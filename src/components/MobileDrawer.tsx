import React, { useState } from "react";
import {
  Inbox,
  CalendarPlus,
  ListChecks,
  Plus,
  ChevronDown,
  ChevronRight,
  Flame,
  X,
  CheckSquare,
} from "lucide-react";
import type { Priority, ViewId } from "../types";
import { useApp } from "../store";
import { triggerHaptic } from "../utils/native";
import { cn } from "./ui";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  currentView?: ViewId;
  onSelectView?: (view: ViewId) => void;
  onSelectTaskFilter?: (filter: "inbox" | "today" | "all" | { project: string } | { tag: string } | { priority: Priority }) => void;
  selectedTaskFilter?: string; // string key e.g. "inbox", "today", "all", "p:id", "t:tag", "pr:priority"
  onNewProject?: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  open,
  onClose,
  currentView,
  onSelectView,
  onSelectTaskFilter,
  selectedTaskFilter,
  onNewProject,
}) => {
  const { state, openTaskDialog } = useApp();
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(true);
  const [prioritiesExpanded, setPrioritiesExpanded] = useState(false);

  if (!open) return null;

  const openTasks = state.tasks.filter((t) => !t.done);
  const inboxCount = openTasks.filter((t) => !t.due).length;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = openTasks.filter(
    (t) => t.due && t.due <= today && (!t.snoozedUntil || t.snoozedUntil <= Date.now())
  ).length;

  // Extract all unique tags
  const allTags = Array.from(new Set(state.tasks.flatMap((t) => t.tags))).filter(Boolean);

  const handleSmartView = (filterKey: "inbox" | "today" | "all") => {
    triggerHaptic("light");
    onSelectView?.("tasks");
    onSelectTaskFilter?.(filterKey);
    onClose();
  };

  const handleProjectClick = (projectId: string) => {
    triggerHaptic("light");
    onSelectView?.("tasks");
    onSelectTaskFilter?.({ project: projectId });
    onClose();
  };

  const handleTagClick = (tag: string) => {
    triggerHaptic("light");
    onSelectView?.("tasks");
    onSelectTaskFilter?.({ tag });
    onClose();
  };

  const handlePriorityClick = (priority: Priority) => {
    triggerHaptic("light");
    onSelectView?.("tasks");
    onSelectTaskFilter?.({ priority });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Task navigation drawer">
      {/* Dimmed touch backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer content panel */}
      <aside
        className="relative z-10 flex h-full w-[290px] max-w-[85vw] flex-col border-r bg-[var(--panel)] shadow-2xl transition-transform animate-in slide-in-from-left duration-250 select-none"
        style={{
          borderColor: "var(--line)",
          paddingTop: "max(calc(var(--safe-top) + 8px), 16px)",
          paddingBottom: "max(var(--safe-bottom), 16px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b px-4 pb-3" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl font-bold shadow-xs text-white"
              style={{ background: "var(--accent)" }}
            >
              <CheckSquare size={18} />
            </div>
            <div>
              <div className="font-display text-[15px] font-bold tracking-tight text-[var(--text)]">
                Tasks & Projects
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--mut)]">
                <span className="flex items-center gap-0.5 text-[var(--accent)] font-bold">
                  <Flame size={11} /> {openTasks.length} open
                </span>
                <span>•</span>
                <span>{state.projects.length} projects</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--mut)] hover:bg-[var(--panel2)] active:scale-95 cursor-pointer"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable List Sections (Todoist Style) */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 scrollbar-none">
          {/* Section 1: Smart Views */}
          <div className="space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--mut)]">
              Tasks
            </div>
            
            {/* Inbox */}
            <button
              type="button"
              onClick={() => handleSmartView("inbox")}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-bold transition-all cursor-pointer text-left",
                currentView === "tasks" && selectedTaskFilter === "inbox"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text)] hover:bg-[var(--panel2)]"
              )}
            >
              <Inbox size={17} className={selectedTaskFilter === "inbox" ? "text-[var(--accent)]" : "text-[var(--mut)]"} />
              <span className="flex-1 truncate">Inbox</span>
              {inboxCount > 0 && (
                <span className="rounded-full bg-[var(--panel2)] px-2 py-0.5 text-[11px] font-bold text-[var(--mut)]">
                  {inboxCount}
                </span>
              )}
            </button>

            {/* Today */}
            <button
              type="button"
              onClick={() => handleSmartView("today")}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-bold transition-all cursor-pointer text-left",
                currentView === "tasks" && selectedTaskFilter === "today"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text)] hover:bg-[var(--panel2)]"
              )}
            >
              <CalendarPlus size={17} className={selectedTaskFilter === "today" ? "text-[var(--accent)]" : "text-amber-500"} />
              <span className="flex-1 truncate">Today</span>
              {todayCount > 0 && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  {todayCount}
                </span>
              )}
            </button>

            {/* All Tasks */}
            <button
              type="button"
              onClick={() => handleSmartView("all")}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-bold transition-all cursor-pointer text-left",
                currentView === "tasks" && selectedTaskFilter === "all"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text)] hover:bg-[var(--panel2)]"
              )}
            >
              <ListChecks size={17} className={selectedTaskFilter === "all" ? "text-[var(--accent)]" : "text-[var(--mut)]"} />
              <span className="flex-1 truncate">All Tasks</span>
              <span className="rounded-full bg-[var(--panel2)] px-2 py-0.5 text-[11px] font-bold text-[var(--mut)]">
                {openTasks.length}
              </span>
            </button>
          </div>

          {/* Section 2: Projects (Collapsible + Add Project) */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between px-2.5 py-1">
              <button
                type="button"
                onClick={() => setProjectsExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--mut)] hover:text-[var(--text)] cursor-pointer"
              >
                {projectsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Projects ({state.projects.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("medium");
                  onNewProject?.();
                  onClose();
                }}
                className="rounded-md p-1 text-[var(--mut)] hover:bg-[var(--panel2)] hover:text-[var(--text)] active:scale-95 cursor-pointer"
                title="Create Project"
                aria-label="Create project"
              >
                <Plus size={14} />
              </button>
            </div>

            {projectsExpanded && (
              <div className="space-y-0.5 pl-1">
                {state.projects.length === 0 && (
                  <div className="px-3 py-2 text-[11.5px] font-medium text-[var(--mut)]">
                    No projects yet. Tap + to add one.
                  </div>
                )}
                {state.projects.map((p) => {
                  const pCount = openTasks.filter((t) => t.projectId === p.id).length;
                  const isSel = currentView === "tasks" && selectedTaskFilter === `p:${p.id}`;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleProjectClick(p.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[13px] font-bold transition-all cursor-pointer text-left",
                        isSel
                          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "text-[var(--text)] hover:bg-[var(--panel2)]"
                      )}
                    >
                      <span className="text-[14px]">{p.emoji || "📁"}</span>
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
                      <span className="flex-1 truncate">{p.name}</span>
                      {pCount > 0 && (
                        <span className="rounded-full px-2 py-0.2 text-[10.5px] font-bold text-[var(--mut)]">
                          {pCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Tags / Labels (Collapsible) */}
          {allTags.length > 0 && (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between px-2.5 py-1">
                <button
                  type="button"
                  onClick={() => setTagsExpanded((v) => !v)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--mut)] hover:text-[var(--text)] cursor-pointer"
                >
                  {tagsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>Tags ({allTags.length})</span>
                </button>
              </div>

              {tagsExpanded && (
                <div className="space-y-0.5 pl-1">
                  {allTags.map((t) => {
                    const tCount = openTasks.filter((x) =>
                      x.tags.some((y) => y.toLowerCase() === t.toLowerCase())
                    ).length;
                    const isSel = currentView === "tasks" && selectedTaskFilter === `t:${t}`;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleTagClick(t)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[13px] font-bold transition-all cursor-pointer text-left",
                          isSel
                            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "text-[var(--text)] hover:bg-[var(--panel2)]"
                        )}
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: state.tagColors[t] ?? "var(--accent)" }}
                        />
                        <span className="flex-1 truncate">#{t}</span>
                        {tCount > 0 && (
                          <span className="rounded-full px-2 py-0.2 text-[10.5px] font-bold text-[var(--mut)]">
                            {tCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section 4: Priority Filters (Collapsible) */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => setPrioritiesExpanded((v) => !v)}
              className="flex w-full items-center justify-between px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--mut)] hover:text-[var(--text)] cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                {prioritiesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>Priorities</span>
              </div>
            </button>

            {prioritiesExpanded && (
              <div className="space-y-0.5 pl-1">
                {(["urgent", "high", "medium", "low"] as const).map((pr) => {
                  const pCount = openTasks.filter((t) => t.priority === pr).length;
                  const isSel = currentView === "tasks" && selectedTaskFilter === `pr:${pr}`;
                  const meta = {
                    urgent: { label: "Urgent", color: "#d66853", icon: "🔴" },
                    high: { label: "High", color: "#e0b457", icon: "🟠" },
                    medium: { label: "Medium", color: "#6fbf8e", icon: "🟡" },
                    low: { label: "Low", color: "#8b93a5", icon: "⚪" },
                  }[pr];
                  return (
                    <button
                      key={pr}
                      type="button"
                      onClick={() => handlePriorityClick(pr)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[13px] font-bold transition-all cursor-pointer text-left",
                        isSel
                          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "text-[var(--text)] hover:bg-[var(--panel2)]"
                      )}
                    >
                      <span className="text-[12px]">{meta.icon}</span>
                      <span className="flex-1 truncate">{meta.label} Priority</span>
                      {pCount > 0 && (
                        <span className="rounded-full px-2 py-0.2 text-[10.5px] font-bold text-[var(--mut)]">
                          {pCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Bottom Bar: Quick Create Task */}
        <div className="border-t p-3" style={{ borderColor: "var(--line)", background: "var(--panel2)" }}>
          <button
            type="button"
            onClick={() => {
              triggerHaptic("medium");
              openTaskDialog();
              onClose();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-white shadow-sm transition-transform active:scale-95 cursor-pointer"
            style={{ background: "var(--accent)" }}
          >
            <Plus size={15} strokeWidth={2.8} />
            <span>Create New Task</span>
          </button>
        </div>
      </aside>
    </div>
  );
};
