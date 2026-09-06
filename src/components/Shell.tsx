import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Calendar,
  Check,
  FileClock,
  FileText,
  Flame,
  LayoutDashboard,
  ListTodo,
  Menu,
  Moon,
  Pause,
  PenLine,
  Play,
  Plus,
  Quote,
  Search,
  Settings,
  Square,
  Sun,
  Timer,
} from "lucide-react";
import type { Priority, TokenKey, ViewId } from "../types";
import { FONT_PAIRS, QUOTES } from "../types";
import { useApp } from "../store";
import {
  ensureContrast,
  fmtDateLong,
  fmtDur,
  fmtHMS,
  greetingFor,
  mix,
  normalizeHex,
  readableOn,
  sessionSeconds,
  todayIso,
} from "../utils/core";
import { playTimerChime } from "../utils/audio";
import { CUSTOM_FONT_FAMILY } from "../utils/fonts";
import { Btn, Modal, TextInput, cn } from "./ui";
import { TaskDialog } from "./TaskDialog";
import { CommandPalette } from "./CommandPalette";
import { LiveAnnouncer } from "./LiveAnnouncer";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { MobileDrawer } from "./MobileDrawer";
import {
  initHardwareBackButton,
  configureStatusBar,
  initNativeSystemBars,
  triggerHaptic,
} from "../utils/native";
import { Dashboard } from "../views/Dashboard";
import { TasksView } from "../views/Tasks";
import { FocusView } from "../views/Focus";
import { CalendarView } from "../views/Calendar";
import { HabitsView } from "../views/Habits";
import { NotesView } from "../views/Notes";
import { DayLogView } from "../views/DayLog";
import { ReportsView } from "../views/Reports";
import { ReviewView } from "../views/Review";
import { SettingsView } from "../views/Settings";
import { WelcomeView } from "../views/Welcome";

export interface NavSection {
  title: string;
  items: { id: ViewId; label: string; icon: typeof Timer }[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Daily Focus",
    items: [
      { id: "dashboard", label: "Today", icon: LayoutDashboard },
      { id: "tasks", label: "Tasks", icon: ListTodo },
      { id: "focus", label: "Focus", icon: Timer },
      { id: "calendar", label: "Calendar", icon: Calendar },
    ],
  },
  {
    title: "Personal Hub",
    items: [
      { id: "habits", label: "Habits", icon: Flame },
      { id: "notes", label: "Notes", icon: FileText },
      { id: "daylog", label: "Day Log", icon: FileClock },
    ],
  },
  {
    title: "Insights & Config",
    items: [
      { id: "reports", label: "Reports", icon: BarChart3 },
      { id: "review", label: "Review", icon: PenLine },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ALL_NAV = NAV_SECTIONS.flatMap((s) => s.items);

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg width={small ? 26 : 30} height={small ? 26 : 30} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--panel2)" stroke="var(--line)" />
        <circle
          cx="16"
          cy="16"
          r="9"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="42 15"
          transform="rotate(-90 16 16)"
        />
        <circle cx="16" cy="16" r="3" fill="var(--accent)" />
      </svg>
      {!small && (
        <div className="leading-none">
          <div className="font-display text-[16px] font-bold tracking-tight">LifeLog</div>
          <div
            className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--mut)" }}
          >
            your day, remembered
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================ */
export function Shell() {
  const app = useApp();
  const { state, set, view, setView, openTaskDialog, toast } = app;
  const [greeting, setGreeting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<
    "inbox" | "today" | "all" | { project: string } | { tag: string } | { priority: Priority }
  >("today");

  // Android Native Status Bar & System Bars Sync
  useEffect(() => {
    initNativeSystemBars();
    configureStatusBar(state.settings.themeMode === "dark");
  }, [state.settings.themeMode]);

  // Sync view with URL hash
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace(/^#/, "") as ViewId;
      if (hash && ALL_NAV.some((n) => n.id === hash)) {
        setView(hash);
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [setView]);

  useEffect(() => {
    if (window.location.hash.replace(/^#/, "") !== view) {
      window.location.hash = `#${view}`;
    }
  }, [view]);

  /* ---------- theme variables: customisable, contrast-checked ---------- */
  useEffect(() => {
    const s = state.settings;
    const dark = s.themeMode === "dark";
    const bg = normalizeHex(dark ? s.bgDark : s.bgLight) ?? (dark ? "#0f1714" : "#eef1ee");
    const derived: Record<TokenKey, string> = {
      text: dark ? "#e8efe9" : "#182019",
      mut: "",
      panel: dark ? mix(bg, "#ffffff", 0.045) : mix(bg, "#ffffff", 0.6),
      panel2: dark ? mix(bg, "#ffffff", 0.09) : mix(bg, "#ffffff", 0.92),
      line: dark ? mix(bg, "#ffffff", 0.14) : mix(bg, "#000000", 0.13),
      ok: dark ? "#6fbf8e" : "#3e8f60",
      warn: dark ? "#e0b457" : "#a67c1f",
      danger: dark ? "#d66853" : "#b23c28",
    };
    derived.mut = mix(derived.text, bg, 0.45);
    (Object.keys(derived) as TokenKey[]).forEach((k) => {
      const o = s.tokens[k];
      if (o && normalizeHex(o)) derived[k] = normalizeHex(o)!;
    });
    derived.text = ensureContrast(derived.text, bg, 7);
    derived.mut = ensureContrast(derived.mut, bg, 4.6);
    derived.ok = ensureContrast(derived.ok, bg, 3);
    derived.warn = ensureContrast(derived.warn, bg, 3);
    derived.danger = ensureContrast(derived.danger, bg, 3);
    const accent = ensureContrast(normalizeHex(s.accent) ?? "#e8a33d", bg, 4.5);
    const root = document.documentElement;
    root.style.setProperty("--bg", bg);
    (Object.keys(derived) as TokenKey[]).forEach((k) => root.style.setProperty(`--${k}`, derived[k]));
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--on-accent", readableOn(accent));
    root.style.setProperty("--ring", `color-mix(in srgb, ${accent} 32%, transparent)`);
    root.style.setProperty("--accent-soft", `color-mix(in srgb, ${accent} 14%, transparent)`);
    root.style.setProperty("--uizoom", String(Math.max(1, Math.min(2, s.uiZoom / 100))));
    const fam = s.customFontName
      ? `'${CUSTOM_FONT_FAMILY}', sans-serif`
      : `'${FONT_PAIRS[s.fontPair]?.family ?? "Manrope"}', sans-serif`;
    root.style.setProperty("--font-body", fam);
    root.style.setProperty("--font-display", fam);
    document.body.style.fontFamily = fam;
    root.dataset.theme = dark ? "dark" : "light";
    root.style.background = bg;
    root.dataset.reduceMotion = String(s.reduceMotion);
    root.dataset.reduceTransparency = String(s.reduceTransparency);
    root.dataset.highContrast = String(s.highContrast);
  }, [state.settings]);

  /* ---------- launch greeting ---------- */
  useEffect(() => {
    const today = todayIso();
    if (state.settings.greeting === "every" || state.meta.lastGreetingDay !== today) setGreeting(true);
  }, []);
  const closeGreeting = () => {
    setGreeting(false);
    set((s) => ({ ...s, meta: { ...s.meta, lastGreetingDay: todayIso() } }));
  };

  /* ---------- global session watchdog ---------- */
  useEffect(() => {
    const t = setInterval(() => {
      const running = state.sessions.find((s) => s.status === "running");
      if (!running || running.mode === "flow" || !running.plannedMin) return;
      if (sessionSeconds(running) >= running.plannedMin * 60) {
        set((st) => ({
          ...st,
          sessions: st.sessions.map((x) =>
            x.id === running.id
              ? {
                  ...x,
                  endedAt: Date.now(),
                  status: "done",
                  pauses: x.pauses.map((p) => (p.resumeAt ? p : { ...p, resumeAt: Date.now() })),
                }
              : x
          ),
        }));
        playTimerChime(running.mode === "break" ? "break" : "complete");
        if (state.settings.notifyEnabled && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(running.mode === "break" ? "Break Finished" : "LifeLog Timer Complete", {
              body:
                running.mode === "break"
                  ? "Break is over — ready to focus again."
                  : "Focus session finished and saved to your log.",
            });
          } catch {}
        }
        app.toast(
          running.mode === "break" ? "Break over — back to it" : "Timer complete — session saved to your log",
          "warn"
        );
      }
    }, 1000);
    return () => clearInterval(t);
  }, [state.sessions, state.settings.notifyEnabled]);

  const toggleTheme = () => {
    triggerHaptic("light");
    const next = state.settings.themeMode === "dark" ? "light" : "dark";
    set((s) => ({ ...s, settings: { ...s.settings, themeMode: next } }));
    toast(`Switched to ${next} mode`, "ok");
  };

  const selectedTaskFilterKey = useMemo(() => {
    if (typeof taskFilter === "string") return taskFilter;
    if ("project" in taskFilter) return `p:${taskFilter.project}`;
    if ("tag" in taskFilter) return `t:${taskFilter.tag}`;
    return `pr:${taskFilter.priority}`;
  }, [taskFilter]);

  const views: Record<ViewId, React.ReactNode> = {
    dashboard: <Dashboard />,
    tasks: (
      <TasksView
        filter={taskFilter}
        onFilterChange={setTaskFilter}
        onOpenDrawer={() => setMobileNavOpen(true)}
      />
    ),
    focus: <FocusView />,
    calendar: <CalendarView />,
    habits: <HabitsView />,
    notes: <NotesView />,
    daylog: <DayLogView />,
    reports: <ReportsView />,
    review: <ReviewView />,
    settings: <SettingsView />,
  };

  if (state.meta && !state.meta.hasSeenWelcome) {
    return (
      <WelcomeView
        onEnter={() => {
          set((s) => ({ ...s, meta: { ...s.meta, hasSeenWelcome: true } }));
        }}
      />
    );
  }

  const activeNavLabel = ALL_NAV.find((n) => n.id === view)?.label ?? "LifeLog";

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden">
      {/* 1. Fixed Top Native App Bar (guaranteed below camera notch & status bar) */}
      <header
        className="fixed top-0 inset-x-0 z-40 flex flex-col border-b select-none transition-colors"
        style={{
          background: "var(--panel)",
          borderColor: "var(--line)",
          paddingTop: "var(--safe-top)",
        }}
      >
        <div className="flex h-14 items-center justify-between px-3.5">
          <div className="flex items-center gap-2 min-w-0">
            {view === "tasks" && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic("light");
                  setMobileNavOpen(true);
                }}
                className="rounded-xl p-2 transition-colors hover:bg-[var(--panel2)] active:scale-95 cursor-pointer text-[var(--text)] shrink-0"
                title="Task filters & projects"
                aria-label="Open task filters"
              >
                <Menu size={20} />
              </button>
            )}
            <Logo small />
            <span className="font-display text-[16px] font-bold truncate max-w-[150px] sm:max-w-[220px] text-[var(--text)]">
              {activeNavLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Theme quick toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-xl border transition-transform active:scale-95 cursor-pointer"
              style={{ borderColor: "var(--line)", color: "var(--mut)", background: "var(--panel2)" }}
              title="Toggle dark/light theme"
              aria-label="Toggle theme"
            >
              {state.settings.themeMode === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Search / Palette */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                setPaletteOpen(true);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl border transition-transform active:scale-95 cursor-pointer"
              style={{ borderColor: "var(--line)", color: "var(--mut)", background: "var(--panel2)" }}
              title="Search"
              aria-label="Search"
            >
              <Search size={15} />
            </button>

            {/* Quick Add Task */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic("medium");
                openTaskDialog();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl transition-transform active:scale-95 cursor-pointer shadow-xs"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
              title="New task"
              aria-label="New task"
            >
              <Plus size={17} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Todoist-Style Side Navigation Drawer */}
      <MobileDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        currentView={view}
        onSelectView={(v) => {
          setView(v);
          window.location.hash = v;
        }}
        onSelectTaskFilter={(f) => {
          setTaskFilter(f);
          setView("tasks");
          window.location.hash = "tasks";
        }}
        selectedTaskFilter={selectedTaskFilterKey}
      />

      {/* 3. Main Screen Viewport (with top & bottom safe insets padding) */}
      <main
        className="zoomable min-h-screen w-full max-w-full min-w-0 overflow-x-hidden px-3.5 sm:px-5"
        style={{
          paddingTop: "calc(58px + var(--safe-top))",
          paddingBottom: "calc(76px + var(--safe-bottom))",
        }}
      >
        <div className="w-full max-w-full min-w-0">{views[view]}</div>
      </main>

      {/* 4. Global Overlays & Mini Timer */}
      <Overlays
        greeting={greeting}
        closeGreeting={closeGreeting}
        paletteOpen={paletteOpen}
        setPaletteOpen={setPaletteOpen}
        drawerOpen={mobileNavOpen}
        onCloseDrawer={() => setMobileNavOpen(false)}
        onToggleTheme={toggleTheme}
      />
      <MiniTimer />
    </div>
  );
}

/* ============================ floating mini-timer ============================ */
function MiniTimer() {
  const { state, set, setView, toast } = useApp();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const running = state.sessions.find((s) => s.status === "running");
  if (!running) return null;

  const openPause = running.pauses.length > 0 && running.pauses[running.pauses.length - 1].resumeAt === null;
  const elapsedSec = sessionSeconds(running);
  const remainingSec = running.plannedMin ? Math.max(0, running.plannedMin * 60 - elapsedSec) : null;
  const task = state.tasks.find((t) => t.id === running.taskId);
  const label = running.mode === "break" ? "Break" : task?.title ?? "Focus session";
  const pct = remainingSec !== null ? Math.min(100, (elapsedSec / (running.plannedMin! * 60)) * 100) : null;

  const togglePause = () => {
    triggerHaptic("light");
    set((s) => ({
      ...s,
      sessions: s.sessions.map((x) => {
        if (x.id !== running.id) return x;
        if (openPause) {
          return {
            ...x,
            pauses: x.pauses.map((p, i) => (i === x.pauses.length - 1 ? { ...p, resumeAt: Date.now() } : p)),
          };
        }
        return { ...x, pauses: [...x.pauses, { at: Date.now(), resumeAt: null }] };
      }),
    }));
    toast(openPause ? "Resumed" : "Paused — timestamps kept", "ok");
  };

  const stop = () => {
    triggerHaptic("medium");
    const ts = Date.now();
    set((s) => ({
      ...s,
      sessions: s.sessions.map((x) =>
        x.id === running.id
          ? {
              ...x,
              endedAt: ts,
              status: "stopped",
              pauses: x.pauses.map((p) => (p.resumeAt ? p : { ...p, resumeAt: ts })),
            }
          : x
      ),
    }));
    toast(`Stopped — ${fmtDur(Math.max(1, Math.round(elapsedSec / 60)))} saved to your log`, "ok");
  };

  const big = remainingSec !== null ? fmtHMS(remainingSec) : fmtHMS(elapsedSec);

  return (
    <div
      className="mini-timer fixed z-[80] w-[calc(100%-28px)] sm:w-[280px] left-3.5 sm:left-auto sm:right-4 rounded-2xl border p-3 shadow-2xl backdrop-blur-xl"
      style={{
        bottom: "calc(74px + var(--safe-bottom, 12px))",
        background: "color-mix(in srgb, var(--panel2) 95%, transparent)",
        borderColor: "color-mix(in srgb, var(--accent) 45%, var(--line))",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn("h-[9px] w-[9px] rounded-full", !openPause && "ring-pulse")}
          style={{ background: openPause ? "var(--warn)" : "var(--ok)" }}
        />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>
          {openPause ? "Paused" : running.mode === "break" ? "Break" : running.mode}
        </span>
        <span className="ml-auto font-mono text-[18px] font-bold tnum" style={{ color: "var(--text)" }}>
          {big}
        </span>
      </div>
      <div className="mt-1 truncate text-[12px] font-bold" title={label}>
        {label}
      </div>
      {pct !== null && (
        <div className="mt-1.5 h-[5px] overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--accent)" }} />
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        <Btn size="sm" variant="soft" className="flex-1" onClick={togglePause}>
          {openPause ? <Play size={12} /> : <Pause size={12} />} {openPause ? "Resume" : "Pause"}
        </Btn>
        <Btn size="sm" variant="danger" onClick={stop}>
          <Square size={11} /> Stop
        </Btn>
        <Btn size="sm" variant="ghost" onClick={() => setView("focus")} title="Open full counter">
          <Timer size={12} />
        </Btn>
      </div>
    </div>
  );
}

/* ============================ greeting + confirm overlays ============================ */
function Overlays({
  greeting,
  closeGreeting,
  paletteOpen,
  setPaletteOpen,
  drawerOpen,
  onCloseDrawer,
  onToggleTheme,
}: {
  greeting: boolean;
  closeGreeting: () => void;
  paletteOpen: boolean;
  setPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  drawerOpen?: boolean;
  onCloseDrawer?: () => void;
  onToggleTheme: () => void;
}) {
  const { state, view, setView, openTaskDialog, confirmReq, resolveConfirm, taskDialog, closeTaskDialog } = useApp();
  const [confirmText, setConfirmText] = useState("");
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  // Android Native Hardware Back Button Handler
  useEffect(() => {
    return initHardwareBackButton(() => {
      if (drawerOpen) {
        onCloseDrawer?.();
        return true;
      }
      if (paletteOpen) {
        setPaletteOpen(false);
        return true;
      }
      if (moreSheetOpen) {
        setMoreSheetOpen(false);
        return true;
      }
      if (taskDialog.open) {
        closeTaskDialog();
        return true;
      }
      if (confirmReq?.open) {
        resolveConfirm(false);
        return true;
      }
      if (greeting) {
        closeGreeting();
        return true;
      }
      if (view !== "dashboard") {
        setView("dashboard");
        return true;
      }
      return false; // let native minimize
    });
  }, [
    drawerOpen,
    onCloseDrawer,
    paletteOpen,
    moreSheetOpen,
    taskDialog.open,
    confirmReq?.open,
    greeting,
    view,
    setView,
    closeTaskDialog,
    closeGreeting,
    resolveConfirm,
    setPaletteOpen,
  ]);

  useEffect(() => setConfirmText(""), [confirmReq]);
  const blocked = !!confirmReq?.requireText && confirmText !== confirmReq.requireText;
  const hour = new Date().getHours();
  const name = state.settings.profileName.trim();

  const quote = useMemo(() => {
    const pool = [...QUOTES, ...state.settings.customQuotes.filter((q) => q.trim())];
    return pool[Math.floor(Math.random() * pool.length)] ?? QUOTES[0];
  }, [greeting, state.settings.customQuotes]);

  return (
    <>
      <Modal open={greeting} onClose={closeGreeting} title="LifeLog" width={520}>
        <div className="flex flex-col items-start gap-4">
          <div>
            <div className="font-display text-[27px] font-bold leading-tight tracking-tight">
              {greetingFor(hour)}
              {name ? `, ${name}` : ""}.
            </div>
            <div className="mt-1 text-[13px] font-semibold" style={{ color: "var(--mut)" }}>
              {fmtDateLong(new Date())}
            </div>
          </div>
          <div className="w-full rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
            <div className="flex items-start gap-3">
              <Quote size={20} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
              <p className="font-display text-[16px] font-semibold leading-relaxed" style={{ color: "var(--text)" }}>
                {quote}
              </p>
            </div>
          </div>
          <div className="flex w-full justify-end gap-2">
            <Btn variant="ghost" onClick={closeGreeting}>
              Skip
            </Btn>
            <Btn variant="primary" onClick={closeGreeting}>
              Let’s log the day
            </Btn>
          </div>
          <div className="text-[11px]" style={{ color: "var(--mut)" }}>
            Shows {state.settings.greeting === "every" ? "on every launch" : "on the first launch of each day"} · customize in Settings.
          </div>
        </div>
      </Modal>

      <Modal
        open={!!confirmReq?.open}
        onClose={() => resolveConfirm(false)}
        title={confirmReq?.title ?? ""}
        width={440}
        zIndex={95}
        footer={
          <>
            <Btn variant="ghost" onClick={() => resolveConfirm(false)}>
              Cancel
            </Btn>
            <Btn
              variant={confirmReq?.danger ? "danger" : "primary"}
              disabled={blocked}
              onClick={() => resolveConfirm(true)}
              style={confirmReq?.danger ? { background: "var(--danger)", color: "#fff", borderColor: "var(--danger)" } : undefined}
            >
              {confirmReq?.confirmLabel ?? "Confirm"}
            </Btn>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--text)" }}>
          {confirmReq?.body}
        </p>
        {confirmReq?.requireText && (
          <div className="mt-3">
            <span className="lbl">Type “{confirmReq.requireText}” to confirm</span>
            <TextInput value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={confirmReq.requireText} />
          </div>
        )}
      </Modal>

      <TaskDialog />
      <LiveAnnouncer />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        state={state}
        currentView={view}
        onNavigate={(v) => {
          setView(v);
          window.location.hash = v;
        }}
        onNewTask={() => openTaskDialog()}
        onSelectTask={(t) => openTaskDialog({ taskId: t.id })}
        onSelectNote={() => {
          setView("notes");
          window.location.hash = "notes";
        }}
        onToggleTheme={onToggleTheme}
      />

      {/* Mobile Android Bottom Dock & Hub Sheet */}
      <MobileBottomNav
        currentView={view}
        onSelectView={(v) => {
          setView(v);
          window.location.hash = v;
        }}
        onOpenNewTask={() => openTaskDialog()}
        onOpenMore={() => setMoreSheetOpen((o) => !o)}
        moreOpen={moreSheetOpen}
      />

      <MobileMoreSheet
        open={moreSheetOpen}
        onClose={() => setMoreSheetOpen(false)}
        currentView={view}
        onSelectView={(v) => {
          setView(v);
          window.location.hash = v;
        }}
      />
    </>
  );
}
