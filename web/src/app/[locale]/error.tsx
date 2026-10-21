"use client";

/**
 * 로케일 레이아웃 안쪽 오류 경계 (2026-10-01) — 화면 렌더가 터졌을 때 **우리 얼굴**로 알린다.
 *
 * 없을 때 벌어진 일: Next 기본 오류 화면(스타일 없는 영문 한 줄 "Application error…")이 떴다.
 * 가장 흔한 원인은 배포 교체 뒤의 청크 404(`lib/chunk-reload` 주석)라, 그 경우는 **먼저 한 번
 * 자동 새로고침**하고 그래도 안 되면 이 화면이다. 그 외 오류는 바로 이 화면 + [새로고침].
 *
 * 이 파일은 `[locale]/layout.tsx` 안에서 그려지므로 globals.css·Providers·next-intl 이 살아 있다.
 * 루트 레이아웃 자체가 터진 경우는 `app/global-error.tsx` 몫이다.
 *
 * 얼굴은 빈 상태와 같은 `EmptyState` 다 (DESIGN.md "빈 상태 = common/empty-state 하나") —
 * 오류 전용 변형을 만들지 않는다. CTA 도 같은 규칙(cta · sm).
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { reloadOnceForChunkError } from "@/lib/chunk-reload";
import s from "./error.module.css";

export default function LocaleError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common.errorPage");
  /* 자동 새로고침이 걸리면 그 사이 안내 화면이 깜빡이지 않도록 아무것도 그리지 않는다 */
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error("[error-boundary]", error);
    if (reloadOnceForChunkError(error)) setReloading(true);
  }, [error]);

  if (reloading) return null;

  return (
    <main className={s.wrap}>
      <EmptyState
        icon={AlertTriangle}
        title={t("title")}
        description={t("desc")}
        action={
          /* reset() 은 같은 트리를 다시 그릴 뿐이라 청크 404·죽은 세션은 못 살린다 — 새로고침이 답 */
          <Button size="sm" onClick={() => window.location.reload()}>
            {t("reload")}
          </Button>
        }
      />
    </main>
  );
}
