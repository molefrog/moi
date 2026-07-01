import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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

import {
  useWorkspaceSessions,
  useWorkspaceViews,
  useWorkspaceWidgets,
  workspaceKeys,
} from "@/client/api/workspaces";
import { ChatPanel } from "@/client/components/ChatPanel";
import { ChatPopup } from "@/client/components/ChatPopup";
import { McpMenu } from "@/client/components/McpMenu";
import { Scratchpad } from "@/client/components/Scratchpad";
import { WidgetErrorBoundary } from "@/client/components/WidgetErrorBoundary";
import { type WidgetMode, Widgets } from "@/client/components/Widgets";
import {
  PanelHeader,
  PROVIDER_ICON,
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
import { useAppletCacheInvalidation, useView } from "@/client/hooks/useApplet";
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
import type { ChatDisplay, SessionInfo, ViewInfo, WidgetInfo } from "@/lib/types";

// Tab label for a view: its configured title, or the file-name id as fallback.
const viewLabel = (v: ViewInfo) => v.config.title || v.id;

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
  const views = useWorkspaceViews(id);
  const sessions = useWorkspaceSessions(id);

  // Keep the grid balanced as widgets come and go. (Theme is applied inside
  // WorkspaceView, scoped to the panel — see useWorkspaceTheme there.)
  useGridReconcile(id, widgets.data, layout, setLayout);

  // Invalidate the shared applet module cache on every rebuild, even for views /
  // widgets whose tab is currently backgrounded — so switching to them later
  // loads the fresh bundle instead of a stale cached module.
  useAppletCacheInvalidation();

  // Server-pushed changes invalidate the matching query so the next render
  // revalidates (theme re-applies; the grid reconcile places any new widget).
  useMeiEvent((e) => {
    if (e.type === "theme:updated" || e.type === "workspace:updated") {
      qc.invalidateQueries({ queryKey: workspaceKeys.layout(id) });
    } else if (e.type === "widget-layout:updated") {
      qc.invalidateQueries({ queryKey: workspaceKeys.widgets(id) });
    } else if (e.type === "view-layout:updated") {
      qc.invalidateQueries({ queryKey: workspaceKeys.views(id) });
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
          <WorkspaceView widgets={widgets.data ?? []} views={views.data ?? []} />
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

type WorkspaceTabsProps = {
  active: WorkspaceNav;
  onSelect: (nav: WorkspaceNav) => void;
  views: ViewInfo[];
  onCreateView: () => void;
};

// Shared geometry for every header tab. The active outline uses an inset shadow
// (not a border) so the box keeps the exact h-7 footprint — no 1px layout shift.
// Labels never wrap and the leading icon never shrinks, so a long view name keeps
// its full footprint. No color transition: switching tabs swaps the bg/border
// instantly.
const TAB_BASE =
  "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap [&_svg]:size-[18px] [&_svg]:shrink-0";

// Square (w = h) geometry modifier for icon-only triggers.
const ICON_TAB_SQUARE = "size-7 justify-center px-0";

// Labeled tabs (and the chat icon) keep a constant foreground text color; only
// the background and (when active) the inset-shadow border change between states.
const tabClass = (isActive: boolean) =>
  cn(
    TAB_BASE,
    "text-foreground",
    isActive ? "bg-muted shadow-[inset_0_0_0_1px_var(--border)]" : "hover:bg-muted/60",
  );

// The "…" overflow trigger stays gray until active/hovered — it doesn't follow
// the always-foreground rule the labeled tabs use.
const iconTabClass = (isActive: boolean) =>
  cn(
    TAB_BASE,
    ICON_TAB_SQUARE,
    isActive
      ? "bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  );

// A collapsible tab. `kind` groups the overflow menu: predefined tabs (widgets,
// canvas) sit above the custom views, separated by a divider.
type TabItem = {
  key: WorkspaceNav;
  Icon: typeof IconMessageCircle;
  label: string;
  kind: "fixed" | "view";
};

type OverflowTabsProps = {
  tabs: TabItem[];
  active: WorkspaceNav;
  onSelect: (nav: WorkspaceNav) => void;
  onCreateView: () => void;
};

// A horizontal strip of tabs that fills its available width and folds whatever
// doesn't fit into a trailing "…" menu, recomputing on resize. It measures each
// tab's natural width with a hidden mirror row (container queries can't see
// variable label widths), tracks its own width via a ResizeObserver, then shows
// as many tabs as fit and hides the rest — rightmost first — into the menu.
function OverflowTabs({ tabs, active, onSelect, onCreateView }: OverflowTabsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mirrorRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [avail, setAvail] = useState(0);
  const [widths, setWidths] = useState<{ items: number[]; menu: number }>({ items: [], menu: 0 });

  // Re-measure natural widths whenever the set of tabs (or their labels) changes.
  const sig = tabs.map((t) => `${t.key}:${t.label}`).join("|");
  useLayoutEffect(() => {
    setWidths({
      items: tabs.map((_, i) => mirrorRefs.current[i]?.offsetWidth ?? 0),
      menu: menuRef.current?.offsetWidth ?? 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Track the strip's available width (it grows to fill the header's slack).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setAvail(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // How many tabs fit: the "…" trigger is always reserved, then add tabs L→R
  // while they fit. GAP mirrors the `gap-1` (4px) between buttons.
  const visibleCount = useMemo(() => {
    const GAP = 4;
    if (!avail || widths.items.length !== tabs.length) return tabs.length;
    let used = widths.menu;
    let count = 0;
    for (const w of widths.items) {
      if (used + w + GAP <= avail) {
        used += w + GAP;
        count++;
      } else break;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avail, widths, tabs.length]);

  const overflow = tabs.slice(visibleCount);
  const overflowFixed = overflow.filter((t) => t.kind === "fixed");
  const overflowViews = overflow.filter((t) => t.kind === "view");
  // The "…" trigger lights up when one of the folded-away tabs is the active one.
  const overflowActive = overflow.some((t) => t.key === active);

  const menuItem = ({ key, Icon, label }: TabItem) => (
    <DropdownMenuCheckboxItem
      key={key}
      checked={active === key}
      closeOnClick
      onClick={() => onSelect(key)}
    >
      <Icon stroke={1.75} />
      {label}
    </DropdownMenuCheckboxItem>
  );

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-1 items-center gap-1">
      {/* Hidden mirror: every tab + the menu trigger at natural width, laid out
          but invisible and out of flow, read via the refs above. */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-1"
      >
        {tabs.map(({ key, Icon, label }, i) => (
          <button
            key={key}
            ref={(el) => {
              mirrorRefs.current[i] = el;
            }}
            type="button"
            className={tabClass(false)}
          >
            <Icon stroke={1.75} />
            {label}
          </button>
        ))}
        <button ref={menuRef} type="button" className={iconTabClass(false)}>
          <IconDots stroke={1.75} />
        </button>
      </div>

      {tabs.slice(0, visibleCount).map(({ key, Icon, label }) => (
        <button
          key={key}
          type="button"
          className={tabClass(active === key)}
          onClick={() => onSelect(key)}
        >
          <Icon stroke={1.75} />
          {label}
        </button>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className={iconTabClass(overflowActive)} aria-label="More views">
              <IconDots stroke={1.75} />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-48">
          {overflowFixed.map(menuItem)}
          {overflowFixed.length > 0 && overflowViews.length > 0 && <DropdownMenuSeparator />}
          {overflowViews.map(menuItem)}
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

// The workspace nav: a pinned fullscreen-chat icon, then the collapsible strip of
// Widgets / Scratchpad / view tabs, which folds overflow into a "…" menu.
function WorkspaceTabs({ active, onSelect, views, onCreateView }: WorkspaceTabsProps) {
  const tabs: TabItem[] = [
    { key: "widgets", Icon: IconLayoutGrid, label: "Widgets", kind: "fixed" },
    { key: "canvas", Icon: IconArtboard, label: "Scratchpad", kind: "fixed" },
    ...views.map(
      (v): TabItem => ({ key: v.id, Icon: IconAppWindow, label: viewLabel(v), kind: "view" }),
    ),
  ];

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <Tooltip delay={50}>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn(tabClass(active === "chat"), ICON_TAB_SQUARE, "shrink-0")}
              onClick={() => onSelect("chat")}
              aria-label="Open fullscreen chat"
            >
              <IconMessageCircle stroke={1.75} />
            </button>
          }
        />
        <TooltipContent>Open fullscreen chat</TooltipContent>
      </Tooltip>
      <OverflowTabs tabs={tabs} active={active} onSelect={onSelect} onCreateView={onCreateView} />
    </div>
  );
}

type ViewAppProps = {
  view: ViewInfo;
};

// A view — an agent-defined app — mounted full-area. The bundle owns its own
// layout + scroll, so we give it a plain filled box and fade it in (mirroring
// WidgetShell, but full-area instead of a grid cell).
function ViewApp({ view }: ViewAppProps) {
  const bundle = useView(view.id);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {bundle.status === "ready" && (
          <motion.div
            key={bundle.version}
            className="absolute inset-0 overflow-auto"
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <WidgetErrorBoundary name={view.id} resetKey={bundle.version}>
              <bundle.Component />
            </WidgetErrorBoundary>
          </motion.div>
        )}
        {bundle.status === "error" && (
          <motion.p
            key={`err-${bundle.version}`}
            className="text-destructive absolute inset-0 p-4 text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {bundle.error}
          </motion.p>
        )}
      </AnimatePresence>
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
  views: ViewInfo[];
};

function WorkspaceView({ widgets, views }: WorkspaceViewProps) {
  const {
    view,
    previewTurn,
    sessionId,
    processing,
    error,
    send,
    stop,
    switchThread,
    dismissError,
  } = useChat();
  const { layout, setLayout, name, icon, provider } = useWorkspaceLayoutCtx();
  const { ref: rowRef, fits: canFitSidebar } = useFitsSidebar<HTMLDivElement>();
  const [widgetMode, setWidgetMode] = useState<WidgetMode>("idle");
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

  // "Create View" is a no-op for now — views are authored by the agent via the
  // CLI (`.moi/views/<name>.tsx` + `moi bundle`), not from the UI.
  const createView = () => {};
  // The active view, when a view (not a fixed tab) fills the main area.
  const activeView = views.find((v) => v.id === bodyTab);

  // If the active view's file was deleted (its bundle vanished from the list),
  // `bodyTab` dangles — fall back to the widget grid so nothing renders blank.
  const isViewTab = bodyTab !== "widgets" && bodyTab !== "canvas";
  useEffect(() => {
    if (isViewTab && !activeView) setBodyTab("widgets");
  }, [isViewTab, activeView]);

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
      previewTurn={previewTurn}
      sessionId={sessionId}
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
            <img
              src={icon ?? PROVIDER_ICON[provider ?? "claude-code"]}
              alt=""
              className="size-5 shrink-0 rounded-[4px]"
            />
            {name && <span className="text-foreground truncate text-sm font-medium">{name}</span>}
            {hasWidgets ? (
              <>
                <span className="text-muted-foreground/40 select-none text-sm">/</span>
                {/* The tabs strip grows to fill the header's slack and measures
                    its own width to fold overflow into the "…" menu, so it owns
                    the spacer role here. */}
                <WorkspaceTabs
                  active={activeNav}
                  onSelect={selectNav}
                  views={views}
                  onCreateView={createView}
                />
              </>
            ) : (
              <div className="flex-1" />
            )}
            {activeNav === "widgets" && <WidgetActions mode={widgetMode} onMode={setWidgetMode} />}
            <McpMenu />
            <WorkspaceSettings />
          </PanelHeader>

          {activeNav === "chat" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{chatPanel}</div>
          ) : activeNav === "widgets" ? (
            <Widgets mode={widgetMode} widgets={widgets} />
          ) : activeNav === "canvas" ? (
            <Scratchpad />
          ) : activeView ? (
            <ViewApp view={activeView} />
          ) : null}
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
              previewTurn={previewTurn}
              sessionId={sessionId}
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
