/**
 * ⚠️ 자리표시자 — `npm run gen:types`(루트) 가 원격 스키마에서 이 파일을 덮어쓴다.
 * 마이그레이션을 push 하기 전까지 typecheck 가 돌도록 빈 스키마만 둔다.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
