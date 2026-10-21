#!/usr/bin/env node
/**
 * create-owner.mjs — WORK LOG 소유자 계정 생성 · 비밀번호 재설정 (anserx scripts/create-admin.mjs 에서 옮김)
 *
 * 왜 스크립트인가: 공개 가입이 꺼져 있어 계정은 service_role 로만 만들 수 있다. 이것이 의도된 유일 경로다.
 *
 * 사용법 (루트에서):
 *   OWNER_EMAIL=... OWNER_PASSWORD=... OWNER_NAME=정건 node scripts/create-owner.mjs
 *   OWNER_EMAIL=... OWNER_PASSWORD=... node scripts/create-owner.mjs --reset-password
 * 접속 정보는 환경변수 우선, 없으면 루트 .env 에서 읽는다. 비밀번호는 인자로 받지 않는다(셸 히스토리).
 * ⚠️ 로컬 전용. service_role 키를 쓰므로 프론트 · 서버 코드에서 부르지 않는다.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(resolve(ROOT, ".env"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const key = t.slice(0, i).trim();
      if (!env[key]) env[key] = t.slice(i + 1).trim();
    }
  } catch { /* .env 없으면 환경변수만 */ }
  return env;
}

const env = loadEnv();
const url = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const email = (env.OWNER_EMAIL ?? "").trim().toLowerCase();
const password = env.OWNER_PASSWORD ?? "";
const name = (env.OWNER_NAME ?? "").trim();
const reset = process.argv.includes("--reset-password");

const die = (m) => { console.error(`✖ ${m}`); process.exit(1); };
if (!url || !serviceKey) die("SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env 또는 환경변수).");
if (!email) die("OWNER_EMAIL 이 필요합니다.");
if (!password) die("OWNER_PASSWORD 가 필요합니다 (환경변수로).");
if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))
  die("비밀번호는 10자 이상, 대문자 · 소문자 · 숫자를 포함해야 합니다.");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) die(`사용자 목록 조회 실패: ${listErr.message}`);
const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);

if (existing) {
  if (!reset) die(`이미 있는 계정입니다: ${email}. 비밀번호를 바꾸려면 --reset-password`);
  const { error } = await admin.auth.admin.updateUserById(existing.id, { password, user_metadata: { name: name || existing.user_metadata?.name } });
  if (error) die(`비밀번호 재설정 실패: ${error.message}`);
  console.log(`✔ 비밀번호를 재설정했습니다: ${email}`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name: name || email.split("@")[0] },
  });
  if (error) die(`계정 생성 실패: ${error.message}`);
  console.log(`✔ 소유자 계정을 만들었습니다: ${data.user.email} (${data.user.id})`);
}
