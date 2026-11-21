"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Bracket, Match, Product } from "@/lib/mockData";
import { catalogueProducts, refreshCatalogue, type CataloguePage } from "@/lib/cataloguePages";
import { getActiveRound, getBracketSize, getInitialRoundNumber, getRoundMatches, loadBracket, loadProducts } from "@/lib/arenaStore";
import { supabase } from "@/lib/supabaseClient";

export function firstOpenBracketMatch(bracket: Bracket): Match | null {
  const round = bracket.status === "active"
    ? getActiveRound(bracket)
    : getInitialRoundNumber(getBracketSize(bracket));
  const matches = getRoundMatches(bracket, round);
  return matches.find((match) => !match.winnerId) || matches[0] || null;
}

type Scope = "discover" | "arena" | "champions" | "console" | "free" | "paid";

export default function usePublicArenaData(
  scope: Scope, initialPages: CataloguePage[] | undefined, initialProducts: Product[],
  initialPastChampions: Product[], initialBracket: Bracket | null,
) {
  const [products, setProducts] = useState(() => initialPages ? catalogueProducts(initialPages) : initialProducts);
  const [pastChampions, setPastChampions] = useState(initialPastChampions);
  const [bracket, setBracket] = useState(initialBracket);
  const [activeMatch, setActiveMatch] = useState(() => initialBracket && firstOpenBracketMatch(initialBracket));
  const [publicSyncError, setPublicSyncError] = useState<string | null>(null);
  const [isPublicSyncPending, setIsPublicSyncPending] = useState(false);
  const pages = useRef(initialPages ?? []);
  const pending = useRef<AbortController | null>(null);
  const lastSuccess = useRef(0);
  const isResettingRef = useRef(false);
  const isSyncLockedRef = useRef(false);
  const votePendingRef = useRef(false);
  const publicRevisionRef = useRef(0);

  const syncCloudData = useCallback(async () => {
    if (scope === "paid" || isResettingRef.current || isSyncLockedRef.current || votePendingRef.current || pending.current) return;
    if (!supabase) {
      setProducts(loadProducts());
      const saved = loadBracket();
      setBracket(saved);
      setActiveMatch(saved && firstOpenBracketMatch(saved));
      return;
    }
    if (Date.now() - lastSuccess.current < 1000) return;
    const controller = new AbortController();
    pending.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
    const revision = publicRevisionRef.current;
    setIsPublicSyncPending(true);
    try {
      const activityView = scope === "discover" || scope === "console" ? "bracket" : scope;
      const activity = scope === "free" ? Promise.resolve({}) : fetch("/api/arena/activity?view=" + activityView, { signal })
        .then(async response => {
          if (!response.ok) throw new Error("Unable to refresh the Arena.");
          return response.json();
        });
      const [updated, live]: [CataloguePage[], { bracket?: Bracket | null; champions?: Product[] }] = await Promise.all([
        scope === "champions" ? pages.current : refreshCatalogue(pages.current, signal), activity,
      ]);
      if (controller.signal.aborted || isSyncLockedRef.current || votePendingRef.current || revision !== publicRevisionRef.current) return;
      if (updated !== pages.current) {
        pages.current = updated;
        setProducts(catalogueProducts(updated));
      }
      if (live.champions) setPastChampions(live.champions);
      if (live.bracket !== undefined) {
        const next = live.bracket;
        setBracket(next);
        setActiveMatch(current => next && (getRoundMatches(next, getActiveRound(next)).find(match => match.id === current?.id) ?? firstOpenBracketMatch(next)));
      }
      lastSuccess.current = Date.now();
      setPublicSyncError(null);
    } catch (failure) {
      if (!controller.signal.aborted) setPublicSyncError(failure instanceof Error && failure.message.startsWith("Unable to refresh")
        ? failure.message : "Unable to refresh products.");
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setIsPublicSyncPending(false);
      }
    }
  }, [scope]);

  useEffect(() => {
    if (scope === "paid") return;
    lastSuccess.current = 0;
    const frame = requestAnimationFrame(() => void syncCloudData());
    const refresh = () => { if (supabase && document.visibilityState === "visible") void syncCloudData(); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      pending.current?.abort();
      pending.current = null;
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [scope, syncCloudData]);

  return { products, setProducts, pastChampions, setPastChampions, bracket, setBracket, activeMatch, setActiveMatch,
    publicSyncError, isPublicSyncPending, syncCloudData, isResettingRef, isSyncLockedRef, votePendingRef, publicRevisionRef };
}
