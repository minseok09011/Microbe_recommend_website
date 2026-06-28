# Supabase 로그인 · 영농기록 설정 가이드

정적 프론트(HTML/JS) + Supabase(Auth + DB + RLS) 구성. 추천/시퀀스(Render 백엔드)와
완전히 분리되어 있고, 인증·기록은 전부 Supabase가 처리합니다.

---

## 0. 접속 키 채우기

`js/supabaseConfig.js` 의 두 상수를 채웁니다.

```js
const SUPABASE_URL = "https://<프로젝트>.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xxxxxxxx";   // publishable 키 (anon 아님)
```

> ⚠️ **secret 키(`sb_secret_...`)는 절대 여기에 넣지 마세요.** 프론트엔드는 publishable
> 키만 씁니다. secret 키는 아래 Edge Function(서버) 안에서만 사용합니다.

---

## 1. RLS 정책 SQL (Supabase → SQL Editor 에서 실행)

아래 전문을 그대로 실행하세요. 농민별 기록 분리의 핵심입니다.

```sql
-- ============================================================
-- 0) admin 판별 함수 (RLS 무한재귀 방지를 위해 SECURITY DEFINER)
--    farmers 정책 안에서 farmers를 다시 select하면 재귀가 나므로,
--    RLS를 우회해 admin 여부만 확인하는 함수를 따로 둔다.
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.farmers
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- 1) farm_records : 본인 것만 CRUD
-- ============================================================
alter table public.farm_records enable row level security;

-- insert 시 farmer_id를 안 보내도 자동으로 본인(auth.uid())이 되도록 기본값 설정
alter table public.farm_records
  alter column farmer_id set default auth.uid();

drop policy if exists "records_select_own" on public.farm_records;
create policy "records_select_own" on public.farm_records
  for select using (farmer_id = auth.uid());

drop policy if exists "records_insert_own" on public.farm_records;
create policy "records_insert_own" on public.farm_records
  for insert with check (farmer_id = auth.uid());

drop policy if exists "records_update_own" on public.farm_records;
create policy "records_update_own" on public.farm_records
  for update using (farmer_id = auth.uid()) with check (farmer_id = auth.uid());

drop policy if exists "records_delete_own" on public.farm_records;
create policy "records_delete_own" on public.farm_records
  for delete using (farmer_id = auth.uid());

-- ============================================================
-- 2) farmers : 본인 행 조회, admin은 전체. 생성/수정은 admin.
-- ============================================================
alter table public.farmers enable row level security;

drop policy if exists "farmers_select_self_or_admin" on public.farmers;
create policy "farmers_select_self_or_admin" on public.farmers
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "farmers_insert_admin" on public.farmers;
create policy "farmers_insert_admin" on public.farmers
  for insert with check (public.is_admin());

drop policy if exists "farmers_update_self_or_admin" on public.farmers;
create policy "farmers_update_self_or_admin" on public.farmers
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "farmers_delete_admin" on public.farmers;
create policy "farmers_delete_admin" on public.farmers
  for delete using (public.is_admin());
```

> 프론트가 실수로 `farmer_id`에 남의 id를 넣어도 `with check (farmer_id = auth.uid())`
> 때문에 INSERT/UPDATE가 **DB 단에서 거부**됩니다. 그래서 프론트는 farmer_id를 아예
> 보내지 않습니다(기본값이 auth.uid()).

---

## 2. 첫 관리자(admin) 계정 만들기

RLS 때문에 "admin이 있어야 admin 행을 만들 수 있는데 첫 admin이 없다"는 닭-달걀
문제가 있습니다. 첫 admin은 **대시보드 + SQL Editor**로 직접 만듭니다(서버 권한이라 RLS 우회).

1. Supabase → **Authentication → Users → Add user**
   - Email: `admin@farm.local`  (아이디가 `admin`이면)
   - Password: 원하는 비밀번호, **Auto Confirm User** 체크
   - 생성된 유저의 **User UID**(uuid)를 복사
2. SQL Editor에서 farmers 프로필 행 삽입(복사한 UID 사용):

```sql
insert into public.farmers (id, username, name, role)
values ('붙여넣은-UID', 'admin', '관리자', 'admin');
```

이제 `admin` / 비밀번호로 `login.html` 에 로그인하면 대시보드에 **🛠️ 관리자** 버튼이 보이고,
이후 농민 계정은 화면에서 만들 수 있습니다.

---

## 3. 농민 계정 생성용 Edge Function 배포

`admin.html` 의 "계정 만들기"는 Auth 관리자 API가 필요하고, 그건 secret 키로만 가능합니다.
secret 키를 프론트에 두지 않기 위해 **Edge Function(`create-farmer`)** 이 대신 처리합니다.

```bash
# Supabase CLI 설치 후
supabase login
supabase link --project-ref <프로젝트ref>

# 함수 배포 (코드: supabase/functions/create-farmer/index.ts)
supabase functions deploy create-farmer
```

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 는 Edge Functions
  런타임에 **자동 주입**됩니다(따로 설정 불필요). 혹시 secret 관리가 필요하면
  `supabase secrets set` 으로 넣습니다.
- 이 함수는 호출자의 JWT로 **admin 여부를 먼저 확인**한 뒤에만 계정을 만듭니다.

> **CLI 없이 가도 됨(대체 방법 b)**: Edge Function을 안 쓰면, 관리자가 Supabase
> 대시보드에서 직접 유저를 추가(2번 절차)하고 SQL로 farmers 행을 넣는 방식으로도
> 운영할 수 있습니다. 이때 `admin.html`의 "계정 만들기"는 동작하지 않지만, **농민 목록
> 조회**는 그대로 됩니다. (권장은 Function 배포)

---

## 3-1. 비밀번호 찾기용 이메일 가입 확인 Edge Function 배포

비밀번호 찾기 화면에서 "가입되지 않은 이메일입니다"를 보여주려면, 가입 여부를
확인하는 **Edge Function(`check-email-exists`)** 을 배포해야 합니다(anon 키로는
계정 존재 여부를 알 수 없도록 Supabase가 막아놔서, secret 키로 동작하는 서버
함수가 필요합니다).

```bash
# Supabase CLI 설치 + 로그인 + 프로젝트 연결까지 했다면(3번과 동일)
supabase functions deploy check-email-exists
```

- 이 함수를 배포하지 않으면, 비밀번호 찾기는 **기존처럼(가입 여부 확인 없이) 그냥
  동작**합니다(앱 코드가 함수 호출 실패를 무시하고 발송을 진행하도록 만들어둠).
  즉 필수는 아니지만, 배포해야 "가입되지 않은 이메일입니다" 안내가 나옵니다.

---

## 4. 테스트 계정 예시

| 구분 | 아이디 | 로그인 이메일(내부) | 비밀번호 | role |
|---|---|---|---|---|
| 관리자 | `admin` | `admin@farm.local` | (직접 지정) | admin |
| 농민 | `hong123` | `hong123@farm.local` | (직접 지정) | farmer |

- 농민 `hong123` 은 admin이 `admin.html`에서 생성하면 됩니다.
- 로그인 화면에선 **아이디만** 입력하면 됩니다(@farm.local은 코드가 자동으로 붙임).

---

## 5. 농민별 기록 분리 원리

1. 로그인하면 Supabase 세션이 생기고, 모든 DB 요청에 그 사용자의 JWT가 자동으로 실립니다.
2. DB는 JWT에서 `auth.uid()`(= 그 농민의 uuid)를 꺼냅니다.
3. `farmers.id` 를 **Auth 유저 id와 동일**하게 맞춰뒀으므로, `farm_records.farmer_id = auth.uid()`
   RLS가 곧 "본인 농민 행"을 의미합니다.
4. 그래서 `select * from farm_records` 를 해도 **DB가 본인 것만** 돌려주고, 남의 행은
   조회/수정/삭제가 원천 차단됩니다. 프론트 코드가 필터를 깜빡해도 안전합니다.

---

## 6. secret 키 주의 (요약)

- 프론트(`js/*.js`, HTML)에는 **publishable 키만**. `sb_secret_...` 절대 금지.
- secret/service-role 키는 **Edge Function 런타임 안에서만** 사용(자동 주입).
- service-role 키는 RLS를 무시하므로 노출되면 전체 데이터가 뚫립니다. 깃에 커밋도 금지.
