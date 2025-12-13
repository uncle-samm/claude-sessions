import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useCurrentUser } from "./useConvexUser";
import { ContentBlock } from "../store/messages";

export interface ConvexMessage {
  _id: Id<"messages">;
  _creationTime: number;
  sessionId: Id<"sessions">;
  externalId?: string;
  type: "user" | "assistant" | "system" | "error";
  content: ContentBlock[];
  cost?: number;
  model?: string;
}

export interface ConvexTodo {
  _id: Id<"todos">;
  _creationTime: number;
  sessionId: Id<"sessions">;
  content: string;
  activeForm?: string;
  status: "pending" | "in_progress" | "completed";
  priority?: string;
}

// Hook to get or create a Convex session for a local session ID
export function useConvexSession(localSessionId: string, cwd: string, name: string) {
  const { userId, isLoading: userLoading } = useCurrentUser();
  const [convexSessionId, setConvexSessionId] = useState<Id<"sessions"> | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Query for existing session
  const existingSession = useQuery(
    api.sessions.getByLocalSessionId,
    localSessionId ? { localSessionId } : "skip"
  );

  const getOrCreate = useMutation(api.sessions.getOrCreateForLocal);

  useEffect(() => {
    if (userLoading || !localSessionId) return;

    // If we found an existing session, use it
    if (existingSession !== undefined) {
      if (existingSession) {
        setConvexSessionId(existingSession._id);
        setIsInitializing(false);
      } else if (userId) {
        // No existing session, create one
        getOrCreate({
          userId,
          localSessionId,
          name,
          cwd,
        }).then((id) => {
          setConvexSessionId(id);
          setIsInitializing(false);
        }).catch((err) => {
          console.error("[useConvexSession] Failed to create session:", err);
          setIsInitializing(false);
        });
      }
    }
  }, [existingSession, userId, userLoading, localSessionId, name, cwd, getOrCreate]);

  return {
    convexSessionId,
    isLoading: isInitializing || existingSession === undefined,
  };
}

// Hook to get messages for a Convex session with real-time updates
export function useConvexMessages(convexSessionId: Id<"sessions"> | null) {
  const messages = useQuery(
    api.messages.getBySession,
    convexSessionId ? { sessionId: convexSessionId } : "skip"
  );

  const addUserMessageMutation = useMutation(api.messages.addUserMessage);
  const addAssistantMessageMutation = useMutation(api.messages.addAssistantMessage);

  return {
    messages: (messages ?? []) as ConvexMessage[],
    isLoading: convexSessionId !== null && messages === undefined,
    addUserMessage: async (content: string, externalId?: string) => {
      if (!convexSessionId) throw new Error("No session");
      return await addUserMessageMutation({
        sessionId: convexSessionId,
        content,
        externalId,
      });
    },
    addAssistantMessage: async (
      content: ContentBlock[],
      options?: { cost?: number; model?: string; externalId?: string }
    ) => {
      if (!convexSessionId) throw new Error("No session");
      return await addAssistantMessageMutation({
        sessionId: convexSessionId,
        content,
        cost: options?.cost,
        model: options?.model,
        externalId: options?.externalId,
      });
    },
  };
}

// Hook to manage todos for a session
export function useConvexTodos(convexSessionId: Id<"sessions"> | null) {
  const todos = useQuery(
    api.todos.getBySession,
    convexSessionId ? { sessionId: convexSessionId } : "skip"
  );

  const setTodosMutation = useMutation(api.todos.setTodos);

  return {
    todos: (todos ?? []) as ConvexTodo[],
    isLoading: convexSessionId !== null && todos === undefined,
    setTodos: async (
      items: Array<{
        content: string;
        activeForm?: string;
        status: "pending" | "in_progress" | "completed";
        priority?: string;
      }>
    ) => {
      if (!convexSessionId) throw new Error("No session");
      return await setTodosMutation({
        sessionId: convexSessionId,
        todos: items,
      });
    },
  };
}
