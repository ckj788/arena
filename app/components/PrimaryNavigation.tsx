import Link from "./NavigationLink";

export type MainPage = "discover" | "arena" | "champions" | "resources";

const items = [
  { page: "discover", href: "/", label: "Discover" },
  { page: "arena", href: "/arena", label: "Arena" },
  { page: "champions", href: "/champions", label: "Champions" },
  { page: "resources", href: "/resources/startup-launch-directories", label: "Resources" },
] as const;

export default function PrimaryNavigation({ activePage, className = "" }: {
  activePage?: MainPage;
  className?: string;
}) {
  return (
    <nav aria-label="Main navigation" className={`items-center gap-1 overflow-x-auto ${className}`}>
      {items.map(({ page, href, label }) => (
        <Link key={page} href={href} prefetch aria-current={activePage === page ? "page" : undefined}
          className="exhibition-nav-link inline-flex shrink-0 items-center">
          {label}
        </Link>
      ))}
    </nav>
  );
}
