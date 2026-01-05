import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { escapeHtml, useHighlightedCode } from "./HighlightedCode";
import { normalizeLanguage } from "./highlighting";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

function MarkdownCode({
  inline,
  className,
  children,
}: {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const raw = String(children || "");
  const value = raw.replace(/\n$/, "");

  if (inline) {
    return <code className="inline-code">{value}</code>;
  }

  const language = normalizeLanguage(className);
  const highlighted = useHighlightedCode(value, language, { defer: true });
  const fallback = escapeHtml(value);

  return (
    <code
      className={["hljs", language ? `language-${language}` : null].filter(Boolean).join(" ")}
      dangerouslySetInnerHTML={{ __html: highlighted || fallback }}
    />
  );
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          pre: ({ children }) => <pre className="code-block">{children}</pre>,
          code: MarkdownCode,
          table: ({ children }) => (
            <div className="markdown-table">
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
