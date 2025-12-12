#!/usr/bin/env node

/**
 * MCP Bridge for Claude Sessions
 *
 * This script is spawned by Claude Code as an MCP server.
 * It translates MCP tool calls into HTTP requests to the Tauri app.
 */

const http = require('http');
const readline = require('readline');

const SERVER_URL = process.env.CLAUDE_SESSIONS_SERVER || 'http://127.0.0.1:19420';
const SESSION_ID = process.env.CLAUDE_SESSIONS_ID;

// Parse URL
const serverUrl = new URL(SERVER_URL);

// MCP tool definitions
const TOOLS = [
  {
    name: 'notify_ready',
    description: 'IMPORTANT: You MUST call this tool when you complete ANY task or respond to the user. Include a brief summary of what was accomplished. This signals that you are done working and ready for the next user message.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'A brief summary of what was accomplished (1-2 sentences). Always include this to let the user know what you did.'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'notify_busy',
    description: 'Signal that Claude is busy working. Call this when starting a long-running task.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'get_pending_comments',
    description: 'Get all open/unresolved comments on your code changes that need attention. Use this to check if the user has left feedback on your work.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'reply_to_comment',
    description: 'Reply to a specific comment thread. Use this to respond to user feedback on your code changes.',
    inputSchema: {
      type: 'object',
      properties: {
        comment_id: {
          type: 'string',
          description: 'The ID of the comment to reply to'
        },
        message: {
          type: 'string',
          description: 'Your response to the comment'
        }
      },
      required: ['comment_id', 'message']
    }
  },
  {
    name: 'resolve_comment',
    description: 'Mark a comment as resolved after addressing it. Use this after you have addressed the feedback in a comment.',
    inputSchema: {
      type: 'object',
      properties: {
        comment_id: {
          type: 'string',
          description: 'The ID of the comment to resolve'
        },
        resolution_note: {
          type: 'string',
          description: 'Optional note explaining how the comment was addressed'
        }
      },
      required: ['comment_id']
    }
  },
  {
    name: 'request_review',
    description: 'Request user review of your changes with a message. Use this when you want the user to review your code changes.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to the user explaining what to review'
        }
      },
      required: ['message']
    }
  }
];

// Make HTTP request to Tauri server
function httpRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: serverUrl.hostname,
      port: serverUrl.port,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ success: true, data: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Handle MCP requests
async function handleRequest(request) {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'claude-sessions',
              version: '1.0.0'
            },
            capabilities: {
              tools: {}
            }
          }
        };

      case 'initialized':
      case 'notifications/initialized':
        // No response needed for notification
        return null;

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: TOOLS
          }
        };

      case 'tools/call':
        const toolName = params?.name;

        if (!SESSION_ID) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: 'Error: CLAUDE_SESSIONS_ID not set' }],
              isError: true
            }
          };
        }

        try {
          let response;
          let resultText;

          if (toolName === 'notify_ready') {
            const message = params?.arguments?.message || 'Task completed';
            // Use the message endpoint which also sets status to ready
            response = await httpRequest('POST', `/api/session/${SESSION_ID}/message`, { message });
            resultText = response.success
              ? `Message sent: ${message}`
              : `Error: ${response.error || 'Unknown error'}`;
          } else if (toolName === 'notify_busy') {
            response = await httpRequest('POST', `/api/session/${SESSION_ID}/status`, { status: 'busy' });
            resultText = response.success
              ? 'Session status updated to: busy'
              : `Error: ${response.error || 'Unknown error'}`;
          } else if (toolName === 'get_pending_comments') {
            response = await httpRequest('GET', `/api/session/${SESSION_ID}/comments`);
            if (response.success && response.comments) {
              if (response.comments.length === 0) {
                resultText = 'No pending comments on your changes.';
              } else {
                resultText = `Found ${response.comments.length} pending comment(s):\n\n` +
                  response.comments.map((c, i) =>
                    `${i + 1}. [${c.id}] ${c.file_path}:${c.line_number || 'file'}\n   Author: ${c.author}\n   "${c.content}"`
                  ).join('\n\n');
              }
            } else {
              resultText = `Error: ${response.error || 'Failed to get comments'}`;
            }
          } else if (toolName === 'reply_to_comment') {
            const commentId = params?.arguments?.comment_id;
            const message = params?.arguments?.message;
            if (!commentId || !message) {
              return {
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{ type: 'text', text: 'Error: comment_id and message are required' }],
                  isError: true
                }
              };
            }
            response = await httpRequest('POST', `/api/session/${SESSION_ID}/comments/${commentId}/reply`, { message });
            resultText = response.success
              ? `Reply added to comment ${commentId}`
              : `Error: ${response.error || 'Failed to reply'}`;
          } else if (toolName === 'resolve_comment') {
            const commentId = params?.arguments?.comment_id;
            const resolutionNote = params?.arguments?.resolution_note;
            if (!commentId) {
              return {
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{ type: 'text', text: 'Error: comment_id is required' }],
                  isError: true
                }
              };
            }
            response = await httpRequest('POST', `/api/session/${SESSION_ID}/comments/${commentId}/resolve`, { resolution_note: resolutionNote });
            resultText = response.success
              ? `Comment ${commentId} marked as resolved`
              : `Error: ${response.error || 'Failed to resolve'}`;
          } else if (toolName === 'request_review') {
            const message = params?.arguments?.message;
            if (!message) {
              return {
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{ type: 'text', text: 'Error: message is required' }],
                  isError: true
                }
              };
            }
            // Send as a special inbox message prefixed with [Review Request]
            response = await httpRequest('POST', `/api/session/${SESSION_ID}/message`, { message: `[Review Request] ${message}` });
            resultText = response.success
              ? 'Review request sent to user'
              : `Error: ${response.error || 'Failed to send review request'}`;
          } else {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
                isError: true
              }
            };
          }

          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: resultText }],
              isError: response && !response.success
            }
          };
        } catch (error) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `HTTP Error: ${error.message}` }],
              isError: true
            }
          };
        }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error.message
      }
    };
  }
}

// Send response to stdout
function sendResponse(response) {
  if (response) {
    process.stdout.write(JSON.stringify(response) + '\n');
  }
}

// Main loop - read from stdin, process, write to stdout
const rl = readline.createInterface({
  input: process.stdin,
  terminal: false
});

rl.on('line', async (line) => {
  process.stderr.write(`[MCP Bridge] Received: ${line.substring(0, 100)}...\n`);
  try {
    const request = JSON.parse(line);
    const response = await handleRequest(request);
    if (response) {
      process.stderr.write(`[MCP Bridge] Sending response for ${request.method}\n`);
    }
    sendResponse(response);
  } catch (error) {
    process.stderr.write(`[MCP Bridge] Error: ${error.message}\n`);
    sendResponse({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error'
      }
    });
  }
});

// Handle readline close - keep process alive
rl.on('close', () => {
  process.stderr.write('[MCP Bridge] Readline closed, exiting\n');
  // Stdin closed, but we might still need to handle pending requests
  // Exit gracefully
  process.exit(0);
});

// Handle process termination
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

// Keep process alive by referencing stdin
process.stdin.resume();
