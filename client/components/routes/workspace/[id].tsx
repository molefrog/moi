import { useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "motion/react";

import {
  IconAppWindow,
  IconArtboard,
  IconDots,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconMessageCircle,
  IconPalette,
  IconPlus,
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/client/components/ui/tooltip";
import { WorkspaceSettings } from "@/client/components/settings/WorkspaceSettings";
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
import { DEMO_VIEWS, type ViewDef } from "@/client/lib/views";
import { liveStore } from "@/client/store/live";
import type { ChatDisplay, SessionInfo, WidgetInfo } from "@/lib/types";

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

// A nav target: a fixed tab, or a view id. The `(string & {})` keeps editor
// autocomplete for the fixed keys while still accepting arbitrary view ids.
// Held in WorkspaceView's local state (transient — never persisted): "chat"
// shows the chat fullscreen; "widgets" / "canvas" / a view id fill the main area
// with the chat in its persisted position beside it.
type WorkspaceNav = "chat" | "widgets" | "canvas" | (string & {});

// How many view tabs render inline before the rest fold into the "…" menu.
const INLINE_VIEWS = 2;

type WorkspaceTabsProps = {
  active: WorkspaceNav;
  onSelect: (nav: WorkspaceNav) => void;
  views: ViewDef[];
  onCreateView: () => void;
};

function WorkspaceTabs({ active, onSelect, views, onCreateView }: WorkspaceTabsProps) {
  // Active tab outline uses an inset shadow (not a border) so the box keeps the
  // exact h-7 footprint of the other header buttons — no 1px layout shift.
  const tabClass = (isActive: boolean) =>
    cn(
      "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors [&_svg]:size-[18px]",
      isActive
        ? "bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    );

  const tab = (key: WorkspaceNav, Icon: typeof IconMessageCircle, label: string) => (
    <button key={key} type="button" className={tabClass(active === key)} onClick={() => onSelect(key)}>
      <Icon stroke={1.75} />
      {label}
    </button>
  );

  // Icon-only tabs are square (w = h) and keep the active/hover treatment.
  const iconTabClass = (isActive: boolean) => cn(tabClass(isActive), "size-7 justify-center px-0");

  const inline = views.slice(0, INLINE_VIEWS);
  const overflow = views.slice(INLINE_VIEWS);
  // The "…" trigger is always shown (it hosts "Create View"); it lights up when
  // one of the folded-away views is the active one.
  const overflowActive = overflow.some((v) => v.id === active);

  return (
    <div className="flex items-center gap-1">
      <Tooltip delay={50}>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={iconTabClass(active === "chat")}
              onClick={() => onSelect("chat")}
              aria-label="Open fullscreen chat"
            >
              <IconMessageCircle stroke={1.75} />
            </button>
          }
        />
        <TooltipContent>Open fullscreen chat</TooltipContent>
      </Tooltip>
      {tab("widgets", IconLayoutGrid, "Widgets")}
      {tab("canvas", IconArtboard, "Scratchpad")}
      {inline.map((v) => tab(v.id, IconAppWindow, v.name))}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className={iconTabClass(overflowActive)} aria-label="More views">
              <IconDots stroke={1.75} />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-48">
          {overflow.map((v) => (
            <DropdownMenuCheckboxItem
              key={v.id}
              checked={active === v.id}
              closeOnClick
              onClick={() => onSelect(v.id)}
            >
              <IconAppWindow stroke={1.75} />
              {v.name}
            </DropdownMenuCheckboxItem>
          ))}
          {overflow.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={onCreateView}>
            <IconPlus stroke={1.75} />
            Create View
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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

type ViewAppProps = {
  view: ViewDef;
};

// A view — an agent-defined app — rendered full-area like the scratchpad.
// Placeholder for now; the real app content will mount here once wired up.
function ViewApp({ view }: ViewAppProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-muted/40 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] bg-[size:20px_20px] bg-[position:center]">
      <IconAppWindow size={32} stroke={1.5} className="text-muted-foreground/50" />
      <div className="text-foreground text-sm font-medium">{view.name}</div>
      <div className="text-muted-foreground/60 text-xs">View app · demo placeholder</div>
    </div>
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
            className="h-7 text-muted-foreground @max-3xl:px-1.5! [&_svg]:size-[18px]"
            onClick={() => onMode("customizing")}
          >
            <IconPalette stroke={1.75} />
            <span className="@max-3xl:hidden">Customize</span>
          </Button>
          <Button
            variant="ghost"
            className="h-7 text-muted-foreground @max-3xl:px-1.5! [&_svg]:size-[18px]"
            onClick={() => onMode("editing")}
          >
            <IconLayoutDashboard stroke={1.75} />
            <span className="@max-3xl:hidden">Edit widgets</span>
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
  // Agent-defined views (demo data; same for every workspace until wired up).
  // Local state so Create/Delete are interactive in the demo.
  const [views, setViews] = useState<ViewDef[]>(DEMO_VIEWS);
  // Two orthogonal, transient local bits: which body is selected (a fixed tab or
  // a view id), and whether the chat is fullscreen. Fullscreen overrides (never
  // persists) the chat's dock position, and toggling it keeps the body beneath.
  const [bodyTab, setBodyTab] = useState<string>("widgets");
  const [fullscreen, setFullscreen] = useState(false);

  // Theme is scoped to this wrapper, not :root — the sidebar keeps the default
  // tokens. The floating chat portals into the same element so it inherits them.
  const themeRef = useRef<HTMLDivElement>(null);
  useWorkspaceTheme(layout.theme, themeRef);

  const hasWidgets = widgets.length > 0;
  // The persisted position switch (sidebar ⇄ floating) only matters with widgets
  // to dock beside; a solo chat is always fullscreen.
  const canChangeChatMode = hasWidgets;

  // How the chat is shown: fullscreen (the chat view, or a solo chat), otherwise
  // its persisted position — sidebar, or floating (also the fallback when a
  // docked sidebar no longer fits). Fullscreen never touches the saved position.
  const display: ChatDisplay =
    !hasWidgets || fullscreen
      ? "fullscreen"
      : layout.chatMode === "floating" || !canFitSidebar
        ? "floating"
        : "sidebar";

  // The nav highlights whatever fills the main area.
  const activeNav: WorkspaceNav = display === "fullscreen" ? "chat" : bodyTab;

  // Nav tabs: "chat" goes fullscreen; a body tab (widgets / canvas / view id)
  // leaves fullscreen and shows it.
  const selectNav = (v: WorkspaceNav) => {
    if (v === "chat") setFullscreen(true);
    else {
      setBodyTab(v);
      setFullscreen(false);
    }
  };

  // Demo view management (local only — not persisted or synced anywhere).
  const createView = () => {
    const created: ViewDef = { id: crypto.randomUUID(), name: `View ${views.length + 1}` };
    setViews([...views, created]);
    setBodyTab(created.id);
    setFullscreen(false);
  };
  // The active view, when a view (not a fixed tab) fills the main area.
  const activeView = views.find((v) => v.id === bodyTab);

  // The chat-mode picker switches the display: fullscreen is the transient view;
  // sidebar/floating persist the dock position (and leave fullscreen).
  const handleModeChange = canChangeChatMode
    ? (mode: ChatDisplay) => {
        if (mode === "fullscreen") setFullscreen(true);
        else {
          setLayout({ chatMode: mode });
          setFullscreen(false);
        }
      }
    : undefined;

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
      chatMode={display}
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
      {/* One shared header always sits atop the main content area, whose body is
          the chat (fullscreen), the widget grid, or the scratchpad per the active
          nav. A docked chat is an extra column beside it. rowRef stays mounted so
          the sidebar-fit measurement (full panel width) survives mode switches. */}
      <div ref={rowRef} className="flex min-h-0 flex-1">
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            // Border + min width only while a chat docks beside the main area.
            display !== "fullscreen" && "border-border min-w-[var(--column-w)] border-r",
          )}
        >
          <PanelHeader>
            <SidebarToggle />
            {name && <span className="text-foreground truncate text-sm font-medium">{name}</span>}
            {hasWidgets && (
              <>
                <span className="text-muted-foreground/40 select-none text-sm">/</span>
                <WorkspaceTabs
                  active={activeNav}
                  onSelect={selectNav}
                  views={views}
                  onCreateView={createView}
                />
              </>
            )}
            <div className="flex-1" />
            {activeNav === "widgets" && <WidgetActions mode={widgetMode} onMode={setWidgetMode} />}
            <McpMenu />
            <WorkspaceSettings />
          </PanelHeader>

          {activeNav === "chat" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{chatPanel}</div>
          ) : activeNav === "widgets" ? (
            <Widgets mode={widgetMode} widgets={widgets} />
          ) : activeNav === "canvas" ? (
            <ScratchpadCanvas />
          ) : activeView ? (
            <ViewApp view={activeView} />
          ) : (
            <ScratchpadCanvas />
          )}
        </div>

        {display === "sidebar" && (
          // Docked chat: caps at --chat-max on big screens (grow 0), shrinks down
          // to --chat-min before the fit check flips it to floating.
          <div className="flex min-h-0 min-w-[var(--chat-min)] flex-[0_1_var(--chat-max)] flex-col overflow-hidden">
            <div className="flex min-h-0 w-full flex-1 flex-col">{chatPanel}</div>
          </div>
        )}
      </div>

      {display === "floating" && (
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
              chatMode={display}
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
