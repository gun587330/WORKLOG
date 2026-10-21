/**
 * MCP 서버 — 클로드가 WORK LOG 를 읽고 쓰는 창구. 주소: /api/mcp (토큰은 Authorization 헤더) 또는 /api/mcp/<토큰>.
 *
 * MCP Streamable HTTP 의 상태 없는(stateless) 형태다: 클로드 앱에 내장된 MCP 클라이언트가 JSON-RPC 메시지를 POST 하면
 * 여기서 받아 JSON 으로 답한다. 처리하는 메서드는 initialize · tools/list · tools/call · ping 뿐이고, 도구의 실제 일은
 * lib/mcp/tools.ts → DB 함수(mcp_read · mcp_prepare · mcp_commit, 마이그레이션 0012)가 한다.
 *
 * 인증: MCP 개인 토큰(npm run mcp:token). 서버는 anon 키만 쓴다. 토큰 검사와 "토큰 주인 = 로그인 사용자" 설정은 DB 함수가 한다.
 * 헤더 방식(Claude Code)을 권장하고, 헤더를 넣을 수 없는 claude.ai 커넥터를 위해 경로 방식도 받는다.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SERVER_INSTRUCTIONS, TOOLS, ToolError, type Ctx } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
type RpcMsg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const rpcError = (id: RpcMsg["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function tokenFrom(req: Request, path?: string[]): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  return path?.[0]?.trim() || null;
}

async function handle(msg: RpcMsg, ctx: Ctx): Promise<object | null> {
  const id = msg.id;
  const isNotification = id === undefined || id === null;
  switch (msg.method) {
    case "initialize": {
      const asked = typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : "";
      return {
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "worklog", title: "WORK LOG", version: "1.0.0" },
          instructions: SERVER_INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return isNotification ? null : { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0", id,
        result: {
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.write
              ? { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
              : { readOnlyHint: true, openWorldHint: false },
          })),
        },
      };
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `알 수 없는 도구: ${name}`);
      try {
        const out = await tool.run((msg.params?.arguments as Record<string, unknown>) ?? {}, ctx);
        const text = typeof out === "string" ? out : JSON.stringify(out, null, 2);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } };
      } catch (e) {
        const message = e instanceof ToolError ? e.message : `처리하지 못했습니다: ${(e as Error).message}`;
        if (!(e instanceof ToolError)) console.error("[mcp] 도구 오류", name, e);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: message }], isError: true } };
      }
    }
    default:
      if (isNotification || msg.method?.startsWith("notifications/")) return null;
      return rpcError(id, -32601, `지원하지 않는 메서드: ${msg.method}`);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ token?: string[] }> }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return json(rpcError(null, -32603, "서버에 Supabase 환경 변수가 없습니다"), 500);

  let body: unknown;
  try { body = await req.json(); } catch { return json(rpcError(null, -32700, "JSON 이 아닙니다"), 400); }

  const token = tokenFrom(req, (await params).token);
  if (!token) return json(rpcError(null, -32001, "MCP 토큰이 필요합니다 (Authorization: Bearer <토큰> 또는 /api/mcp/<토큰>)"), 401);

  const sb = createClient<Database>(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const who = await sb.rpc("mcp_read", { p_token: token, p_tool: "whoami", p_args: {} });
  if (who.error) return json(rpcError(null, -32001, "MCP 토큰이 올바르지 않거나 폐기됐습니다"), 401);

  const ctx: Ctx = { sb, token };
  const msgs = (Array.isArray(body) ? body : [body]) as RpcMsg[];
  const out: object[] = [];
  for (const m of msgs) {
    const r = await handle(m, ctx);
    if (r) out.push(r);
  }
  if (out.length === 0) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? out : out[0]);
}

/* 상태 없는 서버라 서버 → 클라이언트 스트림(GET)과 세션 종료(DELETE)는 열지 않는다 */
export async function GET() {
  return json(rpcError(null, -32000, "이 서버는 POST 만 받습니다"), 405);
}
export async function DELETE() {
  return json(rpcError(null, -32000, "세션이 없는 서버입니다"), 405);
}
