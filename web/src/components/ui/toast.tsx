"use client";

/**
 * Toast — 일시 알림의 **단일 원본** (2026-08-03 신설).
 *
 * ── 왜 필요했나 ──
 * 목록에서 버튼을 눌러 실행하는 액션(메일 발송·하트 토글·멤버 역할 변경·대화 숨김)은
 * 실패해도 **붙일 자리가 없어 조용히 넘어갔다.** 서버는 정확한 사유를 돌려주는데
 * 화면이 그걸 버리고 있었다 — "눌렀는데 아무 반응이 없다"의 정체.
 *
 * ── 구 MVP(k-beauty-biz-buddy)와의 관계 ──
 * 호출 계약은 그대로 가져왔다 — `toast({ title, description, variant })`.
 * 익숙한 사용법을 유지해 옮겨 적을 때 실수를 줄이기 위함이다.
 * 다만 **구현은 새로 썼다**: 구 MVP 는 shadcn/ui(Radix + Tailwind + cva) 기반이라
 * 그대로 들이면 우리에게 없는 의존성 3개와 **두 번째 스타일링 체계**가 따라온다.
 * 이 레포는 CSS Modules + 디자인 토큰 하나로 간다(DESIGN.md) — 표면은 유리 카드 문법을 쓴다.
 *
 * ── 생김새 (2026-08-03 대표 지시 반영) ──
 * 골격(패딩·닫기 버튼 hover 표시·본문 위계)은 구 MVP 원본을 따르되,
 *   · 위치는 **우측 상단**
 *   · 표면은 **불투명 흰 카드**(유리 아님) — 읽으라고 띄우는 표면이라 대비를 우선한다
 *   · 강조는 **제목 색** 하나로. 원본에 없는 장치(아이콘·좌측 바)는 넣지 않는다
 * 대응표는 toast.module.css 상단.
 *
 * ── 동작 (구 MVP 스펙 계승 + 개선) ──
 *   · 우하단 스택, 최신이 아래
 *   · 자동 소멸 — 기본 5초 (구 MVP 는 사실상 무한이라 수동으로 닫아야 했다. 실패 알림을
 *     계속 띄워두면 다음 작업을 가리므로 자동으로 걷는다. 에러는 조금 더 길게 7초)
 *   · 최대 3개까지 쌓이고 넘치면 오래된 것부터 밀려난다 (구 MVP 는 1개 — 연속 실패 시
 *     앞의 사유가 사라져 원인을 놓친다)
 *   · 마우스를 올리면 타이머 정지 (읽는 중에 사라지지 않게)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import s from "./toast.module.css";

export type ToastVariant = "default" | "destructive" | "success";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms. 미지정 시 variant 별 기본값 */
  duration?: number;
};

type ToastItem = ToastInput & { id: string };

const MAX_VISIBLE = 3;
const DEFAULT_MS = 5000;
const ERROR_MS = 7000;

type ToastFn = (input: ToastInput) => void;

const ToastContext = createContext<ToastFn | null>(null);

/**
 * 앱 어디서든 `const toast = useToast()` 로 부른다.
 * Provider 밖에서 부르면 조용히 무시한다 — 알림 하나 때문에 화면이 죽으면 안 된다.
 */
export function useToast(): ToastFn {
  const fn = useContext(ToastContext);
  return fn ?? (() => {});
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const arm = useCallback((item: ToastItem) => {
    const ms = item.duration ?? (item.variant === "destructive" ? ERROR_MS : DEFAULT_MS);
    const handle = window.setTimeout(() => dismiss(item.id), ms);
    timers.current.set(item.id, handle);
  }, [dismiss]);

  const toast = useCallback<ToastFn>((input) => {
    const item: ToastItem = { ...input, id: crypto.randomUUID() };
    setItems((prev) => [...prev, item].slice(-MAX_VISIBLE));
    arm(item);
  }, [arm]);

  // 언마운트 시 남은 타이머 정리 (라우팅 중 누수 방지)
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((h) => window.clearTimeout(h));
      map.clear();
    };
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* role=status + aria-live: 스크린리더가 화면 전환 없이 읽는다 */}
      <div className={s.viewport} role="status" aria-live="polite">
        {items.map((t) => (
          <ToastCard
            key={t.id}
            item={t}
            onClose={() => dismiss(t.id)}
            onPause={() => {
              const h = timers.current.get(t.id);
              if (h) window.clearTimeout(h);
            }}
            onResume={() => arm(t)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  item, onClose, onPause, onResume,
}: {
  item: ToastItem;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  return (
    <div
      className={`${s.toast} ${item.variant === "destructive" ? s.destructive : ""} ${item.variant === "success" ? s.success : ""}`}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
    >
      <div className={s.body}>
        <strong className={s.title}>{item.title}</strong>
        {item.description && <span className={s.desc}>{item.description}</span>}
      </div>
      <button type="button" className={s.close} onClick={onClose} aria-label="닫기">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
