import React, { useEffect, useRef } from "react";
import { cn } from "../shared/cn";
import type { ChatMessage } from "../shared/types";
import {
  MessageChatCircle,
  ChevronRight,
  XClose,
  Expand06,
} from "@untitledui/icons";
import { Button } from "./ui/button";
import { ChatInput } from "./ChatInput";

type Message = ChatMessage;
export type LayoutMode = "centered" | "sidebar" | "popup";

type ChatPanelProps = {
  messages: Message[];
  input: string;
  setInput: (v: string) => void;
  processing: boolean;
  send: () => void;
  stop: () => void;
  layoutMode: LayoutMode;
  onCollapse?: () => void;
  onExpand?: () => void;
  onClose?: () => void;
};

export function ChatPanel({
  messages,
  input,
  setInput,
  processing,
  send,
  stop,
  layoutMode,
  onCollapse,
  onExpand,
  onClose,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isCentered = layoutMode === "centered";

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <header className="flex items-center justify-between pb-6">
        <h1
          className={cn(
            "font-semibold tracking-tight text-ink text-xl leading-normal",
          )}
        >
          New chat
        </h1>
        <div className="flex items-center gap-2">
          {layoutMode === "sidebar" && onCollapse && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onCollapse}
              aria-label="Collapse chat"
            >
              <XClose className="text-ink-muted" />
            </Button>
          )}
          {layoutMode === "popup" && (
            <>
              {onExpand && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onExpand}
                  aria-label="Expand to sidebar"
                >
                  <Expand06 className="text-ink-muted" />
                </Button>
              )}
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  aria-label="Close chat"
                >
                  <XClose className="text-ink-muted" />
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto chat-scroll">
        <div
          className={cn(
            "flex flex-col gap-6",
            isCentered && "max-w-[720px] mx-auto",
          )}
        >
          {messages.length === 0 && !processing && <EmptyState />}
          {messages.map((msg, i) => (
            <MessageBlock key={i} msg={msg} compact={!isCentered} />
          ))}
          {processing && <ThinkingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className={cn("pt-4", isCentered && "max-w-[720px] mx-auto py-4")}>
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={stop}
          processing={processing}
        />
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
      <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center">
        <MessageChatCircle size={18} className="text-ink-muted" />
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

function MessageBlock({ msg, compact }: { msg: Message; compact?: boolean }) {
  switch (msg.type) {
    case "user":
      return (
        <p
          className="ml-8 self-end bg-black/[0.07] rounded-md px-4 py-2 text-base text-ink leading-normal whitespace-pre-wrap wrap-break-word"
          style={{ animation: "fade-in 0.2s ease-out" }}
        >
          {msg.content}
        </p>
      );

    case "assistant":
      return (
        <div style={{ animation: "fade-in 0.2s ease-out" }}>
          <div className="text-base text-ink leading-normal wrap-break-word prose-inline">
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
              <ChevronRight
                size={12}
                className="text-ink-faint chevron transition-transform duration-150"
              />
              <span className="text-xs font-mono font-medium text-tool-ink">
                {msg.name}
              </span>
              <span
                className={cn(
                  "text-[11px] font-mono text-ink-faint truncate",
                  compact ? "max-w-[200px]" : "max-w-[400px]",
                )}
              >
                {formatInputBrief(msg.name, msg.input)}
              </span>
            </summary>
            <div className="mt-1 ml-4 px-3 py-2.5 bg-tool-bg border border-tool-border rounded-md">
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
            <div className="ml-4 px-3 py-2 bg-error-bg border border-error-border rounded-md">
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
              <div className="mt-1 ml-4 px-3 py-2.5 bg-result-bg border border-border-subtle rounded-md">
                <pre className="font-mono text-xs text-ink-muted whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto leading-relaxed">
                  {msg.content || "(empty)"}
                </pre>
              </div>
            </details>
          )}
        </div>
      );

    case "done":
      return null;

    case "stopped":
      return null;

    case "error":
      return (
        <div
          className="ml-7 my-1 px-3.5 py-2.5 bg-error-bg border border-error-border rounded-lg text-sm text-error-ink"
          style={{ animation: "fade-in 0.2s ease-out" }}
        >
          {msg.content}
        </div>
      );
  }
}

function FormattedText({ text }: { text: string }) {
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
              className="px-1.5 py-0.5 bg-muted rounded text-[13px] font-mono"
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
