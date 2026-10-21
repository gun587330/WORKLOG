/**
 * Button — 앱 전체 공용 버튼. 스타일 원본은 button.module.css (DESIGN.md §4 스펙).
 *
 * href 를 주면 링크(next/link)로, 없으면 <button> 으로 렌더된다.
 * 서버·클라이언트 어디서든 import 가능 (상태 없음).
 *
 * variant: cta(바이올렛·기본) | secondary(불투명 뉴트럴 판) | danger(파괴적 액션 — 삭제 등)
 * size   : md(48·기본) | lg(56, 히어로급) | nav(44, 네브바) | sm(30, 박스 헤더·행 내 액션)
 *
 * ⛔ **유리 버튼은 없다** (2026-09-04, DESIGN.md §4-1). 구 `variant="glass"`(반투명 +
 *    backdrop-blur + 흰 테두리)는 뒤에 무엇이 오느냐에 따라 "눌리는 것"으로 안 읽히고
 *    같은 화면 안에서 액션 위계를 흐려서 폐기했다. 이름·모양 둘 다 `secondary` 가 됐고,
 *    되돌리는 것은 `npm run check:glass` 가 막는다(exit 1).
 * ⚠️ **뒤로가기·이전은 버튼이 아니다** — `common/back-link` 의 꺾쇠 하나가 단일 원본이다.
 */
import { Link } from "@/i18n/navigation";  // 로케일 유지 링크 (next/link 금지 — I18N.md §3)
import { Loader2 } from "lucide-react";
import s from "./button.module.css";

type Common = {
  variant?: "cta" | "secondary" | "danger";
  size?: "md" | "lg" | "nav" | "sm";
  /** 아이콘 하나만 담는 정사각 버튼 (aria-label 필수) */
  iconOnly?: boolean;
  /** true 면 스피너로 바뀌고 비활성화 (API 연결 시 사용) */
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
};

type AsButton = Common & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & { href?: undefined };
type AsLink = Common & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href"> & { href: string };

function classes({ variant = "cta", size = "md", iconOnly, className }: Common) {
  return [
    s.btn,
    s[variant],
    size !== "md" && s[size],
    iconOnly && s.iconOnly,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button(props: AsButton | AsLink) {
  if (props.href !== undefined) {
    const { variant, size, iconOnly, loading: _loading, className, href, children, ...rest } = props;
    return (
      <Link href={href} className={classes({ variant, size, iconOnly, className, children })} {...rest}>
        {children}
      </Link>
    );
  }

  const { variant, size, iconOnly, loading = false, className, disabled, children, ...rest } = props;
  return (
    <button
      className={classes({ variant, size, iconOnly, className, children })}
      disabled={disabled || loading}
      {...rest}
    >
      {/* 로딩 중에도 원래 내용을 자리에 남겨(투명) 버튼 폭이 흔들리지 않게 — 스피너는 그 위에 겹친다
          (2026-08-30 대표 지시, [영문으로 번역] 버튼이 로딩 때 줄어들던 문제) */}
      {loading ? (
        <>
          <span className={s.ghost} aria-hidden="true">{children}</span>
          <Loader2 className={`${s.spin} ${s.spinOverlay}`} size={18} aria-label="처리 중" />
        </>
      ) : (
        children
      )}
    </button>
  );
}
