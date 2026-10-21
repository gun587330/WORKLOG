/**
 * PageHeader — 페이지 상단 공통 헤더 (ANSERX common/page-header 에서 옮김 · 바뀐 점: 알림 벨 · 언어 스위처 없음).
 * 서버 컴포넌트. [leading + 제목 + 설명 | 액션] 두 축.
 */
import s from "./page-header.module.css";

export function PageHeader({
  title,
  description,
  leading,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: string;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`${s.head} ${className ?? ""}`}>
      <div className={leading ? s.lead : undefined}>
        {leading}
        <div className={s.text}>
          <h1 className={s.title}>{title}</h1>
          {description && <p className={s.desc}>{description}</p>}
        </div>
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  );
}
