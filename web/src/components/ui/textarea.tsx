"use client";

/**
 * Textarea — 공용 멀티라인 입력. 입력 시각 언어는 ui/field.module.css 의 .input 상속.
 */
import { useId } from "react";
import s from "./textarea.module.css";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  /** 라벨 행의 보조 표시 (글자수 카운트 등) */
  corner?: React.ReactNode;
  /** corner 를 행 끝이 아니라 **라벨 텍스트 바로 옆**에 붙인다 (인라인 액션 버튼용) */
  cornerInline?: boolean;
  /** 입력 아래 보조 문구 */
  hint?: React.ReactNode;
  /** 라벨 옆 작은 태그 (예: "공개 시 필수") */
  tag?: string;
  /** 라벨 텍스트 바로 옆 설명 문구 (좌측 기준) — Field 와 같은 규약 */
  labelHint?: React.ReactNode;
};

export function Textarea({ label, corner, cornerInline, hint, tag, labelHint, id, className, ...rest }: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <div className={s.field}>
      <div className={s.labelRow}>
        <label className={s.label} htmlFor={fieldId}>
          {label}
          {tag && <span className={s.tag}>{tag}</span>}
        </label>
        {/* cornerInline 이면 버튼 → 힌트 순서 (field.tsx 와 같은 이유, 2026-09-06) */}
        {cornerInline && corner && <span className={`${s.corner} ${s.cornerInline}`}>{corner}</span>}
        {labelHint && <span className={s.labelHint}>{labelHint}</span>}
        {!cornerInline && corner && <span className={s.corner}>{corner}</span>}
      </div>
      <textarea id={fieldId} className={`${s.textarea} ${className ?? ""}`} {...rest} />
      {hint && <div className={s.hint}>{hint}</div>}
    </div>
  );
}
