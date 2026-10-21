/**
 * API 응답 계약 — 백엔드 규약 `{ data, error }` 봉투와 프론트를 잇는 단일 지점.
 * (docs/backend/API.md, CLAUDE.md 규칙 9)
 *
 * - PostgREST(supabase-js) 응답과 Edge Function 응답을 여기서 같은 형태로 정규화.
 * - 어떤 기능이 "직접 CRUD → Edge Function"으로 승격돼도 호출부는 이 타입만 본다.
 * - 401 전역 처리(세션 정리 → 로그인)도 이 레이어에서 (SECURITY §2.5).
 */

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };

export type ApiError = {
  message: string;
  status?: number;
  code?: string;
};

/** supabase-js 의 { data, error } 를 ApiResult 로 정규화 */
export function fromSupabase<T>(res: { data: T | null; error: unknown }): ApiResult<T> {
  if (res.error) {
    const e = res.error as { message?: string; code?: string };
    return { data: null, error: { message: e.message ?? "요청 실패", code: e.code } };
  }
  return { data: res.data as T, error: null };
}

/**
 * supabase 에러를 **임의 타입 T 의 실패 봉투**로 변환한다.
 * `fromSupabase` 는 `data` 와 `T` 가 같은 함수에서만 쓸 수 있는데, 조회 도중 실패해
 * `ApiResult<T>` 자리에 되돌려야 할 때가 있다(중간 쿼리 실패). 그때 이걸 쓴다.
 */
export function failFrom<T>(error: unknown): ApiResult<T> {
  const e = error as { message?: string; code?: string };
  return { data: null, error: { message: e?.message ?? "요청 실패", code: e?.code } };
}

/** Edge Function 호출용 fetch 래퍼 — 봉투를 벗겨 ApiResult 로 반환 */
export async function callFunction<T>(
  url: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (e) {
    /**
     * 네트워크 실패·CORS 차단은 HTTP 에러가 아니라 **fetch 자체의 거부(reject)** 다.
     * 여기서 잡지 않으면 호출부의 `await` 가 통째로 터져 `setPending(false)` 같은 뒷정리가
     * 실행되지 않는다 — 버튼이 영원히 로딩인 채로 멈추고, 콘솔에만
     * "Uncaught (in promise) TypeError: Failed to fetch" 가 남는다
     * (2026-08-04 가입 무한 대기 사고: Edge Function CORS 허용 목록에 배포 도메인이 없었다).
     * 다른 모든 실패와 같은 `{ data, error }` 봉투로 돌려보내 화면이 사유를 말할 수 있게 한다.
     */
    console.error("[callFunction] 네트워크 실패", url, e);
    return {
      data: null,
      error: { message: "서버에 연결하지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요." },
    };
  }

  /* 익명 호출(Authorization 없음)의 401 은 "세션이 죽었다"가 아니라 "이 함수는 로그인이 필요하다"다
     (예: 게이트웨이 verify_jwt 가 아직 켜져 있는 공개 함수). 세션을 지우거나 로그인으로 보낼 일이
     아니므로 봉투로 돌려보내 화면이 사유를 말하게 한다 — 랜딩 미리보기가 로그인으로 튕기던 원인 (2026-09-28) */
  const hasAuth = !!(init?.headers && "Authorization" in (init.headers as Record<string, string>));
  if (res.status === 401 && hasAuth) {
    // "서버가 아니라고 하면 아닌 것" (SECURITY §2.5) — 남아 있는 세션을 정리하고
    // 로그인 화면으로 보낸다. 클라이언트에서만 동작하므로 window 존재를 확인한다.
    if (typeof window !== "undefined") {
      // 이미 로그인 화면이면 리다이렉트 루프를 만들지 않는다.
      const onAuthPage = /\/(login|signup|invite|reset-password)(\/|$|\?)/.test(
        window.location.pathname,
      );
      if (!onAuthPage) {
        // 동적 import — 이 모듈은 서버에서도 import 되므로 supabase 클라를 정적으로 끌어오지 않는다.
        void import("@/lib/supabase/client")
          .then(({ createClient }) => createClient().auth.signOut())
          .catch((e) => console.error("[401] 세션 정리 실패", e))
          .finally(() => {
            const next = encodeURIComponent(
              window.location.pathname + window.location.search,
            );
            window.location.assign(`/login?next=${next}`);
          });
      }
    }
    return { data: null, error: { message: "인증이 필요합니다.", status: 401 } };
  }

  const body = (await res.json().catch(() => null)) as
    | { data: T | null; error: string | null }
    | null;

  if (!res.ok || !body || body.error) {
    return {
      data: null,
      error: { message: body?.error ?? `HTTP ${res.status}`, status: res.status },
    };
  }
  return { data: body.data as T, error: null };
}

/** 에러면 throw (TanStack Query 의 queryFn 에서 편하게 쓰기 위함) */
export function unwrap<T>(result: ApiResult<T>): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
