import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PermissionDialog } from '../PermissionDialog';
import { emitTestEvent, clearTauriMocks, invoke } from '../../test/mocks/tauri';
import { useSettingsStore } from '../../store/settings';

describe('PermissionDialog', () => {
  beforeEach(() => {
    clearTauriMocks();
    useSettingsStore.setState({ permissionMode: 'normal' });
  });

  it('should not render when there is no request', () => {
    render(<PermissionDialog />);
    expect(screen.queryByTestId('permission-dialog')).not.toBeInTheDocument();
  });

  it('should render when a permission request is received', async () => {
    render(<PermissionDialog />);

    // Emit a permission request event
    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-dialog')).toBeInTheDocument();
    });

    expect(screen.getByTestId('permission-tool-name')).toHaveTextContent('Allow Claude to Run?');
    expect(screen.getByTestId('permission-preview')).toHaveTextContent('ls -la');
  });

  it('should show correct verb for different tools', async () => {
    render(<PermissionDialog />);

    // Test Write tool
    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Write',
      tool_input: { file_path: '/test/file.txt' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-tool-name')).toHaveTextContent('Allow Claude to Write to?');
    });
  });

  it('should show "Always allow edits" for file edit tools', async () => {
    render(<PermissionDialog />);

    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Edit',
      tool_input: { file_path: '/test/file.txt' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-always-btn')).toHaveTextContent('Always allow edits');
    });
  });

  it('should show "Always allow for project" for non-edit tools', async () => {
    render(<PermissionDialog />);

    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-always-btn')).toHaveTextContent('Always allow for project');
    });
  });

  it('should call invoke with deny when Deny button clicked', async () => {
    render(<PermissionDialog />);

    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-deny-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('permission-deny-btn'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('respond_to_permission', {
        requestId: 'req-1',
        behavior: 'deny',
        message: 'User denied permission',
        alwaysAllow: null,
      });
    });
  });

  it('should call invoke with allow when Allow once clicked', async () => {
    render(<PermissionDialog />);

    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-allow-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('permission-allow-btn'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('respond_to_permission', {
        requestId: 'req-1',
        behavior: 'allow',
        message: null,
        alwaysAllow: null,
      });
    });
  });

  it('should handle Escape key to deny', async () => {
    render(<PermissionDialog />);

    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-dialog')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('respond_to_permission', {
        requestId: 'req-1',
        behavior: 'deny',
        message: 'User denied permission',
        alwaysAllow: null,
      });
    });
  });

  it('should handle Enter key to allow once', async () => {
    render(<PermissionDialog />);

    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-dialog')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('respond_to_permission', {
        requestId: 'req-1',
        behavior: 'allow',
        message: null,
        alwaysAllow: null,
      });
    });
  });

  it('should handle Cmd+Enter to always allow for non-edit tools', async () => {
    render(<PermissionDialog />);

    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-dialog')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('respond_to_permission', {
        requestId: 'req-1',
        behavior: 'allow',
        message: null,
        alwaysAllow: true,
      });
    });
  });

  it('should switch to acceptEdits mode when Cmd+Enter on file edit tool', async () => {
    render(<PermissionDialog />);

    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Edit',
      tool_input: { file_path: '/test/file.txt' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-dialog')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(useSettingsStore.getState().permissionMode).toBe('acceptEdits');
    });
  });

  it('should close dialog after responding', async () => {
    render(<PermissionDialog />);

    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('permission-allow-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('permission-dialog')).not.toBeInTheDocument();
    });
  });

  it('should format Grep tool input correctly', async () => {
    render(<PermissionDialog />);

    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Grep',
      tool_input: { pattern: 'TODO', path: '/src' },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      expect(screen.getByTestId('permission-preview')).toHaveTextContent('TODO in /src');
    });
  });

  it('should truncate long Task prompts', async () => {
    render(<PermissionDialog />);

    const longPrompt = 'A'.repeat(150);
    emitTestEvent('permission-request', {
      request_id: 'req-1',
      session_id: 'session-1',
      tool_name: 'Task',
      tool_input: { prompt: longPrompt },
      tool_use_id: 'tool-1',
    });

    await waitFor(() => {
      const preview = screen.getByTestId('permission-preview');
      expect(preview.textContent?.length).toBeLessThan(150);
      expect(preview).toHaveTextContent('...');
    });
  });
});
