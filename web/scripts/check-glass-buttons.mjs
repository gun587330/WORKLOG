#!/usr/bin/env node
/**
 * 유리 버튼 금지 가드 — 2026-09-04.
 *
 * 규칙(DESIGN.md §4-1): **버튼에 유리를 쓰지 않는다.** 반투명 + backdrop-blur + 흰 테두리는
 * 뒤에 무엇이 오느냐에 따라 "눌리는 것"으로 안 읽히고, 같은 화면 안에서 액션 위계를 흐린다.
 * 유리는 면(카드·패널)의 언어이지 액션의 언어가 아니다.
 * 보조 액션은 `variant="secondary"`(불투명 뉴트럴 판) 또는 텍스트 링크다.
 *
 * 2026-09-04 로 **잔여 0**이다. 구 `variant="glass"` 53곳은 전부 이행됐다:
 * 뒤로가기·이전 계열은 `common/back-link`(꺾쇠), 나머지는 `secondary`.
 * 그래서 기준선(baseline) 방식을 걷어내고 **0 초과면 실패**로 조인다.
 *
 * 왜 문서가 아니라 스크립트인가: 이 레포는 같은 판단을 투어 앵커에서 이미 내렸다
 * (`check-tour-anchors.mjs` — "문서는 사람이 읽어야 작동한다. 조용한 실패를 exit 1 로
 * 바꾸는 게 유일한 실질적 방어다"). 유리 버튼도 똑같이 조용히 늘어나는 종류다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SRC = join(ROOT, "src");
/** 주석은 검사 대상이 아니다 — "쓰지 말 것"이라고 적어둔 문장이 위반으로 잡히면
 *  규칙을 설명하는 것 자체가 불가능해진다. 블록 주석과 줄 주석(URL 의 `//` 제외)을 지운다. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

/** [찾을 것, 사람이 읽을 설명] */
const BANNED = [
  ['variant="glass"', '구 유리 버튼 variant. `variant="secondary"` 를 쓴다'],
  ["composes: glass from", "button.module.css 의 유리 별칭. `composes: secondary from` 을 쓴다"],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(full);
  }
  return out;
}

const hits = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const text = stripComments(readFileSync(file, "utf8"));
  for (const [needle, why] of BANNED) {
    const n = text.split(needle).length - 1;
    if (n > 0) hits.push(`  ${rel} — ${needle} ${n}회 (${why})`);
  }
}

/* 버튼 원본에 blur 가 되돌아오는 것도 막는다 — 이름만 secondary 로 두고 모양만
   유리로 되돌리면 규칙이 무력해진다. 카드·패널(glass-card)의 blur 는 대상이 아니다. */
const btnCss = stripComments(readFileSync(join(SRC, "components/ui/button.module.css"), "utf8"));
if (/backdrop-filter/.test(btnCss)) {
  hits.push("  src/components/ui/button.module.css — backdrop-filter (버튼 표면에 blur 금지)");
}

if (hits.length) {
  console.error("\n⛔ 버튼에 유리를 쓰지 않는다 — DESIGN.md §4-1\n");
  console.error(hits.join("\n"));
  console.error("\n보조 액션은 `variant=\"secondary\"` 또는 텍스트 링크,");
  console.error("뒤로가기·이전은 `common/back-link`(꺾쇠) 를 쓴다.\n");
  process.exit(1);
}

console.log("유리 버튼 0개 — 버튼 표면 blur 없음");
