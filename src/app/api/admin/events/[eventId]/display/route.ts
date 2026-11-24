import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ eventId: string }> };

const schema = z.object({
  publicEnabled: z.boolean().optional(),
  rotateToken: z.boolean().default(false),
});

export async function POST(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const { eventId } = await params;
    const body = schema.parse(await readJson(request));
    const supabase = await getSupabaseServer();

    if (body.publicEnabled !== undefined) {
      const { data: event } = await supabase.from("events").select("settings").eq("id", eventId).maybeSingle();
      if (!event) return fail("Event not found", 404);
      const { error } = await supabase.from("events").update({
        settings: { ...event.settings, public_display_enabled: body.publicEnabled },
      }).eq("id", eventId);
      if (error) return handleError(error);
      await supabase.from("audit_logs").insert({
        event_id: eventId,
        administrator_id: admin.userId,
        action: body.publicEnabled ? "display.enabled" : "display.disabled",
        entity_type: "event",
        entity_id: eventId,
        new_value: { public_display_enabled: body.publicEnabled },
      });
    }

    if (body.rotateToken) {
      const slug = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
      const { data: current } = await supabase
        .from("display_tokens")
        .select("id")
        .eq("event_id", eventId)
        .eq("active", true)
        .maybeSingle();
      if (current) {
        const { error } = await supabase.from("display_tokens").update({
          slug, active: false, rotated_at: new Date().toISOString(),
        }).eq("id", current.id);
        if (error) return handleError(error);
      }
      const { error: insertError } = await supabase
        .from("display_tokens")
        .insert({ event_id: eventId, slug, active: true });
      if (insertError) return handleError(insertError);
      await supabase.from("audit_logs").insert({
        event_id: eventId,
        administrator_id: admin.userId,
        action: "display.token_rotated",
        entity_type: "display_token",
        entity_id: eventId,
      });
      return ok({ slug });
    }

    const { data: token } = await supabase
      .from("display_tokens")
      .select("slug")
      .eq("event_id", eventId)
      .eq("active", true)
      .maybeSingle();
    return ok({ slug: token?.slug ?? null });
  } catch (error) {
    return handleError(error);
  }
}
