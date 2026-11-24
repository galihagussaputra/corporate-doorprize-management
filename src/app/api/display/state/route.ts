import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { getSupabaseService } from "@/lib/supabase/server";
import type { DisplayState } from "@/lib/types";

/**
 * Public, read-only presentation endpoint.
 * Accepts either the unguessable display slug or the event UUID, and only ever
 * returns the sanitized display_state projection (no roster, no audit, no admin
 * data, no unannounced winners). Polling is authoritative; Realtime is optional.
 */
export async function GET(request: Request) {
  const identifier = new URL(request.url).searchParams.get("id")?.trim();
  if (!identifier || !/^[A-Za-z0-9_-]{20,200}$/.test(identifier)) {
    return fail("A valid display identifier is required", 400);
  }

  try {
    const supabase = getSupabaseService();
    let { data } = await supabase
      .from("display_state")
      .select("*")
      .eq("slug", identifier)
      .eq("public_enabled", true)
      .maybeSingle();
    if (!data && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) {
      const byId = await supabase
        .from("display_state")
        .select("*")
        .eq("event_id", identifier)
        .eq("public_enabled", true)
        .maybeSingle();
      data = byId.data;
    }
    if (!data) return fail("Display not available", 404);

    return NextResponse.json(
      { ok: true, data: data as DisplayState },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return fail("Display service unavailable", 503);
  }
}
