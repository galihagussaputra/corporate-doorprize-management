import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { requireAdmin } from "@/lib/auth";

export default async function LoginPage() {
  if (await requireAdmin()) redirect("/admin/events");
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="stage relative hidden flex-col justify-between overflow-hidden p-14 lg:flex">
        <div className="stage-glow absolute inset-0" />
        <div className="stage-grid absolute inset-0" />
        <div className="relative flex items-center gap-3">
          <div className="h-9 w-9 rounded-md border border-white/15 bg-white/5 text-center text-xs font-black leading-9 text-[#e6b75c]">DP</div>
          <span className="text-sm font-semibold tracking-wide text-white/80">DOORPRIZE / LIVE</span>
        </div>
        <div className="relative max-w-xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[.28em] text-[#e6b75c]">
            Corporate events · 2026
          </p>
          <h2 className="text-[clamp(2.6rem,4.4vw,4.6rem)] font-bold leading-[1.03] tracking-[-.055em] text-white">
            Every winner.<br />
            <span className="gold-text">Accounted for.</span>
          </h2>
          <p className="mt-7 max-w-md text-[15px] leading-relaxed text-white/55">
            A controlled drawing environment with cryptographic selection, sequential reveals and a permanent audit trail.
          </p>
        </div>
        <div className="relative flex gap-10 border-t border-white/10 pt-6 text-[11px] uppercase tracking-[.14em] text-white/40">
          <span>ONCE policy enforced</span>
          <span>Server-side draw</span>
          <span>Auditable</span>
        </div>
      </section>
      <section className="flex items-center justify-center bg-[var(--surface-2)] px-6 py-14">
        <Suspense fallback={<div className="text-sm text-[var(--text-muted)]">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
