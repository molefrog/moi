import { useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "motion/react";

import {
  IconArtboard,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconMessageCircle,
  IconPalette,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";

import { useWorkspaceSessions, useWorkspaceWidgets, workspaceKeys } from "@/client/api/workspaces";
import { ChatPanel } from "@/client/components/ChatPanel";
import { ChatPopup } from "@/client/components/ChatPopup";
import { McpMenu } from "@/client/components/McpMenu";
import { type WidgetMode, Widgets } from "@/client/components/Widgets";
import {
  PanelHeader,
  SidebarLayout,
  SidebarToggle,
} from "@/client/components/layout/SidebarLayout";
import { LedLogo } from "@/client/components/playground/LedLogo";
import { Button } from "@/client/components/ui/button";
import { useChat } from "@/client/hooks/useChat";
import { useFitsSidebar } from "@/client/hooks/useFitsSidebar";
import { useGridReconcile } from "@/client/hooks/useGridReconcile";
import { useMeiEvent } from "@/client/hooks/useMeiEvents";
import { useWorkspaceTheme } from "@/client/hooks/useWorkspaceTheme";
import { Workspace } from "@/client/lib/WorkspaceContext";
import {
  WorkspaceLayoutProvider,
  useWorkspaceLayoutCtx,
} from "@/client/lib/WorkspaceLayoutContext";
import { cn } from "@/client/lib/cn";
import { liveStore } from "@/client/store/live";
import type { ChatMode, SessionInfo, WidgetInfo } from "@/lib/types";

type WorkspaceRouteProps = {
  id: string;
};

// Route component for `/workspace/:id` — provides workspace id + layout context,
// then loads. Layout and widgets are React Query resources; chat (sessions,
// events, websocket) still runs on the Zustand stores, seeded from the sessions
// query below.
export function WorkspaceRoute({ id }: WorkspaceRouteProps) {
  return (
    <Workspace id={id}>
      <WorkspaceLayoutProvider id={id}>
        <WorkspaceLoader id={id} />
      </WorkspaceLayoutProvider>
    </Workspace>
  );
}

type WorkspaceLoaderProps = {
  id: string;
};

function WorkspaceLoader({ id }: WorkspaceLoaderProps) {
  const qc = useQueryClient();
  const { layout, setLayout, isLoading: layoutLoading } = useWorkspaceLayoutCtx();
  const widgets = useWorkspaceWidgets(id);
  const sessions = useWorkspaceSessions(id);

  // Keep the grid balanced as widgets come and go. (Theme is applied inside
  // WorkspaceView, scoped to the panel — see useWorkspaceTheme there.)
  useGridReconcile(id, widgets.data, layout, setLayout);

  // Server-pushed changes invalidate the matching query so the next render
  // revalidates (theme re-applies; the grid reconcile places any new widget).
  useMeiEvent((e) => {
    if (e.type === "theme:updated") {
      qc.invalidateQueries({ queryKey: workspaceKeys.layout(id) });
    } else if (e.type === "widget-layout:updated") {
      qc.invalidateQueries({ queryKey: workspaceKeys.widgets(id) });
    }
  });

  // Fresh visit (nothing cached) → centered MOI logo in the panel. Switch-back
  // shows cached data immediately while it revalidates, so no loader then.
  const fresh = layoutLoading || widgets.isLoading;

  // Chat state lives in app-level stores (RQ cache + live store), not here, so
  // navigation never discards an in-flight run — we just seed the active thread.
  return (
    <>
      <SeedActiveSession workspaceId={id} sessions={sessions.data} />
      <SidebarLayout>
        {fresh ? (
          <div className="flex h-full items-center justify-center">
            <LedLogo sprite="moi" effect="chaos" />
          </div>
        ) : (
          <WorkspaceView widgets={widgets.data ?? []} />
        )}
      </SidebarLayout>
    </>
  );
}

type SeedActiveSessionProps = {
  workspaceId: string;
  sessions: SessionInfo[] | undefined;
};

// Picks an active thread once the sessions query resolves. A workspace with no
// active selection yet gets the most recent thread; it also re-selects if the
// current one vanished from the list. Keyed per workspace in the live store, so
// the choice persists across navigation.
function SeedActiveSession({ workspaceId, sessions }: SeedActiveSessionProps) {
  useEffect(() => {
    if (!sessions) return;
    const active = liveStore.getState().activeByWorkspace[workspaceId] ?? null;
    const stillValid = active && sessions.some((s) => s.sessionId === active);
    if (!stillValid) liveStore.getState().setActive(workspaceId, sessions[0]?.sessionId ?? null);
  }, [workspaceId, sessions]);
  return null;
}

const ACTION_VARIANTS = {
  from: { opacity: 0, scale: 0.8, filter: "blur(4px)" },
  to: { opacity: 1, scale: 1, filter: "blur(0px)" },
};

// Workspace nav: switches the panel body between the chat (fullscreen), the
// widget grid, and the scratchpad. "chat" maps to fullscreen chat mode; the
// other two are the body view shown while the chat is docked or floating.
type WorkspaceNav = "chat" | "widgets" | "canvas";
// The non-chat body view. Owned by WorkspaceView so the panel can swap between
// the widget grid and the canvas while the chat is docked/floating.
type WorkspaceTab = "widgets" | "canvas";

type WorkspaceTabsProps = {
  active: WorkspaceNav;
  onSelect: (view: WorkspaceNav) => void;
};

function WorkspaceTabs({ active, onSelect }: WorkspaceTabsProps) {
  // Active tab outline uses an inset shadow (not a border) so the box keeps the
  // exact h-7 footprint of the other header buttons — no 1px layout shift.
  const tabClass = (isActive: boolean) =>
    cn(
      "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors [&_svg]:size-[18px]",
      isActive
        ? "bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    );

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={tabClass(active === "chat")}
        onClick={() => onSelect("chat")}
      >
        <IconMessageCircle stroke={1.75} />
        Chat
      </button>
      <button
        type="button"
        className={tabClass(active === "widgets")}
        onClick={() => onSelect("widgets")}
      >
        <IconLayoutGrid stroke={1.75} />
        Widgets
      </button>
      <button
        type="button"
        className={tabClass(active === "canvas")}
        onClick={() => onSelect("canvas")}
      >
        <IconArtboard stroke={1.75} />
        Scratchpad
      </button>
    </div>
  );
}

// Empty scratchpad canvas — a dotted-pattern page that fills the widget area.
// Placeholder for the infinite canvas that will live here; the dot grid is a
// repeating radial-gradient sized via background-size.
function ScratchpadCanvas() {
  return (
    <div className="min-h-0 flex-1 bg-muted/40 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] bg-[size:20px_20px] bg-[position:center]" />
  );
}

type WidgetActionsProps = {
  mode: WidgetMode;
  onMode: (mode: WidgetMode) => void;
};

// Widget controls — live in the page header (right side), always visible.
function WidgetActions({ mode, onMode }: WidgetActionsProps) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {mode !== "idle" ? (
        <motion.div
          key="done"
          variants={ACTION_VARIANTS}
          initial="from"
          animate="to"
          exit="from"
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        >
          <Button onClick={() => onMode("idle")}>Done</Button>
        </motion.div>
      ) : (
        <motion.div
          key="actions"
          className="flex items-center gap-1"
          variants={ACTION_VARIANTS}
          initial="from"
          animate="to"
          exit="from"
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        >
          <Button
            variant="ghost"
            className="h-7 text-muted-foreground @max-2xl:px-1.5! [&_svg]:size-[18px]"
            onClick={() => onMode("customizing")}
          >
            <IconPalette stroke={1.75} />
            <span className="@max-2xl:hidden">Customize</span>
          </Button>
          <Button
            variant="ghost"
            className="h-7 text-muted-foreground @max-2xl:px-1.5! [&_svg]:size-[18px]"
            onClick={() => onMode("editing")}
          >
            <IconLayoutDashboard stroke={1.75} />
            <span className="@max-2xl:hidden">Edit widgets</span>
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

type WorkspaceViewProps = {
  widgets: WidgetInfo[];
};

function WorkspaceView({ widgets }: WorkspaceViewProps) {
  const { view, input, setInput, processing, error, send, stop, switchThread, dismissError } =
    useChat();
  const { layout, setLayout, name } = useWorkspaceLayoutCtx();
  const { ref: rowRef, fits: canFitSidebar } = useFitsSidebar<HTMLDivElement>();
  const [widgetMode, setWidgetMode] = useState<WidgetMode>("idle");
  const [tab, setTab] = useState<WorkspaceTab>("widgets");

  // Theme is scoped to this wrapper, not :root — the sidebar keeps the default
  // tokens. The floating chat portals into the same element so it inherits them.
  const themeRef = useRef<HTMLDivElement>(null);
  useWorkspaceTheme(layout.theme, themeRef);

  const hasWidgets = widgets.length > 0;
  // Only a workspace with widgets offers a choice of chat placement; a solo
  // chat is always fullscreen, so the mode switch (and nav) are hidden there.
  const canChangeChatMode = hasWidgets;

  // Effective chat placement:
  // - No widgets → always fullscreen (nothing to dock beside).
  // - Widgets → the user's pick, except a docked sidebar that no longer fits
  //   gracefully falls back to floating.
  const chatMode: ChatMode = !hasWidgets
    ? "fullscreen"
    : layout.chatMode === "fullscreen"
      ? "fullscreen"
      : layout.chatMode === "floating" || !canFitSidebar
        ? "floating"
        : "sidebar";

  const handleModeChange = canChangeChatMode
    ? (mode: ChatMode) => setLayout({ chatMode: mode })
    : undefined;

  // The nav mirrors what's in the body: "chat" while fullscreen, else the docked
  // body view. Picking "chat" enters fullscreen; picking a body view leaves it
  // for the docked sidebar (which itself falls back to floating if it can't fit).
  const activeNav: WorkspaceNav = chatMode === "fullscreen" ? "chat" : tab;
  const selectNav = (view: WorkspaceNav) => {
    if (view === "chat") {
      setLayout({ chatMode: "fullscreen" });
    } else {
      setTab(view);
      if (chatMode === "fullscreen") setLayout({ chatMode: "sidebar" });
    }
  };

  const chatPanel = (
    <ChatPanel
      view={view}
      input={input}
      setInput={setInput}
      processing={processing}
      error={error}
      onDismissError={dismissError}
      send={send}
      stop={stop}
      chatMode={chatMode}
      onSwitchThread={switchThread}
      onModeChange={handleModeChange}
      onCollapse={() => setLayout({ chatMode: "floating" })}
    />
  );

  return (
    // Themed wrapper: scoped CSS vars (bg/fg/font) live here so the panel — and
    // the portaled floating chat — pick up the workspace theme, while the
    // sidebar outside stays default.
    <div
      ref={themeRef}
      className="bg-background text-foreground flex h-full min-h-0 flex-col font-sans"
    >
      {/* rowRef stays mounted across modes so the sidebar-fit measurement (full
          panel width) survives switching to and from fullscreen. */}
      <div ref={rowRef} className="flex h-full min-h-0 flex-col">
        {chatMode === "fullscreen" ? (
          // Fullscreen: the shared panel header (name + optional nav + mcp) above
          // a full-width chat — same chrome as the widgets/scratchpad views.
          <>
            <PanelHeader>
              <SidebarToggle />
              {name && <span className="text-foreground truncate text-sm font-medium">{name}</span>}
              {hasWidgets && (
                <>
                  <span className="text-muted-foreground/40 select-none text-sm">/</span>
                  <WorkspaceTabs active={activeNav} onSelect={selectNav} />
                </>
              )}
              <div className="flex-1" />
              <McpMenu />
            </PanelHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{chatPanel}</div>
          </>
        ) : (
          // Two-pane split: widget grid / scratchpad on the left, docked chat on
          // the right (floating chat is rendered as a popup below instead).
          <div className="flex h-full min-h-0">
            <div className="border-border flex min-h-0 min-w-[var(--column-w)] flex-1 flex-col border-r">
              <PanelHeader>
                <SidebarToggle />
                {name && (
                  <span className="text-foreground truncate text-sm font-medium">{name}</span>
                )}
                <span className="text-muted-foreground/40 select-none text-sm">/</span>
                <WorkspaceTabs active={activeNav} onSelect={selectNav} />
                <div className="flex-1" />
                {tab === "widgets" && <WidgetActions mode={widgetMode} onMode={setWidgetMode} />}
                <McpMenu />
              </PanelHeader>
              {tab === "widgets" ? (
                <Widgets mode={widgetMode} widgets={widgets} />
              ) : (
                <ScratchpadCanvas />
              )}
            </div>

            {chatMode === "sidebar" && (
              // Docked chat: caps at --chat-max on big screens (grow 0), shrinks
              // down to --chat-min before the fit check flips it to floating.
              <div className="flex min-h-0 min-w-[var(--chat-min)] flex-[0_1_var(--chat-max)] flex-col overflow-hidden">
                <div className="flex min-h-0 w-full flex-1 flex-col">{chatPanel}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {chatMode === "floating" && (
        <ChatPopup
          defaultOpen={layout.chatMode === "floating" && canFitSidebar}
          container={themeRef}
        >
          {(onClose) => (
            <ChatPanel
              view={view}
              input={input}
              setInput={setInput}
              processing={processing}
              error={error}
              onDismissError={dismissError}
              send={send}
              stop={stop}
              chatMode={chatMode}
              onSwitchThread={switchThread}
              onModeChange={handleModeChange}
              onClose={onClose}
            />
          )}
        </ChatPopup>
      )}
    </div>
  );
}
