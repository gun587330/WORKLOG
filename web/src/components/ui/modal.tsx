"use client";

/**
 * Modal — 중앙 다이얼로그 (atom). 초대 모달(설정)이 첫 소비자.
 * ESC/백드롭 클릭으로 닫힘. 헤더·푸터 고정 + 본문 스크롤. 등장 모션(딤 페이드 + 판 rise).
 *
 * 표면 규칙 (2026-07-20 확정): **기본 paper(불투명 흰 판) = 폼형 다이얼로그의 표준** —
 * 입력·정보 판독이 우선인 폼은 배경이 비치면 안 된다 (제품 상세·수정에서 글래스 판 실측 후 기각).
 * `surface="glass"` 는 정보성·장식성 다이얼로그 전용 옵션으로만 남긴다.
 * Phase 1: 포커스 트랩 없음 (후행 — 접근성 보강 시 추가).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import s from "./modal.module.css";

/** 열려 있는 모달 수 — body 클래스(anserx-modal-open)를 중첩 모달에서도 정확히 관리 */
let openModalCount = 0;

export function Modal({
  open,
  title,
  onClose,
  closeLabel = "닫기",
  size = "md",
  alignContent = true,
  surface = "paper",
  variant = "center",
  titleAside,
  maxWidth,
  bodyFlush = false,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  closeLabel?: string;
  /**
   * md=420px(확인·알림 전용) | lg=760px **폼형 다이얼로그 표준** | xl=1120px(뷰어형 — 소개서 페이지 등)
   * | wide=가로 80%(상한 82rem)·높이 고정 — **화면형 서식**(바이어 제품 상세 오버레이, 2026-09-06 대표 확정)
   * 2026-08-28 대표 지시: **폼형(lg)은 내용물과 무관하게 높이까지 고정**(modal.module.css .lg)해
   * 어떤 폼을 열어도 같은 크기의 판이 뜬다. 확인·알림(md)만 내용 높이를 따른다.
   */
  size?: "md" | "lg" | "xl" | "wide";
  /** 사이드바(네브바)를 제외한 콘텐츠 영역 기준 가운데 정렬 — **기본 true** (2026-08-28 대표 지시:
   *  "화면 정중앙이 아니라 좌측 네브바를 제외한 정중앙"). 전체 뷰포트 중앙이 필요하면 false */
  alignContent?: boolean;
  /** paper=흰 판(기본) | glass=클리어 글래스 판 | tint=테마 틴트 판(내부에 클리어 글래스 박스를 얹는 용도) */
  surface?: "paper" | "glass" | "tint";
  /** center=중앙 다이얼로그(기본) | drawer=우측 가장자리에서 슬라이드되는 전체 높이 시트 */
  variant?: "center" | "drawer";
  children: React.ReactNode;
  /** 하단 액션 영역 (버튼들) */
  footer?: React.ReactNode;
  /** 제목 옆 보조 요소 (예: "영문 입력 권장" 안내) — opt-in, 기본 없음 (2026-08-28) */
  titleAside?: React.ReactNode;
  /** 판 최대 폭 오버라이드 (CSS 길이) — 특정 화면과 폭을 맞춰야 할 때만. 예: 공개 프로필의 제품 상세 = 제품 상세 페이지 카드 폭 (2026-08-30) */
  maxWidth?: string;
  /**
   * 본문 여백·간격 제거 (opt-in, 기본 false) — 콘텐츠가 **판 전체를 차지하는 화면형 서식** 전용.
   * 2026-09-06: 바이어 제품 상세 오버레이가 첫 소비자다(안에 든 2분할 셸이 자기 여백을 갖는다).
   * 폼형 다이얼로그는 이 값을 켜지 말 것 — 입력 판의 여백은 표준이다.
   */
  bodyFlush?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* 모달이 떠 있음을 body 클래스로 알린다 (2026-08-09 대표 리포트 "폼을 클릭하면
     가이드가 닫힌다"). 투어 중 모달을 열면 **모달 위에 남는 클릭 가능한 것은 driver
     팝오버 하나뿐**인데(z 10억 > 백드롭 10001), 그 팝오버가 화면 중앙의 모달과 겹쳐
     폼을 누른다는 클릭이 팝오버의 [건너뛰기]에 떨어져 투어가 통째로 닫혔다.
     styles/tour.css 가 이 클래스를 보고 모달이 떠 있는 동안 팝오버·커서를 숨긴다 —
     모달을 닫으면 팝오버가 돌아와 [다음]으로 진행한다. 중첩 모달 대비 카운터. */
  useEffect(() => {
    if (!open) return;
    openModalCount += 1;
    document.body.classList.add("anserx-modal-open");
    return () => {
      openModalCount -= 1;
      if (openModalCount <= 0) document.body.classList.remove("anserx-modal-open");
    };
  }, [open]);

  /* SSR·하이드레이션 가드 (2026-08-11) — 포털 대상인 document 가 서버엔 없다.
     지금까지는 모달이 전부 사용자 클릭 **후**(클라이언트)에만 열려 안 드러났는데,
     공개 프로필의 `?product=` 공유 링크가 처음으로 "열린 채 서버 렌더"를 만들며
     500 이 났다. `typeof document` 분기만으로는 하이드레이션 불일치(서버 null vs
     클라 모달)가 남아서, 마운트 후에만 그리는 표준 패턴을 쓴다 — 첫 페인트 직후
     모달이 뜨는 한 프레임 지연은 다이얼로그 표면에선 보이지 않는다. */
  if (!open || !mounted) return null;

  /* body 포탈 — 호출 지점이 sticky/backdrop-filter 등 스태킹 컨텍스트 안이어도
   * fixed 백드롭이 갇히지 않고 항상 최상위 (2026-07-27: 상세 좌 레일(sticky) 안 뷰어에서 실측) */
  return createPortal(
    <div
      /* `anserx-modal` = 전역(비해시) 클래스 — styles/tour.css 가 투어 중 이 모달의
         pointer-events 를 되살리는 데 쓴다. driver.css 는 투어 동안 `.driver-active *`
         전체에 pointer-events:none 을 걸어서(활성 요소·팝오버만 예외), 모달이 z 로는
         위에 있어도 **클릭이 관통해 오버레이에 떨어져 투어가 닫혔다** (2026-08-09
         Playwright 실측 — elementFromPoint 가 path 를 반환). */
      className={`anserx-modal ${s.backdrop} ${alignContent && variant === "center" ? s.contentArea : ""} ${surface === "glass" ? s.backdropSoft : ""} ${variant === "drawer" ? s.backdropDrawer : ""}`}
      /* 바깥 클릭 닫기는 **투어 중엔 끈다** (2026-08-09 대표 리포트 "가이드 도중 폼을
         클릭하면 해제된다") — 가이드를 따라가는 사용자는 커서 넛지·팝오버 주변을
         이것저것 누르는데, 패널을 살짝 벗어난 클릭 한 번이 백드롭에 닿아 고르던 폼을
         통째로 날린다. 투어 중 닫기는 X 버튼·Escape 라는 명시적 행동만 남긴다. */
      onClick={() => {
        if (document.body.classList.contains("driver-active")) return;
        onClose();
      }}
      role="presentation"
    >
      <div
        className={`${s.panel} ${size === "lg" ? s.lg : ""} ${size === "xl" ? s.xl : ""} ${size === "wide" ? s.wide : ""} ${surface === "glass" ? s.glass : ""} ${surface === "tint" ? s.tint : ""} ${variant === "drawer" ? s.drawer : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={s.head}>
          <h2 className={s.title}>{title}</h2>
          {titleAside && <div className={s.titleAside}>{titleAside}</div>}
          <button type="button" className={s.close} aria-label={closeLabel} onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className={`${s.body} ${bodyFlush ? s.bodyFlush : ""}`}>{children}</div>
        {footer && <footer className={s.foot}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
