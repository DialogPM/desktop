// Markdown rendering of a message (blocks from lib/richText.parseBlocks): headings, lists,
// quotes, tables and code blocks with syntax highlighting and a copy button. Nothing in a message
// is ever rendered as HTML: highlight.js output is escaped text in <span class="hljs-…">.

import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import dart from "highlight.js/lib/languages/dart";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { memo, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { copyText } from "../../lib/platform";
import type { Block, Seg } from "../../lib/richText";

const LANGS = {
  bash, c, cpp, csharp, css, dart, diff, go, java, javascript, json, kotlin, markdown, php,
  python, ruby, rust, sql, swift, typescript, xml, yaml,
};
for (const [name, lang] of Object.entries(LANGS)) hljs.registerLanguage(name, lang);
hljs.registerAliases(["sh", "shell", "zsh", "console"], { languageName: "bash" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });

// Above this a block is shown plain: highlighting is synchronous and runs on every render.
const HIGHLIGHT_LIMIT = 50_000;

/** Highlighted code as React nodes (never innerHTML): walks highlight.js's token tree. */
function highlight(code: string, lang: string): { nodes: ReactNode; lang: string } {
  if (code.length > HIGHLIGHT_LIMIT) return { nodes: code, lang };
  try {
    const known = lang && hljs.getLanguage(lang);
    const res = known ? hljs.highlight(code, { language: lang, ignoreIllegals: true }) : lang ? null : hljs.highlightAuto(code, Object.keys(LANGS));
    if (!res || (!known && (res.relevance ?? 0) < 5)) return { nodes: code, lang };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const root = (res as any)._emitter?.rootNode as HNode | undefined;
    if (!root) return { nodes: code, lang };
    return { nodes: render(root, "0"), lang: lang || res.language || "" };
  } catch {
    return { nodes: code, lang };
  }
}

type HNode = string | { scope?: string; children: HNode[] };

function render(n: HNode, key: string): ReactNode {
  if (typeof n === "string") return n;
  const kids = n.children.map((c, i) => render(c, `${key}.${i}`));
  if (!n.scope || n.scope.startsWith("language:")) return kids;
  const cls = n.scope
    .split(".")
    .map((p, i) => (i === 0 ? `hljs-${p}` : `${p}${"_".repeat(i)}`))
    .join(" ");
  return (
    <span key={key} className={cls}>
      {kids}
    </span>
  );
}

export const CodeBlock = memo(function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const hl = useMemo(() => highlight(code, lang), [code, lang]);
  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <div className="md-code">
      <div className="md-code-head">
        <span className="md-code-lang">{hl.lang || "text"}</span>
        <button type="button" className="md-code-copy" onClick={() => void copy()}>
          <Icon name={copied ? "check" : "copy"} size={14} />
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>
      <pre className="md-code-body">
        <code className="hljs">{hl.nodes}</code>
      </pre>
    </div>
  );
});

/** Renders Markdown blocks; `inline` renders the inline segments of a block. */
export function MarkdownBlocks({ blocks, inline }: { blocks: Block[]; inline: (segs: Seg[]) => ReactNode }) {
  return (
    <div className="md">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "para":
            return (
              <p key={i} className="md-p">
                {inline(b.segs)}
              </p>
            );
          case "heading": {
            const H = `h${Math.min(b.level + 2, 6)}` as "h3";
            return (
              <H key={i} className={`md-h md-h${b.level}`}>
                {inline(b.segs)}
              </H>
            );
          }
          case "code":
            return <CodeBlock key={i} code={b.text} lang={b.lang} />;
          case "list": {
            const items = b.items.map((it, j) => <li key={j}>{inline(it)}</li>);
            return b.ordered ? (
              <ol key={i} className="md-list" start={b.start}>
                {items}
              </ol>
            ) : (
              <ul key={i} className="md-list">
                {items}
              </ul>
            );
          }
          case "quote":
            return (
              <blockquote key={i} className="md-quote">
                {inline(b.segs)}
              </blockquote>
            );
          case "table":
            return (
              <div key={i} className="md-table-wrap">
                <table className="md-table">
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j} style={{ textAlign: b.align[j] ?? undefined }}>
                          {inline(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, k) => (
                      <tr key={k}>
                        {b.head.map((_, j) => (
                          <td key={j} style={{ textAlign: b.align[j] ?? undefined }}>
                            {r[j] ? inline(r[j]) : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "hr":
            return <hr key={i} className="md-hr" />;
        }
      })}
    </div>
  );
}
