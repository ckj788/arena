import Link from "./NavigationLink";

export type MainPage = "discover" | "arena" | "champions";

const items = [
  { page: "discover", href: "/", label: "Discover" },
  { page: "arena", href: "/arena", label: "Arena" },
  { page: "champions", href: "/champions", label: "Champions" },
] as const;

export default function PrimaryNavigation({ activePage, className = "" }: {
  activePage?: MainPage;
  className?: string;
}) {
  return (
    <nav aria-label="Main navigation" className={`items-center gap-1 ${className}`}>
      {items.map(({ page, href, label }) => (
        <Link key={page} href={href} prefetch aria-current={activePage === page ? "page" : undefined}
          className={`inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium transition-colors ${activePage === page ? "bg-zinc-100 text-zinc-950 font-semibold shadow-2xs" : "text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-950"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
