import { z } from "zod";
import { fail, handleError, ok, readJson } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000).default(""),
  eventDate: z.string().datetime().nullable().optional(),
  status: z.enum(["draft", "ready", "in_progress", "completed", "archived"]).default("draft"),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("events")
    .select("id, name, status, event_date, created_at, updated_at, settings")
    .order("created_at", { ascending: false });
  if (error) return handleError(error);
  return ok(data);
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return fail("Unauthorized", 401);
  try {
    const body = createSchema.parse(await readJson(request));
    const supabase = await getSupabaseServer();
    const { data: event, error } = await supabase
      .from("events")
      .insert({
        name: body.name,
        description: body.description,
        event_date: body.eventDate ?? null,
        status: body.status,
      })
      .select("id, name, status, settings")
      .single();
    if (error) return handleError(error);

    // Every event receives an unguessable public display capability.
    const slug = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
    const { error: tokenError } = await supabase
      .from("display_tokens")
      .insert({ event_id: event.id, slug, active: true });
    if (tokenError) return handleError(tokenError);

    await supabase.from("audit_logs").insert({
      event_id: event.id,
      administrator_id: admin.userId,
      action: "event.created",
      entity_type: "event",
      entity_id: event.id,
      new_value: { name: event.name, status: event.status },
    });

    return ok(event, 201);
  } catch (error) {
    return handleError(error);
  }
}
