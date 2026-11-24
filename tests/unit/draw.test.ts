import { describe, expect, it } from "vitest";
import {
  clampInt, deriveDisplayPhase, DRAW_MODES, DEFAULT_ANIMATION_MS, presentationFromSettings, revealDelayFor,
} from "@/lib/draw";
import type { DisplayState, EventSettings } from "@/lib/types";

function state(patch: Partial<DisplayState> = {}): DisplayState {
  return {
    event_id: "e", public_enabled: true, slug: "slug", event_name: "Demo",
    event_status: "in_progress", logo_url: null, primary_color: "#e6b75c",
    prize_id: null, prize_name: null, prize_image_url: null, session_id: null,
    session_status: null, reveal_index: 0, winner_count: 0, drawing_mode: null,
    presentation: {}, winners: [], previous_winners: [], updated_at: new Date().toISOString(),
    ...patch,
  };
}

const settings: EventSettings = {
  no_repeat: true,
  public_display_enabled: true,
  theme: "dark",
  primary_color: "#e6b75c",
  logo_url: null,
  sound_enabled: true,
  animation_duration_ms: DEFAULT_ANIMATION_MS,
  reveal_delay_ms: 1200,
};

describe("draw helpers", () => {
  it("publishes exactly four distinct presentation modes", () => {
    expect(DRAW_MODES.map((m) => m.id)).toEqual(["wheel", "roller", "picker", "lottery"]);
    expect(new Set(DRAW_MODES.map((m) => m.id)).size).toBe(4);
  });

  it("clamps numeric presentation settings", () => {
    expect(clampInt(10, 800, 8000)).toBe(800);
    expect(clampInt(99999, 800, 8000)).toBe(8000);
    expect(clampInt(Number.NaN, 300, 6000)).toBe(300);
    expect(presentationFromSettings({ ...settings, animation_duration_ms: 10, reveal_delay_ms: 99999 })).toEqual({
      animation_duration_ms: 800,
      reveal_delay_ms: 6000,
      sound_enabled: true,
    });
  });

  it("uses the full animation before the first reveal and the short cadence afterwards", () => {
    expect(revealDelayFor(0, 1200, 2600)).toBe(2600);
    expect(revealDelayFor(1, 1200, 2600)).toBe(1200);
    expect(revealDelayFor(4, 500, 3000)).toBe(500);
  });

  it("derives the presentation phase from the server projection", () => {
    expect(deriveDisplayPhase(null)).toBe("waiting");
    expect(deriveDisplayPhase(state())).toBe("waiting");
    expect(deriveDisplayPhase(state({ presentation: { phase: "intro" } }))).toBe("intro");
    expect(deriveDisplayPhase(state({ presentation: { phase: "reveal" } }))).toBe("reveal");
    expect(deriveDisplayPhase(state({ presentation: { phase: "completed_batch" } }))).toBe("completed_batch");
    expect(deriveDisplayPhase(state({ event_status: "completed", presentation: { phase: "reveal" } })))
      .toBe("event_completed");
  });
});
