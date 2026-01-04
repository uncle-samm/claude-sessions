import { TodoItem, TodoStatus } from "../../store/todos";

interface TodoListProps {
  todos: TodoItem[];
  sessionId: string;
}

// Styled circular checkbox component
function TodoCheckbox({ status }: { status: TodoStatus }) {
  return (
    <div className={`todo-checkbox ${status}`}>
      {status === "completed" && <span className="checkmark" />}
      {status === "in_progress" && <span className="progress-dot" />}
    </div>
  );
}

// Priority badge component
function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority || priority === "low") return null;
  return (
    <span className={`priority-badge ${priority}`}>
      {priority}
    </span>
  );
}

// Get status class
function getStatusClass(status: TodoStatus): string {
  switch (status) {
    case "completed": return "completed";
    case "in_progress": return "in-progress";
    case "pending": return "pending";
  }
}

export function TodoList({ todos }: TodoListProps) {
  const completedCount = todos.filter(t => t.status === "completed").length;
  const totalCount = todos.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const progressLabel = totalCount > 0 ? `${completedCount}/${totalCount} (${progressPercent}%)` : "No tasks yet";

  // Find the current in-progress task
  const currentTask = todos.find(t => t.status === "in_progress");

  return (
    <div className="todo-panel">
      <div className="todo-header">
        <span className="todo-icon-styled" />
        <span className="todo-title">Todo List</span>
        <span className="todo-progress">
          {progressLabel}
        </span>
      </div>

      {/* Progress bar */}
      <div className="todo-progress-bar">
        <div
          className="todo-progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Current task highlight */}
      {currentTask && (
        <div className="todo-current">
          <span className="current-indicator" aria-hidden="true" />
          <span className="current-text">{currentTask.activeForm || currentTask.content}</span>
        </div>
      )}

      {/* Todo items */}
      {totalCount === 0 ? (
        <div className="todo-empty">
          <div className="todo-empty-title">No todos yet</div>
          <div className="todo-empty-detail">Claude will add tasks here when it plans work.</div>
        </div>
      ) : (
        <div className="todo-items">
          {todos.map((todo, index) => (
            <div key={index} className={`todo-item ${getStatusClass(todo.status)}`}>
              <div className="todo-item-row">
                <TodoCheckbox status={todo.status} />
                <span className={`todo-content ${todo.status === "completed" ? "strikethrough" : ""}`}>
                  {todo.content}
                </span>
              </div>
              {todo.priority && todo.priority !== "low" && (
                <PriorityBadge priority={todo.priority} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Keyboard hint */}
      <div className="todo-hint">
        Press Ctrl+T to hide
      </div>
    </div>
  );
}
