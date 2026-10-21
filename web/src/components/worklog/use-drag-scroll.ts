"use client";

/**
 * 가로 드래그 스크롤 — 프롬프트 줄 · 기록 카드 줄이 같이 쓴다. 세로 휠은 가로로 보낸다.
 * 카드(링크) 위에서 끌어도 되게 하되, 끌었으면(4px 이상) 그 클릭은 삼킨다 — 안 그러면 드래그를 놓는 순간 상세가 열린다.
 */
import { useEffect, useRef, useState } from "react";

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      drag.current = { x: e.clientX, left: ref.current?.scrollLeft ?? 0, moved: false };
      suppressClick.current = false;
      setDragging(true);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d || !ref.current) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 4) {
        d.moved = true;
        ref.current.setPointerCapture(e.pointerId);
      }
      if (d.moved) ref.current.scrollLeft = d.left - dx;
    },
    onPointerUp: () => {
      if (drag.current?.moved) suppressClick.current = true;
      drag.current = null;
      setDragging(false);
    },
    onPointerCancel: () => { drag.current = null; setDragging(false); },
    onClickCapture: (e: React.MouseEvent) => {
      if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; }
    },
  };
  return { ref, dragging, handlers };
}
