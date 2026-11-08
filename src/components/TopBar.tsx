"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const CUSTOMER = [
  { href: "/advisor", label: "Get a plan" },
  { href: "/track", label: "Track order" },
  { href: "/account", label: "Account" },
];
const STAFF = [
  { href: "/expert", label: "Expert" },
  { href: "/manager", label: "Manager" },
];

export function TopBar() {
  const path = usePathname();
  const link = (l: { href: string; label: string }) => {
    const active = path.startsWith(l.href);
    return (
      <Link key={l.href} href={l.href} className={`px-3 h-8 inline-flex items-center rounded-full text-sm whitespace-nowrap transition-colors ${active ? "bg-foreground text-white" : "text-muted hover:text-foreground"}`}>
        {l.label}
      </Link>
    );
  };
  return (
    <header className="sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 pt-3">
        <div className="glass rounded-full h-14 px-3 pl-5 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="w-7 h-7 rounded-full bg-brand grid place-items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-white" />
            </span>
            <span className="font-semibold tracking-tight">Udyam Digital</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
            {CUSTOMER.map(link)}
            <span className="w-px h-5 bg-black/10 mx-1 hidden sm:block" />
            <span className="hidden sm:flex gap-1">{STAFF.map(link)}</span>
          </nav>
        </div>
      </div>
    </header>
  );
}
