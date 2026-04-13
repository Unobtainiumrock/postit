"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_TABS = [
  { href: "/inbound", label: "Inbound" },
  { href: "/mine", label: "Posted by me" },
  { href: "/archive", label: "Archive" },
  { href: "/search", label: "Search" },
];

export default function FeedTabs({ isAdmin }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...BASE_TABS, { href: "/admin", label: "Admin" }] : BASE_TABS;

  return (
    <nav className="flex gap-1 flex-wrap">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-1.5 rounded-lg text-sm transition whitespace-nowrap ${
              active
                ? "bg-white/20 text-white"
                : "text-white/70 hover:text-white hover:bg-white/10"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
