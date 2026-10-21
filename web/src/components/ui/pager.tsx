"use client";

/**
 * 번호 페이저 `‹ 1 2 3 ›` — 박스 안 목록 하단 공용 **단일 원본** (2026-09-07 추출).
 *
 * 규격은 `project-card-list` 의 페이저를 그대로 옮긴 것이다(버튼 1.375rem, 활성은 색만).
 * 소비처: 홈 대시보드 알림 센터 · `ProjectCardList`(홈 진행중 프로젝트 + 바이어 발굴 우하단).
 *
 * **페이지 버튼은 최대 5개**, 현재 쪽을 가운데 두고 슬라이드한다. 전부 그리면 페이지가
 * 수십 개로 늘었을 때 하단 줄이 깨진다 (2026-08-10 바이어 발굴 실사고 — buyers-view 주석).
 *
 * 쪽이 하나뿐이어도 그린다. 목록 바닥 높이가 페이지마다 달라지면 옆 박스와 경계가
 * 어긋나 보인다 (바이어 발굴 관례).
 *
 * ⚠️ 아직 합치지 않은 복제: `buyers-view`(표 푸터, 버튼 1.5rem) · `buyer-sheet` ·
 * `deals-view` · `mailbox-view` · `product-grid`. (`buyer/brand-grid` 는 2026-10-21 페이저를 버리고 `ui/panel-footer` 로 갔다.)
 * 그 자리를 손볼 때 이 원본으로 합칠 것 — 페이저 스타일을 새로 쓰지 말 것.
 */
import s from "./pager.module.css";

/** 한 줄에 그리는 페이지 번호 최대 개수 */
const PAGE_WINDOW = 5;

export function Pager({
  page,
  pageCount,
  onChange,
  className,
}: {
  /** 현재 쪽 (1부터) */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  const start =
    pageCount <= PAGE_WINDOW
      ? 1
      : Math.max(1, Math.min(page - Math.floor(PAGE_WINDOW / 2), pageCount - PAGE_WINDOW + 1));
  const numbers = Array.from({ length: Math.min(PAGE_WINDOW, pageCount) }, (_, i) => start + i);

  return (
    <div className={`${s.pager} ${className ?? ""}`}>
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹
      </button>
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          className={n === page ? s.pageOn : ""}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
      <button type="button" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        ›
      </button>
    </div>
  );
}
