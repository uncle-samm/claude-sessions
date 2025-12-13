import { create } from "zustand";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  content: string;
  status: TodoStatus;
  activeForm?: string;
  priority?: string;
}

interface TodosState {
  // Todos per session
  todosBySession: Record<string, TodoItem[]>;

  // Update todos for a session (called when TodoWrite tool is used)
  setTodos: (sessionId: string, todos: TodoItem[]) => void;

  // Get todos for a session
  getTodos: (sessionId: string) => TodoItem[];

  // Clear todos for a session
  clearTodos: (sessionId: string) => void;
}

export const useTodosStore = create<TodosState>((set, get) => ({
  todosBySession: {},

  setTodos: (sessionId: string, todos: TodoItem[]) => {
    set((state) => ({
      todosBySession: {
        ...state.todosBySession,
        [sessionId]: todos,
      },
    }));
  },

  getTodos: (sessionId: string) => {
    return get().todosBySession[sessionId] || [];
  },

  clearTodos: (sessionId: string) => {
    set((state) => {
      const { [sessionId]: _, ...rest } = state.todosBySession;
      return { todosBySession: rest };
    });
  },
}));

// Helper to extract todos from a TodoWrite tool input
export function extractTodosFromToolInput(input: unknown): TodoItem[] {
  if (!input || typeof input !== "object") return [];

  const inputObj = input as Record<string, unknown>;
  const todos = inputObj.todos;

  if (!Array.isArray(todos)) return [];

  return todos.map((todo) => ({
    content: String((todo as Record<string, unknown>).content || ""),
    status: ((todo as Record<string, unknown>).status as TodoStatus) || "pending",
    activeForm: (todo as Record<string, unknown>).activeForm as string | undefined,
    priority: (todo as Record<string, unknown>).priority as string | undefined,
  }));
}
