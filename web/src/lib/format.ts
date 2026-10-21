/** 날짜 표기 — 화면 전역 공통. 모두 로컬 시간대 · ISO(YYYY-MM-DD) 문자열을 받는다 */
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
export const pad2 = (n: number) => String(n).padStart(2, "0");

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function addMonths(iso: string, n: number): string {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1));
}
/** "10월 21일 화요일" */
export function fmtKDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const d = parseISO(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`;
}
/** "2026년 10월 21일 화요일" */
export function fmtKDateLong(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
  const d = parseISO(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`;
}
/** "10-21" */
export const fmtMD = (iso: string | null | undefined) => (iso ? iso.slice(5, 10) : "");
/** "10-20 ~ 10-26" */
export const fmtPeriod = (a: string | null | undefined, b: string | null | undefined) => (a || b ? `${fmtMD(a) || "?"} ~ ${fmtMD(b) || "?"}` : "");
/** "2026년 10월" */
export function fmtMonth(iso: string): string {
  const d = parseISO(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}
export const daysInMonth = (iso: string) => { const d = parseISO(iso); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
export const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);
/** 기록 코드 L-2026-10-19(-2) → "10-19" */
export const logCodeToMD = (code: string) => (code.match(/^L-\d{4}-(\d{2}-\d{2})/)?.[1] ?? code);
