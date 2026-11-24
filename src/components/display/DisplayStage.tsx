"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Radio, Trophy, Wifi, WifiOff } from "lucide-react";
import { deriveDisplayPhase, getMode, type DisplayPhase } from "@/lib/draw";
import { cn } from "@/lib/utils";
import type { DisplayState, DisplayWinner, DrawMode, PreviousWinner } from "@/lib/types";

const fetchDisplay = async (url: string): Promise<DisplayState> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({ ok: false, error: "Invalid response" }));
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Display unavailable");
  return payload.data as DisplayState;
};

export function DisplayStage({ identifier }: { identifier: string }) {
  const { data: swrState, error } = useSWR<DisplayState>(
    `/api/display/state?id=${encodeURIComponent(identifier)}`,
    fetchDisplay,
    {
      refreshInterval: 1000,
      revalidateOnFocus: true,
      errorRetryInterval: 2000,
      keepPreviousData: true,
    },
  );
  const state: DisplayState | null = swrState ?? null;
  const phase = deriveDisplayPhase(state);
  const accent = state?.primary_color || "#e6b75c";
  const lastAnnouncement = useRef("");

  useEffect(() => {
    if (!state || state.reveal_index === 0 || phase !== "reveal") return;
    const key = `${state.session_id ?? ""}:${state.reveal_index}`;
    if (key === lastAnnouncement.current) return;
    lastAnnouncement.current = key;
    if (state.presentation?.sound_enabled !== false) playChime();
  }, [state, phase]);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  return (
    <main
      className="stage min-h-screen w-full p-3 md:p-6"
      style={{ "--stage-accent": accent } as React.CSSProperties}
    >
      <div className="stage-grid pointer-events-none absolute inset-0" />
      <div className="stage-glow pointer-events-none absolute inset-0" />

      <div className="relative mx-auto flex min-h-[calc(100vh-24px)] w-full max-w-[1800px] flex-col md:min-h-[calc(100vh-48px)]">
        <StageHeader state={state} phase={phase} online={!error} />

        <div className="relative flex flex-1 items-center justify-center py-4">
          {!state && error ? (
            <WaitingView title="CONNECTING TO THE STAGE" subtitle="Waiting for the event control server…" accent={accent} />
          ) : !state ? (
            <WaitingView title="GET READY" subtitle="Preparing the live results display…" accent={accent} />
          ) : phase === "event_completed" ? (
            <EventCompletedView state={state} accent={accent} />
          ) : phase === "completed_batch" ? (
            <CompletedBatchView state={state} accent={accent} />
          ) : phase === "intro" ? (
            <IntroView state={state} accent={accent} />
          ) : phase === "reveal" ? (
            <RevealView state={state} accent={accent} />
          ) : (
            <WaitingView
              title={state.event_name || "DOORPRIZE"}
              subtitle="The next draw will appear here automatically."
              accent={accent}
              previous={state.previous_winners}
            />
          )}
        </div>

        <StageFooter state={state} online={!error} onFullscreen={toggleFullscreen} />
      </div>
    </main>
  );
}

function StageHeader({ state, phase, online }: { state: DisplayState | null; phase: DisplayPhase; online: boolean }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
      <div className="flex min-w-0 items-center gap-3">
        {state?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.logo_url} alt="" className="h-9 max-w-[120px] object-contain" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--stage-accent)] text-[11px] font-black text-black">
            DP
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold uppercase tracking-[.16em] text-white/90">
            {state?.event_name || "Corporate doorprize"}
          </div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.22em] text-white/40">Live results</div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {state?.presentation?.paused && (
          <span className="rounded-full border border-[#ffc46b]/40 bg-[#ffc46b]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#ffc46b]">
            Paused by admin
          </span>
        )}
        <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/60 sm:flex">
          {online ? <Wifi className="h-3 w-3 text-emerald-400" /> : <WifiOff className="h-3 w-3 text-red-400" />}
          {online ? "Connected" : "Reconnecting"}
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-[var(--stage-accent)]/40 bg-[var(--stage-accent)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--stage-accent)]">
          <Radio className={cn("h-3 w-3", phase !== "waiting" && "animate-pulse")} />
          {phase === "waiting" ? "Standby" : phase === "event_completed" ? "Finished" : "Live"}
        </span>
      </div>
    </header>
  );
}

function StageFooter({
  state, online, onFullscreen,
}: { state: DisplayState | null; online: boolean; onFullscreen: () => void }) {
  const previous = state?.previous_winners ?? [];
  return (
    <footer className="flex items-end justify-between gap-6 border-t border-white/10 pt-3">
      <div className="min-w-0 flex-1">
        {previous.length > 0 ? (
          <>
            <div className="text-[9px] font-bold uppercase tracking-[.22em] text-white/35">Already announced</div>
            <div className="mt-1.5 flex gap-2 overflow-hidden whitespace-nowrap text-[11px] text-white/45">
              {previous.slice(-6).map((w, i) => (
                <span key={`${w.prizeName}-${w.employeeId}-${i}`} className="shrink-0">
                  <span className="font-semibold text-white/70">{w.employeeId}</span> · {w.employeeName}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="text-[10px] uppercase tracking-[.2em] text-white/25">
            One employee ID · one prize
          </div>
        )}
      </div>
      <button
        onClick={onFullscreen}
        className="shrink-0 rounded-md border border-white/10 p-2 text-white/40 transition hover:bg-white/10 hover:text-white"
        title="Toggle fullscreen (projector mode)"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      {!online && <span className="sr-only">Connection lost. Retrying…</span>}
    </footer>
  );
}

function WaitingView({
  title, subtitle, accent, previous,
}: { title: string; subtitle: string; accent: string; previous?: PreviousWinner[] }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl text-center">
      <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
        <Trophy className="h-7 w-7" style={{ color: accent }} />
      </div>
      <h1 className="text-4xl font-black uppercase tracking-[.12em] text-white md:text-6xl">{title}</h1>
      <p className="mx-auto mt-4 max-w-xl text-sm text-white/45 md:text-base">{subtitle}</p>
      {previous && previous.length > 0 && (
        <div className="mt-10 grid grid-cols-2 gap-2 text-left md:grid-cols-3">
          {previous.slice(-6).map((w, i) => (
            <div key={`${w.employeeId}-${i}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="truncate text-[11px] font-bold text-white/80">{w.employeeName}</div>
              <div className="truncate font-mono text-[10px] text-white/40">{w.employeeId} · {w.prizeName}</div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function IntroView({ state, accent }: { state: DisplayState; accent: string }) {
  const mode = getMode(state.drawing_mode);
  return (
    <div className="w-full max-w-5xl text-center">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-[11px] font-bold uppercase tracking-[.4em] text-white/40">Now drawing</div>
        <h1 className="gold-text mt-4 text-5xl font-black leading-tight md:text-7xl">{state.prize_name ?? "Prize"}</h1>
        <p className="mt-4 text-sm text-white/50">
          {state.winner_count} winner{state.winner_count === 1 ? "" : "s"} · {mode.label}
        </p>
      </motion.div>
      <div className="mt-8">
        <ModeAnimation mode={state.drawing_mode} index={0} duration={state.presentation?.animation_duration_ms ?? 2600} accent={accent} />
      </div>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.4, repeat: Infinity }}
        className="mt-8 text-[11px] font-bold uppercase tracking-[.35em] text-[var(--stage-accent)]"
      >
        Announcing shortly
      </motion.div>
    </div>
  );
}

function RevealView({ state, accent }: { state: DisplayState; accent: string }) {
  const current = state.winners[state.winners.length - 1];
  const progress = state.winner_count > 0 ? Math.round((state.reveal_index / state.winner_count) * 100) : 0;

  return (
    <div className="w-full max-w-6xl">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.35em] text-white/40">Current prize</div>
          <div className="mt-1 text-xl font-bold text-white md:text-2xl">{state.prize_name ?? "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-[.35em] text-white/40">Winner</div>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--stage-accent)]">
            {state.reveal_index} / {state.winner_count}
          </div>
        </div>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full rounded-full bg-[var(--stage-accent)]"
          animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
      </div>

      <div className="relative mt-6 flex min-h-[320px] items-center justify-center md:min-h-[420px]">
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div
              key={`${state.session_id}-${current.revealOrder}`}
              initial={{ opacity: 0, scale: 0.86, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.05, y: -16 }}
              transition={{ type: "spring", stiffness: 150, damping: 18 }}
              className="w-full text-center"
              aria-live="polite"
            >
              <div className="text-[10px] font-bold uppercase tracking-[.45em] text-white/40">Congratulations to</div>
              <div className="gold-text mt-2 text-5xl font-black leading-tight md:text-7xl lg:text-8xl">
                {current.employeeName}
              </div>
              <div className="mt-4 flex justify-center">
                <div className="rounded-xl border border-[var(--stage-accent)]/40 bg-[var(--stage-accent)]/10 px-8 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[.3em] text-white/45">Employee ID</div>
                  <div className="mt-0.5 font-mono text-2xl font-bold tracking-wide text-[var(--stage-accent)] md:text-3xl">
                    {current.employeeId}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <ModeAnimation mode={state.drawing_mode} index={state.reveal_index} duration={state.presentation?.animation_duration_ms ?? 2600} accent={accent} />
              <div className="mt-6 text-xs font-bold uppercase tracking-[.35em] text-white/40">Selecting the next winner…</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {state.winners.length > 1 && (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {state.winners.map((w) => <WinnerPill key={w.revealOrder} winner={w} accent={accent} />)}
        </div>
      )}
    </div>
  );
}

function CompletedBatchView({ state, accent }: { state: DisplayState; accent: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-6xl text-center">
      <div className="text-[11px] font-bold uppercase tracking-[.4em] text-white/45">All winners announced</div>
      <h1 className="gold-text mt-2 text-4xl font-black md:text-6xl">{state.prize_name ?? "Prize"}</h1>
      <div
        className={cn(
          "mx-auto mt-7 grid gap-3",
          state.winners.length <= 3 ? "max-w-3xl md:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {state.winners.map((w, i) => (
          <motion.div
            key={w.revealOrder}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-left"
          >
            <div className="text-[10px] font-bold uppercase tracking-[.25em] text-white/35">Winner #{w.revealOrder}</div>
            <div className="mt-1 truncate text-lg font-bold text-white">{w.employeeName}</div>
            <div className="mt-1 font-mono text-sm font-semibold" style={{ color: accent }}>{w.employeeId}</div>
          </motion.div>
        ))}
      </div>
      <p className="mt-7 text-[11px] uppercase tracking-[.3em] text-white/35">
        Results are final · thank you for participating
      </p>
    </motion.div>
  );
}

function EventCompletedView({ state, accent }: { state: DisplayState; accent: string }) {
  const all = state.previous_winners;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-6xl text-center">
      <Trophy className="mx-auto h-12 w-12" style={{ color: accent }} />
      <h1 className="gold-text mt-4 text-4xl font-black md:text-6xl">Event complete</h1>
      <p className="mt-3 text-sm text-white/50">{state.event_name} · {all.length} prize winners announced</p>
      <div className="mt-8 grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto text-left sm:grid-cols-3 lg:grid-cols-4">
        {all.map((w, i) => (
          <div key={`${w.employeeId}-${i}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-[.2em] text-white/35">{w.prizeName}</div>
            <div className="mt-0.5 truncate text-[12px] font-bold text-white/85">{w.employeeName}</div>
            <div className="truncate font-mono text-[10px]" style={{ color: accent }}>{w.employeeId}</div>
          </div>
        ))}
        {all.length === 0 && <div className="col-span-full text-center text-sm text-white/40">No results to display.</div>}
      </div>
    </motion.div>
  );
}

function WinnerPill({ winner, accent }: { winner: DisplayWinner; accent: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/60">
      <span className="mr-2 font-semibold" style={{ color: accent }}>#{winner.revealOrder}</span>
      {winner.employeeId} · {winner.employeeName}
    </span>
  );
}

function ModeAnimation({
  mode, index, duration, accent,
}: { mode: DrawMode | null; index: number; duration: number; accent: string }) {
  const spins = 3 + (index % 3);
  if (mode === "wheel") {
    const segments = Array.from({ length: 12 }, (_, i) => i);
    return (
      <div className="relative mx-auto h-40 w-40 md:h-56 md:w-56">
        <motion.div
          className="absolute inset-0 rounded-full shadow-2xl"
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 * spins }}
          transition={{ duration: duration / 1000, ease: [0.12, 0.7, 0.12, 1] }}
          style={{
            background: `conic-gradient(${segments.map((i) => `${i % 2 ? accent : "#14263a"} ${i * 30}deg ${(i + 1) * 30}deg`).join(",")})`,
          }}
        >
          {segments.map((i) => (
            <span key={i} className="absolute left-1/2 top-1/2 h-1/2 w-px origin-bottom -translate-x-1/2 -translate-y-full bg-black/25"
              style={{ transform: `translate(-50%, -100%) rotate(${i * 30}deg)` }} />
          ))}
        </motion.div>
        <div className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-8 border-t-[18px] border-x-transparent" style={{ borderTopColor: accent }} />
        <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white/10 bg-[#0b1420]" />
      </div>
    );
  }

  if (mode === "roller") {
    return (
      <div className="flex justify-center gap-2 md:gap-3">
        {[0, 1, 2].map((col) => (
          <div key={col} className="h-28 w-20 overflow-hidden rounded-lg border border-white/10 bg-white/5 md:h-40 md:w-28">
            <motion.div
              initial={{ y: 0 }}
              animate={{ y: [0, -140, -280, -420, -540 + (index % 5) * 20] }}
              transition={{ duration: duration / 1000, ease: [0.15, 0.6, 0.2, 1] }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="flex h-28 items-center justify-center border-b border-white/5 font-mono text-2xl text-white/70 md:h-40 md:text-3xl">
                  {String((index * 7 + col * 13 + i) % 100).padStart(2, "0")}
                </div>
              ))}
            </motion.div>
          </div>
        ))}
      </div>
    );
  }

  if (mode === "picker") {
    return (
      <div className="mx-auto grid max-w-lg grid-cols-3 gap-2 md:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <motion.div
            key={i}
            className="flex aspect-[3/4] items-center justify-center rounded-lg border text-[10px] font-bold tracking-widest"
            style={{ borderColor: `${accent}66`, background: i % 3 === 0 ? `${accent}22` : "#0e1a28" }}
            initial={{ rotateY: 0, opacity: 0.35 }}
            animate={{ rotateY: [0, 180, 360], opacity: [0.35, 1, 0.75] }}
            transition={{ duration: duration / 1000, delay: i * 0.035 }}
          >
            ID
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {Array.from({ length: 9 }, (_, i) => (
        <motion.div
          key={i}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 font-mono text-lg font-bold md:h-16 md:w-16"
          style={{ borderColor: `${accent}88`, color: "#fff" }}
          initial={{ y: -30, x: 0, rotate: 0 }}
          animate={{
            y: [0, 30 + (index % 4) * 8, -10, 0],
            x: [(i % 3) * 8 - 8, 0, (i % 2) * 10 - 5, 0],
            rotate: [0, (i % 2 ? 1 : -1) * 25, 0],
          }}
          transition={{ duration: duration / 1000, delay: i * 0.04, repeat: 0 }}
        >
          {String((index * 9 + i + 1) % 50).padStart(2, "0")}
        </motion.div>
      ))}
    </div>
  );
}

function playChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [660, 880].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.16, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.46);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Browsers may block audio until a gesture; presentation must never depend on it.
  }
}
