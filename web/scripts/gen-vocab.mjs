#!/usr/bin/env node
/**
 * docs/VOCAB.md → src/lib/mcp/vocab.generated.ts
 * MCP describe 도구가 돌려주는 글의 단일 원본은 VOCAB.md 다. 배포(Root Directory = web)에서도 읽히게 빌드 전에 TS 문자열로 굳힌다.
 * 원본을 못 찾으면(저장소 밖 파일이 빌드에 안 들어온 경우) 커밋된 생성 파일을 그대로 쓴다.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../docs/VOCAB.md");
const out = resolve(here, "../src/lib/mcp/vocab.generated.ts");
if (!existsSync(src)) {
  console.log(`[gen-vocab] ${src} 없음 — 커밋된 생성 파일을 씁니다`);
  process.exit(0);
}
const text = readFileSync(src, "utf8");
const body = `/* 자동 생성 — 직접 고치지 말 것. 원본: docs/VOCAB.md, 생성: web/scripts/gen-vocab.mjs */\nexport const VOCAB_MD = ${JSON.stringify(text)};\n`;
const prev = existsSync(out) ? readFileSync(out, "utf8") : "";
if (prev !== body) writeFileSync(out, body);
console.log(`[gen-vocab] ${prev === body ? "변경 없음" : "갱신"} (${text.length}자)`);
