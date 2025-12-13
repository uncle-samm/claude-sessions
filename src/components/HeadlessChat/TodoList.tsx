import { TodoItem, TodoStatus } from "../../store/todos";

interface TodoListProps {
  todos: TodoItem[];
  sessionId: string;
}

// Get status icon
function getStatusIcon(status: TodoStatus): string {
  switch (status) {
    case "completed": return "✓";
    case "in_progress": return "●";
    case "pending": return "○";
  }
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

  // Find the current in-progress task
  const currentTask = todos.find(t => t.status === "in_progress");

  return (
    <div className="todo-panel">
      <div className="todo-header">
        <span className="todo-icon">📋</span>
        <span className="todo-title">Todo List</span>
        <span className="todo-progress">
          {completedCount}/{totalCount} ({progressPercent}%)
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
          <span className="current-indicator">▶</span>
          <span className="current-text">{currentTask.activeForm || currentTask.content}</span>
        </div>
      )}

      {/* Todo items */}
      <div className="todo-items">
        {todos.map((todo, index) => (
          <div key={index} className={`todo-item ${getStatusClass(todo.status)}`}>
            <span className="todo-status-icon">{getStatusIcon(todo.status)}</span>
            <span className={`todo-content ${todo.status === "completed" ? "strikethrough" : ""}`}>
              {todo.content}
            </span>
          </div>
        ))}
      </div>

      {/* Keyboard hint */}
      <div className="todo-hint">
        Press Ctrl+T to hide
      </div>
    </div>
  );
}
