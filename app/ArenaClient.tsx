"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import Link from "@/app/components/NavigationLink";
import useModalAccessibility from "@/app/components/useModalAccessibility";
import usePublicArenaData, { firstOpenBracketMatch } from "./components/usePublicArenaData";
import type { CataloguePage } from "@/lib/cataloguePages";
import useHomeMotion from "@/app/components/useHomeMotion";
import useArenaNavigation from "@/app/components/useArenaNavigation";
import AuthProviderButton from "@/app/components/AuthProviderButton";
import ProductFields from "./submit/ProductFields";
import useProductSubmission, { OAUTH_SUBMIT_DRAFT_KEY } from "./submit/useProductSubmission";
import { gsap } from "gsap";
import { withDeadline } from "@/lib/requestSafety";
import { Product, Match, Bracket } from "@/lib/mockData";
import {
  loadProducts,
  saveProducts,
  saveBracket,
  buildInitialBracket,
  getActiveRound,
  getBracketSize,
  getInitialRoundMatches,
  getInitialRoundNumber,
  getRoundMatches,
  advanceTournamentRound,
  loadLocalPastChampions,
  saveLocalPastChampions
} from "@/lib/arenaStore";
import {
  AuthSessionExpiredError,
  castArenaVote,
  enqueueArenaProduct,
  fetchOwnedArenaProducts,
  requestArenaSettlement,
} from "@/lib/arenaApi";
import { supabase, DB_PREFIX, publicArenaTable } from "@/lib/supabaseClient";
import {
  getMillisecondsToNextNYMidnight,
  getRoundEndAtIso,
  getRoundRemainingMs,
} from "@/lib/timeHelpers";
import InteractiveGrid from "@/app/components/InteractiveGrid";
import ClashLogo from "@/app/components/ClashLogo";
import ClashSculpture from "@/app/components/ClashSculpture";
import MakerConsole from "@/app/components/MakerConsole";
import DiscoverFeed from "./components/DiscoverFeed";
import ArenaBoard from "./arena/ArenaBoard";
import ChampionsSection from "./champions/ChampionsSection";
import PrimaryNavigation, { type MainPage } from "@/app/components/PrimaryNavigation";
import { compareArenaQueue } from "@/lib/discoveryRanking";
import { publicHttpUrl, trustedProductImageUrl } from "@/lib/site";
import { isVisibleProduct, productLinkRel } from "@/lib/productSafety";
import LaunchShareKit from "@/app/components/LaunchShareKit";
import { exchangeOAuthCodeOnce, oauthFailureCode, oauthFailureMessage, OAUTH_RESTORE_EVENT, OAUTH_RETURN_TO_KEY, OAUTH_SUBMISSION_TARGET_KEY, oauthReturnDestination } from "@/lib/browserOAuth";
import { getSubmissionPlan, type SubmissionPlanId } from "@/lib/submissionPlans";
import ServiceFields from "@/app/submit/ServiceFields";
import { useSubmissionAccess } from "@/app/components/SubmissionAccess";

// --- GLOBAL AUDIO UTILITY FOR GEEK HAPTIC SOUNDS ---
let audioCtx: AudioContext | null = null;
const playHaptics = (freq = 220, type: OscillatorType = "sine", duration = 0.08, volume = 0.03) => {
  try {
    if (typeof window === "undefined") return;
    if (!audioCtx) {
      const audioWindow = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextConstructor = window.AudioContext || audioWindow.webkitAudioContext;
      if (!AudioContextConstructor) return;
      audioCtx = new AudioContextConstructor();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    // Suppressed gracefully if audio is locked by browser
  }
};




const PlusIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const XIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const GitCommitIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="4" />
    <line x1="1.05" y1="12" x2="7" y2="12" />
    <line x1="17" y1="12" x2="22.95" y2="12" />
  </svg>
);

interface ArenaClientProps {
  page?: Exclude<MainPage, "resources">;
  submissionPlan?: SubmissionPlanId;
  paidOrderId?: string;
  initialSubmissionDraft?: Record<string, unknown> | null;
  initialPages?: CataloguePage[];
  initialProducts: Product[];
  initialPastChampions: Product[];
  initialBracket: Bracket | null;
}

type DatabaseRecord = Record<string, unknown>;

interface StoredVoteRecord {
  id?: string;
  match_id?: string;
  product_a_id?: string;
  product_b_id?: string;
  voted_product_id?: string;
  voter_username?: string;
  voter_auth_type?: string;
  feedback_winner?: string;
  feedback_loser?: string;
  created_at?: string;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function ArenaClient({
  page = "discover",
  submissionPlan,
  paidOrderId,
  initialSubmissionDraft,
  initialPages,
  initialProducts,
  initialPastChampions,
  initialBracket
}: ArenaClientProps) {
  const router = useRouter();
  const { requestSubmission } = useSubmissionAccess();
  const selectedSubmissionPlan = getSubmissionPlan(submissionPlan);
  const isSubmissionPage = Boolean(selectedSubmissionPlan);
  const isPaidSubmission = Boolean(selectedSubmissionPlan?.price);
  const SubmissionContainer = isSubmissionPage ? "main" : "div";
  const arenaRootRef = useRef<HTMLDivElement | null>(null);
  const authDialogRef = useRef<HTMLDivElement | null>(null);
  const voteDialogRef = useRef<HTMLDivElement | null>(null);
  const successDialogRef = useRef<HTMLDivElement | null>(null);
  const authStartingRef = useRef(false);
  const [signingInProvider, setSigningInProvider] = useState<string | null>(null);
  const { currentView, focusedOrderId, setCurrentView, showHomeSection } = useArenaNavigation();
  const scope = isPaidSubmission ? "paid" : isSubmissionPage ? "free" : currentView === "console" ? "console" : page;
  const { products, setProducts, bracket, setBracket, activeMatch, setActiveMatch, pastChampions, setPastChampions,
    publicSyncError, isPublicSyncPending, syncCloudData, isResettingRef, isSyncLockedRef, votePendingRef,
    publicRevisionRef } = usePublicArenaData(scope, initialPages, initialProducts, initialPastChampions, initialBracket);
  const isMuted = false;
  const synthClick = (freq = 300, type: OscillatorType = "sine", duration = 0.06, vol = 0.02) => {
    if (!isMuted) {
      playHaptics(freq, type, duration, vol);
    }
  };
  const [toasts, setToasts] = useState<{ id: string; message: string; type?: "success" | "info" }[]>([]);
  const pushToast = useCallback((message: string, type: "success" | "info" = "success") => {
    const id = Math.random().toString(36).substring(4);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);
  const [activeMatchCritiques, setActiveMatchCritiques] = useState<Array<{
    id: string;
    voter: string;
    provider: string;
    role: string;
    text: string;
    date: string;
  }>>([]);
  // Screen shake animation state
  const [isShaking, setIsShaking] = useState(false);

  // Visual dynamic clashing swords animation key state
  const [isSwordsClashing, setIsSwordsClashing] = useState(false);

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [publishedProduct, setPublishedProduct] = useState<Product | null>(null);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [activeCardProduct, setActiveCardProduct] = useState<Product | null>(null);
  const openSubmissionPage = () => {
    void requestSubmission();
  };

  // Vote Modal State with Dual-Input Feedback Loop
  const [votingMatch, setVotingMatch] = useState<Match | null>(null);
  const [votingTarget, setVotingTarget] = useState<Product | null>(null);
  const [voteWinnerFeedback, setVoteWinnerFeedback] = useState("");
  const [voteLoserFeedback, setVoteLoserFeedback] = useState("");
  const [voteError, setVoteError] = useState("");
  const [isVoting, setIsVoting] = useState(false);
  
  // User simulated login
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [mockUserTwitter, setMockUserTwitter] = useState("");
  const [userAuthType, setUserAuthType] = useState<"google" | "github" | null>(null);
  const [userSupabaseId, setUserSupabaseId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [authReady, setAuthReady] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutPendingRef = useRef(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [ownership, setOwnership] = useState<{ userId: string; status: "loading" | "ready" | "error"; ids: string[]; products: Product[]; error?: string }>({ userId: "", status: "loading", ids: [], products: [] });
  const [ownershipRevision, setOwnershipRevision] = useState(0);
  const retryOwnership = useCallback(() => setOwnershipRevision((value) => value + 1), []);
  useEffect(() => {
    const onSessionExpired = () => {
      setUserLoggedIn(false);
      setUserSupabaseId("");
      setUserEmail("");
      setMockUserTwitter("");
      setUserAuthType(null);
      setOwnership({ userId: "", status: "error", ids: [], products: [] });
      try { localStorage.removeItem("ship_duel_sandbox_user"); } catch { /* Private browsing may restrict storage. */ }
    };
    window.addEventListener("indieclash:auth-expired", onSessionExpired);
    return () => window.removeEventListener("indieclash:auth-expired", onSessionExpired);
  }, []);
  useEffect(() => {
    if (isPaidSubmission || !supabase || !userSupabaseId || !userLoggedIn) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setOwnership((previous) => ({ userId: userSupabaseId, status: "loading", ids: previous.userId === userSupabaseId ? previous.ids : [], products: previous.userId === userSupabaseId ? previous.products : [] }));
      try {
        const result = await fetchOwnedArenaProducts();
        if (active) setOwnership({ userId: userSupabaseId, status: "ready", ids: result.productIds, products: result.products });
      } catch (error) {
        if (error instanceof AuthSessionExpiredError) return;
        if (active) setOwnership((previous) => ({ ...previous, status: "error", error: error instanceof Error ? error.message : "Please try again." }));
      }
    });
    return () => { active = false; };
  }, [isPaidSubmission, userSupabaseId, userLoggedIn, ownershipRevision]);

  const consoleProducts = useMemo(() => {
    if (!supabase) return products;
    if (ownership.userId !== userSupabaseId || !userLoggedIn) return [];
    const catalog = new Map(products.map((product) => [product.id, product]));
    const privateRows = new Map(ownership.products.map((product) => [product.id, product]));
    return ownership.ids.flatMap((id) => {
      const product = privateRows.get(id) || catalog.get(id);
      const card = catalog.get(id);
      if (card?.moderationStatus === "restricted") return [{ ...card, creator_uid: userSupabaseId }];
      return product ? [{ ...product, ...(card && { votesCount: card.votesCount, queueStatus: card.queueStatus,
        arenaEnqueued: card.arenaEnqueued, arenaEnqueuedAt: card.arenaEnqueuedAt, qualifiedImpressions: card.qualifiedImpressions,
        discoveryBoostUntil: card.discoveryBoostUntil }), creator_uid: userSupabaseId }] : [];
    });
  }, [ownership, products, userSupabaseId, userLoggedIn]);

  useEffect(() => {
    const resumeFromProvider = () => {
      authStartingRef.current = false;
      setSigningInProvider(null);
    };
    window.addEventListener("pageshow", resumeFromProvider);
    return () => window.removeEventListener("pageshow", resumeFromProvider);
  }, []);

  const handleUserSession = useCallback((authUser: User) => {
    setUserLoggedIn(true);
    setUserSupabaseId(authUser.id || "");
    setUserEmail(authUser.email || "");
    const provider = authUser.app_metadata?.provider || authUser.identities?.[0]?.provider || "github";
    setUserAuthType(provider === "google" ? "google" : "github");

    let username = "";
    if (provider === "github") {
      const gitUser = authUser.user_metadata?.preferred_username || authUser.user_metadata?.user_name || authUser.email?.split("@")[0] || "github_user";
      username = gitUser.startsWith("@") ? gitUser : `@${gitUser}`;
    } else {
      username = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email || "google_user";
    }
    setMockUserTwitter(username);

    localStorage.setItem("ship_duel_sandbox_user", JSON.stringify({
      userLoggedIn: true,
      mockUserTwitter: username,
      userAuthType: provider === "google" ? "google" : "github",
      userSupabaseId: authUser.id || "",
      userEmail: authUser.email || ""
    }));

  }, []);

  // Supabase Authentication session listener
  useEffect(() => {
    const authClient = supabase;
    if (!authClient) {
      const savedSandbox = localStorage.getItem("ship_duel_sandbox_user");
      let restoreTimer: number | undefined;
      if (savedSandbox) {
        try {
          const parsed = JSON.parse(savedSandbox);
          if (parsed.userLoggedIn) {
            restoreTimer = window.setTimeout(() => {
              setUserLoggedIn(true);
              setMockUserTwitter(String(parsed.mockUserTwitter || ""));
              setUserAuthType(parsed.userAuthType === "google" ? "google" : "github");
              setUserSupabaseId(String(parsed.userSupabaseId || ""));
              setUserEmail(String(parsed.userEmail || ""));
            }, 0);
          }
        } catch (e) {
          console.warn("Failed to parse sandbox session from localStorage:", e);
        }
      }
      const readyTimer = window.setTimeout(() => setAuthReady(true), 0);
      return () => {
        window.clearTimeout(readyTimer);
        if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
      };
    }
    let active = true;
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const code = url.searchParams.get("code");
    const callbackError = url.searchParams.get("error_code") || fragment.get("error_code") || url.searchParams.get("error") || fragment.get("error");
    const callbackDescription = url.searchParams.get("error_description") || fragment.get("error_description");
    const isCallback = Boolean(code || callbackError || callbackDescription);

    const restoreAfterOAuth = (failureCode?: string) => {
      let requestedReturn: string | null = null;
      let submissionTarget: string | null = null;
      try {
        requestedReturn = sessionStorage.getItem(OAUTH_RETURN_TO_KEY);
        submissionTarget = sessionStorage.getItem(OAUTH_SUBMISSION_TARGET_KEY);
        sessionStorage.removeItem(OAUTH_RETURN_TO_KEY);
        sessionStorage.removeItem(OAUTH_SUBMISSION_TARGET_KEY);
      } catch { /* A missing saved context must not hide the sign-in result. */ }
      const destination = oauthReturnDestination(requestedReturn || `${url.pathname}${url.search}${url.hash}`, submissionTarget, Boolean(failureCode), url.origin);
      // OAuth may return through the homepage. Load the original route before
      // restoring its form or Console; changing the address alone leaves the
      // wrong page mounted when signing in from Arena or Champions.
      const returnUrl = new URL(destination, url.origin);
      if (returnUrl.pathname !== window.location.pathname) {
        // Carry cancellation/failure feedback to the route that opened login.
        if (failureCode) returnUrl.searchParams.set("error", failureCode);
        router.replace(`${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
        return;
      }
      window.history.replaceState(window.history.state, "", destination);
      window.dispatchEvent(new Event(OAUTH_RESTORE_EVENT));
    };

    const recoverSession = async () => {
      let failureCode: string | undefined;
      try {
        if (callbackError || callbackDescription) throw { code: callbackError, message: callbackDescription };
        if (isCallback && !code) throw new Error("Missing sign-in code");
        // The exchange has a transport timeout. Wait for the SDK to finish
        // before consuming the return path or reporting a sign-in result.
        const result = code
          ? await exchangeOAuthCodeOnce(authClient, code)
          : await withDeadline(authClient.auth.getSession(), 15_000);
        if (result.error) {
          const isStaleToken =
            result.error.message?.toLowerCase().includes("refresh token") ||
            (result.error as { code?: string })?.code === "refresh_token_not_found";
          if (isStaleToken && !isCallback) {
            await authClient.auth.signOut({ scope: "local" }).catch(() => {});
            return;
          }
          throw result.error;
        }
        if (code && !result.data.session) throw new Error("Missing sign-in session");
        if (!active) return;
        if (result.data.session?.user) handleUserSession(result.data.session.user);
        if (isCallback) {
          setIsAuthOpen(false);
          setAuthError(null);
          pushToast("Signed in successfully.");
        }
      } catch (error) {
        const isStaleToken =
          error &&
          typeof error === "object" &&
          "message" in error &&
          typeof (error as { message?: unknown }).message === "string" &&
          ((error as { message: string }).message.toLowerCase().includes("refresh token"));
        if (isStaleToken && !isCallback) {
          await authClient.auth.signOut({ scope: "local" }).catch(() => {});
        } else {
          failureCode = oauthFailureCode(error);
          if (active && isCallback) setAuthError(oauthFailureMessage(error));
        }
      } finally {
        if (active) {
          if (isCallback) restoreAfterOAuth(failureCode);
          setAuthReady(true);
        }
      }
    };
    void recoverSession();

    // 3. Listen for auth changes.
    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const { data } = authClient.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          handleUserSession(session.user);
        } else if (event === "SIGNED_OUT") {
          setUserLoggedIn(false);
          setUserSupabaseId("");
          setMockUserTwitter("");
          setUserAuthType(null);
          if (typeof window !== "undefined") {
            localStorage.removeItem("ship_duel_sandbox_user");
          }
        }
      });
      subscription = data.subscription;
    } catch (err) {
      console.warn("Supabase onAuthStateChange init warning:", err);
    }

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [handleUserSession, pushToast, router]);

  const handleSandboxLogin = (provider: "google" | "github") => {
    const mockUser = provider === "google" ? "Google_Hacker_Sandbox" : "@GitHub_Indie_Sandbox";
    const mockId = provider === "google" ? "mock_google_supabase_id" : "mock_github_supabase_id";
    setUserLoggedIn(true);
    setMockUserTwitter(mockUser);
    setUserAuthType(provider);
    setUserSupabaseId(mockId);
    setIsAuthOpen(false);
    
    if (typeof window !== "undefined") {
      localStorage.setItem("ship_duel_sandbox_user", JSON.stringify({
        userLoggedIn: true,
        mockUserTwitter: mockUser,
        userAuthType: provider,
        userSupabaseId: mockId
      }));
    }
  };

  const beginOAuthSignIn = async (provider: "google" | "github") => {
    if (authStartingRef.current || !authReady) return;
    authStartingRef.current = true;
    setSigningInProvider(provider);
    setAuthError(null);
    let leavingForProvider = false;
    try {
    if (!supabase) {
      handleSandboxLogin(provider);
      return;
    }

    if (isSubmitOpen && !preserveOAuthDraft()) return;

    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.delete("code");
    returnUrl.searchParams.delete("error");
    returnUrl.searchParams.delete("error_code");
    returnUrl.searchParams.delete("error_description");
    if (isSubmitOpen) returnUrl.searchParams.set("submit", "1");
    if (currentView === "console" || (isSubmitOpen && submitSource === "console")) {
      returnUrl.searchParams.set("view", "console");
    }
    const returnTo = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
    sessionStorage.setItem(OAUTH_RETURN_TO_KEY, returnTo);
    sessionStorage.removeItem(OAUTH_SUBMISSION_TARGET_KEY);
    const callbackUrl = new URL("/auth/callback", window.location.origin);

    const { data, error } = await withDeadline(supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl.toString(),
        skipBrowserRedirect: true,
      },
    }), 15_000);
    if (error || !data?.url) {
      sessionStorage.removeItem(OAUTH_RETURN_TO_KEY);
      sessionStorage.removeItem(OAUTH_SUBMIT_DRAFT_KEY);
      const message = error?.message || `Unable to start ${provider} verification.`;
      if (isSubmitOpen) setSubmitError(message);
      pushToast(message, "info");
      return;
    }

    // Use the current tab so the PKCE verifier remains in the same browser
    // context. The callback restores this exact route, hash, and submit draft.
    window.location.assign(data.url);
    leavingForProvider = true;
    } catch {
      const message = "Unable to open sign-in. Please check your connection and try again.";
      if (isSubmitOpen) setSubmitError(message);
      pushToast(message, "info");
    } finally {
      // Keep the control locked while the browser is leaving for the provider.
      // A normal error/no-provider path can be retried immediately.
      if (!leavingForProvider) {
        authStartingRef.current = false;
        setSigningInProvider(null);
      }
    }
  };

  const handleLogout = async () => {
    if (logoutPendingRef.current || submitPendingRef.current || votePendingRef.current) return;
    logoutPendingRef.current = true;
    setIsLoggingOut(true);
    try {
    if (supabase) {
      const { error } = await withDeadline(supabase.auth.signOut(), 10_000);
      if (error) throw error;
    }
    
    // Forcefully clean up client state in all scenarios (live & local sandbox fallback)
    setUserLoggedIn(false);
    setMockUserTwitter("");
    setUserAuthType(null);
    setUserSupabaseId("");
    setUserEmail("");
    setCurrentView("home", { replace: true });
    if (typeof window !== "undefined") {
      try { localStorage.removeItem("ship_duel_sandbox_user"); } catch {}
    }
    } catch {
      pushToast("Sign-out could not finish. Please retry; your session may still be active.", "info");
    } finally { logoutPendingRef.current = false; setIsLoggingOut(false); }
  };
  
  // Custom Success Modal States
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [successModalTitle, setSuccessModalTitle] = useState("");
  const [successModalText, setSuccessModalText] = useState("");
  
  const { fields, isSubmitOpen, setIsSubmitOpen, submitSource, submitPendingRef, isSubmittingProduct, isSavingDraft,
    returnToDashboard, changeSubmissionPlan, openEditProduct, closeSubmitModal, submitDialogRef, editingProduct,
    submitError, setSubmitError, serviceDetails, setServiceDetails, normalizedProductUrl, duplicateProduct,
    preparingScreenshot, savePaidDraft, saveSubmissionDraft, preserveOAuthDraft, handleSubmitProduct } = useProductSubmission({
    submissionPlan, paidOrderId, initialSubmissionDraft, userLoggedIn, mockUserTwitter, userSupabaseId,
    products, setProducts, retryOwnership, syncCloudData, isSyncLockedRef, publicRevisionRef, setIsAuthOpen,
    synthClick, pushToast, onPublished(newProd) {
        setPublishedProduct(newProd);
        setSuccessModalTitle("Your product is live");
        setSuccessModalText("Share your profile with people who could use it. You can join the Arena from Dashboard.");
        setIsSuccessOpen(true);
    },
  });

  // New York countdown & 3-2-1-1 active timer states
  const [countdownToMidnightMs, setCountdownToMidnightMs] = useState<number>(0);
  const [activeRoundRemainingMs, setActiveRoundRemainingMs] = useState<number>(0);
  

  // Keep latestBracketRef synchronized with bracket state to avoid closure staleness
  const latestBracketRef = useRef<Bracket | null>(null);
  const isRolloverPendingRef = useRef(false);
  const isSettleRequestedRef = useRef(false);
  useEffect(() => {
    latestBracketRef.current = bracket;
  }, [bracket]);

  // Load critiques for the active match dynamically from Supabase or localStorage
  useEffect(() => {
    if (!activeMatch || page !== "arena" || currentView !== "home" || isSubmissionPage) {
      const clearTimer = window.setTimeout(() => setActiveMatchCritiques([]), 0);
      return () => window.clearTimeout(clearTimer);
    }
    let cancelled = false;

    const loadCritiques = async () => {
      if (supabase) {
        const { data: votes, error } = await supabase
          .from(publicArenaTable("votes"))
          .select("*")
          .eq(`${DB_PREFIX}match_id`, activeMatch.id)
          .order(`${DB_PREFIX}created_at`, { ascending: false });
        
        if (!error && votes) {
          const mapped = votes.map(v => {
            const isWinner = activeMatch?.productA && v[`${DB_PREFIX}voted_product_id`] === activeMatch.productA.id;
            const rawProvider = v[`${DB_PREFIX}voter_auth_type`];
            const provider = rawProvider === "twitter" ? "google" : rawProvider;
            return {
              id: v[`${DB_PREFIX}id`] || `vote-${Math.random()}`,
              voter: v[`${DB_PREFIX}voter_username`],
              provider: provider,
              role: isWinner ? "Winner (Voted For)" : "Loser (Opponent Voted For)",
              text: isWinner ? v[`${DB_PREFIX}feedback_winner`] : v[`${DB_PREFIX}feedback_loser`],
              date: new Date(v[`${DB_PREFIX}created_at`] || Date.now()).toLocaleDateString()
            };
          });
          if (!cancelled) setActiveMatchCritiques(mapped);
        }
      } else {
        // Local mode
        const localVotesStr = localStorage.getItem("arena_votes_v1") || "[]";
        const localVotes = JSON.parse(localVotesStr) as StoredVoteRecord[];
        const filtered = localVotes.filter(v => v.match_id === activeMatch.id);
        const mapped = filtered.map(v => {
          const isWinner = activeMatch?.productA && v.voted_product_id === activeMatch.productA.id;
          return {
            id: v.id || `vote-${Math.random()}`,
            voter: v.voter_username || "Community member",
            provider: v.voter_auth_type || "github",
            role: isWinner ? "Winner (Voted For)" : "Loser (Opponent Voted For)",
            text: (isWinner ? v.feedback_winner : v.feedback_loser) || "No critique was provided.",
            date: new Date(v.created_at || Date.now()).toLocaleDateString()
          };
        });
        if (!cancelled) setActiveMatchCritiques(mapped);
      }
    };

    void loadCritiques();
    return () => {
      cancelled = true;
    };
  }, [activeMatch, page, currentView, isSubmissionPage]);

  // Local sandbox rollover. Cloud rollover is serialized by the settlement API.
  const tryAutoRollover = useCallback((currentProducts: Product[]) => {
    if (supabase) {
      isRolloverPendingRef.current = false;
      return;
    }
    const waitingQueue = currentProducts.filter(
      p => p.queueStatus === "waiting" && (p.arenaEnqueued ?? (!p.makerAvatar || !p.makerAvatar.includes("pushed=false")))
    );
    if (waitingQueue.length >= 16) {
      isRolloverPendingRef.current = true;
      setTimeout(() => {
        const { bracket: newB, updatedProducts: newProds } = buildInitialBracket([...currentProducts]);
        setProducts(newProds);
        setBracket(newB);
        setActiveMatch(firstOpenBracketMatch(newB));
        pushToast("New season started automatically! 16 products matched.", "success");
        saveProducts(newProds);
        saveBracket(newB);
        isSyncLockedRef.current = false;
        isRolloverPendingRef.current = false;
      }, 3000);
    } else {
      isRolloverPendingRef.current = false;
    }
  }, [pushToast]);

  // Master Clock & Settle & Simulated Votes Loop
  useEffect(() => {
    if (isSubmissionPage) return;
    const timer = setInterval(() => {
      // A. Active bracket countdown and automatic round settlement
      if (bracket && bracket.status === "preparing") {
        const explicitStart = bracket.roundEndsAt ? new Date(bracket.roundEndsAt).getTime() - Date.now() : Number.NaN;
        const ms = Number.isFinite(explicitStart) ? Math.max(0, explicitStart) : getMillisecondsToNextNYMidnight(bracket.roundStartedAt);
        setCountdownToMidnightMs(ms);
        
        if (ms <= 0) {
          if (!supabase) {
            const activeBracket = {
              ...bracket,
              status: "active" as const,
              roundStartedAt: new Date().toISOString(),
              roundEndsAt: getRoundEndAtIso(getInitialRoundNumber(getBracketSize(bracket))),
            };
            setBracket(activeBracket);
            setActiveMatch(firstOpenBracketMatch(activeBracket));
            saveBracket(activeBracket);
          } else {
            // Trigger JIT start for preparing bracket
            if (userLoggedIn && !isSettleRequestedRef.current) {
              isSettleRequestedRef.current = true;
              requestArenaSettlement()
                .then(() => {
                  syncCloudData();
                })
                .catch(err => console.error("[INDIE CLASH] JIT Season Start error:", err))
                .finally(() => {
                  setTimeout(() => {
                    isSettleRequestedRef.current = false;
                  }, 10000);
                });
            }
          }
        }
      }
      
      if (bracket && bracket.status === "active") {
        const roundNum = getActiveRound(bracket);
        const ms = getRoundRemainingMs(roundNum, bracket.roundStartedAt || new Date().toISOString(), bracket.roundEndsAt);
        setActiveRoundRemainingMs(ms);
        
        if (ms <= 0) {
          if (!supabase) {
            const advanced = advanceTournamentRound(bracket);
            
            if (advanced.status === "completed" && advanced.winner) {
              const champ = advanced.winner;
              if (getBracketSize(advanced) === 16) {
                setPastChampions(prev => {
                  if (prev.some(x => x.id === champ.id)) return prev;
                  return [...prev, champ];
                });
                const localChamps = loadLocalPastChampions();
                if (!localChamps.some(c => c.id === champ.id)) {
                  localChamps.push(champ);
                  saveLocalPastChampions(localChamps);
                }
              }
              setBracket(null);
              setActiveMatch(null);
              saveBracket(null);
              // Auto-rollover for local mode
              const latestProds = loadProducts();
              tryAutoRollover(latestProds);
            } else {
              setBracket(advanced);
              setActiveMatch(firstOpenBracketMatch(advanced));
              saveBracket(advanced);
            }
          } else {
            // Trigger JIT settlement for active bracket
            if (userLoggedIn && !isSettleRequestedRef.current) {
              isSettleRequestedRef.current = true;
              requestArenaSettlement()
                .then(() => {
                  syncCloudData();
                })
                .catch(err => console.error("[INDIE CLASH] JIT Settle error:", err))
                .finally(() => {
                  setTimeout(() => {
                    isSettleRequestedRef.current = false;
                  }, 10000);
                });
            }
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isSubmissionPage, bracket, activeMatch, syncCloudData, tryAutoRollover, userLoggedIn]);

  // Generate 20 Mock Showcase Products Helper
  const generateMockShowcaseProducts = (count = 20): Product[] => {
    const list: Product[] = [];
    for (let i = 0; i < count; i++) {
      const names = ["Oliver", "Emma", "Sophia", "James", "Mia", "Leo", "John", "David", "Grace", "Jack", "Alex", "Zoe", "Ryan", "Chloe", "Luke", "Harper", "Aria", "Ben", "Ava", "Mason"];
      const projects = ["TaskPulse", "Designify", "MailSniper", "ScribeAI", "SchemaForge", "FormFlow", "IconSpark", "DocuGen", "SiteFlow", "SpeedPDF", "LaunchKit", "TypeBoost", "FastAPI", "DevFlow", "CodeSync", "BugSlayer", "GitMap", "FileShrink", "CssGen", "FlexGrid"];
      const taglines = [
        "Elegant micro-utility that designs beautiful typography layouts in 10 seconds.",
        "Ultra-minimalist 24h cold outreach email sender and queue monitor.",
        "Ultimate local-first client to compress and convert PDFs and videos with zero server delay.",
        "Keyboard-centric floating speed-dial overlay built specifically for Figma power users.",
        "Convert your hand-drawn notebook sketches into clean raw SVG vector code instantly.",
        "7-day personal bookkeeping dashboard with rich charts and high-end visual stats."
      ];
      const emojis = ["🍎", "🚀", "⚡", "🍀", "🧠", "📦", "🧩", "🎯", "🥑", "🔮", "✨", "📡"];

      const randomName = names[Math.floor(Math.random() * names.length)];
      const randomProject = projects[Math.floor(Math.random() * projects.length)] + " " + emojis[Math.floor(Math.random() * emojis.length)] + " " + (i + 1);
      const randomTagline = taglines[Math.floor(Math.random() * taglines.length)];
      const randomId = `p_dummy_${Date.now()}_${i}_${Math.floor(Math.random() * 1000000)}`;

      const newProduct: Product = {
        id: randomId,
        title: randomProject,
        tagline: randomTagline,
        url: `https://${randomProject.toLowerCase().replace(/\s/g, "").replace(/[^a-z0-9]/g, "")}.xyz`,
        makerName: randomName,
        makerTwitter: `@${randomName.toLowerCase()}_ship`,
        makerAvatar: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 500000)}?w=100&h=100&fit=crop&crop=faces#pushed=false`,
        logo: emojis[Math.floor(Math.random() * emojis.length)],
        submittedAt: new Date().toISOString(),
        queueStatus: "waiting",
        votesCount: 0
      };

      list.push(newProduct);
    }
    return list;
  };

  // Reset Sandbox
  const handleReset = () => {
    isResettingRef.current = true;
    localStorage.clear();
    const mockShowcase = generateMockShowcaseProducts(20);
    setProducts(mockShowcase);
    saveProducts(mockShowcase);
    setPastChampions([]);
    setBracket(null);
    setActiveMatch(null);
    setIsSubmitOpen(false);
    setVotingMatch(null);
    setVotingTarget(null);
    setVoteWinnerFeedback("");
    setVoteLoserFeedback("");

    if (supabase) {
      isResettingRef.current = false;
      pushToast("Cloud reset is disabled. Use the authenticated admin endpoint.", "info");
      syncCloudData();
    } else {
      isResettingRef.current = false;
      pushToast("Local sandbox reset successfully!", "success");
    }
  };

  // Inject 16 Arena Competitors
  const handleInject16 = () => {
    // Acquire Sync Lock to prevent race condition pullbacks
    isSyncLockedRef.current = true;
    
    const currentProducts = [...products];
    const newAdded: Product[] = [];
    
    for (let i = 0; i < 16; i++) {
      const names = ["Oliver", "Emma", "Sophia", "James", "Mia", "Leo", "John", "David", "Grace", "Jack", "Alex", "Zoe", "Ryan", "Chloe", "Luke", "Harper", "Aria", "Ben", "Ava", "Mason"];
      const projects = ["TaskPulse", "Designify", "MailSniper", "ScribeAI", "SchemaForge", "FormFlow", "IconSpark", "DocuGen", "SiteFlow", "SpeedPDF", "LaunchKit", "TypeBoost", "FastAPI", "DevFlow", "CodeSync", "BugSlayer", "GitMap", "FileShrink", "CssGen", "FlexGrid"];
      const taglines = [
        "Elegant micro-utility that designs beautiful typography layouts in 10 seconds.",
        "Ultra-minimalist 24h cold outreach email sender and queue monitor.",
        "Ultimate local-first client to compress and convert PDFs and videos with zero server delay.",
        "Keyboard-centric floating speed-dial overlay built specifically for Figma power users.",
        "Convert your hand-drawn notebook sketches into clean raw SVG vector code instantly.",
        "7-day personal bookkeeping dashboard with rich charts and high-end visual stats."
      ];
      const emojis = ["🍎", "🚀", "⚡", "🍀", "🧠", "📦", "🧩", "🎯", "🥑", "🔮", "✨", "📡"];

      const randomName = names[Math.floor(Math.random() * names.length)];
      const randomProject = projects[Math.floor(Math.random() * projects.length)] + " " + emojis[Math.floor(Math.random() * emojis.length)] + " " + (i + 1);
      const randomTagline = taglines[Math.floor(Math.random() * taglines.length)];
      const randomId = `p_dummy_${Date.now()}_${i}_${Math.floor(Math.random() * 1000000)}`;

      const newProduct: Product = {
        id: randomId,
        title: randomProject,
        tagline: randomTagline,
        url: `https://${randomProject.toLowerCase().replace(/\s/g, "").replace(/[^a-z0-9]/g, "")}.xyz`,
        makerName: randomName,
        makerTwitter: `@${randomName.toLowerCase()}_ship`,
        makerAvatar: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 500000)}?w=100&h=100&fit=crop&crop=faces`,
        logo: emojis[Math.floor(Math.random() * emojis.length)],
        submittedAt: new Date(Date.now() + i * 1000).toISOString(),
        queueStatus: "waiting",
        votesCount: 0
      };

      currentProducts.push(newProduct);
      newAdded.push(newProduct);
    }

    setProducts(currentProducts);
    saveProducts(currentProducts);

    const startTournament = () => {
      const { bracket: newB, updatedProducts: newProds } = buildInitialBracket(currentProducts);
      setProducts(newProds);
      setBracket(newB);
      setActiveMatch(firstOpenBracketMatch(newB));
      if (supabase) {
        isSyncLockedRef.current = false;
        pushToast("Cloud fixture injection is disabled for safety.", "info");
        syncCloudData();
      } else {
        isSyncLockedRef.current = false;
      }
    };

    if (supabase) {
      isSyncLockedRef.current = false;
      pushToast("Cloud fixture injection is disabled for safety.", "info");
      syncCloudData();
    } else {
      pushToast("16 Arena Competitors successfully injected!");
      if (!bracket && !isRolloverPendingRef.current) {
        setTimeout(startTournament, 300);
      } else {
        isSyncLockedRef.current = false;
      }
    }
  };

  // Inject 20 Mock Competitors
  const handleInject20 = () => {
    // Acquire Sync Lock to prevent race condition pullbacks
    isSyncLockedRef.current = true;

    const newAdded = generateMockShowcaseProducts(20);
    const currentProducts = [...products, ...newAdded];
    setProducts(currentProducts);
    saveProducts(currentProducts);

    if (supabase) {
      isSyncLockedRef.current = false;
      pushToast("Cloud fixture injection is disabled for safety.", "info");
      syncCloudData();
    } else {
      isSyncLockedRef.current = false;
      pushToast("20 Mock Competitors successfully injected (Local)!");
    }
  };

  // Push project to arena waitlist matchmaking queue
  const handlePushToQueue = async (productId: string) => {
    if (isSyncLockedRef.current) throw new Error("Please wait for your current action to finish.");
    publicRevisionRef.current += 1;
    synthClick(300, "sine", 0.05);
    isSyncLockedRef.current = true;
    try {
      if (supabase) {
        const { bracketStarted } = await enqueueArenaProduct(productId);
        pushToast("Product successfully enqueued in matchmaking waitlist!", "success");
        if (bracketStarted) {
          setSuccessModalTitle("CHAMPIONSHIP ROSTER LOCKED ⚔️");
          setSuccessModalText("Sixteen products are now locked into the Championship roster. Voting opens at the next New York midnight, giving every maker the same published start. Sharing is welcome, but bringing an existing audience is never required to be seen here.");
          setIsSuccessOpen(true);
        }
        isSyncLockedRef.current = false;
        await syncCloudData();
        return;
      }

      const updated = products.map(p => {
        if (p.id !== productId) return p;
        return {
          ...p,
          arenaEnqueued: true,
          arenaEnqueuedAt: p.arenaEnqueuedAt || new Date().toISOString(),
          makerAvatar: p.makerAvatar?.replace("pushed=false", "pushed=true") || p.makerAvatar,
        };
      });
      setProducts(updated);
      saveProducts(updated);
      pushToast("Product successfully enqueued in matchmaking waitlist!", "success");

      const queuedList = updated.filter(
        p => p.queueStatus === "waiting" && (p.arenaEnqueued ?? (!p.makerAvatar || !p.makerAvatar.includes("pushed=false"))),
      );
      if (queuedList.length >= 16 && !bracket && !isRolloverPendingRef.current) {
        const { bracket: newBracket, updatedProducts } = buildInitialBracket(updated);
        setProducts(updatedProducts);
        saveProducts(updatedProducts);
        setBracket(newBracket);
        saveBracket(newBracket);
        setActiveMatch(firstOpenBracketMatch(newBracket));
        setSuccessModalTitle("CHAMPIONSHIP ROSTER LOCKED ⚔️");
        setSuccessModalText("Sixteen products are now locked into the Championship roster. Voting opens at the next New York midnight, giving every maker the same published start. Sharing is welcome, but bringing an existing audience is never required for visibility.");
        setIsSuccessOpen(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to enqueue this product.";
      pushToast(message, "info");
      throw error;
    } finally {
      isSyncLockedRef.current = false;
    }
  };
  // Advance Round
  const handleAdvanceRound = () => {
    if (!bracket) return;
    if (supabase) {
      pushToast("Cloud force-advance is disabled. Settlement is handled by the protected server workflow.", "info");
      return;
    }
    
    let updated;
    if (bracket.status === "preparing") {
      // Force start the tournament (skip New York Midnight countdown)
      updated = {
        ...bracket,
        status: "active" as const,
        roundStartedAt: new Date().toISOString(),
        roundEndsAt: getRoundEndAtIso(getInitialRoundNumber(getBracketSize(bracket))),
      };
    } else {
      updated = advanceTournamentRound(bracket);
    }
    
    // Acquire Sync Lock to prevent race condition pullbacks
    isSyncLockedRef.current = true;

    if (updated.status === "completed" && updated.winner) {
      const champ = updated.winner;
      if (getBracketSize(updated) === 16) {
        setPastChampions(prev => {
          if (prev.some(x => x.id === champ.id)) return prev;
          return [...prev, champ];
        });
        const localChamps = loadLocalPastChampions();
        if (!localChamps.some(c => c.id === champ.id)) {
          localChamps.push(champ);
          saveLocalPastChampions(localChamps);
        }
      }
      setBracket(null);
      setActiveMatch(null);
      saveBracket(null);
      isSyncLockedRef.current = false;
      const latestProds = loadProducts();
      tryAutoRollover(latestProds);
    } else {
      setBracket(updated);
      
      setActiveMatch(firstOpenBracketMatch(updated));

      saveBracket(updated);
      isSyncLockedRef.current = false;
    }
  };

  // Submit vote with dual-input feedback
  const handleVoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (votePendingRef.current) return;
    if (!userLoggedIn) {
      synthClick(150, "sawtooth", 0.12);
      setVoteError("Please link your Google or GitHub account first to authorize your vote.");
      return;
    }
    if (voteWinnerFeedback.trim().length < 10 || voteLoserFeedback.trim().length < 10) {
      synthClick(150, "sawtooth", 0.12);
      setVoteError("Dual feedback inputs must both be at least 10 characters long.");
      return;
    }
    if (!bracket || !votingMatch || !votingTarget) return;

    const round = getActiveRound(bracket);

    // Limit to one vote per user per separate 1v1 matchup (within a round)
    const localVoterId = userSupabaseId || mockUserTwitter;
    const alreadyVotedOnThisMatch = votingMatch.votedUserIds?.some(
      id => id === localVoterId || id === mockUserTwitter,
    );
    if (alreadyVotedOnThisMatch) {
      synthClick(180, "sawtooth", 0.1);
      setVoteError("Voting Limit Reached! To ensure fair play, you can only cast ONE vote per separate 1v1 matchup.");
      return;
    }
    votePendingRef.current = true;
    publicRevisionRef.current += 1;
    setIsVoting(true);
    setVoteError("");
    try {
    const voteForA = votingMatch?.productA && votingTarget.id === votingMatch.productA.id;
    let exactVotesA = voteForA ? votingMatch.votesA + 1 : votingMatch.votesA;
    let exactVotesB = voteForA ? votingMatch.votesB : votingMatch.votesB + 1;
    let persistedVoterId = localVoterId;

    if (supabase) {
      try {
        const result = await castArenaVote({
          matchId: votingMatch.id,
          votedProductId: votingTarget.id,
          winnerFeedback: voteWinnerFeedback,
          loserFeedback: voteLoserFeedback,
        });
        exactVotesA = result.votesA;
        exactVotesB = result.votesB;
        persistedVoterId = result.voterId;
      } catch (error) {
        synthClick(180, "sawtooth", 0.1);
        setVoteError(error instanceof Error ? error.message : "Unable to record your vote.");
        return;
      }
    }

    const updateVotes = (matches: Match[]): Match[] => {
      return matches.map(m => {
        if (m.id === votingMatch.id) {
          return {
            ...m,
            votesA: exactVotesA,
            votesB: exactVotesB,
            votedUserIds: m.votedUserIds.includes(persistedVoterId)
              ? m.votedUserIds
              : [...m.votedUserIds, persistedVoterId]
          };
        }
        return m;
      });
    };

    const nextBracket = { ...bracket };
    if (round === 1) nextBracket.round1 = updateVotes(nextBracket.round1);
    else if (round === 2) nextBracket.round2 = updateVotes(nextBracket.round2);
    else if (round === 3) nextBracket.round3 = updateVotes(nextBracket.round3);
    else if (round === 4) nextBracket.round4 = updateVotes(nextBracket.round4);

    setBracket(nextBracket);
    if (!supabase) saveBracket(nextBracket);

    let freshMatch = null;
    if (round === 1) freshMatch = nextBracket.round1.find(m => m.id === votingMatch.id);
    else if (round === 2) freshMatch = nextBracket.round2.find(m => m.id === votingMatch.id);
    else if (round === 3) freshMatch = nextBracket.round3.find(m => m.id === votingMatch.id);
    else if (round === 4) freshMatch = nextBracket.round4.find(m => m.id === votingMatch.id);
    if (freshMatch) setActiveMatch(freshMatch);

    // Trigger physical screen rumble shake & swords clash animations
    synthClick(440, "sine", 0.12, 0.05);
    setIsShaking(true);
    setIsSwordsClashing(true);
    setTimeout(() => {
      setIsShaking(false);
      setIsSwordsClashing(false);
    }, 450);

    // Keep the offline sandbox self-contained. Cloud votes are persisted only by the atomic RPC.
    if (!supabase && typeof window !== "undefined") {
      try {
        const localVotes = JSON.parse(localStorage.getItem("arena_votes_v1") || "[]");
        localVotes.push({
          id: `v_${Date.now()}_${Math.random()}`,
          match_id: freshMatch ? freshMatch.id : votingMatch.id,
          voter_username: mockUserTwitter,
          voter_auth_type: userAuthType,
          voted_product_id: votingTarget.id,
          feedback_winner: voteWinnerFeedback,
          feedback_loser: voteLoserFeedback,
          product_a_id: votingMatch.productA?.id || "",
          product_b_id: votingMatch.productB?.id || "",
          created_at: new Date().toISOString()
        });
        localStorage.setItem("arena_votes_v1", JSON.stringify(localVotes));
      } catch (e) {
        console.error("Local votes storage error:", e);
      }
    }

    let locallyOwnedIds = new Set<string>();
    if (!supabase && typeof window !== "undefined") {
      try {
        locallyOwnedIds = new Set(JSON.parse(localStorage.getItem("my_arena_products") || "[]"));
      } catch {}
    }
    const discoveryBoostUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
    setProducts((current) => {
      // Apply our confirmed vote immediately; background reads reconcile other voters.
      const next = current.map((product) => {
        const voted = product.id === votingTarget.id
          ? { ...product, votesCount: (product.votesCount || 0) + 1 }
          : product;
        return (userSupabaseId && (product.creator_uid === userSupabaseId || (ownership.userId === userSupabaseId && ownership.ids.includes(product.id)))) || locallyOwnedIds.has(product.id)
          ? { ...voted, discoveryBoostUntil }
          : voted;
      });
      if (!supabase) saveProducts(next);
      return next;
    });

    setVotingMatch(null);
    setVotingTarget(null);
    setVoteWinnerFeedback("");
    setVoteLoserFeedback("");
    setVoteError("");
    } catch (error) {
      setVoteError(error instanceof Error ? error.message : "Unable to finish your vote. Please check the match before retrying.");
    } finally {
      // Invalidate reads spanning this mutation, including failed/ambiguous requests.
      publicRevisionRef.current += 1;
      votePendingRef.current = false;
      setIsVoting(false);
    }
  };

  const handleDiscoveryAdvance = useCallback(() => playHaptics(320, "sine", 0.04, 0.02), []);
  const renderLogo = useCallback((logoStr: string, className = "w-6 h-6 object-contain") => {
    const trustedImage = trustedProductImageUrl(logoStr);
    const localPreview = !supabase && logoStr?.startsWith("data:image") ? logoStr : undefined;
    if (trustedImage || localPreview) {
      return (
        <span className={`${className} relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200/80 bg-white shadow-2xs`}>
          <span aria-hidden="true" className="text-base leading-none">🚀</span>
          <img
            key={trustedImage || localPreview}
            src={trustedImage || localPreview}
            alt="Logo"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full bg-white object-contain p-0.5"
            onError={(event) => {
              // React owns this node. Removing it here crashes a later list /
              // matchup update with removeChild; reveal the fallback instead.
              event.currentTarget.style.opacity = "0";
            }}
          />
        </span>
      );
    }
    const compactSymbol = logoStr && logoStr.length <= 8 && !logoStr.includes(":") && !logoStr.includes("/") ? logoStr : "🚀";
    return <span className="inline-block shrink-0">{compactSymbol}</span>;
  }, []);

  const renderDiscoveryFeedBadge = useCallback((item: Product) => {
    const trustedImage = trustedProductImageUrl(item.logo);
    const localPreview = !supabase && item.logo?.startsWith("data:image") ? item.logo : undefined;
    const isEmoji = item.logo && item.logo.length <= 4 && !item.logo.includes(":") && !item.logo.includes("/");

    // Curated high-aesthetic squircle badge themes matching discovery feed mockup
    const hash = (item.title || item.id).split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const badgeThemes = [
      "bg-violet-100/80 text-violet-700 border-violet-200/80",
      "bg-emerald-100/80 text-emerald-800 border-emerald-200/80",
      "bg-zinc-900 text-white border-zinc-950 shadow-2xs",
      "bg-amber-100/80 text-amber-800 border-amber-200/80",
      "bg-blue-100/80 text-blue-700 border-blue-200/80",
      "bg-rose-100/80 text-rose-700 border-rose-200/80",
    ];
    const themeClass = badgeThemes[hash % badgeThemes.length];

    let monogram = "";
    if (item.title) {
      const parts = item.title.trim().split(/\s+/);
      if (parts.length >= 2) {
        monogram = (parts[0][0] + parts[1][0]).toUpperCase();
      } else {
        monogram = item.title.slice(0, 2).toUpperCase();
      }
    } else {
      monogram = "IC";
    }

    if (trustedImage || localPreview) {
      return (
        <span className={`w-12 h-12 relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200/80 shadow-2xs ${themeClass}`}>
          <span aria-hidden="true" className="font-bold text-sm tracking-tight select-none">
            {monogram}
          </span>
          <img
            key={trustedImage || localPreview}
            src={trustedImage || localPreview}
            alt={item.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full bg-white object-contain p-1 rounded-xl"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        </span>
      );
    }

    if (isEmoji && /\p{Emoji}/u.test(item.logo)) {
      return (
        <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl bg-zinc-50 border border-zinc-200/80 shadow-2xs select-none">
          {item.logo}
        </span>
      );
    }

    return (
      <span className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-bold border text-sm select-none shadow-2xs tracking-tight ${themeClass}`}>
        {monogram}
      </span>
    );
  }, [supabase]);

  const isProductOwner = (p: Product, _userTwitter: string, userSubId?: string) => {
    if (supabase) return Boolean(userLoggedIn && userSubId && ownership.userId === userSubId && ownership.ids.includes(p.id));
    // Local-only submissions are tracked in the browser; cloud ownership always uses auth.uid().
    if (typeof window !== "undefined") {
      try {
        const myIds = JSON.parse(localStorage.getItem("my_arena_products") || "[]");
        if (myIds.includes(p.id)) return true;
      } catch {}
    }
    return Boolean(userSubId && p.creator_uid === userSubId);
  };

  // Export critiques for a product as a CSV file
  const handleExportCritiquesCsv = async (product: Product) => {
    // Privacy & Security Check: Ensure only the verified creator of this product can download its CSV critiques
    if (!userLoggedIn || !mockUserTwitter) {
      alert("Authentication Required!\n\nPlease link and verify your identity before exporting critiques.");
      return;
    }
    const isAdmin = userEmail && ["zyc729@outlook.com", "easoncheung9@gmail.com"].includes(userEmail.toLowerCase());
    const isOwner = isProductOwner(product, mockUserTwitter, userSupabaseId) || isAdmin;
    if (!isOwner) {
      alert("Access Denied!\n\nYou can only export critiques for your own registered products to respect developer privacy.");
      return;
    }

    try {
      let critiques: Array<{
        voter: string;
        provider: string;
        role: string;
        text: string;
        date: string;
      }> = [];

      if (supabase) {
        // 1. Cloud Mode: Fetch from Supabase
        // A. Fetch matches where the product participated
        const { data: matches, error: mErr } = await supabase
          .from(publicArenaTable("matches"))
          .select("*")
          .or(`${DB_PREFIX}product_a_id.eq.${product.id},${DB_PREFIX}product_b_id.eq.${product.id}`);

        if (mErr) throw mErr;

        if (matches && matches.length > 0) {
          const matchIds = matches.map(m => String((m as DatabaseRecord)[`${DB_PREFIX}id`]));
          
          // B. Fetch all votes for these matches
          const { data: votes, error: vErr } = await supabase
            .from(publicArenaTable("votes"))
            .select("*")
            .in(`${DB_PREFIX}match_id`, matchIds);

          if (vErr) throw vErr;

          if (votes) {
            critiques = votes.map(vote => {
              const v = vote as DatabaseRecord;
              const isWinner = v[`${DB_PREFIX}voted_product_id`] === product.id;
              // Map database-compatible provider 'twitter' back to 'google' if voter has a google/email style signature
              const rawProvider = v[`${DB_PREFIX}voter_auth_type`];
              const provider = rawProvider === "twitter" ? "google" : rawProvider;
              return {
                voter: String(v[`${DB_PREFIX}voter_username`] || "Community member"),
                provider: String(provider || "github"),
                role: isWinner ? "Winner (Voted For)" : "Loser (Opponent Voted For)",
                text: String(isWinner ? v[`${DB_PREFIX}feedback_winner`] : v[`${DB_PREFIX}feedback_loser`]),
                date: new Date(String(v[`${DB_PREFIX}created_at`] || new Date().toISOString())).toLocaleDateString()
              };
            });
          }
        }
      } else {
        // 2. Local/Sandbox Mode: Load from localStorage + generate mock if empty
        const localVotesStr = localStorage.getItem("arena_votes_v1") || "[]";
        const localVotes = JSON.parse(localVotesStr) as StoredVoteRecord[];
        
        // Find matching votes
        const matchIds = new Set<string>();
        if (bracket) {
          const allMatches = [...bracket.round1, ...bracket.round2, ...bracket.round3, ...bracket.round4];
          allMatches.forEach(m => {
            if (m.productA.id === product.id || m.productB.id === product.id) {
              matchIds.add(m.id);
            }
          });
        }

        // Robust match filtering: Match either via direct saved product IDs (perfect round survival)
        // or through matching product IDs in current active match slates.
        const filteredVotes = localVotes.filter(v =>
          (v.product_a_id && (v.product_a_id === product.id || v.product_b_id === product.id)) ||
          v.voted_product_id === product.id || 
          Boolean(v.match_id && matchIds.has(v.match_id))
        );
        
        if (filteredVotes.length > 0) {
          critiques = filteredVotes.map(v => {
            const isWinner = v.voted_product_id === product.id;
            return {
              voter: v.voter_username || "Community member",
              provider: v.voter_auth_type || "github",
              role: isWinner ? "Winner (Voted For)" : "Loser (Opponent Voted For)",
              text: (isWinner ? v.feedback_winner : v.feedback_loser) || "No critique was provided.",
              date: new Date(v.created_at || Date.now()).toLocaleDateString()
            };
          });
        } else {
          // No local votes cast yet, let's generate beautiful, realistic mock critiques for this product
          // so the CSV export works immediately in sandbox mode!
          const mockAdjective = ["clean", "intuitive", "lightning-fast", "extremely polished", "highly responsive"];
          const mockAdvice = [
            "Add SVG download option",
            "Optimize mobile responsive views",
            "Add a search filter option",
            "Speed up initial load times",
            "Provide detailed onboarding tooltips"
          ];
          
          critiques = [
            {
              voter: "@john_dev",
              provider: "github",
              role: "Winner (Voted For)",
              text: `The UI is incredibly ${mockAdjective[Math.floor(Math.random() * mockAdjective.length)]}. Love the aesthetic!`,
              date: new Date().toLocaleDateString()
            },
            {
              voter: "@sarah_builder",
              provider: "google",
              role: "Loser (Opponent Voted For)",
              text: `Needs optimization: ${mockAdvice[Math.floor(Math.random() * mockAdvice.length)]} for better conversion.`,
              date: new Date().toLocaleDateString()
            }
          ];
        }
      }

      if (critiques.length === 0) {
        const confirmMock = window.confirm(
          "Notice:\n\n" +
          "Your product has not received any votes or peer critiques in the colosseum records yet!\n\n" +
          "Would you like to export simulated mock critiques instead so you can instantly verify the CSV formatting?"
        );
        
        if (confirmMock) {
          const mockAdjectives = ["clean", "intuitive", "lightning-fast", "extremely polished", "highly responsive"];
          const mockAdvices = [
            "Add SVG download option",
            "Optimize mobile responsive views",
            "Add a search filter option",
            "Speed up initial load times",
            "Provide detailed onboarding tooltips"
          ];
          
          critiques = [
            {
              voter: "@john_dev",
              provider: "github",
              role: "Winner (Voted For)",
              text: `The UI is incredibly ${mockAdjectives[Math.floor(Math.random() * mockAdjectives.length)]}. Love the aesthetic!`,
              date: new Date().toLocaleDateString()
            },
            {
              voter: "@sarah_builder",
              provider: "google",
              role: "Loser (Opponent Voted For)",
              text: `Needs optimization: ${mockAdvices[Math.floor(Math.random() * mockAdvices.length)]} for better conversion.`,
              date: new Date().toLocaleDateString()
            }
          ];
        } else {
          return;
        }
      }

      // 3. Compile CSV content
      const headers = ["Voter", "Provider", "Role", "Critique Text", "Date"];
      const csvRows = [headers.join(",")];
      
      critiques.forEach(c => {
        // Quotes protect CSV structure; the leading apostrophe prevents spreadsheet
        // applications from executing user-authored feedback as a formula.
        const escapeCSV = (str: string) => {
          const neutralized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
          return `"${neutralized.replace(/"/g, '""')}"`;
        };
        const row = [
          escapeCSV(c.voter),
          escapeCSV(c.provider),
          escapeCSV(c.role),
          escapeCSV(c.text),
          escapeCSV(c.date)
        ];
        csvRows.push(row.join(","));
      });

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.setAttribute("href", url);
      const safeFilename = product.title.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "product";
      link.setAttribute("download", `${safeFilename}_critiques.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error("CSV Export failed:", err);
      alert(`Error exporting critiques: ${errorMessage(err)}`);
    }
  };

  const activeRoundNum = bracket ? getActiveRound(bracket) : 0;
  const queuedProducts = useMemo(() => {
    return products
      .filter(p => p.queueStatus === "waiting" && (p.arenaEnqueued ?? (!p.makerAvatar || !p.makerAvatar.includes("pushed=false"))))
      .sort(compareArenaQueue);
  }, [products]);
  const activeBracketSize = bracket ? getBracketSize(bracket) : 16;
  const fallbackBracketSize = queuedProducts.length >= 16
    ? null
    : queuedProducts.length >= 8
      ? 8
      : queuedProducts.length >= 4
        ? 4
        : queuedProducts.length >= 2
          ? 2
          : null;
  const rosterTarget = bracket
    ? activeBracketSize
    : queuedProducts.length >= 16
      ? 16
      : fallbackBracketSize || 16;
  const lineupProducts = useMemo(() => {
    if (bracket) {
      const list: Product[] = [];
      getInitialRoundMatches(bracket).forEach(m => {
        if (m.productA) list.push(m.productA);
        if (m.productB) list.push(m.productB);
      });
      if (list.length) return list;
    }
    return queuedProducts.slice(0, rosterTarget);
  }, [bracket, queuedProducts, rosterTarget]);
  const visibleProducts = useMemo(() => products.filter(isVisibleProduct), [products]);

  const currentSeasonNum = pastChampions.length + 1;
  const currentSeasonStr = String(currentSeasonNum).padStart(2, "0");

  const currentRoundMatches = useMemo(() => {
    if (!bracket) return [];
    return getRoundMatches(bracket, getActiveRound(bracket));
  }, [bracket]);

  const closeAuthDialog = useCallback(() => {
    if (!authDialogRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsAuthOpen(false);
      return;
    }
    gsap.to(authDialogRef.current, { y: 8, opacity: 0, scale: 0.985, duration: 0.16, ease: "power2.in", overwrite: true, onComplete: () => setIsAuthOpen(false) });
  }, []);
  useModalAccessibility(isAuthOpen, authDialogRef, closeAuthDialog);
  useModalAccessibility(Boolean(votingMatch && votingTarget), voteDialogRef, () => {
    if (votePendingRef.current) return;
    setVotingMatch(null); setVotingTarget(null); setVoteError("");
  });
  useModalAccessibility(isSuccessOpen, successDialogRef, () => setIsSuccessOpen(false));

  useHomeMotion(currentView === "home", arenaRootRef, page);

  const matchMotionKey = currentRoundMatches.map(match => match.id).join(":");
  const inspectorMotionKey = activeMatch?.id;
  const previousMatchMotion = useRef<string | undefined>(undefined);
  const previousInspectorMotion = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const firstPaint = previousMatchMotion.current === undefined;
    if (previousMatchMotion.current === matchMotionKey) return;
    previousMatchMotion.current = matchMotionKey;
    if (firstPaint || currentView !== "home" || page !== "arena" || !matchMotionKey) return;
    const media = gsap.matchMedia(arenaRootRef);
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(".match-card-item", { opacity: 0, x: -14 },
        { opacity: 1, x: 0, duration: 0.48, stagger: 0.04, ease: "power3.out", clearProps: "opacity,transform" });
    });
    return () => media.revert();
  }, [currentView, page, matchMotionKey]);

  useLayoutEffect(() => {
    const firstPaint = previousInspectorMotion.current === undefined;
    if (previousInspectorMotion.current === (inspectorMotionKey || "")) return;
    previousInspectorMotion.current = inspectorMotionKey || "";
    if (firstPaint || currentView !== "home" || page !== "arena" || !inspectorMotionKey) return;
    const media = gsap.matchMedia(arenaRootRef);
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(".inspector-title, .inspector-card-a, .inspector-card-b, .inspector-vs",
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.035, ease: "power3.out", clearProps: "opacity,transform" });
    });
    return () => media.revert();
  }, [currentView, page, inspectorMotionKey]);

  useEffect(() => {
    if (!isSwordsClashing) return;
    const media = gsap.matchMedia(arenaRootRef);
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.timeline()
        .to(".inspector-vs", { scale: 1.08, duration: 0.1, ease: "power2.out" })
        .to(".inspector-vs", { scale: 1, duration: 0.2, ease: "power2.out", clearProps: "transform" });
    });
    return () => media.revert();
  }, [isSwordsClashing]);

  return (
    <div ref={arenaRootRef} data-main-page={page} className={`arena-app min-h-screen bg-[#fafafa] text-zinc-900 font-sans selection:bg-zinc-900 selection:text-white antialiased relative ${isPaidSubmission ? "overflow-x-clip" : "overflow-x-hidden"} ${isShaking ? "animate-arena-shake" : ""}`}>
      
      {/* HIGH PERFORMANCE DYNAMIC CANVAS BACKGROUND */}
      <InteractiveGrid />

      {/* FIXED TOAST NOTIFICATION CONTAINER */}
      <div role="status" aria-live="polite" className="fixed top-6 right-6 z-[200] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className="bg-white border border-zinc-200 text-xs font-mono text-zinc-900 shadow-lg p-4 rounded-md flex items-center justify-between pointer-events-auto animate-fade-in-blur"
          >
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${t.type === 'success' ? 'bg-emerald-500' : 'bg-cyan-500'}`} />
              <span>{t.message}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sticky Header Navbar */}
      <header className="site-glass-nav sticky top-0 z-50 w-full border-b border-zinc-200/80">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-16 flex items-center justify-between gap-2">
          
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/" aria-label="Indie Clash home"
              className="flex min-h-11 items-center gap-2 cursor-pointer"
            >
              <ClashLogo size="md" className="max-sm:w-7 max-sm:h-7" />
              <span className="exhibition-wordmark whitespace-nowrap text-zinc-950 text-sm sm:text-xl">
                Indie-Clash
              </span>
            </Link>

            <PrimaryNavigation activePage={!isSubmissionPage && currentView === "home" ? page : undefined} className="hidden lg:flex" />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">

            {userLoggedIn && (
              <button
                onClick={() => {
                  synthClick(300, "sine", 0.05);
                  if (isSubmissionPage) {
                    void returnToDashboard();
                  } else if (currentView === "console") {
                    showHomeSection("arena-section");
                  } else {
                    setCurrentView("console");
                  }
                }}
                className="hidden sm:block py-1.5 px-3 bg-white text-zinc-800 border border-zinc-200 hover:bg-zinc-50 shadow-2xs text-[10px] font-mono uppercase tracking-wider rounded-md cursor-pointer transition mr-2"
              >
                {currentView === 'console' ? "Return to Arena ➔" : "Dashboard"}
              </button>
            )}

            {userLoggedIn ? (
              <div className="hidden lg:flex items-center gap-3 text-xs px-3 py-1.5 text-zinc-900">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse"></span>
                <span className="hidden xl:inline text-zinc-500 text-[10px] font-mono">
                  CONNECTED: <span className="text-zinc-950 font-sans font-bold">{mockUserTwitter}</span>
                </span>
                <button 
                  onClick={handleLogout} disabled={isLoggingOut} aria-busy={isLoggingOut}
                  className="px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-950 transition-colors"
                >
                  {isLoggingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : (
              <button 
                disabled={!authReady}
                aria-busy={!authReady}
                onClick={() => setIsAuthOpen(true)}
                className="whitespace-nowrap bg-white text-zinc-800 border border-zinc-200 hover:bg-zinc-50 shadow-2xs text-[11px] sm:text-xs font-semibold px-2 sm:px-3 py-2 rounded-md transition-all cursor-pointer"
              >
                {authReady ? "Sign in" : "Loading…"}
              </button>
            )}

            {/* Top Right Main Conversion button */}
            {currentView !== 'console' && (
              <button
                type="button"
                onClick={() => {
                  synthClick(420, "sine", 0.08, 0.04);
                  if (isSubmissionPage) changeSubmissionPlan();
                  else openSubmissionPage();
                }}
                className="exhibition-button whitespace-nowrap max-sm:min-h-10 max-sm:px-3"
              >
                {isSubmissionPage ? paidOrderId ? "Dashboard" : "Change plan" : "Submit Product"}
              </button>
            )}

          </div>

        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 border-t border-zinc-200/80 px-3 lg:hidden">
          <PrimaryNavigation activePage={!isSubmissionPage && currentView === "home" ? page : undefined} className="flex" />
          {userLoggedIn && <div className="flex items-center gap-3 px-3">
            <button type="button" onClick={() => { if (isSubmissionPage) void returnToDashboard(); else if (currentView === "console") showHomeSection("arena-section"); else setCurrentView("console"); }} className="min-h-11 whitespace-nowrap text-xs text-violet-700 sm:hidden">{currentView === "console" ? "Back to Arena" : "Dashboard"}</button>
            <button type="button" onClick={handleLogout} disabled={isLoggingOut} aria-busy={isLoggingOut} className="min-h-11 whitespace-nowrap text-xs text-zinc-500">{isLoggingOut ? "Signing out…" : "Sign out"}</button>
          </div>}
        </div>
      </header>

      {publicSyncError && (
        <div data-public-refresh-error role="status" aria-live="polite" className="relative mx-4 mt-4 flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 sm:mx-6 lg:mx-auto">
          <div>
            <p className="font-semibold">{publicSyncError}</p>
            <p className="mt-1 text-xs text-amber-800">Latest data is unavailable. Any displayed content may be out of date.</p>
          </div>
          <button type="button" onClick={() => void syncCloudData()} disabled={isPublicSyncPending} aria-busy={isPublicSyncPending} className="min-h-10 rounded-lg border border-amber-300 bg-white px-4 text-xs font-semibold transition hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60">
            {isPublicSyncPending ? "Retrying…" : "Retry refresh"}
          </button>
        </div>
      )}

      {authError && !isSubmitOpen && !isAuthOpen && !votingMatch && <div role="alert" data-auth-error className="mx-auto mt-4 max-w-4xl rounded-md border border-red-200 bg-red-50 px-5 py-4 text-sm leading-6 text-red-700">
        {authError}
      </div>}

      {!isSubmissionPage && (currentView === "console" ? (
        <MakerConsole 
          isOpen={true}
          products={consoleProducts}
          ownershipStatus={!supabase ? "ready" : !authReady ? "loading" : !userLoggedIn ? "reauth" : ownership.userId === userSupabaseId ? ownership.status : "loading"}
          ownershipError={ownership.error}
          onRetryOwnership={retryOwnership}
          onSignIn={() => setIsAuthOpen(true)}
          allProducts={products}
          activeBracket={bracket}
          userTwitter={mockUserTwitter}
          userSubId={userSupabaseId}
          focusedOrderId={focusedOrderId}
          onPushToQueue={handlePushToQueue}
          renderLogo={renderLogo}
          onExportCsv={handleExportCritiquesCsv}
          onSubmitProductClick={() => {
            openSubmissionPage();
          }}
          onEditProduct={openEditProduct}
        />
      ) : (
      <div>
          {/* Hero Banner */}
          {page === "discover" && (
          <section className="exhibition-hero">
            <div className="exhibition-hero-layout">
              <div className="exhibition-hero-copy">
                <p className="exhibition-kicker hero-badge">Product discovery &amp; launch platform</p>
                <h1 className="exhibition-hero-title hero-title">
                  <span>Every Product</span>
                  <span>deserves</span>
                  <span className="exhibition-title-accent">to be seen.</span>
                </h1>
                <p className="exhibition-hero-description hero-desc">
                  Launch for free. Discover overlooked indie products. Join optional Arena battles for honest feedback.
                </p>
                <div className="exhibition-hero-actions hero-stats">
                  <button type="button" className="exhibition-button" onClick={openSubmissionPage}>
                    Launch your product <span aria-hidden="true">↗</span>
                  </button>
                  <a href="#new-and-unseen-section" className="exhibition-text-link">Find your next discovery <span aria-hidden="true">↓</span></a>
                </div>
              </div>
              <ClashSculpture />
            </div>
            <div className="exhibition-ledger">
              <span className="exhibition-product-count"><i aria-hidden="true" /> <strong>{visibleProducts.length} products launched</strong></span>
              <div className="exhibition-ledger-principles">
                <span>Built for discovery</span>
                <span>Optional battles</span>
                <span>Feedback beyond votes</span>
              </div>
            </div>
          </section>
          )}

      {/* CORE APP WRAPPER LAYOUT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">



        {page === "discover" && <DiscoverFeed
          visibleProducts={visibleProducts}
          bracket={bracket}
          activeMatch={activeMatch}
          renderLogo={renderLogo}
          renderDiscoveryFeedBadge={renderDiscoveryFeedBadge}
          synthClick={synthClick}
          handleDiscoveryAdvance={handleDiscoveryAdvance}
        />}

        {page === "arena" && <ArenaBoard
          bracket={bracket}
          activeMatch={activeMatch}
          currentRoundMatches={currentRoundMatches}
          queuedProducts={queuedProducts}
          lineupProducts={lineupProducts}
          rosterTarget={rosterTarget}
          fallbackBracketSize={fallbackBracketSize}
          activeBracketSize={activeBracketSize}
          activeRoundNum={activeRoundNum}
          activeRoundRemainingMs={activeRoundRemainingMs}
          countdownToMidnightMs={countdownToMidnightMs}
          currentSeasonStr={currentSeasonStr}
          activeMatchCritiques={activeMatchCritiques}
          renderLogo={renderLogo}
          synthClick={synthClick}
          setActiveMatch={setActiveMatch}
          setActiveCardProduct={setActiveCardProduct}
          pushToast={pushToast}
          onVote={(match, product) => {
            setVotingMatch(match);
            setVotingTarget(product);
            setVoteWinnerFeedback("");
            setVoteLoserFeedback("");
            setVoteError("");
          }}
        />}

        {page === "champions" && <ChampionsSection
          pastChampions={pastChampions}
          renderLogo={renderLogo}
        />}

      </main>

      <footer className="border-t border-zinc-200/80 bg-zinc-50/70 py-10 mt-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-zinc-500 text-xs">
          <div className="flex items-center space-x-1.5 font-mono">
            <span>© {new Date().getFullYear()} Indie Clash.</span>
            <span>Created by</span>
            <a 
              href="https://x.com/MaberFate" 
              target="_blank" 
              rel="noreferrer" 
              className="text-zinc-950 font-medium hover:underline hover:text-violet-700 transition"
            >
              Vesper
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 font-medium">
            <Link href="/products" className="text-zinc-600 hover:text-zinc-950 transition">All products</Link>
            <Link href="/champions#how-it-works-section" className="text-zinc-600 hover:text-zinc-950 transition">How it works</Link>
            <Link
              href="/privacy"
              className="hover:text-zinc-950 transition cursor-pointer bg-transparent border-none p-0 text-zinc-600 text-xs font-medium"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="hover:text-zinc-950 transition cursor-pointer bg-transparent border-none p-0 text-zinc-600 text-xs font-medium"
            >
              Terms of Use
            </Link>
            <a 
              href="mailto:support@maber.xyz" 
              className="text-zinc-600 hover:text-zinc-950 transition"
            >
              Contact Support
            </a>
          </div>
        </div>
        {page === "discover" && (
          <div className="mx-auto mt-6 flex max-w-7xl flex-wrap items-center justify-center gap-4 px-4 sm:px-6 md:justify-end lg:px-8">
            <a
              href="https://startupfa.me/s/indie-clash?utm_source=www.indieclash.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://startupfa.me/badges/featured-badge-small.webp"
                alt="Indie-Clash - Featured on Startup Fame"
                width={224}
                height={36}
                className="block h-9 w-56"
              />
            </a>
            <a
              href="https://www.toolpilot.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://www.toolpilot.ai/cdn/shop/files/toolpilot-badge-w.png"
                alt="Featured on ToolPilot.ai"
                width={164}
                height={36}
                className="block h-9 w-auto"
              />
            </a>
            <a
              href="https://fazier.com/launches/indieclash.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://fazier.com/api/v1//public/badges/launch_badges.svg?badge_type=launched&theme=light"
                alt="Indie Clash - Launched on Fazier"
                width={120}
                height={51}
                className="block h-auto w-[120px]"
                loading="lazy"
              />
            </a>
            <a
              href="https://submitaitools.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://submitaitools.org/static_submitaitools/images/submitaitools.png"
                alt="提交 AI 工具"
                width={200}
                height={60}
                className="block h-[60px] w-[200px] rounded-[10px] object-contain"
                loading="lazy"
              />
            </a>
            <a
              href="https://dofollow.tools"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://dofollow.tools/badge/badge_dark.svg"
                alt="Featured on Dofollow.Tools"
                width={200}
                height={54}
                className="block h-[54px] w-[200px] object-contain"
                loading="lazy"
              />
            </a>
            <a
              href="https://turbo0.com/item/indie-clash"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://img.turbo0.com/badge-listed-light.svg"
                alt="Listed on Turbo0"
                height={54}
                className="block h-[54px] w-auto"
                loading="lazy"
              />
            </a>
            <a
              href="https://toolfame.com/item/indie-clash"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://toolfame.com/badge-light.svg"
                alt="Featured on toolfame.com"
                height={54}
                className="block h-[54px] w-auto"
                loading="lazy"
              />
            </a>
            <a
              href="https://www.betterlaunch.co/product/indie-clash"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://www.betterlaunch.co/badge-live-dark.svg"
                alt="Indie Clash on Better Launch"
                width={200}
                height={56}
                className="block h-14 w-[200px] object-contain"
                loading="lazy"
              />
            </a>
            <a
              href="https://daniellaunches.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://daniellaunches.com/badge-light.svg"
                alt="Featured on DanielLaunches"
                width={220}
                height={48}
                className="block h-12 w-[220px]"
                loading="lazy"
              />
            </a>
            <a
              href="https://saasfame.com/item/indie-clash"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://saasfame.com/badge-light.svg"
                alt="Featured on saasfame.com"
                height={54}
                className="block h-[54px] w-auto"
                loading="lazy"
              />
            </a>
            <a
              href="https://newtool.site/item/indie-clash"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://newtool.site/badges/newtool-light.svg"
                alt="Featured on NewTool.site"
                height={54}
                className="block h-[54px] w-auto"
                loading="lazy"
              />
            </a>
            <a
              href="https://twelve.tools"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-700"
            >
              <img
                src="https://twelve.tools/badge0-white.svg"
                alt="Featured on Twelve Tools"
                width={148}
                height={40}
                className="block h-10 w-[148px]"
                loading="lazy"
              />
            </a>
          </div>
        )}
      </footer>
      </div>
      ))}

      {/* ========================================================
          Full-page submission; the existing modal remains for profile editing.
         ======================================================== */}
      {isSubmitOpen && (
        <SubmissionContainer className={isSubmissionPage ? "submission-page-shell relative z-10" : "fixed inset-0 z-[100] flex items-center justify-center p-4"}>
          {isSubmissionPage && <div className="submission-page-heading">
            <button type="button" onClick={changeSubmissionPlan} className="submission-back-link">{paidOrderId ? "← Dashboard" : "← Choose your plan"}</button>
            <p className="exhibition-kicker">{paidOrderId ? "03" : "02"} / Your product, properly introduced</p>
            <h1>Tell us what you’re building<span>.</span></h1>
            <p>{isPaidSubmission ? "Your payment is confirmed. Add your product details and previous directory submissions to prepare your launch. You can save a draft and finish later." : "Create your free Indie Clash product profile. You can join the Arena later, on your terms."}</p>
          </div>}
          {!isSubmissionPage && <div
            className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in"
            onClick={closeSubmitModal}
          />}
          <div ref={submitDialogRef} role={isSubmissionPage ? undefined : "dialog"} aria-modal={isSubmissionPage ? undefined : true} aria-labelledby="product-form-title" tabIndex={isSubmissionPage ? undefined : -1} className={isSubmissionPage ? "submission-page-form space-y-6" : "product-form-dialog max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200/90 bg-white p-4 sm:p-6 text-sm text-zinc-900 shadow-xl relative z-10 space-y-4"}>
            <div className="flex items-center justify-between border-b border-zinc-200/80 pb-3">
              <h3 id="product-form-title" className="text-base font-semibold text-zinc-950 tracking-tight font-sans flex items-center gap-2 uppercase">
                <PlusIcon className="w-4 h-4 text-violet-700" /> {editingProduct ? "EDIT PRODUCT PROFILE" : isSubmissionPage ? "Product details" : "SUBMIT PROJECT"}
              </h3>
              {!isSubmissionPage && <button
                type="button"
                onClick={closeSubmitModal}
                disabled={isSubmittingProduct}
                className="text-zinc-500 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 p-1.5 rounded-lg border border-zinc-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={editingProduct ? "Close product editor" : "Close product submission"}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>}
            </div>

            <p className="text-zinc-600 font-sans text-[11px] leading-relaxed">
              {editingProduct
                ? "Complete this permanent profile without changing its URL, submission date, votes, or Arena history."
                : isPaidSubmission ? "Publish your product profile and provide the details for your directory submission service."
                : "Publish a permanent product profile first. Arena participation is optional and can be enabled from your Dashboard after submission."}
            </p>

            {/* Auth Status Segment */}
            {!isPaidSubmission && authError && <p role="alert" data-auth-error className="rounded-md border border-red-400/25 bg-red-950/30 p-3 text-sm leading-6 text-red-200">{authError}</p>}
            {!isPaidSubmission && <div className="p-4 bg-zinc-50/80 border border-zinc-200/80 rounded-xl flex flex-col gap-3 text-left">
              <div className="flex items-center space-x-3">
                <span className="w-8 h-8 bg-white border border-zinc-200 shadow-2xs flex items-center justify-center text-sm rounded-lg">
                  {userAuthType === "github" ? "🐙" : "🔑"}
                </span>
                <div>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block">ACCOUNT</span>
                  {userLoggedIn ? (
                    <span className="text-xs font-semibold text-zinc-950">
                      {mockUserTwitter} <span className="text-zinc-500 font-mono">({userAuthType === "github" ? "GitHub" : "Google"})</span>
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-950 font-bold uppercase">{authReady ? "Sign in to publish" : "Loading…"}</span>
                  )}
                </div>
              </div>
              {!userLoggedIn ? (
                <div className="flex gap-2 w-full">
<AuthProviderButton provider="google" busy={signingInProvider === "google"} disabled={!authReady || Boolean(signingInProvider)} onClick={() => void beginOAuthSignIn("google")} />
<AuthProviderButton provider="github" busy={signingInProvider === "github"} disabled={!authReady || Boolean(signingInProvider)} onClick={() => void beginOAuthSignIn("github")} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleLogout} disabled={isLoggingOut || isSubmittingProduct}
                  className="text-zinc-500 hover:text-zinc-950 text-[10px] underline font-mono font-bold transition duration-150 cursor-pointer self-start"
                >
                  Disconnect
                </button>
              )}
            </div>}

            <form
              onSubmit={handleSubmitProduct}
              noValidate
              aria-busy={isSubmittingProduct}
              className="space-y-4 text-left"
            >
              <fieldset disabled={isSubmittingProduct} className="submission-form-fields">
              {isPaidSubmission && <ServiceFields value={serviceDetails} onChange={setServiceDetails} />}
              <ProductFields fields={fields} normalizedProductUrl={normalizedProductUrl} duplicateProduct={duplicateProduct}
                isPaidSubmission={isPaidSubmission} isSubmittingProduct={isSubmittingProduct} setSubmitError={setSubmitError} />

              {(submitError || (isPaidSubmission && authError)) && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-red-700"
                >
                  {submitError || authError}
                </div>
              )}
              {isPaidSubmission && <label className="submission-consent"><input type="checkbox" required checked={serviceDetails.consent} onChange={event => setServiceDetails({ ...serviceDetails, consent: event.target.checked })} /><span>I am authorized to submit this product and allow Indie Clash and its fulfillment partner to use these details for directory submissions and delivery reports.</span></label>}
              <div className={isPaidSubmission ? "sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/80 bg-white py-4" : isSubmissionPage ? "flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/80 bg-white pt-6" : "sticky -bottom-4 sm:-bottom-6 z-20 flex justify-end gap-3 border-t border-zinc-200/80 bg-white py-4"}>
                <button
                  type="button"
                  onClick={() => { if (paidOrderId) void savePaidDraft(); else if (isSubmissionPage) { if (saveSubmissionDraft()) pushToast("Draft saved in this browser session."); } else closeSubmitModal(); }}
                  disabled={isSubmittingProduct || isSavingDraft || preparingScreenshot}
                  aria-busy={isSavingDraft}
                  className="px-4 py-2 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg text-xs font-medium shadow-2xs transition duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmissionPage ? "Save" : "Cancel"}
                </button>
                {isSavingDraft && <span role="status" className="text-xs text-zinc-500">Saving…</span>}
                <button
                  type="submit"
                  disabled={isSubmittingProduct || isSavingDraft || preparingScreenshot || (isPaidSubmission && !serviceDetails.consent) || (!isPaidSubmission && Boolean(duplicateProduct))}
                  className="min-w-28 px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-lg text-xs shadow-xs transition duration-150 cursor-pointer disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
                >
                  {preparingScreenshot ? "Preparing image…" : isSubmittingProduct ? (editingProduct ? "Saving…" : "Submitting…") : editingProduct ? "Save Changes" : isPaidSubmission ? "Send product details →" : isSubmissionPage ? "Publish for free →" : "Submit Project"}
                </button>
              </div>
              </fieldset>
            </form>
          </div>
          {isSubmissionPage && selectedSubmissionPlan && <aside id="submission-summary" className="submission-summary" aria-label="Selected plan">
            <p className="launch-eyebrow">Your launch plan</p>
            <div className="submission-summary-name"><h2>{selectedSubmissionPlan.name}</h2><span>${selectedSubmissionPlan.price}</span></div>
            <p>{isPaidSubmission ? `${selectedSubmissionPlan.directories}+ directory submissions · One-time payment` : "Your product profile on Indie Clash. No payment required."}</p>
            <button type="button" onClick={changeSubmissionPlan} className="submission-back-link">{paidOrderId ? "Return to Dashboard ↗" : "Change plan ↗"}</button>
            <div className="submission-summary-total"><span>{isPaidSubmission ? "Paid" : "Total today"}</span><strong>${selectedSubmissionPlan.price} USD</strong></div>
            {isPaidSubmission ? <>
              <p className="submission-preview-note">Payment confirmed · Awaiting product details. Your order remains in Dashboard if you leave this page. Work starts after these details are submitted and reviewed.</p>
              <p className="submission-preview-note">Order reference: {paidOrderId}</p>
            </> : <p className="submission-preview-note">Your profile is free. Sign in before publishing to keep control of your product. Arena participation is always optional.</p>}
          </aside>}
        </SubmissionContainer>
      )}

      {/* ========================================================
          Dual-Input Voting Modal
         ======================================================== */}
      {votingMatch && votingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in"
            onClick={() => {
              if (votePendingRef.current) return;
              setVotingMatch(null);
              setVotingTarget(null);
              setVoteWinnerFeedback("");
              setVoteLoserFeedback("");
              setVoteError("");
            }}
          />
          <div ref={voteDialogRef} role="dialog" aria-modal="true" aria-label="Vote and give feedback" tabIndex={-1} className="product-form-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain bg-white border border-zinc-200/90 rounded-2xl p-6 w-full max-w-md relative z-10 text-sm space-y-4 text-zinc-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200/80 pb-3">
              <h3 className="text-sm font-semibold text-zinc-950 tracking-tight font-sans flex items-center gap-2 uppercase">
                <GitCommitIcon className="w-4 h-4 text-violet-700" /> DUELING VOTE BOX
              </h3>
              <button 
                disabled={isVoting} aria-label="Close voting" onClick={() => {
                  setVotingMatch(null);
                  setVotingTarget(null);
                  setVoteWinnerFeedback("");
                  setVoteLoserFeedback("");
                  setVoteError("");
                }}
                className="text-zinc-500 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 p-1.5 rounded-lg border border-zinc-200 cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">VOTING FOR</span>
              <div className="text-sm font-bold text-zinc-950 uppercase mt-0.5">{votingTarget.title}</div>
            </div>

            <p className="text-zinc-600 font-sans text-[11px] leading-relaxed">
              Tell one maker what works well and give the other a useful suggestion. Sign in to submit your vote with both pieces of feedback.
            </p>

            <form onSubmit={handleVoteSubmit} noValidate aria-busy={isVoting} className="space-y-4 text-left">
              <fieldset disabled={isVoting} className="contents">
              {authError && <p role="alert" data-auth-error className="rounded-md border border-red-400/25 bg-red-950/30 p-3 text-sm leading-6 text-red-200">{authError}</p>}
              {/* Auth Verification Card */}
              <div className="p-4 bg-zinc-50/80 border border-zinc-200/80 rounded-xl flex flex-col gap-3">
                <div className="flex items-center space-x-3">
                  <span className="w-8 h-8 bg-white border border-zinc-200 shadow-2xs flex items-center justify-center text-sm rounded-lg">
                    {userAuthType === "github" ? "🐙" : "🔑"}
                  </span>
                  <div>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block">AUTHORIZATION</span>
                    {userLoggedIn ? (
                      <span className="text-xs font-semibold text-zinc-950">
                        {mockUserTwitter} <span className="text-zinc-500 font-mono">({userAuthType === "github" ? "GitHub" : "Google"})</span>
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-950 font-bold uppercase">{authReady ? "Sign in to vote" : "Loading…"}</span>
                    )}
                  </div>
                </div>
                {!userLoggedIn ? (
                  <div className="flex gap-2 w-full">
<AuthProviderButton provider="google" busy={signingInProvider === "google"} disabled={!authReady || Boolean(signingInProvider)} onClick={() => void beginOAuthSignIn("google")} />
<AuthProviderButton provider="github" busy={signingInProvider === "github"} disabled={!authReady || Boolean(signingInProvider)} onClick={() => void beginOAuthSignIn("github")} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout} disabled={isLoggingOut || isVoting}
                    className="text-zinc-500 hover:text-zinc-950 text-[10px] underline font-mono font-bold transition duration-150 cursor-pointer self-start"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {/* Input 1: Why vote for winner */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
                  1. Why are you voting for {votingTarget.title}? (min 10 chars) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g., The core user interface is incredibly fast and intuitive."
                  value={voteWinnerFeedback}
                  onChange={(e) => setVoteWinnerFeedback(e.target.value)}
                  className="bg-zinc-50/50 border border-zinc-200 text-xs text-zinc-900 placeholder:text-zinc-400 p-2.5 rounded-lg focus:outline-none focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 resize-none"
                />
                <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                  <span>Chars: {voteWinnerFeedback.length}</span>
                  <span className={voteWinnerFeedback.length >= 10 ? "text-emerald-600 font-semibold" : "text-zinc-500"}>
                    {voteWinnerFeedback.length >= 10 ? "✓ Ready" : `Need ${Math.max(0, 10 - voteWinnerFeedback.length)} more`}
                  </span>
                </div>
              </div>

              {/* Input 2: Constructive advice for loser */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">
                  2. Constructive Advice for {votingTarget.id === votingMatch.productA.id ? votingMatch.productB.title : votingMatch.productA.title} (min 10 chars) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g., The tagline needs more clarity; should clarify if it exports in SVG."
                  value={voteLoserFeedback}
                  onChange={(e) => setVoteLoserFeedback(e.target.value)}
                  className="bg-zinc-50/50 border border-zinc-200 text-xs text-zinc-900 placeholder:text-zinc-400 p-2.5 rounded-lg focus:outline-none focus:bg-white focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 resize-none"
                />
                <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                  <span>Chars: {voteLoserFeedback.length}</span>
                  <span className={voteLoserFeedback.length >= 10 ? "text-emerald-600 font-semibold" : "text-zinc-500"}>
                    {voteLoserFeedback.length >= 10 ? "✓ Ready" : `Need ${Math.max(0, 10 - voteLoserFeedback.length)} more`}
                  </span>
                </div>
              </div>

              {voteError && (
                <div className="p-2.5 bg-red-50 text-red-700 text-[10px] border border-red-200 font-mono rounded-lg">
                  [ERROR]: {voteError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-200/80">
                <button
                  type="button"
                  onClick={() => {
                    setVotingMatch(null);
                    setVotingTarget(null);
                    setVoteWinnerFeedback("");
                    setVoteLoserFeedback("");
                    setVoteError("");
                  }}
                  className="px-4 py-2 border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 rounded-lg text-xs font-medium shadow-2xs transition duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-lg text-xs shadow-xs transition duration-150 cursor-pointer"
                >
                  {isVoting ? "Submitting vote…" : "Submit Dual Vote"}
                </button>
              </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          Developer testing console (PM control panel)
         ======================================================== */}
      {process.env.NODE_ENV === "development" && !isSubmissionPage && (
        <div className="fixed bottom-4 right-4 z-40 bg-white/95 backdrop-blur-md border border-zinc-200/90 shadow-lg rounded-xl p-4 max-w-xs transition-all text-zinc-900 text-xs space-y-3" style={{ willChange: "transform" }}>
          <div className="flex justify-between items-center pb-2 border-b border-zinc-200/80">
            <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest font-semibold">
              DEV_CONSOLE
            </span>
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
          </div>
          <div className="space-y-2">
            {!bracket || bracket.status === "preparing" ? (
              <>
                {bracket && (
                  <div className="p-2 bg-zinc-50 border border-zinc-200/80 text-[10px] font-mono space-y-1 text-zinc-600 rounded-lg mb-2">
                    <div>STATUS: <strong className="text-emerald-700">{bracket.status}</strong></div>
                    <div>STAGE: <strong className="text-zinc-950">WAITLIST</strong></div>
                  </div>
                )}
                <button 
                  onClick={handleInject16}
                  className="w-full text-left px-2.5 py-1.5 bg-zinc-900 text-white hover:bg-zinc-800 transition-all rounded-lg font-semibold flex justify-between items-center p-2 cursor-pointer mb-2 shadow-xs"
                >
                  <span>🚀 Inject 16 Arena Competitors</span>
                  <span className="font-mono">➔</span>
                </button>
                <button 
                  onClick={handleInject20}
                  className="w-full text-left px-2.5 py-1.5 border border-zinc-200 bg-white hover:bg-zinc-50 transition-all rounded-lg font-mono flex justify-between items-center text-amber-700 p-2 cursor-pointer mb-2 shadow-2xs font-semibold"
                >
                  <span>＋ Inject 20 Showcase Products</span>
                  <span className="font-mono">⚡</span>
                </button>
                {bracket && (
                  <button
                    onClick={handleAdvanceRound}
                    className="w-full text-left px-2.5 py-1.5 bg-zinc-900 text-white hover:bg-zinc-800 transition-all rounded-lg font-semibold flex justify-between items-center p-2 cursor-pointer shadow-xs"
                  >
                    <span>⚡ Force Start (Skip Midnight)</span>
                    <span className="font-mono">➔</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="p-2 bg-zinc-50 border border-zinc-200/80 text-[10px] font-mono space-y-1 text-zinc-600 rounded-lg">
                  <div>STATUS: <strong className="text-emerald-700">{bracket.status}</strong></div>
                  <div>STAGE: <strong className="text-zinc-950">{
                    bracket.status === "completed" ? "COMPLETED" : 
                    activeRoundNum === 1 ? "ROUND_16" : 
                    activeRoundNum === 2 ? "QUARTERS" : 
                    activeRoundNum === 3 ? "SEMIS" : "FINALS"
                  }</strong></div>
                </div>
                {bracket.status === "completed" ? (
                  <button
                    onClick={handleReset}
                    className="w-full text-left px-2.5 py-1.5 bg-zinc-100 border border-zinc-200 text-zinc-700 hover:bg-zinc-200 transition-all rounded-lg font-mono flex justify-between items-center p-2 cursor-pointer"
                  >
                    <span>🔄 Start New Season (Reset)</span>
                    <span className="font-mono">➔</span>
                  </button>
                ) : (
                  <button
                    onClick={handleAdvanceRound}
                    className="w-full text-left px-2.5 py-1.5 bg-zinc-900 text-white hover:bg-zinc-800 transition-all rounded-lg font-semibold flex justify-between items-center p-2 cursor-pointer shadow-xs"
                  >
                    <span>🏆 Settle & Advance Round</span>
                    <span className="font-mono">➔</span>
                  </button>
                )}
              </>
            )}
            <button 
              onClick={handleReset}
              className="w-full text-center py-1.5 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-all font-mono rounded-lg text-[10px] cursor-pointer font-semibold"
            >
              🔄 Reset Arena
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          Retro Pixel Authentication Selector Modal (Twitter/X & GitHub)
         ======================================================== */}
      {isAuthOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ zIndex: 100 }}>
          <div 
            className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in"
            onClick={closeAuthDialog}
          />
          <div ref={authDialogRef} role="dialog" aria-modal="true" aria-label="Sign in" tabIndex={-1} className="product-form-dialog auth-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto p-8 w-full max-w-sm relative z-10 text-sm text-zinc-900 rounded-2xl border border-zinc-200/90 bg-white shadow-xl">
            <div className="flex flex-col items-center text-center">
              <ClashLogo size="md" />
              <h3 className="mt-5 text-2xl font-semibold text-zinc-950 tracking-tight">
                <span>Welcome back.</span>
              </h3>
              <button 
                aria-label="Close sign in" onClick={closeAuthDialog}
                className="auth-close absolute right-3 top-3 flex w-8 h-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {authError && <p role="alert" data-auth-error className="rounded-md border border-red-400/25 bg-red-950/30 p-3 text-sm leading-6 text-red-200">{authError}</p>}

            <div className="space-y-3 mt-7">
<AuthProviderButton provider="google" busy={signingInProvider === "google"} disabled={!authReady || Boolean(signingInProvider)} onClick={() => void beginOAuthSignIn("google")} />
 
<AuthProviderButton provider="github" busy={signingInProvider === "github"} disabled={!authReady || Boolean(signingInProvider)} onClick={() => void beginOAuthSignIn("github")} />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          Custom Success Card Modal
         ======================================================== */}
      {isSuccessOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ zIndex: 100 }}>
          <div 
            className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsSuccessOpen(false)}
          />
          <div ref={successDialogRef} role="dialog" aria-modal="true" aria-label="Confirmation" tabIndex={-1} className="product-form-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white border border-zinc-200/90 rounded-2xl p-6 w-full max-w-md relative z-10 text-sm space-y-4 text-center text-zinc-900 shadow-xl">
            <button type="button" aria-label="Close confirmation" onClick={() => setIsSuccessOpen(false)} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950">×</button>
            
            <div className="w-10 h-10 bg-zinc-50 border border-zinc-200 rounded-xl mx-auto flex items-center justify-center text-xl font-mono shadow-2xs">
              🛡️
            </div>
            
            <h3 className="text-sm font-semibold text-zinc-950 uppercase tracking-tight font-sans">
              {successModalTitle}
            </h3>
            
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block">
              Submission Confirmed
            </span>

            <div className="bg-zinc-50 border border-zinc-200/80 p-4 text-left font-mono text-[10px] text-zinc-600 leading-relaxed whitespace-pre-line rounded-xl">
              {successModalText}
            </div>

            {successModalTitle === "Your product is live" && publishedProduct ? (
              <div className="space-y-4">
                <Link href={`/products/${encodeURIComponent(publishedProduct.id)}`} className="block rounded-lg bg-amber-400 px-4 py-3 font-semibold hover:bg-amber-300">View {publishedProduct.title} →</Link>
                <LaunchShareKit product={publishedProduct} />
              <button
                onClick={() => {
                  setIsSuccessOpen(false);
                  setCurrentView('console');
                }}
                className="w-full py-2.5 bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold rounded-lg shadow-xs transition duration-150 cursor-pointer"
              >
                Dashboard →
              </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsSuccessOpen(false);
                  setTimeout(() => {
                    const element = document.getElementById("tournament-dashboard");
                    if (element) {
                      element.scrollIntoView({ behavior: "smooth" });
                    }
                  }, 100);
                }}
                className="w-full py-2.5 bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-semibold rounded-lg shadow-xs transition duration-150 cursor-pointer"
              >
                ENTER THE ARENA ➔
              </button>
            )}
          </div>
        </div>
      )}



      {/* ========================================================
          Privacy Policy Modal
         ======================================================== */}
      {isPrivacyOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" style={{ zIndex: 150 }}>
          <div 
            className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsPrivacyOpen(false)}
          />
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 w-full max-w-2xl relative z-10 text-xs space-y-4 text-zinc-900 shadow-xl">
            <button 
              onClick={() => setIsPrivacyOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 p-1.5 rounded-lg border border-zinc-200 cursor-pointer"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center space-x-3 mb-2 border-b border-zinc-200/80 pb-3">
              <div>
                <h3 className="font-sans text-sm uppercase tracking-wider text-zinc-950 font-semibold">
                  Privacy Policy
                </h3>
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block mt-0.5">SECURE SYSTEM MATCH DATA</span>
              </div>
            </div>
            
            <div className="max-h-[50vh] overflow-y-auto pr-3 custom-scrollbar font-sans text-xs text-zinc-600 space-y-5 leading-relaxed text-left">
              <div className="bg-zinc-50 border border-zinc-200/80 px-4 py-2.5 rounded-xl mb-2 flex items-center justify-between">
                <span className="text-[9px] font-mono text-zinc-600 font-semibold">STATUS: ACTIVE // VERIFIED</span>
                <span className="text-[9px] font-mono text-zinc-500 font-semibold">UPDATED: MAY 29, 2026</span>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-zinc-950 uppercase mb-1.5 border-l-2 border-zinc-950 pl-2 font-semibold">1. Scope & Commitment</h4>
                <p className="text-zinc-600">
                  At Indie Clash (operated by @MaberFate), we respect your privacy. This policy outlines how we handle data for our 1v1 tournament arena website. We are committed to data minimization and user security.
                </p>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-zinc-950 uppercase mb-1.5 border-l-2 border-zinc-950 pl-2 font-semibold">2. Information We Collect</h4>
                <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-xl space-y-3">
                  <div>
                    <span className="inline-block bg-zinc-900 text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">OAUTH ACCOUNT METADATA</span>
                    <p className="text-zinc-600 text-[10px] leading-relaxed">
                      When you connect via Google or GitHub OAuth, we collect your verified email address, public profile name, avatar image URL, and auth provider details. This is necessary to verify your identity.
                    </p>
                  </div>
                  <div>
                    <span className="inline-block bg-zinc-900 text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">PROJECT SUBMISSION DATA</span>
                    <p className="text-zinc-600 text-[10px] leading-relaxed">
                      If you submit an indie product, we collect the title, tagline, logo/emoji, maker Twitter/X handle, and live demo URL.
                    </p>
                  </div>
                  <div>
                    <span className="inline-block bg-zinc-900 text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">CRITIQUES & PUBLIC VOTES</span>
                    <p className="text-zinc-600 text-[10px] leading-relaxed">
                      To participate in the arena voting process, you must submit a constructive critique. We store and publicly display the critique texts you write, alongside your voting selection.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-zinc-950 uppercase mb-1.5 border-l-2 border-zinc-950 pl-2 font-semibold">3. How We Use Your Data</h4>
                <ul className="space-y-2 text-zinc-600">
                  <li className="flex items-start space-x-2">
                    <span className="text-emerald-600 mt-0.5 shrink-0">✔</span>
                    <span><strong>Spam & Vote Rigging Prevention:</strong> Connected accounts help us prevent bots, duplicate voting, and coordinated manipulation rings.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-emerald-600 mt-0.5 shrink-0">✔</span>
                    <span><strong>Public Duel Transparency:</strong> Constructive critiques are published on the battle whiteboard. The identity linked to your account may be shown next to your feedback.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-emerald-600 mt-0.5 shrink-0">✔</span>
                    <span><strong>Tournament Operation:</strong> We use project details for matching, voting updates, rankings, and historical champion boards.</span>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-zinc-950 uppercase mb-1.5 border-l-2 border-zinc-950 pl-2 font-semibold">4. Data Sharing & Retention</h4>
                <p className="text-zinc-600">
                  We do not sell, rent, or lease your personal information. Your public display name, submitted critiques, and project links may be displayed as part of the core Indie Clash experience. Email addresses and account UUIDs remain in private, access-controlled Supabase tables.
                </p>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-zinc-950 uppercase mb-1.5 border-l-2 border-zinc-950 pl-2 font-semibold">5. Contact Us</h4>
                <p className="text-zinc-600">
                  For any privacy inquiries, data deletion requests, or support, reach out to us at:
                  <a href="mailto:support@maber.xyz" className="text-zinc-950 hover:underline font-semibold ml-1">support@maber.xyz</a>.
                </p>
              </div>
            </div>

            <div className="mt-4 text-right border-t border-zinc-200/80 pt-4 flex justify-between items-center">
              <span className="text-[9px] font-mono text-zinc-500 uppercase font-medium">INDIE CLASH PROTOCOL v1.0</span>
              <button
                onClick={() => setIsPrivacyOpen(false)}
                className="py-2.5 px-6 text-xs font-mono transition-all bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-lg cursor-pointer shadow-xs"
              >
                ACCEPT & CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          Terms of Use Modal
         ======================================================== */}
      {isTermsOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" style={{ zIndex: 150 }}>
          <div 
            className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsTermsOpen(false)}
          />
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 w-full max-w-2xl relative z-10 text-xs space-y-4 text-zinc-900 shadow-xl">
            <button 
              onClick={() => setIsTermsOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 p-1.5 rounded-lg border border-zinc-200 cursor-pointer"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center space-x-3 mb-2 border-b border-zinc-200/80 pb-3">
              <div>
                <h3 className="font-sans text-sm uppercase tracking-wider text-zinc-950 font-semibold">
                  Terms of Use
                </h3>
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block mt-0.5">ARENA DEPLOY RULES & POLICY</span>
              </div>
            </div>
            
            <div className="max-h-[50vh] overflow-y-auto pr-3 custom-scrollbar font-sans text-xs text-zinc-600 space-y-5 leading-relaxed text-left">
              <div className="bg-zinc-50 border border-zinc-200/80 px-4 py-2.5 rounded-xl mb-2 flex items-center justify-between">
                <span className="text-[9px] font-mono text-zinc-600 font-semibold">LICENSE AGREEMENT: PUBLIC ACCESS</span>
                <span className="text-[9px] font-mono text-zinc-500 font-semibold">UPDATED: MAY 29, 2026</span>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-zinc-950 uppercase mb-1.5 border-l-2 border-zinc-950 pl-2 font-semibold">1. Acceptance of Terms</h4>
                <p className="text-zinc-600">
                  By accessing and using Indie Clash (located at this website, created by @MaberFate), you agree to be bound by these Terms of Use. If you do not agree, please discontinue use immediately.
                </p>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-zinc-950 uppercase mb-1.5 border-l-2 border-zinc-950 pl-2 font-semibold">2. Description of Service</h4>
                <p className="text-zinc-600">
                  Indie Clash is a 1v1 product tournament bracket platform. Users submit project details, connect identity via OAuth, and participate in peer-critique voting to rank products in live battles.
                </p>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-zinc-950 uppercase mb-1.5 border-l-2 border-zinc-950 pl-2 font-semibold">3. Battle Arena Fair Play Policy</h4>
                <div className="bg-zinc-50 border border-zinc-200/80 p-4 rounded-xl space-y-3 text-[10px] text-zinc-600 leading-relaxed">
                  <div>
                    <span className="inline-block bg-zinc-900 text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">ZERO TOLERANCE: BOT ACTIVITY</span>
                    <p>You may not use automated scripts, bots, or fake accounts to generate votes or project queues.</p>
                  </div>
                  <div>
                    <span className="inline-block bg-zinc-900 text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">ZERO TOLERANCE: COORDINATED MANIPULATION</span>
                    <p>Coordinated upvote manipulation, review exchanges, or purchasing of votes is strictly prohibited.</p>
                  </div>
                  <div>
                    <span className="inline-block bg-zinc-900 text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">REQUIRED: DUAL CRITIQUE LOCK</span>
                    <p>You must leave a constructive critique of at least 10 characters summarizing positive points for the winner and actionable feedback for the runner-up. Low-effort or spam text will invalidate the vote.</p>
                  </div>
                  <p className="text-zinc-500 font-medium border-t border-zinc-200/80 pt-2 font-mono text-[9px] uppercase">
                    ※ Violation results in permanent disqualification of products from current brackets & hall of valor.
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-zinc-950 uppercase mb-1.5 border-l-2 border-zinc-950 pl-2 font-semibold">4. Intellectual Property & Submissions</h4>
                <p className="text-zinc-600">
                  You retain ownership of all intellectual property rights to the products you submit. By submitting a product, you grant Indie Clash a worldwide, non-exclusive, royalty-free license to display your product details (title, tagline, logo/emoji, screenshots, maker info, and URL) publicly in the arena.
                </p>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-zinc-950 uppercase mb-1.5 border-l-2 border-zinc-950 pl-2 font-semibold">5. Limitation of Liability</h4>
                <p className="text-zinc-600">
                  Indie Clash is provided &quot;as is&quot; and &quot;as available&quot;. We do not guarantee uninterrupted service or error-free matchups. We reserve the right to modify, pause, or terminate tournament systems, brackets, or database values at our sole discretion without notice.
                </p>
              </div>
            </div>

            <div className="mt-4 text-right border-t border-zinc-200/80 pt-4 flex justify-between items-center">
              <span className="text-[9px] font-mono text-zinc-500 uppercase font-medium">INDIE CLASH PROTOCOL v1.0</span>
              <button
                onClick={() => setIsTermsOpen(false)}
                className="py-2.5 px-6 text-xs font-mono transition-all bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-lg cursor-pointer shadow-xs"
              >
                ACCEPT & CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          Product Details Popover Card
         ======================================================== */}
      {activeCardProduct && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4" style={{ zIndex: 160 }}>
          <div 
            className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in" 
            onClick={() => setActiveCardProduct(null)}
          />
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 w-full max-w-sm relative z-10 text-xs space-y-4 text-left text-zinc-900 shadow-xl">
            {/* Top close button */}
            <button 
              onClick={() => setActiveCardProduct(null)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-950 bg-zinc-100 hover:bg-zinc-200 p-1.5 rounded-lg border border-zinc-200 cursor-pointer"
            >
              <XIcon className="w-3 h-3" />
            </button>

            {/* Main product display */}
            <div className="flex items-center gap-3 pb-3 border-b border-zinc-200/80">
              <div className="w-12 h-12 bg-zinc-50 border border-zinc-200/80 rounded-xl flex items-center justify-center text-2xl shadow-2xs">
                {renderLogo(activeCardProduct.logo, "w-8 h-8 object-contain")}
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-950 uppercase tracking-wide">
                  {activeCardProduct.title}
                </h3>
              </div>
            </div>

            {/* Tagline */}
            <p className="text-zinc-600 text-[11px] leading-relaxed font-sans">
              {activeCardProduct.tagline}
            </p>

            {/* URL Link Section */}
            {publicHttpUrl(activeCardProduct.url) ? <div className="bg-zinc-50 border border-zinc-200/80 p-3 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-700">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">LIVE DEMO URL</span>
              </div>
              <a 
                href={publicHttpUrl(activeCardProduct.url)}
                target="_blank" 
                rel={productLinkRel(activeCardProduct)}
                onClick={() => synthClick(400, "sine", 0.08)}
                className="text-violet-700 hover:text-violet-900 font-semibold transition-colors flex items-center gap-1 group text-[11px]"
              >
                VIEW DEMO <span className="group-hover:translate-x-0.5 transition-transform">➔</span>
              </a>
            </div> : null}

            {/* Maker details footer */}
            <div className="pt-3 border-t border-dashed border-zinc-200 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
              <div className="flex items-center gap-2">
                {activeCardProduct.makerAvatar ? (
                  <img 
                    src={activeCardProduct.makerAvatar.split("#")[0]} 
                    alt={activeCardProduct.makerName} 
                    className="w-5 h-5 rounded-full border border-zinc-200 object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-zinc-200 bg-zinc-100 flex items-center justify-center text-[8px]">👤</div>
                )}
                <span className="text-zinc-700 hover:text-zinc-950 font-medium transition-colors">
                  {activeCardProduct.makerTwitter || `@${activeCardProduct.makerName.toLowerCase().replace(/\s/g, "")}`}
                </span>
              </div>
              <span>
                {(() => {
                  try {
                    const d = new Date(activeCardProduct.submittedAt);
                    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                  } catch {
                    return "";
                  }
                })()}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
