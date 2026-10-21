"use client";

/**
 * 작업 본문 렌더러 — 작업 하나의 md 를 그린다. 토글(`::: 제목` ~ `:::`)은 파서(lib/work-log splitToggles)가
 * 조각으로 나눠 주고 여기서 details 로 감싼다. HTML 은 렌더하지 않는다(react-markdown 기본값).
 * anserx-code components/admin/work-markdown.tsx 와 같다(경로만).
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitToggles } from "@/lib/work-log";
import s from "./worklog.module.css";

function Md({ md }: { md: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{ table: (props) => (<div className={s.tableWrap}><table {...props} /></div>) }}
    >
      {md}
    </ReactMarkdown>
  );
}

export function WorkMarkdown({ md }: { md: string }) {
  const chunks = splitToggles(md);
  return (
    <div className={s.body}>
      {chunks.map((c, i) =>
        c.kind === "md" ? (
          <Md key={i} md={c.md} />
        ) : (
          <details key={i} className={s.toggle}>
            <summary>{c.title}</summary>
            <div className={s.toggleBody}><Md md={c.md} /></div>
          </details>
        ),
      )}
    </div>
  );
}
