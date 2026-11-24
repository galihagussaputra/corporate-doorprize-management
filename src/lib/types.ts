export type EventStatus = "draft" | "ready" | "in_progress" | "completed" | "archived";
export type DrawMode = "wheel" | "roller" | "picker" | "lottery";
export type DrawStatus = "drawing" | "revealing" | "completed" | "cancelled" | "voided";

export interface EventSettings {
  no_repeat: true; // ONCE policy — permanently enabled in v2
  public_display_enabled: boolean;
  theme: "dark" | "light";
  primary_color: string;
  logo_url: string | null;
  sound_enabled: boolean;
  animation_duration_ms: number;
  reveal_delay_ms: number;
}

export interface EventRecord {
  id: string;
  name: string;
  description: string;
  event_date: string | null;
  status: EventStatus;
  settings: EventSettings;
  created_at: string;
  updated_at: string;
}

export interface ParticipantRecord {
  id: string;
  event_id: string;
  employee_id: string;
  employee_name: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface PrizeRecord {
  id: string;
  event_id: string;
  name: string;
  description: string;
  image_url: string | null;
  category: string;
  quantity: number;
  remaining: number;
  awarded: number;
  completed: boolean;
  display_order: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface DrawWinner {
  id: string;
  session_id: string;
  participant_id: string;
  event_id: string;
  prize_id: string;
  employee_id: string;
  employee_name: string;
  reveal_order: number;
  status: "active" | "voided" | "withdrawn";
  revealed_at: string | null;
  created_at: string;
  prize_name?: string;
}

export interface DrawSessionRecord {
  id: string;
  event_id: string;
  prize_id: string;
  prize_name?: string;
  drawing_mode: DrawMode;
  requested_winner_count: number;
  status: DrawStatus;
  reveal_index: number;
  administrator_id: string | null;
  presentation: {
    animation_duration_ms?: number;
    reveal_delay_ms?: number;
    sound_enabled?: boolean;
    paused?: boolean;
    phase?: string;
  };
  started_at: string;
  completed_at: string | null;
  cancellation_reason: string | null;
  voided_reason: string | null;
  paused_at: string | null;
  created_at: string;
  winners?: DrawWinner[];
}

export interface DisplayWinner {
  revealOrder: number;
  employeeId: string;
  employeeName: string;
  revealedAt: string | null;
}

export interface PreviousWinner extends DisplayWinner {
  prizeName: string;
  completedAt: string | null;
}

export interface DisplayState {
  event_id: string;
  public_enabled: boolean;
  slug: string;
  event_name: string;
  event_status: EventStatus;
  logo_url: string | null;
  primary_color: string;
  prize_id: string | null;
  prize_name: string | null;
  prize_image_url: string | null;
  session_id: string | null;
  session_status: DrawStatus | null;
  reveal_index: number;
  winner_count: number;
  drawing_mode: DrawMode | null;
  presentation: {
    animation_duration_ms?: number;
    reveal_delay_ms?: number;
    sound_enabled?: boolean;
    paused?: boolean;
    phase?: "waiting" | "intro" | "reveal" | "completed_batch";
  };
  winners: DisplayWinner[];
  previous_winners: PreviousWinner[];
  updated_at: string;
}

export interface DashboardSummary {
  totalParticipants: number;
  activeParticipants: number;
  alreadyWon: number;
  excludedParticipants: number;
  eligibleParticipants: number;
  totalPrizes: number;
  totalPrizeQuantity: number;
  remainingPrizeQuantity: number;
  completedDraws: number;
  activeSession: DrawSessionRecord | null;
}

export interface AuditRecord {
  id: string;
  event_id: string | null;
  administrator_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  created_at: string;
}
