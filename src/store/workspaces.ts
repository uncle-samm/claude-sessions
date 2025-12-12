import { create } from "zustand";
import * as api from "./api";

export interface Workspace {
  id: string;
  name: string;
  folder: string;
  scriptPath: string;
  originBranch: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  loading: boolean;
  expandedWorkspaces: Set<string>;
  loadWorkspaces: () => Promise<void>;
  addWorkspace: (name: string, folder: string, scriptPath: string, originBranch?: string) => Promise<Workspace>;
  removeWorkspace: (id: string) => Promise<void>;
  toggleExpanded: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  loading: true,
  expandedWorkspaces: new Set<string>(),

  loadWorkspaces: async () => {
    console.log("[WorkspaceStore] loadWorkspaces called");
    set({ loading: true });
    try {
      const data = await api.getWorkspaces();
      const workspaces: Workspace[] = data.map((w) => ({
        id: w.id,
        name: w.name,
        folder: w.folder,
        scriptPath: w.script_path || "",
        originBranch: w.origin_branch || "main",
      }));
      console.log("[WorkspaceStore] loaded workspaces:", workspaces);
      // Auto-expand all workspaces initially
      const expanded = new Set(workspaces.map((w) => w.id));
      set({ workspaces, loading: false, expandedWorkspaces: expanded });
    } catch (err) {
      console.error("[WorkspaceStore] Failed to load:", err);
      set({ loading: false });
    }
  },

  addWorkspace: async (name: string, folder: string, scriptPath: string, originBranch?: string) => {
    const data = await api.createWorkspace(name, folder, scriptPath || null, originBranch || null);
    const workspace: Workspace = {
      id: data.id,
      name: data.name,
      folder: data.folder,
      scriptPath: data.script_path || "",
      originBranch: data.origin_branch || "main",
    };
    set((state) => ({
      workspaces: [...state.workspaces, workspace],
      expandedWorkspaces: new Set([...state.expandedWorkspaces, workspace.id]),
    }));
    return workspace;
  },

  removeWorkspace: async (id: string) => {
    await api.deleteWorkspace(id);
    set((state) => {
      const expanded = new Set(state.expandedWorkspaces);
      expanded.delete(id);
      return {
        workspaces: state.workspaces.filter((w) => w.id !== id),
        expandedWorkspaces: expanded,
      };
    });
  },

  toggleExpanded: (id: string) => {
    set((state) => {
      const expanded = new Set(state.expandedWorkspaces);
      if (expanded.has(id)) {
        expanded.delete(id);
      } else {
        expanded.add(id);
      }
      return { expandedWorkspaces: expanded };
    });
  },
}));
