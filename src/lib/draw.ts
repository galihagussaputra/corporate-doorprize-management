import type { DrawMode, DisplayState, EventSettings } from "@/lib/types";

export const DRAW_MODES: Array<{
  id: DrawMode;
  label: string;
  tagline: string;
  description: string;
}> = [
  {
    id: "wheel",
    label: "Spin Wheel",
    tagline: "The classic spin",
    description: "A weighted-feel wheel slows down on the announced winner.",
  },
  {
    id: "roller",
    label: "Name Roller",
    tagline: "Slot machine",
    description: "Rapid name reels decelerate one winner at a time.",
  },
  {
    id: "picker",
    label: "Random Picker",
    tagline: "Card reveal",
    description: "A deck of cards flips to reveal the selected employee.",
  },
  {
    id: "lottery",
    label: "Lottery Balls",
    tagline: "Number draw",
    description: "Numbered balls tumble before the winner card appears.",
  },
];

export const DEFAULT_ANIMATION_MS = 2600;
export const DEFAULT_REVEAL_DELAY_MS = 1200;

export function getMode(mode: DrawMode | null | undefined) {
  return DRAW_MODES.find((m) => m.id === mode) ?? DRAW_MODES[0];
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function presentationFromSettings(settings: EventSettings) {
  return {
    animation_duration_ms: clampInt(settings.animation_duration_ms, 800, 8000),
    reveal_delay_ms: clampInt(settings.reveal_delay_ms, 300, 6000),
    sound_enabled: settings.sound_enabled,
  };
}

export type DisplayPhase = "waiting" | "intro" | "reveal" | "completed_batch" | "event_completed";

export function deriveDisplayPhase(state: DisplayState | null): DisplayPhase {
  if (!state) return "waiting";
  if (state.event_status === "completed") return "event_completed";
  const persisted = state.presentation?.phase;
  if (persisted === "completed_batch" || persisted === "intro" || persisted === "reveal") {
    return persisted;
  }
  return "waiting";
}

/** Admin-only auto-reveal cadence. The backend remains the source of truth. */
export function revealDelayFor(index: number, delayMs: number, durationMs: number): number {
  // First reveal follows the full animation; later reveals use the configured gap.
  return index === 0 ? Math.max(durationMs, delayMs) : delayMs;
}
