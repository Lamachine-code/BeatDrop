"use client";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, loginUrl, useMe } from "@/lib/api";

const NAV = [
  { href: "/", label: "Explore" },
  { href: "/studio", label: "Create" },
  { href: "/random", label: "Random" },
  { href: "/setup", label: "Setup" },
];

export function Header() {
  const { data } = useMe();
  const qc = useQueryClient();
  const path = usePathname();
  const user = data?.user;
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-bg0/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-5 py-3">
        <Link href="/" className="font-display text-3xl tracking-wide text-white">
          <span className="text-accent">♪</span> BEATDROP
        </Link>
        <nav className="flex flex-1 gap-1 text-sm">
          {NAV.map((n) => {
            const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`rounded-full px-3 py-1.5 ${on ? "bg-bg2 text-white" : "text-text1 hover:text-white"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        {user ? (
          <div className="flex items-center gap-3">
            {user.avatarUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={user.avatarUrl} alt="" className="size-8 rounded-full" />}
            <span className="text-sm">{user.displayName}</span>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                await api("/auth/logout", { method: "POST" });
                await qc.invalidateQueries({ queryKey: ["me"] });
              }}
            >
              Log out
            </button>
          </div>
        ) : (
          <a href={loginUrl} className="btn btn-primary">
            Log in with Twitch
          </a>
        )}
      </div>
    </header>
  );
}
