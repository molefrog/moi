import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { cn } from "./shared/cn";
import type { ChatMessage, StatusMessage, HistoryMessage } from "./shared/types";
import {
  ArrowRightIcon,
  ChatBubbleLeftIcon,
  ChevronRightIcon,
  CpuChipIcon,
} from "@heroicons/react/16/solid";

type Message = ChatMessage;

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "status") {
        setProcessing(data.processing);
        return;
      }
      if (data.type === "history") {
        setMessages(data.messages);
        return;
      }
      setMessages((prev) => [...prev, data]);
    };

    ws.onclose = () => {
      setTimeout(() => location.reload(), 2000);
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !wsRef.current || processing) return;
    wsRef.current.send(JSON.stringify({ type: "chat", content: text }));
    setInput("");
  }, [input, processing]);

  const stop = useCallback(() => {
    if (!wsRef.current || !processing) return;
    wsRef.current.send(JSON.stringify({ type: "stop" }));
  }, [processing]);

  return (
    <div className="flex flex-col h-screen bg-surface font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-raised">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight text-ink">
            none.computer
          </h1>
          <span className="text-xs text-ink-faint font-mono">~/workspace</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-colors duration-300",
              processing ? "bg-amber-500" : "bg-emerald-500"
            )}
          />
          <span className="text-xs text-ink-muted">
            {processing ? "Working\u2026" : "Ready"}
          </span>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto chat-scroll">
        <div className="max-w-[720px] mx-auto px-6 py-6 flex flex-col gap-1">
          {messages.length === 0 && !processing && <EmptyState />}
          {messages.map((msg, i) => (
            <MessageBlock key={i} msg={msg} />
          ))}
          {processing && <ThinkingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border bg-surface-raised">
        <form
          className="max-w-[720px] mx-auto flex items-end gap-3 px-6 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask the agent..."
            disabled={processing}
            autoFocus
            rows={1}
            className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-sm text-ink leading-relaxed outline-none resize-none transition-colors placeholder:text-ink-faint focus:border-ink-muted disabled:opacity-50 font-sans"
          />
          {processing ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop agent"
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-error-ink text-white rounded-xl transition-opacity hover:opacity-80"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-accent text-white rounded-xl transition-opacity disabled:opacity-15 disabled:cursor-not-allowed hover:opacity-80"
            >
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center flex-1 min-h-[60vh] gap-3"
      style={{ animation: "fade-in 0.4s ease-out" }}
    >
      <div className="w-10 h-10 rounded-full bg-accent-soft border border-border flex items-center justify-center">
        <ChatBubbleLeftIcon className="w-4.5 h-4.5 text-ink-muted" />
      </div>
      <p className="text-sm text-ink-muted">
        Start a conversation with the agent
      </p>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-3 px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-1.5 h-1.5 rounded-full bg-ink-faint"
          style={{
            animation: "pulse-dot 1.4s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

function MessageBlock({ msg }: { msg: Message }) {
  switch (msg.type) {
    case "user":
      return (
        <div
          className="mt-4 mb-1"
          style={{ animation: "fade-in 0.2s ease-out" }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center text-[10px] font-semibold">
              Y
            </div>
            <span className="text-xs font-medium text-ink-muted">You</span>
          </div>
          <div className="pl-7 text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">
            {msg.content}
          </div>
        </div>
      );

    case "assistant":
      return (
        <div
          className="mt-4 mb-1"
          style={{ animation: "fade-in 0.2s ease-out" }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-full bg-accent-soft border border-border flex items-center justify-center">
              <CpuChipIcon className="w-3 h-3 text-ink-muted" />
            </div>
            <span className="text-xs font-medium text-ink-muted">Agent</span>
          </div>
          <div className="pl-7 text-sm text-ink leading-[1.7] break-words prose-inline">
            <FormattedText text={msg.content} />
          </div>
        </div>
      );

    case "tool_use":
      return (
        <div
          className="ml-7 my-0.5 pl-3 border-l-2 border-border-subtle"
          style={{ animation: "fade-in 0.15s ease-out" }}
        >
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer py-1.5 select-none">
              <ChevronRightIcon className="w-3 h-3 text-ink-faint chevron transition-transform duration-150" />
              <span className="text-xs font-mono font-medium text-tool-ink">
                {msg.name}
              </span>
              <span className="text-[11px] font-mono text-ink-faint truncate max-w-[400px]">
                {formatInputBrief(msg.name, msg.input)}
              </span>
            </summary>
            <div className="mt-1 ml-4 px-3 py-2.5 bg-tool-bg border border-tool-border rounded-lg">
              <pre className="font-mono text-xs text-tool-ink whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto leading-relaxed">
                {formatInput(msg.name, msg.input)}
              </pre>
            </div>
          </details>
        </div>
      );

    case "tool_result":
      return (
        <div
          className="ml-7 my-0.5 pl-3 border-l-2 border-border-subtle"
          style={{ animation: "fade-in 0.15s ease-out" }}
        >
          {msg.is_error ? (
            <div className="ml-4 px-3 py-2 bg-error-bg border border-error-border rounded-lg">
              <pre className="font-mono text-xs text-error-ink whitespace-pre-wrap break-all max-h-[160px] overflow-y-auto leading-relaxed">
                {msg.content || "(empty)"}
              </pre>
            </div>
          ) : (
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer py-1 select-none ml-4">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-ink-faint chevron transition-transform duration-150"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <span className="text-[11px] font-mono text-ink-faint">
                  Result
                  {msg.content
                    ? ` \u00B7 ${msg.content.length} chars`
                    : " \u00B7 empty"}
                </span>
              </summary>
              <div className="mt-1 ml-4 px-3 py-2.5 bg-result-bg border border-border-subtle rounded-lg">
                <pre className="font-mono text-xs text-ink-muted whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto leading-relaxed">
                  {msg.content || "(empty)"}
                </pre>
              </div>
            </details>
          )}
        </div>
      );

    case "done":
      return (
        <div
          className="flex items-center gap-3 py-3 mt-2"
          style={{ animation: "fade-in 0.3s ease-out" }}
        >
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] font-mono text-ink-faint tabular-nums">
            {msg.turns} turns &middot; ${msg.cost.toFixed(4)}
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>
      );

    case "stopped":
      return (
        <div
          className="flex items-center gap-3 py-3 mt-2"
          style={{ animation: "fade-in 0.3s ease-out" }}
        >
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] font-mono text-ink-faint">
            Stopped
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>
      );

    case "error":
      return (
        <div
          className="ml-7 my-1 px-3.5 py-2.5 bg-error-bg border border-error-border rounded-xl text-sm text-error-ink"
          style={{ animation: "fade-in 0.2s ease-out" }}
        >
          {msg.content}
        </div>
      );
  }
}

function FormattedText({ text }: { text: string }) {
  // Simple inline markdown: **bold**, `code`, and newlines
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="px-1.5 py-0.5 bg-accent-soft rounded text-[13px] font-mono"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function formatInputBrief(tool: string, input: any): string {
  if (tool === "Bash") return `$ ${input.command}`;
  if (tool === "Read") return input.file_path;
  if (tool === "Write" || tool === "Edit") return input.file_path;
  if (tool === "Glob") return input.pattern;
  if (tool === "Grep") return `/${input.pattern}/ ${input.path || ""}`;
  return "";
}

function formatInput(tool: string, input: any): string {
  if (tool === "Bash") return `$ ${input.command}`;
  if (tool === "Read") return input.file_path;
  if (tool === "Write" || tool === "Edit") return input.file_path;
  if (tool === "Glob") return input.pattern;
  if (tool === "Grep") return `/${input.pattern}/ ${input.path || ""}`;
  return JSON.stringify(input, null, 2);
}

createRoot(document.getElementById("root")!).render(<App />);
