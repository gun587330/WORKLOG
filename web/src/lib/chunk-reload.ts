/**
 * 배포 교체로 깨진 화면을 **자동 새로고침**으로 살린다 (2026-10-01).
 *
 * 탭을 오래 열어 두면 그 사이 새 버전이 배포된다. 이전 빌드의 JS·CSS 조각은 주소(해시)가
 * 바뀌어 404 가 되고, 다음 화면 이동이나 모달 열기에서 `ChunkLoadError` 가 난다. Next 는
 * 이 오류를 가장 가까운 error boundary 로 올리는데 우리는 그게 없었다 → Next 기본 오류 화면
 * (스타일 없는 영문 한 줄)이 떴다. 사용자가 본 "CSS 없는 텍스트"가 이것이다.
 *
 * 해법은 로그아웃이 아니라 **새로고침**이다 — 새로고침하면 새 빌드를 받아 정상이 된다.
 * 사용자가 누르기 전에 우리가 한 번 해준다. 단 **같은 오류로 두 번 연속**이면 멈춘다 —
 * 진짜 네트워크 장애면 무한 새로고침이 된다. 그때는 안내 화면 + [새로고침] 버튼이다.
 */

const KEY = "anserx:chunk-reload-at";
/** 이 시간 안에 또 청크 오류면 자동 새로고침을 멈춘다 (무한 루프 방지) */
const COOLDOWN_MS = 30_000;

/* App Router 의 청크 이름은 `app/[locale]/(app)/brand/home/page` 처럼 `/ [ ] ( )` 를 품는다 —
   `[\w-]+` 로는 못 잡는다(실측). 같은 줄 안에서 "failed" 까지를 통째로 본다 */
const CHUNK_ERROR_RE =
  /ChunkLoadError|Loading (?:CSS )?chunk [^\n]*?failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script/i;

export function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  if (!e) return false;
  return e.name === "ChunkLoadError" || CHUNK_ERROR_RE.test(e.message ?? "");
}

/**
 * 청크 오류면 한 번 새로고침하고 true. 방금 새로고침한 뒤 또 났거나 청크 오류가 아니면 false —
 * 호출부가 안내 화면을 그린다. sessionStorage 는 탭 단위라 다른 탭에 영향 없다.
 */
export function reloadOnceForChunkError(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < COOLDOWN_MS) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* 저장소 접근 불가(프라이빗 모드 등) — 루프 방지를 못 하니 자동 새로고침을 하지 않는다 */
    return false;
  }
  window.location.reload();
  return true;
}
