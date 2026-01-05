import { useMemo, useState } from "react";
import "./MessageStyleExamples.css";

interface Variant {
  id: "ledger" | "timeline" | "studio" | "editorial";
  label: string;
  summary: string;
  tone: string;
}

interface ExampleMessage {
  id: string;
  role: "user" | "ai";
  title: string;
  body: string[];
  bullets?: string[];
  meta?: string;
}

interface ExampleTodo {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "completed";
}

const VARIANTS: Variant[] = [
  {
    id: "ledger",
    label: "Ledger Cards",
    summary: "Wide offset panels with soft gradients and minimal framing.",
    tone: "Calm rhythm, rich surface depth.",
  },
  {
    id: "timeline",
    label: "Timeline Stream",
    summary: "Flowing chat panels with faint edge glow and gentle offsets.",
    tone: "Lightweight, drifting cadence.",
  },
  {
    id: "studio",
    label: "Studio Panels",
    summary: "Crisp frames with gradient edging and quiet typography.",
    tone: "Studio calm, deliberate spacing.",
  },
  {
    id: "editorial",
    label: "Editorial Notes",
    summary: "Rounded notes with airy spacing and diffused color.",
    tone: "Soft, composed, reflective.",
  },
];

const SAMPLE_MESSAGES: ExampleMessage[] = [
  {
    id: "prompt-1",
    role: "user",
    title: "Set the direction",
    body: [
      "Move the experience away from chat framing.",
      "Keep roles distinct without labels or avatars.",
    ],
    meta: "10:42",
  },
  {
    id: "ai-1",
    role: "ai",
    title: "Visual plan",
    body: [
      "Use a strong structural frame and quiet typography.",
      "Let color and texture carry the role identity.",
    ],
    bullets: [
      "Wide panels with subtle offsets",
      "No avatars, no name headers",
      "Soft gradients to separate roles",
    ],
    meta: "10:43",
  },
  {
    id: "prompt-2",
    role: "user",
    title: "Constraints",
    body: [
      "Keep layout crisp and legible on smaller screens.",
      "Avoid left/right speech alignment patterns.",
    ],
    meta: "10:45",
  },
  {
    id: "ai-2",
    role: "ai",
    title: "Spec summary",
    body: [
      "Each entry reads as a calm panel, not a speech bubble.",
      "The flow should feel generous and steady.",
    ],
    bullets: [
      "Consistent spacing rhythm",
      "Muted backgrounds, clear hierarchy",
      "Role-specific color drift",
    ],
    meta: "10:46",
  },
];

const SAMPLE_TODOS: ExampleTodo[] = [
  { id: "todo-1", label: "Define role chip styles", status: "completed" },
  { id: "todo-2", label: "Refine timeline spacing", status: "in_progress" },
  { id: "todo-3", label: "Balance editorial margins", status: "pending" },
];

export function MessageStyleExamples({ onExit }: { onExit: () => void }) {
  const [activeId, setActiveId] = useState<Variant["id"]>("ledger");

  const activeIndex = useMemo(
    () => VARIANTS.findIndex((variant) => variant.id === activeId),
    [activeId],
  );
  const activeVariant = VARIANTS[activeIndex] ?? VARIANTS[0];

  const handlePrev = () => {
    const nextIndex = (activeIndex - 1 + VARIANTS.length) % VARIANTS.length;
    setActiveId(VARIANTS[nextIndex].id);
  };

  const handleNext = () => {
    const nextIndex = (activeIndex + 1) % VARIANTS.length;
    setActiveId(VARIANTS[nextIndex].id);
  };

  return (
    <div className="message-examples">
      <header className="examples-header">
        <div>
          <p className="examples-kicker">Message UI Studies</p>
          <h1 className="examples-title">Wider, calmer message flow</h1>
        </div>
        <div className="examples-actions">
          <button type="button" className="examples-btn" onClick={handlePrev}>
            Previous
          </button>
          <button type="button" className="examples-btn primary" onClick={handleNext}>
            Next
          </button>
          <button type="button" className="examples-btn ghost" onClick={onExit}>
            Back to app
          </button>
        </div>
      </header>

      <div className="examples-layout">
        <aside className="examples-sidebar">
          <p className="sidebar-title">Variants</p>
          <div className="variant-list">
            {VARIANTS.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className={`variant-btn ${variant.id === activeId ? "active" : ""}`}
                onClick={() => setActiveId(variant.id)}
              >
                <span className="variant-label">{variant.label}</span>
                <span className="variant-summary">{variant.tone}</span>
              </button>
            ))}
          </div>
          <div className="examples-hint">
            Tip: Use hash <code>#examples</code> to open this view.
          </div>
        </aside>

        <main className={`examples-stage variant-${activeVariant.id}`}>
          <div className="examples-hero">
            <h2>{activeVariant.label}</h2>
            <p>{activeVariant.summary}</p>
          </div>

          <section className="example-feed">
            {SAMPLE_MESSAGES.map((message) => (
              <article
                key={message.id}
                className={`example-message role-${message.role}`}
              >
                <div className="example-message-header">
                  <span className="example-message-title">{message.title}</span>
                  {message.meta && (
                    <span className="example-message-meta">{message.meta}</span>
                  )}
                </div>
                <div className="example-message-body">
                  {message.body.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {message.bullets && (
                    <ul>
                      {message.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </section>

          <section className="example-todos">
            <div className="example-todos-header">
              <span>Worklist</span>
              <span className="example-todos-subtitle">
                Example tasks for layout review
              </span>
            </div>
            <div className="example-todos-grid">
              {SAMPLE_TODOS.map((todo) => (
                <div
                  key={todo.id}
                  className={`example-todo status-${todo.status}`}
                >
                  <span className="example-todo-status">{todo.status.replace("_", " ")}</span>
                  <span className="example-todo-label">{todo.label}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
