/**
 * EmptyState — 빈 목록·미구현·에러의 **유일한** 표시 (2026-09-04 단일화).
 *
 * 벤치마크 학습(Phase 2 계획): 초기 사용자는 데이터가 전부 0 — 빈 상태가 첫인상이다.
 * 그래서 "없다"가 아니라 "하면 이렇게 된다"를 말하는 문구 + 행동 버튼(action)을 권장.
 *
 * ⚠️ **표면·크기를 고르는 prop 이 없다.** 소비처가 정하는 것은 아이콘·문구·CTA 뿐이고,
 *    얼굴(소프트 존 배경 + 아이콘 칩 + 타이포)과 크기(**부모 100%**)는 여기서만 정한다.
 *
 *    2026-09-04 대표 지시로 ~~`fill`~~·~~`bare`~~·~~`soft`~~ 세 prop 을 전부 없앴다.
 *    셋을 두니 소비처마다 조합이 달라져 같은 뜻의 면이 화면마다 다른 얼굴이 됐다
 *    (유리 박스 / 배경 없음 / 소프트 존 + 채움 여부 = 조합 6가지가 24곳에 흩어짐).
 *    공용 컴포넌트를 쓰고 있었는데도 디자인이 갈라진 이유가 정확히 이것이다 —
 *    **선택지를 없애는 것이 유일한 구조적 해결**이다. 새 변형을 prop 으로 되돌리지 말 것.
 */
import type { LucideIcon } from "lucide-react";
import s from "./empty-state.module.css";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={s.wrap}>
      <div className={s.box} role="status">
        {Icon && (
          <span className={s.icon}>
            <Icon aria-hidden="true" />
          </span>
        )}
        <p className={s.title}>{title}</p>
        {description && <p className={s.desc}>{description}</p>}
        {action && <div className={s.action}>{action}</div>}
      </div>
    </div>
  );
}
