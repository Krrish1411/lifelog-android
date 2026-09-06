import React, { useMemo, useState } from "react";
import {
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Inbox,
  ListChecks,
  Pencil,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
  Zap,
  Layers,
  FileText,
  ArrowUpDown,
  GripVertical,
} from "lucide-react";
import type { Priority, Project, Subtask, Task } from "../types";
import { useApp } from "../store";
import {
  describeRecurrence,
  fmtClock,
  fmtDayShort,
  fmtDur,
  isoDate,
  normalizeHex,
  sessionMinutes,
  todayIso,
  uid,
} from "../utils/core";
import {
  Btn,
  ColorPicker,
  EmojiPicker,
  EmptyState,
  Labeled,
  Modal,
  SearchInput,
  TextInput,
  cn,
} from "../components/ui";
import { announce } from "../components/LiveAnnouncer";
import { triggerHaptic } from "../utils/native";

const PRIORITY_META: Record<Priority, { label: string; color: string; icon: string }> = {
  urgent: { label: "Urgent", color: "#d66853", icon: "🔴" },
  high: { label: "High", color: "#e0b457", icon: "🟠" },
  medium: { label: "Medium", color: "#6fbf8e", icon: "🟡" },
  low: { label: "Low", color: "#8b93a5", icon: "⚪" },
};
const PRIORITY_ORDER: Priority[] = ["urgent", "high", "medium", "low"];

type SmartView =
  | "inbox"
  | "today"
  | "all"
  | { project: string }
  | { tag: string }
  | { priority: Priority };

function viewKey(v: SmartView): string {
  if (typeof v === "string") return v;
  if ("project" in v) return `p:${v.project}`;
  if ("tag" in v) return `t:${v.tag}`;
  return `pr:${v.priority}`;
}

export function TasksView() {
  const app = useApp();
  const { state, set, toast, confirm, openTaskDialog, requestFocus, toggleDone } = app;
  const today = todayIso();
  const [sel, setSel] = useState<SmartView>("today");
  const [query, setQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedLimit, setCompletedLimit] = useState(25);
  const [sortMode, setSortMode] = useState<"manual" | "due" | "priority">(
    state.settings.taskSortMode ?? "manual"
  );

  const [projDialog, setProjDialog] = useState<{ open: boolean; project: Project | null }>({
    open: false,
    project: null,
  });
  const [projName, setProjName] = useState("");
  const [projEmoji, setProjEmoji] = useState("🌐");
  const [projColor, setProjColor] = useState("#4fa3a5");

  const [tagMgr, setTagMgr] = useState<{ open: boolean; tag: string | null }>({
    open: false,
    tag: null,
  });
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#e8a33d");
  const [activeDragTask, setActiveDragTask] = useState<string | null>(null);
  const [activeDragProj, setActiveDragProj] = useState<string | null>(null);
  const [activeDragTag, setActiveDragTag] = useState<string | null>(null);

  const trackedByTask = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of state.sessions)
      if (s.taskId) m.set(s.taskId, (m.get(s.taskId) ?? 0) + sessionMinutes(s));
    return m;
  }, [state.sessions]);

  // Tag list with respect to tagOrder setting
  const allTags = useMemo(() => {
    const s = new Set<string>();
    state.tasks.forEach((t) => t.tags.forEach((x) => s.add(x)));
    const discovered = [...s];
    const order = state.settings.tagOrder ?? [];
    return discovered.sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [state.tasks, state.settings.tagOrder]);

  const openTasks = useMemo(() => state.tasks.filter((t) => !t.done), [state.tasks]);
  const inboxCount = openTasks.filter((t) => !t.due).length;
  const todayCount = openTasks.filter(
    (t) => t.due && t.due <= today && (!t.snoozedUntil || t.snoozedUntil <= Date.now())
  ).length;

  const list = useMemo(() => {
    let base = openTasks;
    if (sel === "inbox") base = base.filter((t) => !t.due);
    else if (sel === "today")
      base = base.filter(
        (t) => t.due && t.due <= today && (!t.snoozedUntil || t.snoozedUntil <= Date.now())
      );
    else if (typeof sel === "object" && "project" in sel)
      base = base.filter((t) => t.projectId === sel.project);
    else if (typeof sel === "object" && "tag" in sel)
      base = base.filter((t) => t.tags.some((x) => x.toLowerCase() === sel.tag.toLowerCase()));
    else if (typeof sel === "object" && "priority" in sel)
      base = base.filter((t) => t.priority === sel.priority);

    const q = query.trim().toLowerCase();
    if (q)
      base = base.filter((t) =>
        `${t.title} ${t.notes} ${t.tags.join(" ")}`.toLowerCase().includes(q)
      );

    if (sortMode === "manual") {
      // Respect manual ordering (index in state.tasks)
      return [...base];
    } else if (sortMode === "due") {
      return [...base].sort((a, b) => {
        if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
        if (a.due && !b.due) return -1;
        if (!a.due && b.due) return 1;
        return 0;
      });
    } else {
      const pw = { urgent: 0, high: 1, medium: 2, low: 3 };
      return [...base].sort((a, b) => pw[a.priority] - pw[b.priority]);
    }
  }, [openTasks, sel, query, today, sortMode]);

  const completed = useMemo(() => {
    let base = state.tasks.filter((t) => t.done);
    if (typeof sel === "object" && "project" in sel)
      base = base.filter((t) => t.projectId === sel.project);
    else if (typeof sel === "object" && "tag" in sel)
      base = base.filter((t) => t.tags.some((x) => x.toLowerCase() === sel.tag.toLowerCase()));
    else if (typeof sel === "object" && "priority" in sel)
      base = base.filter((t) => t.priority === sel.priority);
    return base.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  }, [state.tasks, sel]);

  const selTitle = useMemo(() => {
    if (sel === "inbox") return "Inbox";
    if (sel === "today") return "Today";
    if (sel === "all") return "All tasks";
    if ("project" in sel)
      return state.projects.find((p) => p.id === sel.project)?.name ?? "Project";
    if ("tag" in sel) return sel.tag;
    return PRIORITY_META[sel.priority].label;
  }, [sel, state.projects]);

  /* ---------------- reordering actions ---------------- */
  const moveTask = (taskId: string, dir: "top" | "up" | "down" | "bottom") => {
    const all = [...state.tasks];
    const idx = all.findIndex((t) => t.id === taskId);
    if (idx === -1) return;
    const item = all[idx];

    if (dir === "top") {
      all.splice(idx, 1);
      all.unshift(item);
      announce(`Moved "${item.title}" to top`);
      toast(`Moved to top`, "ok");
    } else if (dir === "bottom") {
      all.splice(idx, 1);
      all.push(item);
      announce(`Moved "${item.title}" to bottom`);
      toast(`Moved to bottom`, "ok");
    } else if (dir === "up" && idx > 0) {
      all[idx] = all[idx - 1];
      all[idx - 1] = item;
      announce(`Moved "${item.title}" up`);
    } else if (dir === "down" && idx < all.length - 1) {
      all[idx] = all[idx + 1];
      all[idx + 1] = item;
      announce(`Moved "${item.title}" down`);
    }
    set((s) => ({ ...s, tasks: all }));
  };

  const moveProject = (projId: string, dir: "top" | "up" | "down" | "bottom") => {
    const all = [...state.projects];
    const idx = all.findIndex((p) => p.id === projId);
    if (idx === -1) return;
    const item = all[idx];

    if (dir === "top") {
      all.splice(idx, 1);
      all.unshift(item);
    } else if (dir === "bottom") {
      all.splice(idx, 1);
      all.push(item);
    } else if (dir === "up" && idx > 0) {
      all[idx] = all[idx - 1];
      all[idx - 1] = item;
    } else if (dir === "down" && idx < all.length - 1) {
      all[idx] = all[idx + 1];
      all[idx + 1] = item;
    }
    set((s) => ({ ...s, projects: all }));
  };

  const moveTag = (tag: string, dir: "top" | "up" | "down" | "bottom") => {
    const cur = [...allTags];
    const idx = cur.indexOf(tag);
    if (idx === -1) return;
    const item = cur[idx];

    if (dir === "top") {
      cur.splice(idx, 1);
      cur.unshift(item);
    } else if (dir === "bottom") {
      cur.splice(idx, 1);
      cur.push(item);
    } else if (dir === "up" && idx > 0) {
      cur[idx] = cur[idx - 1];
      cur[idx - 1] = item;
    } else if (dir === "down" && idx < cur.length - 1) {
      cur[idx] = cur[idx + 1];
      cur[idx + 1] = item;
    }
    set((s) => ({ ...s, settings: { ...s.settings, tagOrder: cur } }));
  };

  /* Dynamic live drag-and-slide reordering (Super Productivity style) */
  const handleTaskLiveReorder = (targetId: string, clientY: number, targetRect: DOMRect) => {
    if (!activeDragTask || activeDragTask === targetId) return;
    const all = [...state.tasks];
    const srcIdx = all.findIndex((t) => t.id === activeDragTask);
    const tgtIdx = all.findIndex((t) => t.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const isMovingDown = srcIdx < tgtIdx;
    const threshold = isMovingDown
      ? targetRect.top + targetRect.height * 0.35
      : targetRect.top + targetRect.height * 0.65;

    if ((isMovingDown && clientY > threshold) || (!isMovingDown && clientY < threshold)) {
      const [moved] = all.splice(srcIdx, 1);
      all.splice(tgtIdx, 0, moved);
      triggerHaptic("light");
      set((s) => ({ ...s, tasks: all }));
    }
  };

  const handleProjectLiveReorder = (targetId: string, clientY: number, targetRect: DOMRect) => {
    if (!activeDragProj || activeDragProj === targetId) return;
    const all = [...state.projects];
    const srcIdx = all.findIndex((p) => p.id === activeDragProj);
    const tgtIdx = all.findIndex((p) => p.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const isMovingDown = srcIdx < tgtIdx;
    const threshold = isMovingDown
      ? targetRect.top + targetRect.height * 0.35
      : targetRect.top + targetRect.height * 0.65;

    if ((isMovingDown && clientY > threshold) || (!isMovingDown && clientY < threshold)) {
      const [moved] = all.splice(srcIdx, 1);
      all.splice(tgtIdx, 0, moved);
      triggerHaptic("light");
      set((s) => ({ ...s, projects: all }));
    }
  };

  const handleTagLiveReorder = (targetTag: string, clientY: number, targetRect: DOMRect) => {
    if (!activeDragTag || activeDragTag === targetTag) return;
    const cur = [...allTags];
    const srcIdx = cur.indexOf(activeDragTag);
    const tgtIdx = cur.indexOf(targetTag);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const isMovingDown = srcIdx < tgtIdx;
    const threshold = isMovingDown
      ? targetRect.top + targetRect.height * 0.35
      : targetRect.top + targetRect.height * 0.65;

    if ((isMovingDown && clientY > threshold) || (!isMovingDown && clientY < threshold)) {
      const [moved] = cur.splice(srcIdx, 1);
      cur.splice(tgtIdx, 0, moved);
      triggerHaptic("light");
      set((s) => ({
        ...s,
        settings: { ...s.settings, tagOrder: cur },
      }));
    }
  };

  const reorderTasks = (sourceId: string, targetId: string, position: "before" | "after") => {
    if (sourceId === targetId) return;
    const all = [...state.tasks];
    const srcIdx = all.findIndex((t) => t.id === sourceId);
    const tgtIdx = all.findIndex((t) => t.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const [moved] = all.splice(srcIdx, 1);
    const newTgtIdx = all.findIndex((t) => t.id === targetId);
    const insertIdx = position === "before" ? newTgtIdx : newTgtIdx + 1;
    all.splice(insertIdx, 0, moved);

    set((s) => ({ ...s, tasks: all }));
    announce(`Moved "${moved.title}" ${position} "${all[newTgtIdx]?.title || ""}"`);
    toast(`Task reordered`, "ok");
  };

  const reorderProjects = (sourceId: string, targetId: string, position: "before" | "after") => {
    if (sourceId === targetId) return;
    const all = [...state.projects];
    const srcIdx = all.findIndex((p) => p.id === sourceId);
    const tgtIdx = all.findIndex((p) => p.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const [moved] = all.splice(srcIdx, 1);
    const newTgtIdx = all.findIndex((p) => p.id === targetId);
    const insertIdx = position === "before" ? newTgtIdx : newTgtIdx + 1;
    all.splice(insertIdx, 0, moved);

    set((s) => ({ ...s, projects: all }));
    toast(`Project reordered`, "ok");
  };

  const reorderTags = (sourceTag: string, targetTag: string, position: "before" | "after") => {
    if (sourceTag === targetTag) return;
    const cur = [...allTags];
    const srcIdx = cur.indexOf(sourceTag);
    const tgtIdx = cur.indexOf(targetTag);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const [moved] = cur.splice(srcIdx, 1);
    const newTgtIdx = cur.indexOf(targetTag);
    const insertIdx = position === "before" ? newTgtIdx : newTgtIdx + 1;
    cur.splice(insertIdx, 0, moved);

    set((s) => ({
      ...s,
      settings: { ...s.settings, tagOrder: cur },
    }));
    toast(`Tag reordered`, "ok");
  };

  /* ---------------- projects ---------------- */
  const openProject = (p: Project | null) => {
    setProjDialog({ open: true, project: p });
    setProjName(p?.name ?? "");
    setProjEmoji(p?.emoji ?? "🌐");
    setProjColor(p?.color ?? "#4fa3a5");
  };
  const saveProject = () => {
    if (!projName.trim()) return toast("Project needs a name", "err");
    if (projDialog.project) {
      set((s) => ({
        ...s,
        projects: s.projects.map((p) =>
          p.id === projDialog.project!.id
            ? { ...p, name: projName.trim(), emoji: projEmoji, color: projColor }
            : p
        ),
      }));
      toast("Project updated", "ok");
    } else {
      const id = uid();
      set((s) => ({
        ...s,
        projects: [
          ...s.projects,
          { id, name: projName.trim(), emoji: projEmoji, color: projColor, createdAt: Date.now() },
        ],
      }));
      setSel({ project: id });
      toast("Project created", "ok");
    }
    setProjDialog({ open: false, project: null });
  };
  const deleteProject = async () => {
    const p = projDialog.project;
    if (!p) return;
    const taskCount = state.tasks.filter((t) => t.projectId === p.id).length;
    const ok = await confirm({
      title: "Delete project — permanently",
      body: `“${p.name}” and its ${taskCount} task(s) will be removed. Tracked history stays in reports. This cannot be undone.`,
      confirmLabel: "Delete forever",
      danger: true,
      requireText: p.name,
    });
    if (!ok) return;
    set((s) => ({
      ...s,
      projects: s.projects.filter((x) => x.id !== p.id),
      tasks: s.tasks.filter((t) => t.projectId !== p.id),
    }));
    setProjDialog({ open: false, project: null });
    setSel("today");
    toast("Project deleted", "warn");
  };

  /* ---------------- tag manager ---------------- */
  const openTagMgr = (tag: string) => {
    setTagMgr({ open: true, tag });
    setTagName(tag);
    setTagColor(state.tagColors[tag] ?? "#e8a33d");
  };
  const saveTag = () => {
    const old = tagMgr.tag;
    const next = tagName.trim();
    if (!old) return;
    if (!next) return toast("Tag needs a name", "err");
    set((s) => {
      const tagColors = { ...s.tagColors };
      delete tagColors[old];
      tagColors[next] = normalizeHex(tagColor) ?? tagColor;
      return {
        ...s,
        tagColors,
        tasks:
          next === old
            ? s.tasks
            : s.tasks.map((t) =>
                t.tags.includes(old)
                  ? { ...t, tags: t.tags.map((x) => (x === old ? next : x)) }
                  : t
              ),
      };
    });
    if (typeof sel === "object" && "tag" in sel && sel.tag === old) setSel({ tag: next });
    setTagMgr({ open: false, tag: null });
    toast(next === old ? "Tag colour updated" : `Tag renamed to “${next}”`, "ok");
  };
  const deleteTag = async () => {
    const old = tagMgr.tag;
    if (!old) return;
    const usedBy = state.tasks.filter((t) => t.tags.includes(old)).length;
    const ok = await confirm({
      title: "Delete tag",
      body: `“${old}” will be removed from ${usedBy} task(s). The tasks themselves stay.`,
      confirmLabel: "Delete tag",
      danger: true,
    });
    if (!ok) return;
    set((s) => {
      const tagColors = { ...s.tagColors };
      delete tagColors[old];
      return {
        ...s,
        tagColors,
        tasks: s.tasks.map((t) =>
          t.tags.includes(old) ? { ...t, tags: t.tags.filter((x) => x !== old) } : t
        ),
      };
    });
    if (typeof sel === "object" && "tag" in sel && sel.tag === old) setSel("all");
    setTagMgr({ open: false, tag: null });
    toast("Tag deleted", "warn");
  };

  const navRow = (
    key: string,
    icon: React.ReactNode,
    label: string,
    count: number,
    target: SmartView
  ) => (
    <button
      key={key}
      onClick={() => setSel(target)}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-left text-[12.5px] font-bold transition-all"
      style={
        viewKey(sel) === key
          ? { background: "var(--accent-soft)", color: "var(--accent)" }
          : { color: "var(--text)", cursor: "pointer" }
      }
    >
      <span className="w-[18px] text-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        className="tnum rounded-md px-1.5 text-[10.5px] font-bold"
        style={{ background: "var(--panel2)", color: "var(--mut)" }}
      >
        {count}
      </span>
    </button>
  );

  const tagDot = (tag: string) => (
    <span
      className="inline-block h-[9px] w-[9px] rounded-full"
      style={{ background: state.tagColors[tag] ?? "var(--accent)" }}
    />
  );

  return (
    <div className="flex flex-col lg:flex-row gap-5 w-full max-w-full overflow-x-hidden">
      {/* ================= smart panel (desktop only) ================= */}
      <aside className="hidden lg:block sticky top-5 h-fit w-[230px] shrink-0">
        <div className="card engine-panel flex flex-col gap-0.5 p-2.5">
          <div
            className="mb-1 px-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--mut)" }}
          >
            Smart views
          </div>
          {navRow("inbox", <Inbox size={14} />, "Inbox", inboxCount, "inbox")}
          {navRow("today", <CalendarPlus size={14} />, "Today", todayCount, "today")}
          {navRow("all", <ListChecks size={14} />, "All tasks", openTasks.length, "all")}

          {/* Projects with reordering */}
          <div className="mb-1 mt-3 flex items-center justify-between px-1.5">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--mut)" }}
            >
              Projects
            </span>
            <button
              onClick={() => openProject(null)}
              className="rounded-md p-0.5 transition-transform hover:scale-110"
              style={{ color: "var(--mut)", cursor: "pointer" }}
              title="New project"
            >
              <Plus size={13} />
            </button>
          </div>
          {state.projects.length === 0 && (
            <div className="px-2 py-1 text-[11px]" style={{ color: "var(--mut)" }}>
              No projects yet — add one.
            </div>
          )}
          {state.projects.map((p) => {
            const isDragging = activeDragProj === p.id;
            return (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-lifelog-project", p.id);
                  e.dataTransfer.effectAllowed = "move";
                  setActiveDragProj(p.id);
                }}
                onDragEnd={() => {
                  setActiveDragProj(null);
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("application/x-lifelog-project")) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  handleProjectLiveReorder(p.id, e.clientY, rect);
                }}
                className={cn(
                  "group flex items-center gap-1 rounded-xl transition-all duration-150 relative",
                  isDragging && "opacity-40 scale-[0.98] ring-1 ring-[var(--accent)]"
                )}
              >
                <div
                  className="cursor-grab active:cursor-grabbing text-[var(--color-mut)] hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"
                  title="Drag to reorder project"
                >
                  <GripVertical size={12} />
                </div>
                <button
                  onClick={() => setSel({ project: p.id })}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-[7px] text-left text-[12.5px] font-bold transition-all"
                  style={
                    viewKey(sel) === `p:${p.id}`
                      ? { background: "var(--accent-soft)", color: "var(--accent)" }
                      : { color: "var(--text)", cursor: "pointer" }
                  }
                >
                  <span className="text-[13px]">{p.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ background: p.color }} />
                  <span className="tnum text-[10.5px] font-bold" style={{ color: "var(--mut)" }}>
                    {openTasks.filter((t) => t.projectId === p.id).length}
                  </span>
                </button>
                <div className="hidden group-hover:flex items-center gap-0.5 pr-1">
                  <button
                    onClick={() => openProject(p)}
                    className="rounded p-1 hover:bg-[var(--panel2)] text-[var(--color-mut)] hover:text-[var(--color-text)] cursor-pointer"
                    title={`Edit ${p.name}`}
                  >
                    <Pencil size={11} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Tags with drag-and-drop reordering */}
          <div
            className="mb-1 mt-3 px-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--mut)" }}
          >
            Tags
          </div>
          {allTags.length === 0 && (
            <div className="px-2 py-1 text-[11px]" style={{ color: "var(--mut)" }}>
              Tags appear as you add them.
            </div>
          )}
          {allTags.map((t) => {
            const isDragging = activeDragTag === t;
            return (
              <div
                key={t}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-lifelog-tag", t);
                  e.dataTransfer.effectAllowed = "move";
                  setActiveDragTag(t);
                }}
                onDragEnd={() => {
                  setActiveDragTag(null);
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("application/x-lifelog-tag")) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const rect = e.currentTarget.getBoundingClientRect();
                  handleTagLiveReorder(t, e.clientY, rect);
                }}
                className={cn(
                  "group flex items-center gap-1 rounded-xl transition-all duration-150 relative",
                  isDragging && "opacity-40 scale-[0.98] ring-1 ring-[var(--accent)]"
                )}
              >
                <div
                  className="cursor-grab active:cursor-grabbing text-[var(--color-mut)] hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"
                  title="Drag to reorder tag"
                >
                  <GripVertical size={12} />
                </div>
                <button
                  onClick={() => setSel({ tag: t })}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-left text-[12.5px] font-bold transition-all"
                  style={
                    viewKey(sel) === `t:${t}`
                      ? { background: "var(--accent-soft)", color: "var(--accent)" }
                      : { color: "var(--text)", cursor: "pointer" }
                  }
                >
                  {tagDot(t)}
                  <span className="min-w-0 flex-1 truncate">{t}</span>
                  <span className="tnum text-[10.5px] font-bold" style={{ color: "var(--mut)" }}>
                    {openTasks.filter((x) => x.tags.some((y) => y.toLowerCase() === t.toLowerCase())).length}
                  </span>
                </button>
                <div className="hidden group-hover:flex items-center gap-0.5 pr-1">
                  <button
                    onClick={() => openTagMgr(t)}
                    className="rounded p-1 hover:bg-[var(--panel2)] text-[var(--color-mut)] hover:text-[var(--color-text)] cursor-pointer"
                    title={`Edit tag “${t}”`}
                  >
                    <Pencil size={11} />
                  </button>
                </div>
              </div>
            );
          })}

          <div
            className="mb-1 mt-3 px-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--mut)" }}
          >
            Priority
          </div>
          {PRIORITY_ORDER.map((pr) =>
            navRow(
              `pr:${pr}`,
              <span>{PRIORITY_META[pr].icon}</span>,
              PRIORITY_META[pr].label,
              openTasks.filter((x) => x.priority === pr).length,
              { priority: pr }
            )
          )}
        </div>
      </aside>

      {/* ================= list ================= */}
      <div className="min-w-0 flex-1 w-full max-w-full">
        {/* Mobile Filter Carousel (visible on mobile / tablet) */}
        <div className="lg:hidden mb-3.5 -mx-4 px-4 sm:mx-0 sm:px-0 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setSel("inbox");
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all cursor-pointer border",
              sel === "inbox"
                ? "bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] shadow-sm"
                : "bg-[var(--panel)] text-[var(--text)] border-[var(--line)]"
            )}
          >
            <Inbox size={13} />
            <span>Inbox</span>
            {inboxCount > 0 && (
              <span
                className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                  sel === "inbox" ? "bg-black/20 text-white" : "bg-[var(--panel2)] text-[var(--mut)]"
                )}
              >
                {inboxCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setSel("today");
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all cursor-pointer border",
              sel === "today"
                ? "bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] shadow-sm"
                : "bg-[var(--panel)] text-[var(--text)] border-[var(--line)]"
            )}
          >
            <CalendarPlus size={13} />
            <span>Today</span>
            {todayCount > 0 && (
              <span
                className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                  sel === "today" ? "bg-black/20 text-white" : "bg-[var(--panel2)] text-[var(--mut)]"
                )}
              >
                {todayCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setSel("all");
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all cursor-pointer border",
              sel === "all"
                ? "bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] shadow-sm"
                : "bg-[var(--panel)] text-[var(--text)] border-[var(--line)]"
            )}
          >
            <ListChecks size={13} />
            <span>All</span>
            <span
              className={cn(
                "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                sel === "all" ? "bg-black/20 text-white" : "bg-[var(--panel2)] text-[var(--mut)]"
              )}
            >
              {openTasks.length}
            </span>
          </button>

          {/* Separator */}
          {state.projects.length > 0 && <div className="h-4 w-[1px] bg-[var(--line)] shrink-0 mx-0.5" />}

          {/* Projects */}
          {state.projects.map((p) => {
            const isSelected = viewKey(sel) === `p:${p.id}`;
            const pCount = openTasks.filter((t) => t.projectId === p.id).length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  triggerHaptic("light");
                  setSel({ project: p.id });
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all cursor-pointer border",
                  isSelected
                    ? "bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] shadow-sm"
                    : "bg-[var(--panel)] text-[var(--text)] border-[var(--line)]"
                )}
              >
                <span>{p.emoji}</span>
                <span>{p.name}</span>
                {pCount > 0 && (
                  <span
                    className={cn(
                      "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                      isSelected ? "bg-black/20 text-white" : "bg-[var(--panel2)] text-[var(--mut)]"
                    )}
                  >
                    {pCount}
                  </span>
                )}
              </button>
            );
          })}

          {/* Tags Separator */}
          {allTags.length > 0 && <div className="h-4 w-[1px] bg-[var(--line)] shrink-0 mx-0.5" />}

          {/* Tags */}
          {allTags.map((t) => {
            const isSelected = viewKey(sel) === `t:${t}`;
            const tCount = openTasks.filter((x) =>
              x.tags.some((y) => y.toLowerCase() === t.toLowerCase())
            ).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  triggerHaptic("light");
                  setSel({ tag: t });
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all cursor-pointer border",
                  isSelected
                    ? "bg-[var(--accent)] text-[var(--on-accent)] border-[var(--accent)] shadow-sm"
                    : "bg-[var(--panel)] text-[var(--text)] border-[var(--line)]"
                )}
              >
                {tagDot(t)}
                <span>#{t}</span>
                {tCount > 0 && (
                  <span
                    className={cn(
                      "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                      isSelected ? "bg-black/20 text-white" : "bg-[var(--panel2)] text-[var(--mut)]"
                    )}
                  >
                    {tCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Task list header & controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
          <div>
            <h1 className="font-display text-[22px] sm:text-[24px] font-bold tracking-tight">{selTitle}</h1>
            <p className="text-[12px] sm:text-[12.5px] font-semibold" style={{ color: "var(--mut)" }}>
              {list.length} open · {completed.length} completed
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* Sort selector */}
            <div className="flex items-center gap-0.5 bg-[var(--panel2)] p-0.5 rounded-xl border border-[var(--line)] text-xs shrink-0">
              <ArrowUpDown size={12} className="text-[var(--color-mut)] mx-1" />
              {(["manual", "due", "priority"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSortMode(m)}
                  className="px-2.5 py-1 rounded-[9px] font-bold whitespace-nowrap transition-all cursor-pointer text-xs"
                  style={
                    sortMode === m
                      ? { background: "var(--accent)", color: "var(--on-accent)" }
                      : { color: "var(--mut)", background: "transparent" }
                  }
                >
                  {m === "manual" ? "Manual" : m === "due" ? "Due" : "Priority"}
                </button>
              ))}
            </div>

            <div className="flex-1 min-w-[120px] sm:w-[160px]">
              <SearchInput value={query} onChange={setQuery} placeholder="Search tasks…" />
            </div>

            <Btn
              variant="primary"
              onClick={() =>
                openTaskDialog({
                  projectId: typeof sel === "object" && "project" in sel ? sel.project : undefined,
                })
              }
              className="shrink-0"
            >
              <Plus size={13} /> <span className="hidden xs:inline">Task</span>
            </Btn>
          </div>
        </div>

        <div className="stagger mt-4 flex flex-col gap-2">
          {/* Top Drop Target for dropping to the very top in manual mode */}
          {sortMode === "manual" && list.length > 0 && (
            <div
              onDragOver={(e) => {
                if (!activeDragTask) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const first = list[0];
                if (first && activeDragTask !== first.id) {
                  const all = [...state.tasks];
                  const srcIdx = all.findIndex((t) => t.id === activeDragTask);
                  const firstIdx = all.findIndex((t) => t.id === first.id);
                  if (srcIdx !== -1 && firstIdx !== -1 && srcIdx > firstIdx) {
                    const [moved] = all.splice(srcIdx, 1);
                    all.splice(firstIdx, 0, moved);
                    set((s) => ({ ...s, tasks: all }));
                  }
                }
              }}
              className="h-2 -my-1 rounded-full transition-all bg-accent/20"
              title="Drag here to move to top"
            />
          )}

          {list.length === 0 && (
            <div className="card">
              <EmptyState
                icon={sel === "inbox" ? Inbox : ListChecks}
                title={sel === "inbox" ? "Inbox zero" : `Nothing in “${selTitle}”`}
                body={
                  query
                    ? "No tasks match your search."
                    : sel === "inbox"
                    ? "Tasks without a date land here. Give them a day or schedule them on the calendar."
                    : "Add a task and it will show up here."
                }
              >
                <Btn variant="primary" onClick={() => openTaskDialog()}>
                  <Plus size={13} /> New task
                </Btn>
              </EmptyState>
            </div>
          )}
          {list.map((t, idx) => (
            <TaskCard
              key={t.id}
              t={t}
              idx={idx}
              totalInList={list.length}
              sortMode={sortMode}
              tracked={trackedByTask.get(t.id) ?? 0}
              today={today}
              isDragging={activeDragTask === t.id}
              onDragStartTask={() => setActiveDragTask(t.id)}
              onDragEndTask={() => setActiveDragTask(null)}
              onLiveReorderTask={handleTaskLiveReorder}
              onToggle={() => toggleDone(t.id)}
              onEdit={() => openTaskDialog({ taskId: t.id })}
              onFocus={() => requestFocus(t.id)}
              onMove={(dir) => moveTask(t.id, dir)}
              onReorder={reorderTasks}
            />
          ))}
        </div>

        {/* Chunked Completed Tasks */}
        {completed.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="text-[12.5px] font-bold inline-flex items-center gap-1.5"
              style={{ color: "var(--mut)", cursor: "pointer" }}
            >
              {showCompleted ? "▾" : "▸"} {completed.length} completed — shown exactly as they were,
              with completion date
            </button>
            {showCompleted && (
              <div className="stagger mt-2 flex flex-col gap-2">
                {completed.slice(0, completedLimit).map((t) => (
                  <TaskCard
                    key={t.id}
                    t={t}
                    idx={0}
                    totalInList={1}
                    sortMode="due"
                    tracked={trackedByTask.get(t.id) ?? 0}
                    today={today}
                    completedAt={t.doneAt}
                    onToggle={() => toggleDone(t.id)}
                    onEdit={() => openTaskDialog({ taskId: t.id })}
                    onFocus={() => requestFocus(t.id)}
                    onMove={() => {}}
                  />
                ))}
                {completed.length > completedLimit && (
                  <div className="text-center py-2">
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={() => setCompletedLimit((prev) => prev + 25)}
                    >
                      Load {Math.min(25, completed.length - completedLimit)} more completed tasks (
                      {completed.length - completedLimit} remaining)
                    </Btn>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= project dialog ================= */}
      <Modal
        open={projDialog.open}
        onClose={() => setProjDialog({ open: false, project: null })}
        title={projDialog.project ? "Edit project" : "New project"}
        width={480}
        footer={
          <>
            {projDialog.project && (
              <Btn variant="danger" className="mr-auto" onClick={deleteProject}>
                <Trash2 size={13} /> Delete project
              </Btn>
            )}
            <Btn variant="ghost" onClick={() => setProjDialog({ open: false, project: null })}>
              Cancel
            </Btn>
            <Btn variant="primary" onClick={saveProject}>
              {projDialog.project ? "Save" : "Create"}
            </Btn>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Labeled label="Name">
            <TextInput
              autoFocus
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              placeholder="e.g. Side project"
            />
          </Labeled>
          <Labeled label="Emoji">
            <EmojiPicker value={projEmoji} onChange={setProjEmoji} />
          </Labeled>
          <Labeled label="Colour" hint="custom hex always available">
            <ColorPicker value={projColor} onChange={setProjColor} />
          </Labeled>
        </div>
      </Modal>

      {/* ================= tag manager dialog ================= */}
      <Modal
        open={tagMgr.open}
        onClose={() => setTagMgr({ open: false, tag: null })}
        title={
          <>
            Edit tag —{" "}
            <span style={{ color: state.tagColors[tagMgr.tag ?? ""] ?? "var(--accent)" }}>
              {tagMgr.tag}
            </span>
          </>
        }
        width={440}
        footer={
          <>
            <Btn variant="danger" className="mr-auto" onClick={deleteTag}>
              <Trash2 size={13} /> Delete tag
            </Btn>
            <Btn variant="ghost" onClick={() => setTagMgr({ open: false, tag: null })}>
              Cancel
            </Btn>
            <Btn variant="primary" onClick={saveTag}>
              Save
            </Btn>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Labeled label="Name" hint="casing is preserved exactly">
            <TextInput autoFocus value={tagName} onChange={(e) => setTagName(e.target.value)} />
          </Labeled>
          <Labeled label="Colour" hint="shown in the sidebar and on task chips">
            <ColorPicker value={tagColor} onChange={setTagColor} />
          </Labeled>
          <div
            className="rounded-xl border p-3 text-[12px]"
            style={{ borderColor: "var(--line)", color: "var(--mut)" }}
          >
            Used by{" "}
            {state.tasks.filter((t) => t.tags.includes(tagMgr.tag ?? "\u0000")).length} task(s).
            Renaming updates every task; deleting removes the tag but keeps the tasks.
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ================= task card with chained subtasks, multi-block badges & reordering ================= */
function TaskCard({
  t,
  idx,
  totalInList,
  sortMode,
  tracked,
  today,
  completedAt,
  isDragging,
  onDragStartTask,
  onDragEndTask,
  onLiveReorderTask,
  onToggle,
  onEdit,
  onFocus,
  onMove,
  onReorder,
}: {
  t: Task;
  idx: number;
  totalInList: number;
  sortMode: "manual" | "due" | "priority";
  tracked: number;
  today: string;
  completedAt?: number | null;
  isDragging?: boolean;
  onDragStartTask?: () => void;
  onDragEndTask?: () => void;
  onLiveReorderTask?: (targetId: string, clientY: number, targetRect: DOMRect) => void;
  onToggle: () => void;
  onEdit: () => void;
  onFocus: () => void;
  onMove?: (dir: "top" | "up" | "down" | "bottom") => void;
  onReorder?: (sourceId: string, targetId: string, position: "before" | "after") => void;
}) {
  const { state, set, toast } = useApp();
  const [chainOpen, setChainOpen] = useState(t.subtasks.length > 0);
  const [newSub, setNewSub] = useState("");
  const proj = state.projects.find((p) => p.id === t.projectId);
  const done = !!completedAt;
  const overdue = !done && !!t.due && t.due < today;
  const snoozed = !!t.snoozedUntil && t.snoozedUntil > Date.now();
  const subDone = t.subtasks.filter((s) => s.done).length;

  const timeBlocks = t.timeBlocks ?? [];
  const completedBlocks = timeBlocks.filter((b) => b.done).length;

  const addSub = () => {
    const v = newSub.trim();
    if (!v) return;
    const sub: Subtask = { id: uid(), title: v, done: false, doneAt: null };
    set((s) => ({
      ...s,
      tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, subtasks: [...x.subtasks, sub] } : x)),
    }));
    setNewSub("");
    setChainOpen(true);
  };
  const toggleSub = (sid: string) => {
    set((s) => ({
      ...s,
      tasks: s.tasks.map((x) =>
        x.id === t.id
          ? {
              ...x,
              subtasks: x.subtasks.map((y) =>
                y.id === sid ? { ...y, done: !y.done, doneAt: !y.done ? Date.now() : null } : y
              ),
            }
          : x
      ),
    }));
  };
  const removeSub = (sid: string) => {
    set((s) => ({
      ...s,
      tasks: s.tasks.map((x) =>
        x.id === t.id ? { ...x, subtasks: x.subtasks.filter((y) => y.id !== sid) } : x
      ),
    }));
    toast("Subtask removed", "warn");
  };

  return (
    <div
      draggable={!done && sortMode === "manual"}
      onDragStart={(e) => {
        if (done || sortMode !== "manual") return;
        e.dataTransfer.setData("application/x-lifelog-task", t.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStartTask?.();
      }}
      onDragEnd={() => {
        onDragEndTask?.();
      }}
      onDragOver={(e) => {
        if (done || sortMode !== "manual") return;
        if (!e.dataTransfer.types.includes("application/x-lifelog-task")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        onLiveReorderTask?.(t.id, e.clientY, rect);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDragEndTask?.();
      }}
      className={cn(
        "card card-hover overflow-hidden group/card transition-all duration-150 relative",
        isDragging && "opacity-40 scale-[0.98] ring-2 ring-[var(--accent)] shadow-md"
      )}
      style={done ? { opacity: 0.92 } : undefined}
    >
      {/* completion strip */}
      {done && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold"
          style={{
            background: "color-mix(in srgb, var(--ok) 14%, transparent)",
            color: "var(--ok)",
          }}
        >
          <Check size={12} /> Completed {fmtDayShort(isoDate(new Date(completedAt!)))} at{" "}
          {fmtClock(completedAt!)}
          <button
            onClick={onToggle}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-all hover:opacity-75"
            style={{ cursor: "pointer", color: "var(--mut)" }}
          >
            <RotateCcw size={11} /> Reopen
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Reordering in manual mode: desktop drag handle + mobile up/down buttons */}
        {!done && sortMode === "manual" && (
          <div className="flex items-center gap-0.5 shrink-0">
            <div
              className="cursor-grab active:cursor-grabbing p-1 rounded text-[var(--color-mut)] hover:text-accent hover:bg-[var(--panel2)] transition-opacity opacity-0 group-hover/card:opacity-100 shrink-0 hidden md:block"
              title="Drag to reorder task"
            >
              <GripVertical size={14} />
            </div>
            {onMove && (
              <div className="flex flex-col md:hidden -my-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic("light");
                    onMove("up");
                  }}
                  className="p-1 rounded text-[var(--color-mut)] active:text-[var(--accent)] active:bg-[var(--panel2)] disabled:opacity-15 cursor-pointer"
                  title="Move up"
                  aria-label="Move task up"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  type="button"
                  disabled={idx === totalInList - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic("light");
                    onMove("down");
                  }}
                  className="p-1 rounded text-[var(--color-mut)] active:text-[var(--accent)] active:bg-[var(--panel2)] disabled:opacity-15 cursor-pointer"
                  title="Move down"
                  aria-label="Move task down"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-center p-0.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic("medium");
              onToggle();
            }}
            className={cn(
              "flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-lg border-[2px] transition-transform active:scale-85 hover:scale-105"
            )}
            style={{
              borderColor: done ? "var(--ok)" : proj?.color ?? "var(--accent)",
              background: done ? "var(--ok)" : "transparent",
              cursor: "pointer",
              opacity: snoozed ? 0.5 : 1,
            }}
            title={
              done
                ? "Reopen task"
                : t.recurrence
                ? "Complete occurrence (repeats)"
                : "Complete task"
            }
            aria-label="Toggle done"
          >
            {done && <Check size={14} strokeWidth={2.8} style={{ color: "var(--on-accent)" }} />}
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {t.emoji && <span className="text-[15px]">{t.emoji}</span>}
            <span
              className={cn("truncate text-[14px] font-bold", done && "line-through opacity-70")}
            >
              {t.title}
            </span>
            {t.priority === "urgent" ? (
              <span
                className="chip !py-0 text-[10px]"
                style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
              >
                <Zap size={9} /> urgent
              </span>
            ) : (
              <span
                className="chip !py-0 text-[10px]"
                style={{ color: PRIORITY_META[t.priority].color }}
              >
                {PRIORITY_META[t.priority].icon} {PRIORITY_META[t.priority].label}
              </span>
            )}
            {/* Multi-block badge */}
            {timeBlocks.length > 0 && (
              <span
                className="chip !py-0 text-[10px] bg-purple-500/10 border-purple-500/40 text-purple-600 dark:text-purple-300"
                title={`${timeBlocks.length} scheduled calendar blocks`}
              >
                <Layers size={9} /> {completedBlocks}/{timeBlocks.length} blocks
              </span>
            )}
            {/* Linked Notes badge */}
            {t.linkedNoteIds && t.linkedNoteIds.length > 0 && (
              <span
                className="chip !py-0 text-[10px] bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-300"
                title={`${t.linkedNoteIds.length} linked notes`}
              >
                <FileText size={9} /> {t.linkedNoteIds.length} notes
              </span>
            )}
          </div>
          <div
            className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold"
            style={{ color: "var(--mut)" }}
          >
            <span className="inline-flex items-center gap-1">
              <span
                className="h-[8px] w-[8px] rounded-full"
                style={{ background: proj?.color }}
              />
              {proj?.emoji} {proj?.name}
            </span>
            {t.tags.map((tag) => (
              <span
                key={tag}
                className="chip !py-0 text-[10px]"
                style={{
                  borderColor: `color-mix(in srgb, ${
                    state.tagColors[tag] ?? "var(--accent)"
                  } 55%, var(--line))`,
                }}
              >
                <span
                  className="h-[7px] w-[7px] rounded-full"
                  style={{ background: state.tagColors[tag] ?? "var(--accent)" }}
                />
                {tag}
              </span>
            ))}
            {t.due && (
              <span style={{ color: overdue ? "var(--danger)" : "var(--mut)" }}>
                📅 {overdue ? "overdue · " : ""}
                {fmtDayShort(t.due)}
                {t.dueTime ? ` · ${t.dueTime}` : ""}
              </span>
            )}
            {snoozed && <span style={{ color: "var(--warn)" }}>⏸ snoozed</span>}
            {t.recurrence && (
              <span className="inline-flex items-center gap-1" style={{ color: "var(--accent)" }}>
                <Repeat size={9} /> {describeRecurrence(t.recurrence)}
              </span>
            )}
            {t.estimateMin > 0 && <span>⏳ est {fmtDur(t.estimateMin)}</span>}
            {tracked > 0 && (
              <span style={{ color: "var(--accent)" }}>▸ {fmtDur(tracked)} logged</span>
            )}
          </div>
        </div>

        {t.subtasks.length > 0 && (
          <button
            onClick={() => setChainOpen((v) => !v)}
            className="chip shrink-0 !py-0.5 text-[10.5px]"
            style={{
              cursor: "pointer",
              color: subDone === t.subtasks.length ? "var(--ok)" : "var(--mut)",
            }}
          >
            {chainOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />} {subDone}/
            {t.subtasks.length} steps
          </button>
        )}
        <Btn size="sm" variant="ghost" onClick={onEdit} aria-label="Edit task" className="shrink-0">
          <Pencil size={13} />
        </Btn>
        {!done && (
          <Btn
            size="sm"
            variant="soft"
            onClick={onFocus}
            title="Open in Focus — you choose the mode, nothing auto-starts"
            className="shrink-0"
          >
            <Play size={12} />
          </Btn>
        )}
      </div>

      {/* subtask chain */}
      {chainOpen && (
        <div
          className="border-t px-3 py-2.5"
          style={{
            borderColor: "var(--line)",
            background: "color-mix(in srgb, var(--bg) 55%, var(--panel))",
          }}
        >
          <div className="chain flex flex-col gap-1">
            {t.subtasks.map((s) => (
              <div
                key={s.id}
                className="chain-item group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--panel2)]"
              >
                <button
                  onClick={() => toggleSub(s.id)}
                  className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all hover:scale-110"
                  style={{
                    borderColor: s.done ? "var(--ok)" : "var(--line)",
                    background: s.done ? "var(--ok)" : "transparent",
                    cursor: "pointer",
                  }}
                  aria-label="Toggle subtask"
                >
                  {s.done && <Check size={10} style={{ color: "var(--on-accent)" }} />}
                </button>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[12.5px] font-semibold",
                    s.done && "line-through opacity-55"
                  )}
                >
                  {s.title}
                </span>
                {s.done && s.doneAt && (
                  <span className="tnum text-[10px] font-bold" style={{ color: "var(--mut)" }}>
                    {fmtClock(s.doneAt)}
                  </span>
                )}
                {!done && (
                  <button
                    onClick={() => removeSub(s.id)}
                    className="hidden group-hover:block"
                    style={{ color: "var(--mut)", cursor: "pointer" }}
                    aria-label="Remove subtask"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
            {!done && (
              <div className="chain-item flex items-center gap-2 px-2 py-1">
                <Circle size={13} style={{ color: "var(--mut)" }} />
                <input
                  className="inp !border-0 !bg-transparent !p-0 text-[12.5px] !shadow-none"
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSub()}
                  placeholder="Add a step… (Enter)"
                />
                {newSub.trim() && (
                  <Btn size="sm" variant="primary" onClick={addSub}>
                    <Plus size={11} />
                  </Btn>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
