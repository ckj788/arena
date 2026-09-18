"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { OAUTH_RESTORE_EVENT } from "@/lib/browserOAuth";

const EVENT = "indieclash:navigation";
const KEY = "indieclashNavigation";
type View = "home" | "console";
type Position = { y?: number; target?: string };
const snapshot = () => `${window.location.search}${window.location.hash}`;
const serverSnapshot = () => "";
function subscribe(notify: () => void) {
  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);
  window.addEventListener(EVENT, notify);
  window.addEventListener(OAUTH_RESTORE_EVENT, notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener("hashchange", notify);
    window.removeEventListener(EVENT, notify);
    window.removeEventListener(OAUTH_RESTORE_EVENT, notify);
  };
}
function scrollToPosition(position: Position) {
  if (position.target && position.target !== "page-top") {
    document.getElementById(position.target)?.scrollIntoView({ block: "start", behavior: "instant" });
  } else {
    window.scrollTo({ top: position.y ?? 0, behavior: "instant" });
  }
}

/** URL-backed local views: Back/Forward must agree with the rendered screen. */
export default function useArenaNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const location = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const view: View = new URLSearchParams(location.split("#")[0]).get("view") === "console" ? "console" : "home";

  useLayoutEffect(() => {
    // Fragments never reach the server. Preserve previously shared homepage
    // anchors with a client redirect to the new, independently rendered route.
    const legacyTargets: Record<string, string> = {
      "#arena-section": "/arena",
      "#champions-section": "/champions",
      "#how-it-works-section": "/champions#how-it-works-section",
    };
    const legacyTarget = pathname === "/" && legacyTargets[window.location.hash];
    const query = new URLSearchParams(window.location.search);
    if (legacyTarget && view !== "console" && !query.has("code") && !query.has("error") && !query.has("error_description")) {
      const destination = new URL(legacyTarget, window.location.origin);
      destination.search = window.location.search;
      router.replace(`${destination.pathname}${destination.search}${destination.hash}`);
      return;
    }
    const saved = window.history.state?.[KEY] as Position | undefined;
    // Let Next restore the scroll position on route navigation. Only local
    // Console transitions and explicit section links need our own restoration.
    if (!saved && view !== "console" && !window.location.hash) return;
    const position = saved ?? (view === "console" ? { y: 0 } : { target: window.location.hash.slice(1), y: 0 });
    // React must mount the destination before restoring its position.
    const frame = window.requestAnimationFrame(() => scrollToPosition(position));
    return () => window.cancelAnimationFrame(frame);
  }, [location, view, pathname, router]);

  const navigate = useCallback((nextView: View, target = "page-top", replace = false) => {
    const url = new URL(window.location.href);
    if (nextView === "console") url.searchParams.set("view", "console");
    else url.searchParams.delete("view");
    url.hash = nextView === "home" && target !== "page-top" ? target : "";
    const destination = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const position: Position = nextView === "console" ? { y: 0 } : { target, y: 0 };
    if (destination === current) {
      window.dispatchEvent(new Event(EVENT));
      scrollToPosition(position);
      return;
    }
    // Preserve Next's internal router state on the entry being left. Pass only
    // our state to pushState so Next's supported History integration runs.
    window.history.replaceState({ ...window.history.state, [KEY]: { y: window.scrollY } }, "", current);
    if (replace) window.history.replaceState({ [KEY]: position }, "", destination);
    else window.history.pushState({ [KEY]: position }, "", destination);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const setView = useCallback((nextView: View, options?: { replace?: boolean }) => {
    navigate(nextView, "page-top", options?.replace);
  }, [navigate]);
  const showHomeSection = useCallback((target = "page-top") => {
    const route = target === "arena-section" ? "/arena"
      : target === "champions-section" || target === "how-it-works-section" ? "/champions" : "/";
    const section = ["arena-section", "champions-section"].includes(target) ? "page-top" : target;
    if (window.location.pathname === route) navigate("home", section);
    else router.push(`${route}${section === "page-top" ? "" : `#${section}`}`);
  }, [navigate, router]);
  return { currentView: view, setCurrentView: setView, showHomeSection };
}
