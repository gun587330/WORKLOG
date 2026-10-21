"use client";

/**
 * 루트 오류 경계 (2026-10-01) — `[locale]/layout.tsx` 자체가 터졌을 때의 마지막 그물.
 *
 * 여기서는 globals.css·next-intl·Providers 가 **없다고 가정**한다(그래서 터진 것일 수 있다).
 * 스타일은 인라인, 문구는 한·영 고정이다. 토큰도 못 믿으므로 색을 직접 적는다 —
 * 이 파일의 색은 theme.css 의 --bg/--ink/--accent 값을 그대로 옮긴 것이다.
 *
 * 청크 404(배포 교체)는 `[locale]/error.tsx` 와 같은 규칙으로 먼저 한 번 자동 새로고침한다.
 */
import { useEffect, useState } from "react";
import { reloadOnceForChunkError } from "@/lib/chunk-reload";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error("[global-error]", error);
    if (reloadOnceForChunkError(error)) setReloading(true);
  }, [error]);

  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "Pretendard, system-ui, sans-serif", background: "#f4f4f6", color: "#16151c" }}>
        {!reloading && (
          <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
            <div style={{ textAlign: "center", maxWidth: 420 }}>
              <p style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>화면을 불러오지 못했어요</p>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "#6b6b75", margin: "0 0 20px", whiteSpace: "pre-line" }}>
                {"잠시 연결이 끊겼거나 새 버전이 배포됐을 수 있어요.\n새로고침하면 대부분 해결돼요.\n\nCouldn't load this screen. Reloading usually fixes it."}
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ height: 40, padding: "0 18px", borderRadius: 999, border: 0, background: "#1f1d24", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                새로고침 · Reload
              </button>
            </div>
          </main>
        )}
      </body>
    </html>
  );
}
