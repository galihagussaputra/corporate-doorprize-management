"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const error = params.get("error");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }
    router.push(params.get("next") || "/admin/events");
    router.refresh();
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-10">
        <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-lg bg-[#0d8b7d] text-white">
          <span className="text-lg font-black tracking-tighter">DP</span>
        </div>
        <h1 className="text-[30px] font-bold tracking-[-.04em] text-[var(--text)]">
          Event control
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Sign in to manage participants, prizes and the live draw.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-md border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {error === "unauthorized"
            ? "This account is not authorized as an administrator."
            : "Application configuration is incomplete. Check environment variables."}
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="field-label" htmlFor="email">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              id="email" type="email" autoComplete="username" required
              className="input pl-10" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@company.com"
            />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="password">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              id="password" type={show ? "text" : "password"} autoComplete="current-password" required
              className="input pl-10 pr-10" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button" aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button type="submit" className="btn btn-primary w-full py-3 text-sm" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-8 text-xs leading-relaxed text-[var(--text-muted)]">
        Access is restricted to authorized event administrators. Every privileged action is recorded in the audit log.
      </p>
    </div>
  );
}
