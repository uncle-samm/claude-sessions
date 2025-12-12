import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore } from "../store/workspaces";

interface AddWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddWorkspaceModal({ isOpen, onClose }: AddWorkspaceModalProps) {
  const { addWorkspace } = useWorkspaceStore();
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [scriptPath, setScriptPath] = useState("");
  const [originBranch, setOriginBranch] = useState("main");

  const handleSelectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select workspace folder",
    });
    if (selected && typeof selected === "string") {
      setFolder(selected);
      // Auto-fill name from folder name if empty
      if (!name) {
        const folderName = selected.split("/").pop() || "";
        setName(folderName);
      }
    }
  };

  const handleSelectScript = async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      title: "Select setup script",
      filters: [{ name: "Scripts", extensions: ["sh", "zsh", "bash"] }],
    });
    if (selected && typeof selected === "string") {
      setScriptPath(selected);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !folder.trim() || !scriptPath.trim()) {
      return;
    }

    await addWorkspace(name.trim(), folder.trim(), scriptPath.trim(), originBranch.trim() || "main");

    // Reset and close
    setName("");
    setFolder("");
    setScriptPath("");
    setOriginBranch("main");
    onClose();
  };

  const handleCancel = () => {
    setName("");
    setFolder("");
    setScriptPath("");
    setOriginBranch("main");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Workspace</h3>
        </div>

        <div className="modal-content">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
            />
          </div>

          <div className="form-group">
            <label>Folder</label>
            <div className="input-with-button">
              <input
                type="text"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="/path/to/project"
                readOnly
              />
              <button type="button" onClick={handleSelectFolder}>
                Browse
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Setup Script</label>
            <div className="input-with-button">
              <input
                type="text"
                value={scriptPath}
                onChange={(e) => setScriptPath(e.target.value)}
                placeholder="/path/to/setup.sh"
                readOnly
              />
              <button type="button" onClick={handleSelectScript}>
                Browse
              </button>
            </div>
            <span className="form-hint">
              Script should cd into the worktree directory. We'll run claude after.
            </span>
          </div>

          <div className="form-group">
            <label>Origin Branch</label>
            <input
              type="text"
              value={originBranch}
              onChange={(e) => setOriginBranch(e.target.value)}
              placeholder="main"
            />
            <span className="form-hint">
              Branch to compare diffs against (default: main)
            </span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!name.trim() || !folder.trim() || !scriptPath.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
