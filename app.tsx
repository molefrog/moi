import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence } from "motion/react";
import "./app.css";
import type { ChatMessage } from "./shared/types";
import { ChatPanel } from "./components/ChatPanel";
import { Workspace } from "./components/Workspace";
import { ChatPopup } from "./components/ChatPopup";

type Message = ChatMessage;

const MESSAGE_THRESHOLD = 5;

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const layoutMode =
    messages.length < MESSAGE_THRESHOLD
      ? "centered"
      : chatCollapsed
        ? "popup"
        : "sidebar";

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

  const chatPanel = (
    <ChatPanel
      messages={messages}
      input={input}
      setInput={setInput}
      processing={processing}
      send={send}
      stop={stop}
      layoutMode={layoutMode}
      onCollapse={() => setChatCollapsed(true)}
      onExpand={() => {
        setChatCollapsed(false);
        setPopupOpen(false);
      }}
    />
  );

  if (layoutMode === "centered") {
    return (
      <div className="h-screen">
        {chatPanel}
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Workspace always visible in sidebar/popup modes */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex-1 min-w-0"
      >
        <Workspace />
      </motion.div>

      {/* Sidebar chat */}
      <AnimatePresence>
        {layoutMode === "sidebar" && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 420, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="shrink-0 border-l border-border overflow-hidden"
          >
            <div className="w-[420px] h-full">
              {chatPanel}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Popup chat */}
      {layoutMode === "popup" && (
        <ChatPopup
          open={popupOpen}
          onToggle={() => setPopupOpen((prev) => !prev)}
        >
          {chatPanel}
        </ChatPopup>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
