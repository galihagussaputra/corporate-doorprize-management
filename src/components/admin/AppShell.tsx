"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown, ExternalLink, Gift, LayoutDashboard, LogOut,
  Moon, PlayCircle, Settings2, Sun, Trophy, UsersRound,
} from "lucide-react";

export interface ShellEvent {
  id: string;
  name: string;
  status: string;
  slug: string | null;
}

const navigation = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/participants", label: "Participants", icon: UsersRound },
  { href: "/prizes", label: "Prizes", icon: Gift },
  { href: "/draw", label: "Live draw", icon: PlayCircle },
  { href: "/winners", label: "Winners & audit", icon: Trophy },
  { href: "/settings", label: "Event settings", icon: Settings2 },
];

export function AppShell({
  events, children, adminName,
}: {
  events: ShellEvent[];
  children: React.ReactNode;
  adminName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const match = pathname.match(/^\/admin\/events\/([0-9a-f-]{36})/);
  const eventId = match?.[1] ?? "";
  const active = events.find((e) => e.id === eventId);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme ?? "light");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("dp-theme", next);
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] lg:flex">
        <div className="flex h-[68px] items-center gap-3 border-b border-[var(--line)] px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#0d8b7d] text-[11px] font-black text-white">DP</div>
          <div>
            <div className="text-[13px] font-bold tracking-tight">DOORPRIZE</div>
            <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[var(--text-muted)]">Event control</div>
          </div>
        </div>

        <div className="px-4 pt-5">
          <label className="field-label">Current event</label>
          <div className="relative">
            <select
              className="input appearance-none pr-8 text-[13px] font-semibold"
              value={eventId}
              onChange={(e) => router.push(`/admin/events/${e.target.value}`)}
            >
              <option value="">Select an event…</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          </div>
        </div>

        <nav className="mt-6 flex-1 space-y-0.5 px-3">
          {navigation.map((item) => {
            const href = `/admin/events/${eventId}${item.href}`;
            const isActive = eventId && pathname === href;
            return (
              <Link
                key={item.label}
                href={eventId ? href : "/admin/events"}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition ${
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                }`}
              >
                <item.icon className="h-[17px] w-[17px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--line)] p-4">
          {active?.slug && (
            <a
              href={`/display/${active.slug}`}
              target="_blank"
              rel="noreferrer"
              className="mb-3 flex items-center justify-between rounded-md border border-[var(--line)] px-3 py-2 text-[12px] font-semibold hover:bg-[var(--surface-2)]"
            >
              <span className="flex items-center gap-2"><ExternalLink className="h-3.5 w-3.5" /> Open LED display</span>
            </a>
          )}
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold">{adminName || "Administrator"}</div>
              <div className="text-[10px] text-[var(--text-muted)]">Administrator</div>
            </div>
            <form action="/api/auth/logout" method="post">
              <button type="submit" title="Sign out" className="btn-ghost rounded-md p-2">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[var(--line)] bg-[var(--surface)]/95 px-5 backdrop-blur md:px-8">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[.15em] text-[var(--text-muted)]">
              {active ? active.status.replace("_", " ") : "Event management"}
            </div>
            <div className="truncate text-[16px] font-bold tracking-tight">{active?.name ?? "Events"}</div>
          </div>
          <div className="flex items-center gap-2">
            <nav className="mr-2 hidden gap-1 md:flex">
              {events.slice(0, 3).map((e) => (
                <Link
                  key={e.id}
                  href={`/admin/events/${e.id}`}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${
                    e.id === eventId ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {e.name.length > 18 ? e.name.slice(0, 17) + "…" : e.name}
                </Link>
              ))}
            </nav>
            <button onClick={toggleTheme} className="btn-ghost rounded-md p-2" title="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>
        <div className="border-b border-[var(--line)] bg-[var(--surface-2)] px-5 py-2 lg:hidden">
          <select
            className="input text-xs"
            value={eventId}
            onChange={(e) => router.push(`/admin/events/${e.target.value}`)}
          >
            <option value="">Select an event…</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <div className="mt-2 flex gap-1 overflow-x-auto">
            {navigation.map((item) => (
              <Link key={item.label} href={eventId ? `/admin/events/${eventId}${item.href}` : "/admin/events"}
                className="whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <main className="mx-auto max-w-[1440px] px-5 py-7 md:px-8">{children}</main>
      </div>
    </div>
  );
}
