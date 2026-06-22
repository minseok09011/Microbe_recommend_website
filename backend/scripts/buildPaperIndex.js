// 일회성 인덱싱 스크립트: A등급 논문 본문을 청크로 나누고 Voyage AI로 임베딩해서
// RAG 검색용 인덱스 파일로 저장합니다.
//
// 사용법: VOYAGE_API_KEY=... node backend/scripts/buildPaperIndex.js
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const DATA_ROOT = "D:/농림축산/논문 csv 파일 + jsonL";

const MEMBERS = [
    { graded: "member_1/papers_graded.csv", fulltext: "member_1/fulltext.jsonl" },
    { graded: "member_2/papers_graded.csv", fulltext: "member_2/fulltext.jsonl" },
    { graded: "member_3/papers_graded.csv", fulltext: "member_3/fulltext.jsonl" },
    { graded: "member_4/member4_papers_graded.csv", fulltext: "member_4/member4_fulltext.jsonl" },
];

const CHUNK_SIZE = 3000; // 약 750토큰 (영어 기준 4자/토큰)
const CHUNK_OVERLAP = 300;

function loadGradedMeta() {
    const metaById = new Map();
    for (const { graded } of MEMBERS) {
        let csvText = fs.readFileSync(path.join(DATA_ROOT, graded), "utf-8");
        if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);
        const rows = parse(csvText, { columns: true, skip_empty_lines: true, relax_column_count: true });
        for (const row of rows) {
            const grade = (row.grade || "").trim();
            if (!grade.startsWith("A")) continue;
            metaById.set(row.paper_id.trim(), {
                paperId: row.paper_id.trim(),
                title: row.title || "",
                firstAuthor: row.first_author || "",
                journal: row.journal || "",
                year: row.year || "",
                doi: row.doi || "",
                axis: row.axis || "",
                matchedKeywords: row.matched_keywords || "",
            });
        }
    }
    return metaById;
}

function chunkText(text) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + CHUNK_SIZE, text.length);
        chunks.push(text.slice(start, end));
        if (end === text.length) break;
        start = end - CHUNK_OVERLAP;
    }
    return chunks;
}

function buildChunks(metaById) {
    const chunks = [];
    for (const { fulltext } of MEMBERS) {
        const lines = fs.readFileSync(path.join(DATA_ROOT, fulltext), "utf-8").split("\n");
        for (const line of lines) {
            if (!line.trim()) continue;
            const obj = JSON.parse(line);
            const pid = (obj.paper_id || "").trim();
            const meta = metaById.get(pid);
            if (!meta) continue; // A등급이 아니거나 메타 없음

            const pieces = chunkText(obj.full_text || "");
            pieces.forEach((text, idx) => {
                chunks.push({ ...meta, chunkIndex: idx, totalChunks: pieces.length, text });
            });
        }
    }
    return chunks;
}

const OUT_DIR = path.join(__dirname, "..", "data");
const CHUNKS_FILE = path.join(OUT_DIR, "chunks.jsonl");
const VECTORS_FILE = path.join(OUT_DIR, "vectors.f32");
const PROGRESS_FILE = path.join(OUT_DIR, "embed_progress.txt");

const VECTOR_DIM = 1024;
const MAX_TOKENS_PER_BATCH = 60000; // Voyage 한도(120k)보다 여유 크게 둠 (글자수 추정이 부정확할 수 있음)
const MAX_TEXTS_PER_BATCH = 200;
const CHARS_PER_TOKEN_ESTIMATE = 3; // 과학 논문 텍스트는 4자/토큰보다 토큰이 더 많이 나옴

async function buildChunksFile() {
    console.log("📚 A등급 논문 메타데이터 로딩...");
    const metaById = loadGradedMeta();
    console.log(`✅ A등급 논문 ${metaById.size}편 확인`);

    console.log("✂️  본문 청크 분할...");
    const chunks = buildChunks(metaById);
    console.log(`✅ 총 청크 수: ${chunks.length}`);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const out = fs.createWriteStream(CHUNKS_FILE, { encoding: "utf-8" });
    for (const chunk of chunks) out.write(JSON.stringify(chunk) + "\n");
    await new Promise((resolve, reject) => {
        out.end((err) => (err ? reject(err) : resolve()));
    });

    return chunks.length;
}

function loadChunkTexts() {
    const lines = fs.readFileSync(CHUNKS_FILE, "utf-8").split("\n").filter((l) => l.trim());
    return lines.map((l) => JSON.parse(l).text);
}

function getResumeIndex() {
    if (!fs.existsSync(PROGRESS_FILE)) return 0;
    return parseInt(fs.readFileSync(PROGRESS_FILE, "utf-8").trim(), 10) || 0;
}

async function embedBatch(texts, attempt = 1) {
    try {
        const res = await fetch("https://api.voyageai.com/v1/embeddings", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${VOYAGE_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ input: texts, model: "voyage-multilingual-2", input_type: "document" }),
        });
        const data = await res.json();
        if (!data.data) throw new Error(JSON.stringify(data));
        return data.data.map((d) => d.embedding);
    } catch (error) {
        if (attempt >= 3) throw error;
        console.warn(`⚠️  배치 실패(${attempt}회), 재시도:`, error.message);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        return embedBatch(texts, attempt + 1);
    }
}

function makeBatches(texts, startIdx) {
    const batches = [];
    let current = [];
    let currentTokenEstimate = 0;

    for (let i = startIdx; i < texts.length; i++) {
        const tokenEstimate = Math.ceil(texts[i].length / CHARS_PER_TOKEN_ESTIMATE);
        const wouldExceed =
            current.length >= MAX_TEXTS_PER_BATCH || currentTokenEstimate + tokenEstimate > MAX_TOKENS_PER_BATCH;

        if (wouldExceed && current.length > 0) {
            batches.push(current);
            current = [];
            currentTokenEstimate = 0;
        }
        current.push(texts[i]);
        currentTokenEstimate += tokenEstimate;
    }
    if (current.length > 0) batches.push(current);
    return batches;
}

async function embedAll() {
    const texts = loadChunkTexts();
    const resumeIdx = getResumeIndex();
    console.log(`📦 총 청크 ${texts.length}개, ${resumeIdx}개는 이미 임베딩 완료 (이어서 진행)`);

    const batches = makeBatches(texts, resumeIdx);
    console.log(`🚀 남은 배치 수: ${batches.length}`);

    const vectorStream = fs.createWriteStream(VECTORS_FILE, { flags: resumeIdx > 0 ? "a" : "w" });
    let doneCount = resumeIdx;

    for (let b = 0; b < batches.length; b++) {
        const embeddings = await embedBatch(batches[b]);
        for (const vec of embeddings) {
            vectorStream.write(Buffer.from(new Float32Array(vec).buffer));
        }
        doneCount += batches[b].length;
        fs.writeFileSync(PROGRESS_FILE, String(doneCount));
        console.log(`  배치 ${b + 1}/${batches.length} 완료 (누적 ${doneCount}/${texts.length})`);
    }

    await new Promise((resolve) => vectorStream.end(resolve));
    console.log(`✅ 임베딩 완료: ${VECTORS_FILE} (${doneCount}개 x ${VECTOR_DIM}차원)`);
}

async function main() {
    if (!fs.existsSync(CHUNKS_FILE)) {
        await buildChunksFile();
    } else {
        console.log(`ℹ️  기존 청크 파일 재사용: ${CHUNKS_FILE}`);
    }

    if (!VOYAGE_API_KEY) {
        console.log("\n⚠️  VOYAGE_API_KEY가 없어서 임베딩은 건너뜁니다. 청크 분할 결과만 저장됨.");
        return;
    }

    await embedAll();
}

main().catch((err) => {
    console.error("❌ 스크립트 실패:", err);
    process.exit(1);
});
