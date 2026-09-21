import Link from "./NavigationLink";
import ClashLogo from "./ClashLogo";
import PrimaryNavigation from "./PrimaryNavigation";
import PublicAccountLink from "./PublicAccountLink";

/** The same navigation on public profiles, directories, and matchup pages. */
export default function PublicSiteHeader({ actionHref = "/?submit=1", actionLabel = "Submit Product" }: {
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <header className="site-glass-nav sticky top-0 z-50 border-b border-zinc-200/80">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" aria-label="Indie Clash home" className="flex min-h-11 items-center gap-2">
            <ClashLogo size="md" className="max-sm:w-7 max-sm:h-7" />
            <span className="whitespace-nowrap text-sm font-bold tracking-tight text-zinc-950 sm:text-xl">Indie-Clash</span>
          </Link>
          <PrimaryNavigation className="hidden lg:flex" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
        <PublicAccountLink />
        <Link href={actionHref} className="inline-flex min-h-10 shrink-0 items-center rounded-md bg-zinc-900 px-2 text-[11px] font-semibold text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] sm:px-3 sm:text-xs">
          {actionLabel}
        </Link>
        </div>
      </div>
      <PrimaryNavigation className="flex border-t border-zinc-200/80 px-3 lg:hidden" />
    </header>
  );
}
