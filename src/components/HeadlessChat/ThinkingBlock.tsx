import { useState } from "react";
import { useSettingsStore } from "../../store/settings";

interface ThinkingBlockProps {
  thinking: string;
}

export function ThinkingBlock({ thinking }: ThinkingBlockProps) {
  const { verboseMode } = useSettingsStore();
  const [expanded, setExpanded] = useState(false);

  // If not in verbose mode, don't render thinking blocks at all
  if (!verboseMode) {
    return null;
  }

  // Truncate for preview
  const preview = thinking.length > 200 ? thinking.slice(0, 200) + "..." : thinking;

  return (
    <div className="thinking-block">
      <div className="thinking-header" onClick={() => setExpanded(!expanded)}>
        <span className={`thinking-chevron ${expanded ? "expanded" : ""}`} aria-hidden="true" />
        <span className="thinking-icon" aria-hidden="true" />
        <span className="thinking-label">Thinking</span>
        <span className="thinking-length">({thinking.length} chars)</span>
      </div>
      <div className={`thinking-content ${expanded ? "expanded" : ""}`}>
        <pre>{expanded ? thinking : preview}</pre>
        {!expanded && thinking.length > 200 && (
          <button className="thinking-expand-btn" onClick={(e) => { e.stopPropagation(); setExpanded(true); }}>
            Show more
          </button>
        )}
      </div>
    </div>
  );
}
