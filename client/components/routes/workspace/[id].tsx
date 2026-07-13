import { useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "motion/react";

import {
  IconAppWindow,
  IconArtboard,
  IconLayoutGrid,
  IconLayoutSidebarRight,
  IconPalette,
  IconPlus,
  IconRobotFace,
  IconX,
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
import { CustomizePanel } from "@/client/components/CustomizePanel";
import { McpMenu } from "@/client/components/McpMenu";
import { ReorderableList } from "@/client/components/ReorderableList";
import type { ReorderableRenderState } from "@/client/components/ReorderableList";
import { Scratchpad } from "@/client/components/Scratchpad";
import { WidgetErrorBoundary } from "@/client/components/WidgetErrorBoundary";
import { Widgets } from "@/client/components/Widgets";
import {
  PanelHeader,
  PROVIDER_ICON,
  SidebarLayout,
} from "@/client/components/layout/SidebarLayout";
import { LedLogo } from "@/client/components/playground/LedLogo";
import { Button, buttonVariants } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import { WorkspaceSettings } from "@/client/components/settings/WorkspaceSettings";
import { useChat } from "@/client/hooks/useChat";
import { useAppletCacheInvalidation, useView } from "@/client/hooks/useApplet";
import { useFitsSplitLayout } from "@/client/hooks/useFitsSplitLayout";
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
import type {
  LayoutMode,
  SessionInfo,
  ViewInfo,
  WidgetInfo,
  WorkspaceTabId,
  WorkspaceTabsState,
} from "@/lib/types";

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
  const {
    layout,
    setLayout,
    isLoading: layoutLoading,
  } = useWorkspaceLayoutCtx();
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
          <WorkspaceView
            widgets={widgets.data ?? []}
            views={views.data ?? []}
          />
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
    if (!stillValid)
      liveStore
        .getState()
        .setActive(workspaceId, sessions[0]?.sessionId ?? null);
  }, [workspaceId, sessions]);
  return null;
}

const DEFAULT_TABS: WorkspaceTabsState = { open: ["agent"], active: "agent" };

const viewTabId = (id: string): WorkspaceTabId => `view:${id}`;
const viewIdFromTab = (tab: WorkspaceTabId) =>
  tab.startsWith("view:") ? tab.slice(5) : null;

type WorkspaceTabsProps = {
  tabs: TabItem[];
  active: WorkspaceTabId;
  createItems: CreateTabItem[];
  onSelect: (nav: WorkspaceTabId) => void;
  onClose: (nav: WorkspaceTabId) => void;
  onReorder: (ordered: WorkspaceTabId[]) => void;
};

const CREATE_TAB_TRIGGER_CLASS = "text-muted-foreground";

const tabClass = (isActive: boolean) =>
  cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    isActive && "bg-accent text-accent-foreground",
  );

type TabItem = {
  key: WorkspaceTabId;
  Icon: typeof IconRobotFace;
  label: string;
  closable?: boolean;
};

type CreateTabItem = {
  key: string;
  Icon: typeof IconRobotFace;
  label: string;
  onClick: () => void;
};

function CreateTabMenu({ items }: { items: CreateTabItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={CREATE_TAB_TRIGGER_CLASS}
            aria-label="Create tab"
          >
            <IconPlus stroke={1.75} />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuGroup>
          {items.map(({ key, Icon, label, onClick }) => (
            <DropdownMenuItem key={key} onClick={onClick}>
              <Icon stroke={1.75} />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type TabButtonProps = {
  tab: TabItem;
  active: boolean;
  state: ReorderableRenderState;
  onSelect: (nav: WorkspaceTabId) => void;
  onClose: (nav: WorkspaceTabId) => void;
};

function TabButton({ tab, active, state, onSelect, onClose }: TabButtonProps) {
  const className = cn(
    tabClass(active),
    "min-w-0",
    state.isDragging && "invisible",
  );

  if (tab.closable) {
    return (
      <div className={cn(className, "group/close relative overflow-hidden")}>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => onSelect(tab.key)}
          {...state.dragHandleProps}
        >
          <tab.Icon stroke={1.75} />
          <span className="truncate">{tab.label}</span>
        </button>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end rounded-r-xs bg-linear-to-l from-accent via-accent/95 via-55% to-transparent pr-1.5 opacity-0 transition-opacity duration-150 group-hover/close:opacity-100 group-focus-within/close:opacity-100"
        />
        <button
          type="button"
          aria-label={`Close ${tab.label}`}
          className="absolute right-1.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-xs text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/close:opacity-100 group-focus-within/close:opacity-100"
          onClick={() => {
            onClose(tab.key);
          }}
        >
          <IconX className="size-3!" stroke={1.75} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onSelect(tab.key)}
      {...state.dragHandleProps}
    >
      <tab.Icon stroke={1.75} />
      <span className="truncate">{tab.label}</span>
    </button>
  );
}

function TabDragPreview({ tab, active }: { tab: TabItem; active: boolean }) {
  return (
    <div
      className={cn(
        tabClass(active),
        "cursor-grabbing shadow-lg ring-1 ring-border",
      )}
    >
      <tab.Icon stroke={1.75} />
      {tab.label}
      {tab.closable && <IconX className="size-3!" stroke={1.75} />}
    </div>
  );
}

// The section nav: the scrollable strip of Widgets / Scratchpad / view tabs.
function WorkspaceTabs({
  tabs,
  active,
  createItems,
  onSelect,
  onClose,
  onReorder,
}: WorkspaceTabsProps) {
  return (
    <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
      <div className="flex w-max items-center gap-1">
        <ReorderableList
          items={tabs}
          getId={(tab) => tab.key}
          className="flex items-center gap-1"
          onReorder={(ordered) => onReorder(ordered as WorkspaceTabId[])}
          renderPlaceholder={() => (
            <div className="pointer-events-none absolute inset-0 rounded-xs bg-muted" />
          )}
          renderOverlay={(tab) => (
            <TabDragPreview tab={tab} active={active === tab.key} />
          )}
          renderItem={(tab, state) => (
            <TabButton
              tab={tab}
              active={active === tab.key}
              state={state}
              onSelect={onSelect}
              onClose={onClose}
            />
          )}
        />
        <CreateTabMenu items={createItems} />
      </div>
    </div>
  );
}

type SectionControlsProps = {
  mode: LayoutMode;
  onToggleMode: () => void;
};

// Temporary layout switch: fullscreen tabbed workspace ⇄ legacy split view.
function SectionControls({ mode, onToggleMode }: SectionControlsProps) {
  const fullscreen = mode === "fullscreen";
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onToggleMode}
      aria-label={
        fullscreen ? "Switch to split view" : "Switch to full-screen view"
      }
    >
      <IconLayoutSidebarRight stroke={1.75} />
    </Button>
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

type WorkspaceCustomizeActionProps = {
  active: boolean;
  onToggle: () => void;
};

function WorkspaceCustomizeAction({
  active,
  onToggle,
}: WorkspaceCustomizeActionProps) {
  return (
    <Tooltip delay={50}>
      <TooltipTrigger
        render={
          <Button
            variant={active ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Customize"
            aria-pressed={active}
            onClick={onToggle}
          >
            <IconPalette stroke={1.75} />
          </Button>
        }
      />
      <TooltipContent>Customize</TooltipContent>
    </Tooltip>
  );
}

type WorkspaceViewProps = {
  widgets: WidgetInfo[];
  views: ViewInfo[];
};

type WidgetMode = "idle" | "editing" | "customizing";

function normalizeTabsState(
  tabs: WorkspaceTabsState | undefined,
): WorkspaceTabsState {
  if (!tabs || !Array.isArray(tabs.open)) return DEFAULT_TABS;
  const open = tabs.open.filter(
    (tab, index, all) => all.indexOf(tab) === index,
  );
  if (open.length === 0) return DEFAULT_TABS;
  return { open, active: open.includes(tabs.active) ? tabs.active : open[0] };
}

function tabAvailable(
  tab: WorkspaceTabId,
  views: ViewInfo[],
) {
  if (tab === "agent" || tab === "widgets" || tab === "scratchpad") return true;
  const viewId = viewIdFromTab(tab);
  return viewId ? views.some((v) => v.id === viewId) : false;
}

function tabItemFor(
  tab: WorkspaceTabId,
  views: ViewInfo[],
  closable: boolean,
): TabItem | null {
  if (tab === "agent") {
    return {
      key: tab,
      Icon: IconRobotFace,
      label: "Agent",
      closable,
    };
  }
  if (tab === "widgets") {
    return {
      key: tab,
      Icon: IconLayoutGrid,
      label: "Widgets",
      closable,
    };
  }
  if (tab === "scratchpad") {
    return {
      key: tab,
      Icon: IconArtboard,
      label: "Scratchpad",
      closable,
    };
  }
  const viewId = viewIdFromTab(tab);
  const view = viewId ? views.find((v) => v.id === viewId) : null;
  return view
    ? {
        key: tab,
        Icon: IconAppWindow,
        label: viewLabel(view),
        closable,
      }
    : null;
}

function applyVisibleTabOrder(
  open: WorkspaceTabId[],
  visible: WorkspaceTabId[],
  orderedVisible: WorkspaceTabId[],
) {
  const visibleSet = new Set(visible);
  let cursor = 0;
  return open.map((tab) =>
    visibleSet.has(tab) ? orderedVisible[cursor++] : tab,
  );
}

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
  const { layout, setLayout, name, icon, provider, workspaceId } =
    useWorkspaceLayoutCtx();
  const { ref: rowRef, fits: canUseSplit } =
    useFitsSplitLayout<HTMLDivElement>();
  const [widgetMode, setWidgetMode] = useState<WidgetMode>("idle");
  const [floatingChatOpen, setFloatingChatOpen] = useState(false);
  const [chatFocusRequest, setChatFocusRequest] = useState(0);

  // Theme is scoped to this wrapper, not :root — the sidebar keeps the default
  // tokens. The floating chat portals into the same element so it inherits them.
  const themeRef = useRef<HTMLDivElement>(null);
  useWorkspaceTheme(layout.theme, themeRef);

  const tabsState = normalizeTabsState(layout.tabs);
  const availableOpenTabs = tabsState.open.filter((tab) =>
    tabAvailable(tab, views),
  );
  const effectiveOpenTabs =
    availableOpenTabs.length > 0 ? availableOpenTabs : DEFAULT_TABS.open;
  const openSet = new Set(tabsState.open);
  const nonAgentOpenTabs = effectiveOpenTabs.filter((tab) => tab !== "agent");
  const hasWorkspaceContent = nonAgentOpenTabs.length > 0;

  // Effective layout mode. Split is only visible with workspace content and
  // enough row width; the saved mode remains the user's intent.
  const wantsSplit = layout.layoutMode === "split" && hasWorkspaceContent;
  const mode: LayoutMode =
    wantsSplit && canUseSplit ? "split" : "fullscreen";
  const dockedSplit = mode === "split";

  const setMode = (m: LayoutMode) => {
    if (m === "split" && tabsState.active === "agent") {
      setLayout({
        layoutMode: m,
        tabs: {
          open: tabsState.open,
          active: nonAgentOpenTabs[0] ?? tabsState.active,
        },
      });
      return;
    }
    setLayout({ layoutMode: m });
  };

  const visibleTabIds = dockedSplit
    ? nonAgentOpenTabs
    : effectiveOpenTabs;
  const activeTab: WorkspaceTabId = visibleTabIds.includes(tabsState.active)
    ? tabsState.active
    : (visibleTabIds[0] ?? "agent");
  const canCloseTabs = effectiveOpenTabs.length > 1;
  const tabItems = visibleTabIds
    .map((tab) => tabItemFor(tab, views, canCloseTabs))
    .filter((tab): tab is TabItem => Boolean(tab));
  const activeViewId = viewIdFromTab(activeTab);
  const activeView = activeViewId
    ? views.find((v) => v.id === activeViewId)
    : undefined;

  useEffect(() => {
    if (mode !== "fullscreen" || activeTab === "agent") {
      setFloatingChatOpen(false);
    }
  }, [activeTab, mode]);

  const setTabs = (tabs: WorkspaceTabsState) => setLayout({ tabs });

  const openTab = (tab: WorkspaceTabId) => {
    const open = openSet.has(tab) ? tabsState.open : [...tabsState.open, tab];
    setTabs({ open, active: tab });
    if (tab === "agent") {
      setFloatingChatOpen(false);
      setChatFocusRequest((request) => request + 1);
    }
  };

  const closeTab = (tab: WorkspaceTabId) => {
    if (!canCloseTabs || !openSet.has(tab)) return;
    const open = tabsState.open.filter((t) => t !== tab);
    let active = tabsState.active;
    if (active === tab || !open.includes(active)) {
      const visibleIndex = visibleTabIds.indexOf(tab);
      active =
        visibleTabIds[visibleIndex + 1] ??
        visibleTabIds[visibleIndex - 1] ??
        open.find((t) => tabAvailable(t, views)) ??
        "agent";
    }
    setTabs({ open, active });
  };

  const reorderTabs = (orderedVisibleTabs: WorkspaceTabId[]) => {
    const open = applyVisibleTabOrder(
      tabsState.open,
      visibleTabIds,
      orderedVisibleTabs,
    );
    if (open === tabsState.open) return;
    setTabs({ open, active: tabsState.active });
  };

  const openChat = (intent?: string) => {
    if (intent !== undefined) {
      liveStore.getState().setDraft(workspaceId, sessionId, intent);
    }
    if (mode === "fullscreen" && activeTab !== "agent") {
      setFloatingChatOpen(true);
      if (floatingChatOpen) {
        setChatFocusRequest((request) => request + 1);
      }
      return;
    }
    setChatFocusRequest((request) => request + 1);
  };

  const createItems: CreateTabItem[] = [
    ...(!dockedSplit && !openSet.has("agent")
      ? ([
          {
            key: "agent",
            Icon: IconRobotFace,
            label: "Agent",
            onClick: () => openTab("agent"),
          },
        ] satisfies CreateTabItem[])
      : []),
    ...(!openSet.has("widgets")
      ? ([
          {
            key: "widgets",
            Icon: IconLayoutGrid,
            label: "Widgets",
            onClick: () => openTab("widgets"),
          },
        ] satisfies CreateTabItem[])
      : []),
    ...(!openSet.has("scratchpad")
      ? ([
          {
            key: "scratchpad",
            Icon: IconArtboard,
            label: "Scratchpad",
            onClick: () => openTab("scratchpad"),
          },
        ] satisfies CreateTabItem[])
      : []),
    ...views
      .map((v) => ({ view: v, tab: viewTabId(v.id) }))
      .filter(({ tab }) => !openSet.has(tab))
      .map(
        ({ view, tab }): CreateTabItem => ({
          key: tab,
          Icon: IconAppWindow,
          label: viewLabel(view),
          onClick: () => openTab(tab),
        }),
      ),
    {
      key: "create-view",
      Icon: IconAppWindow,
      label: "View",
      onClick: () => openChat("Create view"),
    },
  ];

  const workspaceIdentity = (
    <>
      <img
        src={icon ?? PROVIDER_ICON[provider ?? "claude-code"]}
        alt=""
        className="size-5 shrink-0 rounded-[4px]"
      />
      {name && (
        <span className="text-foreground truncate text-sm font-medium">
          {name}
        </span>
      )}
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
    </>
  );

  // The docked split chat. Full-screen Agent uses the tabbed chat below.
  const dockedChat = (
    <ChatPanel
      active={mode === "split"}
      focusRequest={chatFocusRequest}
      view={view}
      previewTurn={previewTurn}
      sessionId={sessionId}
      processing={processing}
      error={error}
      onDismissError={dismissError}
      send={send}
      stop={stop}
      onSwitchThread={switchThread}
    />
  );

  const tabbedChat = (
    <ChatPanel
      active={mode === "fullscreen" && activeTab === "agent"}
      focusRequest={chatFocusRequest}
      view={view}
      previewTurn={previewTurn}
      sessionId={sessionId}
      processing={processing}
      error={error}
      onDismissError={dismissError}
      send={send}
      stop={stop}
      onSwitchThread={switchThread}
    />
  );

  return (
    // Themed wrapper: scoped CSS vars (bg/fg/font) live here so the panel — and
    // the portaled floating chat — pick up the workspace theme, while the
    // sidebar outside stays default.
    <div
      ref={themeRef}
      className="bg-background text-foreground relative flex h-full min-h-0 flex-col font-sans"
    >
      <div ref={rowRef} className="flex min-h-0 flex-1">
        {/* Full-screen: whole panel. Split: the left content column. */}
        {(mode === "fullscreen" || hasWorkspaceContent) && (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              mode === "split" && "min-w-[var(--column-w)]",
            )}
          >
            <PanelHeader>
              {workspaceIdentity}
              {/* The tabs strip grows to fill the header's slack and scrolls
                  horizontally when there are too many tabs. */}
              <WorkspaceTabs
                tabs={tabItems}
                active={activeTab}
                createItems={createItems}
                onSelect={openTab}
                onClose={closeTab}
                onReorder={reorderTabs}
              />
              <div className="flex items-center gap-1">
                <WorkspaceCustomizeAction
                  active={widgetMode === "customizing"}
                  onToggle={() =>
                    setWidgetMode(
                      widgetMode === "customizing" ? "idle" : "customizing",
                    )
                  }
                />
                <McpMenu />
                <WorkspaceSettings />
                {hasWorkspaceContent && canUseSplit && (
                  <SectionControls
                    mode={mode}
                    onToggleMode={() =>
                      setMode(
                        mode === "fullscreen" ? "split" : "fullscreen",
                      )
                    }
                  />
                )}
              </div>
            </PanelHeader>

            {activeTab === "agent" ? (
              tabbedChat
            ) : activeTab === "widgets" ? (
              <Widgets
                editing={widgetMode === "editing"}
                onEditingChange={(editing) =>
                  setWidgetMode(editing ? "editing" : "idle")
                }
                widgets={widgets}
                onCreateWidget={() => openChat("Create widget")}
              />
            ) : activeTab === "scratchpad" ? (
              <Scratchpad />
            ) : activeView ? (
              <ViewApp view={activeView} />
            ) : null}
          </div>
        )}

        {/* Split: Agent chat as a bounded right column. Full-screen mode uses the
            Agent tab instead. */}
        {mode === "split" && (
          <div
            className={cn(
              "border-border flex min-h-0 min-w-[var(--chat-min)] flex-[0_1_var(--chat-max)] flex-col overflow-hidden border-l",
            )}
          >
            {dockedChat}
          </div>
        )}
      </div>

      <AnimatePresence>
        {widgetMode === "customizing" && <CustomizePanel />}
      </AnimatePresence>

      {mode === "fullscreen" &&
        activeTab !== "agent" &&
        hasWorkspaceContent && (
          <ChatPopup
            open={floatingChatOpen}
            onOpenChange={setFloatingChatOpen}
            onOpenChangeComplete={(open) => {
              if (open) {
                setChatFocusRequest((request) => request + 1);
              }
            }}
            container={themeRef}
          >
            {(onClose) => (
              <ChatPanel
                active={floatingChatOpen}
                focusRequest={chatFocusRequest}
                view={view}
                previewTurn={previewTurn}
                sessionId={sessionId}
                processing={processing}
                error={error}
                onDismissError={dismissError}
                send={send}
                stop={stop}
                onSwitchThread={switchThread}
                onClose={onClose}
              />
            )}
          </ChatPopup>
        )}
    </div>
  );
}
