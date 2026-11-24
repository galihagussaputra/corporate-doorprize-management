import { DrawConsole } from "@/components/admin/DrawConsole";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { EventRecord } from "@/lib/types";

export default async function Page({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  await requireAdmin();
  const supabase = await getSupabaseServer();
  const { data } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
  return <DrawConsole eventId={eventId} event={(data as unknown as EventRecord) ?? null} />;
}
