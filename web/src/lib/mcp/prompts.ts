/**
 * MCP 프롬프트 — 사이트 「프롬프트」 모음(prompts 표)을 클로드의 프롬프트 메뉴로 내보낸다(마이그레이션 0016).
 * Claude Code 에서는 /mcp__worklog__<name> 슬래시 명령으로 보인다. 이름은 슬래시 명령에서 안전한 영문 소문자 · 밑줄만 쓴다.
 *
 * 사이트 프롬프트는 "다른 AI 에 붙여넣어 md 파일을 받는" 흐름으로 쓰여 있다. MCP 로 연결된 대화에서는 그 중 두 단계가 달라지므로
 * 본문 앞에 [MCP 연결 대화에서는] 절을 붙여 덮어쓴다: 컨텍스트 팩은 도구로 직접 읽고, 결과는 파일 대신 upload_* preview → 승인 → commit.
 * 나머지 절차(질문 · 양식 · 자가 점검)는 사이트 프롬프트 원문을 그대로 따른다.
 */
import type { Ctx } from "./tools";
import { ToolError } from "./tools";

type Row = { id: string; title: string; purpose: string | null; body: string; sort: number };
type McpPrompt = { name: string; title: string; description: string; arguments: { name: string; description: string; required: boolean }[] };

const KNOWN: Record<string, { name: string; kind: "log" | "plan" }> = {
  "작업 기록용 프롬프트": { name: "work_log", kind: "log" },
  "작업 계획용 프롬프트": { name: "work_plan", kind: "plan" },
};

const ADAPTER = {
  log: `[MCP 연결 대화에서는] 이 대화는 WORKLOG 와 MCP 로 연결돼 있다. 아래 프롬프트를 따르되 다음 두 가지만 바꾼다.
- [0단계] 컨텍스트 팩을 사용자에게 붙여넣어 달라고 하지 않는다. describe 를 읽고 get_context_pack 도구로 직접 가져온다.
- [출력 규칙] 파일이나 코드블록으로 내려주지 않는다. 사용자가 "정리해줘" 라고 하면 문서를 만들어 upload_log 를 mode=preview 로 부르고,
  결과(작업마다 프로젝트 확인 질문 포함)를 사용자에게 보여 준 뒤 명시적 승인을 받으면 mode=commit 으로 저장한다.
- 오늘 한 일은 이 대화, 이 작업 공간의 git 커밋 · 바뀐 파일, list_logs · list_todos 에서 먼저 찾아 보여 주고, 빠진 것을 묻는다.
`,
  plan: `[MCP 연결 대화에서는] 이 대화는 WORKLOG 와 MCP 로 연결돼 있다. 아래 프롬프트를 따르되 다음 두 가지만 바꾼다.
- [0단계] 컨텍스트 팩을 사용자에게 붙여넣어 달라고 하지 않는다. describe 를 읽고 get_context_pack · list_goals · list_plan_items 도구로 직접 가져온다.
- [출력 규칙] 파일이나 코드블록으로 내려주지 않는다. 사용자가 "정리해줘" 라고 하면 문서를 만들어 upload_plan 을 mode=preview 로 부르고,
  결과([신규] 목표마다 프로젝트 확인 질문 포함)를 사용자에게 보여 준 뒤 명시적 승인을 받으면 mode=commit 으로 저장한다.
`,
};

async function rows(ctx: Ctx): Promise<Row[]> {
  const { data, error } = await ctx.sb.rpc("mcp_prompts", { p_token: ctx.token });
  if (error) throw new ToolError(error.message);
  return (data ?? []) as Row[];
}

const nameOf = (r: Row) => KNOWN[r.title]?.name ?? `prompt_${r.id.slice(0, 6)}`;

export async function listPrompts(ctx: Ctx): Promise<McpPrompt[]> {
  return (await rows(ctx)).map((r) => ({
    name: nameOf(r),
    title: r.title,
    description: r.purpose ?? r.title,
    arguments: [{ name: "memo", description: "선택. 오늘 메모 · 붙여넣을 내용(다른 AI 결과 등)", required: false }],
  }));
}

export async function getPrompt(ctx: Ctx, name: string, args: Record<string, unknown>) {
  const r = (await rows(ctx)).find((x) => nameOf(x) === name);
  if (!r) throw new ToolError(`알 수 없는 프롬프트: ${name}`);
  const kind = KNOWN[r.title]?.kind;
  const memo = typeof args.memo === "string" && args.memo.trim() ? `\n\n[사용자가 함께 준 메모]\n${args.memo.trim()}` : "";
  const text = `${kind ? ADAPTER[kind] + "\n" : ""}${r.body.trim()}${memo}`;
  return {
    description: r.purpose ?? r.title,
    messages: [{ role: "user", content: { type: "text", text } }],
  };
}
