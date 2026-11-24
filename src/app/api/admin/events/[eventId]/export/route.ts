import { NextResponse } from "next/server";
import { fail, handleError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { participantRows, toCsv, toXlsx, winnerRows } from "@/lib/exports";

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const { eventId } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "winners";
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const supabase = await getSupabaseServer();

  try {
    let rows: ReturnType<typeof participantRows> | ReturnType<typeof winnerRows>;
    let filename: string;
    if (type === "participants") {
      const { data, error } = await supabase
        .from("participants")
        .select("employee_id, employee_name, status, created_at")
        .eq("event_id", eventId)
        .order("employee_id");
      if (error) throw error;
      rows = participantRows(data ?? []);
      filename = "participants";
    } else {
      const { data, error } = await supabase
        .from("draw_winners")
        .select("prize:prizes(name), reveal_order, employee_id, employee_name, status, revealed_at, session_id, created_at")
        .eq("event_id", eventId)
        .order("created_at");
      if (error) throw error;
      const mapped = (data ?? []).map((w: Record<string, unknown>) => ({
        ...(w as Record<string, string | number | null>),
        prize_name: (w.prize as { name: string } | null)?.name ?? null,
      }));
      rows = winnerRows(mapped as Parameters<typeof winnerRows>[0]);
      filename = "winners";
    }

    const body = format === "csv"
      ? new Blob([toCsv(rows)], { type: "text/csv; charset=utf-8" })
      : new Blob([new Uint8Array(toXlsx(rows, filename))], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
    return new NextResponse(body, {
      headers: {
        "Content-Type": format === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}-${eventId.slice(0, 8)}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
