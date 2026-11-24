import { getSupabaseServer } from "@/lib/supabase/server";

export interface AdminContext {
  userId: string;
  email: string | null;
  displayName: string | null;
}

/**
 * Server-side authorization. Middleware is a UX convenience; this check is the
 * actual security boundary and is called by every privileged route handler.
 */
export async function requireAdmin(): Promise<AdminContext | null> {
  const supabase = await getSupabaseServer();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("admin_profiles")
    .select("user_id, email, display_name, role")
    .eq("user_id", auth.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (profileError || !profile) return null;

  return {
    userId: auth.user.id,
    email: profile.email ?? auth.user.email ?? null,
    displayName: profile.display_name ?? null,
  };
}
