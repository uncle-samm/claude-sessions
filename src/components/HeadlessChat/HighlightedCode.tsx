import { useEffect, useMemo, useState } from "react";
import { getHighlighter, normalizeLanguage } from "./highlighting";

type HighlightOptions = {
  defer?: boolean;
};

type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;
type IdleCallbackHandle = number;

const idleApi = globalThis as typeof globalThis & {
  requestIdleCallback?: (callback: IdleCallback, options?: { timeout: number }) => IdleCallbackHandle;
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
};

function scheduleIdle(callback: () => void): () => void {
  if (idleApi.requestIdleCallback) {
    const handle = idleApi.requestIdleCallback(() => callback(), { timeout: 1200 });
    return () => idleApi.cancelIdleCallback?.(handle);
  }
  const timeout = setTimeout(callback, 0);
  return () => clearTimeout(timeout);
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (match) => {
    switch (match) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return match;
    }
  });
}

export function useHighlightedCode(code: string, language?: string, options?: HighlightOptions): string | null {
  const [html, setHtml] = useState<string | null>(null);
  const normalizedLanguage = normalizeLanguage(language);
  const defer = options?.defer ?? true;

  useEffect(() => {
    let active = true;
    let cancelSchedule: (() => void) | null = null;

    if (!code.trim() || !normalizedLanguage) {
      setHtml(null);
      return () => {
        active = false;
      };
    }

    getHighlighter()
      .then((hljs) => {
        const runHighlight = () => {
          if (!active) return;
          if (!hljs.getLanguage(normalizedLanguage)) {
            if (active) setHtml(null);
            return;
          }
          const highlighted = hljs.highlight(code, { language: normalizedLanguage, ignoreIllegals: true }).value;
          if (active) setHtml(highlighted);
        };
        if (defer) {
          cancelSchedule = scheduleIdle(runHighlight);
        } else {
          runHighlight();
        }
      })
      .catch(() => {
        if (active) setHtml(null);
      });

    return () => {
      active = false;
      if (cancelSchedule) cancelSchedule();
    };
  }, [code, normalizedLanguage, defer]);

  return html;
}

export function useHighlightedLines(code: string, language?: string, options?: HighlightOptions): string[] | null {
  const html = useHighlightedCode(code, language, options);

  return useMemo(() => {
    if (!html) return null;
    return html.split("\n");
  }, [html]);
}

export function HighlightedCodeBlock({
  code,
  language,
  className,
  codeClassName,
  defer = true,
}: {
  code: string;
  language?: string;
  className?: string;
  codeClassName?: string;
  defer?: boolean;
}) {
  const normalizedLanguage = normalizeLanguage(language);
  const highlighted = useHighlightedCode(code, normalizedLanguage, { defer });
  const fallback = useMemo(() => escapeHtml(code), [code]);
  const codeClass = ["hljs", normalizedLanguage ? `language-${normalizedLanguage}` : null, codeClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <pre className={className}>
      {highlighted ? (
        <code className={codeClass} dangerouslySetInnerHTML={{ __html: highlighted }} />
      ) : (
        <code className={codeClass} dangerouslySetInnerHTML={{ __html: fallback }} />
      )}
    </pre>
  );
}
