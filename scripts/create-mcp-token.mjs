#!/usr/bin/env node
/**
 * create-mcp-token.mjs — 클로드(MCP) 연결용 개인 토큰 발급 · 폐기 (마이그레이션 0012)
 *
 * 토큰은 원문을 DB 에 저장하지 않는다. 여기서 만들어 화면에 **한 번만** 보여 주고, DB 에는 sha256 해시만 넣는다.
 * 잃어버리면 다시 발급하고 옛 토큰은 폐기한다. service_role 키를 쓰므로 로컬 전용.
 *
 * 사용법 (루트에서):
 *   npm run mcp:token -- --label "claude-code"     발급 (OWNER_EMAIL 계정 소유)
 *   npm run mcp:token -- --revoke --label "claude-code"   그 이름의 토큰 폐기
 *   npm run mcp:token -- --revoke-all              전부 폐기
 * 접속 정보는 루트 .env (SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · OWNER_EMAIL) 에서 읽는다.
 */
import { createHash, randomBytes } from "node:crypto";
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
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const has = (name) => process.argv.includes(name);
const die = (m) => { console.error(`✖ ${m}`); process.exit(1); };

const env = loadEnv();
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) die("SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env).");
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const label = (arg("--label") ?? "claude").trim();

if (has("--revoke-all") || has("--revoke")) {
  const { data, error } = await admin.rpc("revoke_mcp_tokens", { p_label: has("--revoke-all") ? null : label });
  if (error) die(`폐기 실패: ${error.message}`);
  console.log(`✔ 토큰 ${data}개를 폐기했습니다${has("--revoke-all") ? "" : ` (이름: ${label})`}.`);
  process.exit(0);
}

if (!env.OWNER_EMAIL) die("OWNER_EMAIL 이 필요합니다 (.env).");
const token = `wl_${randomBytes(32).toString("base64url")}`;
const hash = createHash("sha256").update(token).digest("hex");
const { error } = await admin.rpc("issue_mcp_token", { p_owner_email: env.OWNER_EMAIL, p_label: label, p_token_hash: hash });
if (error) die(`발급 실패: ${error.message}`);

console.log(`✔ MCP 토큰을 발급했습니다 (이름: ${label}). 이 화면을 닫으면 다시 볼 수 없습니다.\n`);
console.log(token);
console.log(`\n연결 (배포 주소가 https://worklog-phi-two.vercel.app 일 때)`);
console.log(`  Claude Code : claude mcp add --transport http worklog https://worklog-phi-two.vercel.app/api/mcp --header "Authorization: Bearer ${token}"`);
console.log(`  claude.ai   : 설정 > 커넥터 > 사용자 지정 커넥터 추가 > URL 에  https://worklog-phi-two.vercel.app/api/mcp/${token}`);
