import { redirect } from "next/navigation";
import { AppShell, type ShellEvent } from "@/components/admin/AppShell";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  const supabase = await getSupabaseServer();
  const [eventsRes, tokensRes] = await Promise.all([
    supabase.from("events").select("id, name, status").order("created_at", { ascending: false }),
    supabase.from("display_tokens").select("event_id, slug").eq("active", true),
  ]);
  const events: ShellEvent[] = (eventsRes.data ?? []).map((e: Record<string, unknown>) => ({
    id: e.id as string,
    name: e.name as string,
    status: e.status as string,
    slug: (tokensRes.data ?? []).find(
      (t: { event_id: string }) => t.event_id === e.id,
    )?.slug ?? null,
  }));

  return (
    <AppShell events={events} adminName={admin.displayName ?? admin.email ?? "Administrator"}>
      {children}
    </AppShell>
  );
}
