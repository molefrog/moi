import { query } from "@anthropic-ai/claude-agent-sdk";
import * as path from "path";
import index from "./index.html";
import type { ServerMessage, ChatMessage } from "./shared/types";

const WORKSPACE = path.join(import.meta.dir, "workspace");
const MESSAGES_PATH = path.join(WORKSPACE, "messages.json");

// --- Persistence ---
type StoredState = {
  sessionId: string | null;
  messages: ChatMessage[];
};

function loadState(): StoredState {
  try {
    const file = Bun.file(MESSAGES_PATH);
    // Bun.file().json() is async, use text() sync workaround isn't available
    // so we read synchronously via node compat
    const text = require("fs").readFileSync(MESSAGES_PATH, "utf-8");
    return JSON.parse(text);
  } catch {
    return { sessionId: null, messages: [] };
  }
}

function saveState() {
  const data = JSON.stringify({ sessionId, messages }, null, 2);
  Bun.write(MESSAGES_PATH, data);
}

// Load persisted state
let { sessionId, messages } = loadState();
let processing = false;
let abortController: AbortController | null = null;
const clients = new Set<any>();

function broadcast(msg: ServerMessage) {
  const json = JSON.stringify(msg);
  for (const ws of clients) {
    ws.send(json);
  }
}

function record(msg: ChatMessage) {
  messages.push(msg);
  saveState();
  broadcast(msg);
}

async function handleChat(content: string) {
  if (processing) {
    broadcast({ type: "error", content: "Already processing a message" });
    return;
  }

  processing = true;
  abortController = new AbortController();
  broadcast({ type: "status", processing: true });
  record({ type: "user", content });

  try {
    const options: any = {
      abortController,
      maxTurns: 50,
      cwd: WORKSPACE,
      model: "sonnet",
      allowedTools: [
        "Bash",
        "Read",
        "Write",
        "Edit",
        "MultiEdit",
        "Glob",
        "Grep",
        "WebSearch",
        "WebFetch",
      ],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      settingSources: ["project"],
      env: { ...process.env, CLAUDECODE: undefined },
      stderr: (data: string) => console.error("[SDK stderr]", data),
    };

    if (sessionId) {
      options.resume = sessionId;
    }

    const q = query({ prompt: content, options });

    for await (const msg of q) {
      // Capture session ID
      if (msg.type === "system" && msg.subtype === "init") {
        sessionId = msg.session_id;
        saveState();
      }

      // Assistant message — extract text and tool_use blocks
      if (msg.type === "assistant" && msg.message) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            record({ type: "assistant", content: block.text });
          }
          if (block.type === "tool_use") {
            record({
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }
      }

      // Tool results
      if (msg.type === "user" && msg.message) {
        for (const block of msg.message.content) {
          if (block.type === "tool_result") {
            const text =
              typeof block.content === "string"
                ? block.content
                : Array.isArray(block.content)
                  ? block.content
                      .filter((c: any) => c.type === "text")
                      .map((c: any) => c.text)
                      .join("\n")
                  : "";
            const cleaned = text
              .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
              .trim();
            record({
              type: "tool_result",
              tool_use_id: block.tool_use_id,
              content: cleaned.slice(0, 2000),
              is_error: !!block.is_error,
            });
          }
        }
      }

      // Final result
      if (msg.type === "result") {
        record({
          type: "done",
          cost: msg.total_cost_usd,
          turns: msg.num_turns,
          session_id: msg.session_id,
        });
      }
    }
  } catch (err: any) {
    // Don't record abort as an error
    if (err.name !== "AbortError") {
      record({ type: "error", content: err.message || "Unknown error" });
    }
  } finally {
    processing = false;
    abortController = null;
    broadcast({ type: "status", processing: false });
  }
}

Bun.serve({
  port: 3000,
  routes: {
    "/": index,
  },
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return new Response(null, { status: 101 });
      return new Response("Upgrade failed", { status: 500 });
    }
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      // Send history + current status to new client
      ws.send(JSON.stringify({ type: "history", messages }));
      ws.send(JSON.stringify({ type: "status", processing }));
    },
    message(ws, message) {
      try {
        const data = JSON.parse(String(message));
        if (data.type === "chat" && data.content?.trim()) {
          handleChat(data.content.trim());
        }
        if (data.type === "stop" && abortController) {
          abortController.abort();
          record({ type: "stopped" });
        }
      } catch {}
    },
    close(ws) {
      clients.delete(ws);
    },
  },
});

console.log("Agent chat running at http://localhost:3000");
