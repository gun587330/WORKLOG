"use client";

/**
 * 뒤로가기·이전 — **단일 원본** (2026-08-24 대표: "박스로 감싸지 말고 이모티콘만 테마색으로,
 * 모든 뒤로가기 동기화", 2026-09-04 전 화면 이행 완료).
 *
 * 화면마다 제각각이던 것을 하나로 모았다: `‹ 텍스트` 링크 · 유리 박스 iconOnly 버튼 ·
 * 손으로 짠 `.chip`/`.tplBack` 버튼 · 텍스트만 있는 유리 버튼까지 다섯 갈래였다.
 * 이제 전부 **테두리·배경 없는 꺾쇠 아이콘 하나**다. 라벨은 화면에 쓰지 않고
 * `aria-label` 로만 남긴다(어디로 돌아가는지는 옆의 제목·스텝퍼가 이미 말해준다).
 *
 * `href` = 다른 화면으로 돌아간다(링크). `onClick` = 같은 화면 안에서 앞 단계로 간다
 * (위저드 이전 스텝, 상세→목록 복귀). 둘 중 하나만 준다.
 * ⚠️ 페이저의 좌우 화살표는 이것이 아니다 — 그건 "이전 항목"이지 "뒤로"가 아니다.
 */
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import s from "./back-link.module.css";

type Common = { label: string; className?: string };
type AsLink = Common & { href: string; onClick?: never; disabled?: never };
type AsButton = Common & { href?: never; onClick: () => void; disabled?: boolean };

export function BackLink({ label, className, ...rest }: AsLink | AsButton) {
  /* ‹ 모양(꺾쇠) + 굵은 획 — 화살표(꼬리 있는 ←)가 아니다 (2026-08-24 대표).
     획 두께는 lucide 기본 2 보다 굵은 2.5 */
  const icon = <ChevronLeft aria-hidden="true" strokeWidth={2.5} />;
  const cls = `${s.back} ${className ?? ""}`;

  if (rest.href !== undefined) {
    return (
      <Link href={rest.href} className={cls} aria-label={label} title={label}>
        {icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      title={label}
      onClick={rest.onClick}
      disabled={rest.disabled}
    >
      {icon}
    </button>
  );
}
