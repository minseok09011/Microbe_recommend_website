/* ============================================================
   영농 기록 CRUD — Supabase 직접 호출
   ------------------------------------------------------------
   ⚠️ farmer_id 를 절대 직접 넣지 않는다.
      DB 기본값(auth.uid())과 RLS가 본인 것만 처리하도록 맡긴다.
   의존: supabaseClient (js/supabaseClient.js)
   ============================================================ */
const WORK_TYPES = ["농약", "미생물", "비료", "기타"];

// 내 기록 전체 (RLS가 본인 것만 반환). 최신 날짜순.
async function listMyRecords() {
    ensureSupabase();
    const { data, error } = await supabaseClient
        .from("farm_records")
        .select("id, record_date, crop_name, work_type, memo, note, created_at")
        .order("record_date", { ascending: false })
        .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
}

async function getRecord(id) {
    ensureSupabase();
    const { data, error } = await supabaseClient
        .from("farm_records")
        .select("id, record_date, crop_name, work_type, memo, note")
        .eq("id", id)
        .single();
    if (error) throw error;
    return data;
}

// 추가 — farmer_id 미포함. RLS 기본값이 auth.uid() 로 채움.
async function createRecord(rec) {
    ensureSupabase();
    const payload = {
        record_date: rec.record_date || null,
        crop_name: rec.crop_name || null,
        work_type: rec.work_type || null,
        memo: rec.memo || null,
        note: rec.note || null,
    };
    const { data, error } = await supabaseClient
        .from("farm_records")
        .insert(payload)   // farmer_id 없음 (DB가 auth.uid()로 세팅)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// 수정 — id로만 지정. RLS가 본인 행만 허용.
async function updateRecord(id, rec) {
    ensureSupabase();
    const payload = {
        record_date: rec.record_date || null,
        crop_name: rec.crop_name || null,
        work_type: rec.work_type || null,
        memo: rec.memo || null,
        note: rec.note || null,
        updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseClient
        .from("farm_records")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// 삭제 — id로만. RLS가 본인 행만 허용.
async function deleteRecord(id) {
    ensureSupabase();
    const { error } = await supabaseClient.from("farm_records").delete().eq("id", id);
    if (error) throw error;
}
