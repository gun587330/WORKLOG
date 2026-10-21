"use client";

/**
 * 앱 전체 공용 입력 필드 — 입력 스타일의 단일 원본 (field.module.css).
 *
 * 라벨·아이콘·힌트 배치를 여기 한 곳에 두면, 화면이 늘어나도 입력 생김새가 갈라지지 않는다.
 * (구 MVP는 화면마다 input 클래스를 복사해서 미묘하게 다 달랐다)
 * Select/Textarea/ChipsInput 은 이 파일의 .input 을 composes 로 이어받는다.
 * 원래 components/auth/ 에 있었으나 제품 등록 폼(두 번째 사용처)이 생겨 ui/ 로 승격 (2026-07-18).
 */
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import s from "./field.module.css";

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: LucideIcon;
  /** 입력 아래 우측에 붙는 보조 요소 (예: "비밀번호를 잊으셨나요?") */
  hint?: React.ReactNode;
  /** 라벨 옆 작은 태그 (예: "필수", "공개 시 필수") */
  tag?: string;
  /** 라벨 행의 보조 슬롯 (글자수 카운트·인라인 액션 버튼 등) — Textarea 와 같은 규약 */
  corner?: React.ReactNode;
  /** corner 를 행 끝이 아니라 **라벨 텍스트 바로 옆**에 붙인다 (인라인 액션 버튼용) */
  cornerInline?: boolean;
  /** 라벨 텍스트 바로 옆 설명 문구 (좌측 기준). 아래 힌트 줄 대신 — 높이를 먹지 않는다 (2026-08-30) */
  labelHint?: React.ReactNode;
};

export function Field({ label, icon: Icon, hint, tag, corner, cornerInline, labelHint, id, className, ...rest }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <div className={s.field}>
      {/* corner 가 없으면 라벨만 — 기존 화면의 여백이 바뀌지 않게 래퍼를 씌우지 않는다 */}
      {corner || labelHint ? (
        <div className={s.labelRow}>
          <label className={s.label} htmlFor={fieldId}>
            {label}
            {tag && <span className={s.tag}>{tag}</span>}
          </label>
          {/* cornerInline(라벨 옆 액션 버튼)이면 버튼 → 힌트 순서 — 힌트가 버튼의 사용법을
              설명하므로 버튼 오른쪽에 온다 (2026-09-06 대표 지시). 행 끝 corner 는 종전 순서 */}
          {cornerInline && corner && <span className={`${s.corner} ${s.cornerInline}`}>{corner}</span>}
          {labelHint && <span className={s.labelHint}>{labelHint}</span>}
          {!cornerInline && corner && <span className={s.corner}>{corner}</span>}
        </div>
      ) : (
        <label className={s.label} htmlFor={fieldId}>
          {label}
          {tag && <span className={s.tag}>{tag}</span>}
        </label>
      )}
      <div className={s.wrap}>
        {Icon && <Icon className={s.icon} aria-hidden="true" />}
        <input
          id={fieldId}
          className={`${s.input} ${Icon ? s.hasIcon : ""} ${className ?? ""}`}
          {...rest}
        />
      </div>
      {hint && <div className={s.hint}>{hint}</div>}
    </div>
  );
}

/** 표시/숨기기 토글이 붙은 비밀번호 필드 */
export function PasswordField({ label, icon: Icon, hint, id, ...rest }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [reveal, setReveal] = useState(false);
  const t = useTranslations("auth.field");

  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={fieldId}>{label}</label>
      <div className={s.wrap}>
        {Icon && <Icon className={s.icon} aria-hidden="true" />}
        <input
          id={fieldId}
          type={reveal ? "text" : "password"}
          className={`${s.input} ${Icon ? s.hasIcon : ""} ${s.hasTrailing}`}
          {...rest}
        />
        <button
          type="button"
          className={s.reveal}
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? t("hide") : t("show")}
        >
          {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {hint && <div className={s.hint}>{hint}</div>}
    </div>
  );
}
