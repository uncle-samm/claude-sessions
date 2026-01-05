import type { HLJSApi } from "highlight.js";

const languageAliases: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  md: "markdown",
  yml: "yaml",
  sh: "bash",
  zsh: "bash",
  shell: "bash",
  html: "xml",
  toml: "ini",
};

export function normalizeLanguage(language?: string | null): string | undefined {
  if (!language) return undefined;
  const cleaned = language.toLowerCase().replace(/^language-/, "");
  return languageAliases[cleaned] || cleaned;
}

export function getLanguageFromFilename(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  return normalizeLanguage(ext);
}

let highlighterPromise: Promise<HLJSApi> | null = null;

export function getHighlighter(): Promise<HLJSApi> {
  if (highlighterPromise) return highlighterPromise;

  highlighterPromise = (async () => {
    const hljs = (await import("highlight.js/lib/core")).default;

    const [
      javascript,
      typescript,
      json,
      bash,
      python,
      rust,
      yaml,
      ini,
      markdown,
      css,
      xml,
      diff,
    ] = await Promise.all([
      import("highlight.js/lib/languages/javascript"),
      import("highlight.js/lib/languages/typescript"),
      import("highlight.js/lib/languages/json"),
      import("highlight.js/lib/languages/bash"),
      import("highlight.js/lib/languages/python"),
      import("highlight.js/lib/languages/rust"),
      import("highlight.js/lib/languages/yaml"),
      import("highlight.js/lib/languages/ini"),
      import("highlight.js/lib/languages/markdown"),
      import("highlight.js/lib/languages/css"),
      import("highlight.js/lib/languages/xml"),
      import("highlight.js/lib/languages/diff"),
    ]);

    hljs.registerLanguage("javascript", javascript.default);
    hljs.registerLanguage("typescript", typescript.default);
    hljs.registerAliases(["jsx"], { languageName: "javascript" });
    hljs.registerAliases(["tsx"], { languageName: "typescript" });
    hljs.registerLanguage("json", json.default);
    hljs.registerLanguage("bash", bash.default);
    hljs.registerLanguage("python", python.default);
    hljs.registerLanguage("rust", rust.default);
    hljs.registerLanguage("yaml", yaml.default);
    hljs.registerLanguage("ini", ini.default);
    hljs.registerAliases(["toml"], { languageName: "ini" });
    hljs.registerLanguage("markdown", markdown.default);
    hljs.registerLanguage("css", css.default);
    hljs.registerLanguage("xml", xml.default);
    hljs.registerLanguage("diff", diff.default);

    await import("highlight.js/styles/github-dark.css");

    return hljs;
  })();

  return highlighterPromise;
}
