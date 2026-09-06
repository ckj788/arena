"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "@/app/components/NavigationLink";
import useModalAccessibility from "@/app/components/useModalAccessibility";
import useHomeMotion from "@/app/components/useHomeMotion";
import useArenaNavigation from "@/app/components/useArenaNavigation";
import AuthProviderButton from "@/app/components/AuthProviderButton";
import { gsap } from "gsap";
import { Product, Match, Bracket } from "@/lib/mockData";
import {
  loadProducts,
  saveProducts,
  loadBracket,
  saveBracket,
  buildInitialBracket,
  getActiveRound,
  getArenaFormatName,
  getBracketSize,
  getInitialRoundMatches,
  getInitialRoundNumber,
  getRoundMatches,
  advanceTournamentRound,
  fetchCloudProducts,
  fetchCloudBracket,
  fetchCloudPastChampions,
  loadLocalPastChampions,
  saveLocalPastChampions
} from "@/lib/arenaStore";
import {
  castArenaVote,
  enqueueArenaProduct,
  fetchOwnedArenaProducts,
  requestArenaSettlement,
  submitArenaProduct,
  updateArenaProduct,
  uploadArenaLogo,
} from "@/lib/arenaApi";
import { supabase, DB_PREFIX, publicArenaTable } from "@/lib/supabaseClient";
import {
  getMillisecondsToNextNYMidnight,
  getRoundEndAtIso,
  getRoundRemainingMs,
  formatToHMS
} from "@/lib/timeHelpers";
import InteractiveGrid from "@/app/components/InteractiveGrid";
import ClashLogo from "@/app/components/ClashLogo";
import MakerConsole from "@/app/components/MakerConsole";
import FairDiscoverySection from "@/app/components/FairDiscoverySection";
import DailyArenaRunCountdown from "@/app/components/DailyArenaRunCountdown";
import { PRICING_MODELS, type PricingModel } from "@/lib/productTaxonomy";
import { compareArenaQueue } from "@/lib/discoveryRanking";
import { publicHttpUrl, trustedProductImageUrl } from "@/lib/site";
import { exchangeOAuthCodeOnce, oauthFailureMessage, OAUTH_RESTORE_EVENT, OAUTH_RETURN_TO_KEY, safeOAuthReturnPath } from "@/lib/browserOAuth";

function firstOpenBracketMatch(bracket: Bracket): Match | null {
  const round = bracket.status === "active"
    ? getActiveRound(bracket)
    : getInitialRoundNumber(getBracketSize(bracket));
  const matches = getRoundMatches(bracket, round);
  return matches.find((match) => !match.winnerId) || matches[0] || null;
}

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



// --- INLINE SVG ICONS INSTEAD OF LUCIDE-REACT ---
const ExternalLinkIcon = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

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

// Memory cache for client-side Stale-While-Revalidate (SWR) performance
let memoryCache: {
  products: Product[] | null;
  bracket: Bracket | null;
  champs: Product[] | null;
  lastFetchTime: number;
} = {
  products: null,
  bracket: null,
  champs: null,
  lastFetchTime: 0
};

const OAUTH_SUBMIT_DRAFT_KEY = "indieclash_oauth_submit_draft_v1";

interface ArenaClientProps {
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
  initialProducts,
  initialPastChampions,
  initialBracket
}: ArenaClientProps) {
  const arenaRootRef = useRef<HTMLDivElement | null>(null);
  const submitDialogRef = useRef<HTMLDivElement | null>(null);
  const authDialogRef = useRef<HTMLDivElement | null>(null);
  const voteDialogRef = useRef<HTMLDivElement | null>(null);
  const successDialogRef = useRef<HTMLDivElement | null>(null);
  const authStartingRef = useRef(false);
  const [signingInProvider, setSigningInProvider] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [pastChampions, setPastChampions] = useState<Product[]>(initialPastChampions);
  const { currentView, setCurrentView, showHomeSection } = useArenaNavigation();
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
  const [bracket, setBracket] = useState<Bracket | null>(initialBracket);
  const [activeMatch, setActiveMatch] = useState<Match | null>(() => {
    if (!initialBracket) return null;
    return firstOpenBracketMatch(initialBracket);
  });
  const isInitialSyncDone = useRef(false);



  // Screen shake animation state
  const [isShaking, setIsShaking] = useState(false);

  // Visual dynamic clashing swords animation key state
  const [isSwordsClashing, setIsSwordsClashing] = useState(false);

  // Submit Drawer State
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [submitSource, setSubmitSource] = useState<'home' | 'console'>('home');
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTagline, setNewTagline] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPricingModel, setNewPricingModel] = useState<PricingModel>("unspecified");
  const [newPlatforms, setNewPlatforms] = useState("");
  const [newTargetAudience, setNewTargetAudience] = useState("");
  const [newMakerStory, setNewMakerStory] = useState("");
  const [newFeedbackRequest, setNewFeedbackRequest] = useState("");
  const newTimeframe = "48h" as const;
  const [newMaker, setNewMaker] = useState("");
  const [newTwitter, setNewTwitter] = useState("");
  const [newLogo, setNewLogo] = useState("🚀");
  const [activeCardProduct, setActiveCardProduct] = useState<Product | null>(null);

  useEffect(() => {
    let restoreTimer: number | undefined;
    const restoreUi = () => {
    const params = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const isOAuthCallback = params.has("code") || params.has("error") || params.has("error_description") || fragment.has("error");
    // Wait for the code exchange before consuming the draft/return context.
    if (isOAuthCallback) return;
    const shouldOpenFromQuery = params.get("submit") === "1";
    const shouldRestoreConsole = params.get("view") === "console";
    let savedDraft: string | null = null;
    try { savedDraft = sessionStorage.getItem(OAUTH_SUBMIT_DRAFT_KEY); } catch { /* Storage may be restricted. */ }
    let restoredDraft: Record<string, unknown> | null = null;

    if (savedDraft) {
      try {
        restoredDraft = JSON.parse(savedDraft) as Record<string, unknown>;
      } catch {
        // A malformed browser draft should never prevent the page from loading.
      }
    }

    if (!shouldOpenFromQuery && !savedDraft && !shouldRestoreConsole) return;

    restoreTimer = window.setTimeout(() => {
      if (restoredDraft) {
        const draft = restoredDraft;
        setNewTitle(typeof draft.title === "string" ? draft.title : "");
        setNewTagline(typeof draft.tagline === "string" ? draft.tagline : "");
        setNewUrl(typeof draft.url === "string" ? draft.url : "");
        setNewDescription(typeof draft.description === "string" ? draft.description : "");
        setNewPricingModel(PRICING_MODELS.some((item) => item.value === draft.pricingModel) ? draft.pricingModel as PricingModel : "unspecified");
        setNewPlatforms(typeof draft.platforms === "string" ? draft.platforms : "");
        setNewTargetAudience(typeof draft.targetAudience === "string" ? draft.targetAudience : "");
        setNewMakerStory(typeof draft.makerStory === "string" ? draft.makerStory : "");
        setNewFeedbackRequest(typeof draft.feedbackRequest === "string" ? draft.feedbackRequest : "");
        setNewMaker(typeof draft.maker === "string" ? draft.maker : "");
        setNewTwitter(typeof draft.twitter === "string" ? draft.twitter : "");
        setNewLogo(typeof draft.logo === "string" ? draft.logo : "🚀");
        setSubmitSource(draft.source === "console" ? "console" : "home");
      }
      if (shouldOpenFromQuery || savedDraft) setIsSubmitOpen(true);
      try { sessionStorage.removeItem(OAUTH_SUBMIT_DRAFT_KEY); } catch { /* Optional draft storage. */ }
    if (shouldOpenFromQuery) params.delete("submit");

    const remainingQuery = params.toString();
    const cleanUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", cleanUrl);
    }, 0);
    };
    restoreUi();
    window.addEventListener(OAUTH_RESTORE_EVENT, restoreUi);
    return () => {
      if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
      window.removeEventListener(OAUTH_RESTORE_EVENT, restoreUi);
    };
  }, []);

  const resetProductForm = () => {
    setNewTitle("");
    setNewTagline("");
    setNewUrl("");
    setNewDescription("");
    setNewPricingModel("unspecified");
    setNewPlatforms("");
    setNewTargetAudience("");
    setNewMakerStory("");
    setNewFeedbackRequest("");
    setNewMaker("");
    setNewTwitter("");
    setNewLogo("🚀");
  };

  const openSubmitModal = (source: 'home' | 'console') => {
    setEditingProduct(null);
    resetProductForm();
    setSubmitSource(source);
    setSubmitError(null);
    setIsSubmitOpen(true);
  };

  const closeSubmitModal = () => {
    if (isSubmittingProduct) return;
    setSubmitError(null);
    setIsSubmitOpen(false);
    setEditingProduct(null);
  };

  useModalAccessibility(isSubmitOpen, submitDialogRef, closeSubmitModal);

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setSubmitSource("console");
    setSubmitError(null);
    setNewTitle(product.title);
    setNewTagline(product.tagline);
    setNewUrl(product.url);
    setNewDescription(product.description || "");
    setNewPricingModel(product.pricingModel || "unspecified");
    setNewPlatforms(product.platforms?.join(", ") || "");
    setNewTargetAudience(product.targetAudience || "");
    setNewMakerStory(product.makerStory || "");
    setNewFeedbackRequest(product.feedbackRequest || "");
    setNewMaker(product.makerName);
    setNewTwitter(product.makerTwitter);
    setNewLogo(product.logo || "🚀");
    setIsSubmitOpen(true);
  };

  // Vote Modal State with Dual-Input Feedback Loop
  const [votingMatch, setVotingMatch] = useState<Match | null>(null);
  const [votingTarget, setVotingTarget] = useState<Product | null>(null);
  const [voteWinnerFeedback, setVoteWinnerFeedback] = useState("");
  const [voteLoserFeedback, setVoteLoserFeedback] = useState("");
  const [voteError, setVoteError] = useState("");
  
  // User simulated login
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const [mockUserTwitter, setMockUserTwitter] = useState("");
  const [userAuthType, setUserAuthType] = useState<"google" | "github" | null>(null);
  const [userSupabaseId, setUserSupabaseId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [ownership, setOwnership] = useState<{ userId: string; status: "loading" | "ready" | "error"; ids: string[]; products: Product[] }>({ userId: "", status: "loading", ids: [], products: [] });
  const [ownershipRevision, setOwnershipRevision] = useState(0);
  const retryOwnership = useCallback(() => setOwnershipRevision((value) => value + 1), []);
  useEffect(() => {
    if (!supabase || !userSupabaseId || !userLoggedIn) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setOwnership((previous) => ({ userId: userSupabaseId, status: "loading", ids: previous.userId === userSupabaseId ? previous.ids : [], products: previous.userId === userSupabaseId ? previous.products : [] }));
      try {
        const result = await fetchOwnedArenaProducts();
        if (active) setOwnership({ userId: userSupabaseId, status: "ready", ids: result.productIds, products: result.products });
      } catch {
        if (active) setOwnership((previous) => ({ ...previous, status: "error" }));
      }
    });
    return () => { active = false; };
  }, [userSupabaseId, userLoggedIn, ownershipRevision]);

  const consoleProducts = useMemo(() => {
    if (!supabase) return products;
    if (ownership.userId !== userSupabaseId || !userLoggedIn) return [];
    const catalog = new Map(products.map((product) => [product.id, product]));
    const privateRows = new Map(ownership.products.map((product) => [product.id, product]));
    return ownership.ids.flatMap((id) => {
      const product = privateRows.get(id) || catalog.get(id);
      return product ? [{ ...product, ...catalog.get(id), creator_uid: userSupabaseId }] : [];
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
    const callbackError = url.searchParams.get("error") || fragment.get("error");
    const isCallback = Boolean(code || callbackError || url.searchParams.has("error_description"));

    const restoreAfterOAuth = () => {
      let requestedReturn: string | null = null;
      try {
        requestedReturn = sessionStorage.getItem(OAUTH_RETURN_TO_KEY);
        sessionStorage.removeItem(OAUTH_RETURN_TO_KEY);
      } catch { /* A missing saved context must not hide the sign-in result. */ }
      const destination = safeOAuthReturnPath(requestedReturn || `${url.pathname}${url.search}${url.hash}`, url.origin);
      // Stay in this mounted page: update the session and restore the form or
      // console directly, instead of reloading the complete website again.
      window.history.replaceState(window.history.state, "", destination);
      window.dispatchEvent(new Event(OAUTH_RESTORE_EVENT));
    };

    const recoverSession = async () => {
      try {
        if (callbackError) throw { code: callbackError };
        if (isCallback && !code) throw new Error("Missing sign-in code");
        const result = code ? await exchangeOAuthCodeOnce(authClient, code) : await authClient.auth.getSession();
        if (result.error) throw result.error;
        if (code && !result.data.session) throw new Error("Missing sign-in session");
        if (!active) return;
        if (result.data.session?.user) handleUserSession(result.data.session.user);
        if (isCallback) {
          setIsAuthOpen(false);
          setAuthError(null);
          pushToast("Signed in successfully.");
        }
      } catch (error) {
        if (active) setAuthError(oauthFailureMessage(error));
      } finally {
        if (active) {
          if (isCallback) restoreAfterOAuth();
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
  }, [handleUserSession, pushToast]);

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

    if (isSubmitOpen) {
      try {
        sessionStorage.setItem(OAUTH_SUBMIT_DRAFT_KEY, JSON.stringify({
          title: newTitle,
          tagline: newTagline,
          url: newUrl,
          description: newDescription,
          pricingModel: newPricingModel,
          platforms: newPlatforms,
          targetAudience: newTargetAudience,
          makerStory: newMakerStory,
          feedbackRequest: newFeedbackRequest,
          maker: newMaker,
          twitter: newTwitter,
          logo: newLogo,
          source: submitSource,
        }));
      } catch {
        // Continue authentication even when browser storage is unavailable.
      }
    }

    const returnUrl = new URL(window.location.href);
    returnUrl.searchParams.delete("code");
    returnUrl.searchParams.delete("error");
    returnUrl.searchParams.delete("error_description");
    if (isSubmitOpen) returnUrl.searchParams.set("submit", "1");
    if (currentView === "console" || (isSubmitOpen && submitSource === "console")) {
      returnUrl.searchParams.set("view", "console");
    }
    const returnTo = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
    sessionStorage.setItem(OAUTH_RETURN_TO_KEY, returnTo);
    const callbackUrl = new URL("/auth/callback", window.location.origin);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl.toString(),
        skipBrowserRedirect: true,
      },
    });
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
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("Supabase signOut error:", err);
      }
    }
    
    // Forcefully clean up client state in all scenarios (live & local sandbox fallback)
    setUserLoggedIn(false);
    setMockUserTwitter("");
    setUserAuthType(null);
    setUserSupabaseId("");
    setUserEmail("");
    setCurrentView("home", { replace: true });
    if (typeof window !== "undefined") {
      localStorage.removeItem("ship_duel_sandbox_user");
    }
  };
  
  // Custom Success Modal States
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [successModalTitle, setSuccessModalTitle] = useState("");
  const [successModalText, setSuccessModalText] = useState("");
  
  // New York countdown & 3-2-1-1 active timer states
  const [countdownToMidnightMs, setCountdownToMidnightMs] = useState<number>(0);
  const [activeRoundRemainingMs, setActiveRoundRemainingMs] = useState<number>(0);
  

  // Keep latestBracketRef synchronized with bracket state to avoid closure staleness
  const latestBracketRef = useRef<Bracket | null>(null);
  const isResettingRef = useRef(false);
  const isSyncLockedRef = useRef(false);
  const isRolloverPendingRef = useRef(false);
  const isSettleRequestedRef = useRef(false);
  useEffect(() => {
    latestBracketRef.current = bracket;
  }, [bracket]);

  // Synchronize state changes to memoryCache and localStorage cache (SWR Sync)
  useEffect(() => {
    if (!isInitialSyncDone.current) return;
    if (products) {
      memoryCache.products = products;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("indieclash_client_cache", JSON.stringify(memoryCache));
        } catch {}
      }
    }
  }, [products]);

  useEffect(() => {
    if (!isInitialSyncDone.current) return;
    memoryCache.bracket = bracket;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("indieclash_client_cache", JSON.stringify(memoryCache));
      } catch {}
    }
  }, [bracket]);

  useEffect(() => {
    if (!isInitialSyncDone.current) return;
    if (pastChampions) {
      memoryCache.champs = pastChampions;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("indieclash_client_cache", JSON.stringify(memoryCache));
        } catch {}
      }
    }
  }, [pastChampions]);

  // Sync products and bracket from cloud or local storage with Stale-While-Revalidate
  const syncCloudData = useCallback(async () => {
    if (isResettingRef.current || isSyncLockedRef.current) {
      console.log("ℹ️ [INDIE CLASH] syncCloudData bypassed because operation lock is active.");
      return;
    }
    // 1. Load cache from localStorage if memory is empty
    if (!memoryCache.products && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("indieclash_client_cache");
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<typeof memoryCache>;
          if (parsed && Array.isArray(parsed.products)) {
            // Filter out any mock SEED_PRODUCTS from previous offline cache
            const cachedProducts = parsed.products.filter((product): product is Product => (
              Boolean(product?.id)
              && !/^p[1-9]/.test(product.id)
              && product.makerName !== "Lucas Kent"
            ));
            memoryCache = {
              products: cachedProducts,
              bracket: parsed.bracket ?? null,
              champs: Array.isArray(parsed.champs) ? parsed.champs : null,
              lastFetchTime: typeof parsed.lastFetchTime === "number" ? parsed.lastFetchTime : 0,
            };
          }
        }
      } catch {}
    }

    // 2. Render cached data instantly in 0ms if it exists, ONLY if current state is empty
    if (memoryCache.products && memoryCache.products.length > 0) {
      setProducts((current) => current.length > 0 ? current : memoryCache.products!);
    }
    if (memoryCache.champs && memoryCache.champs.length > 0) {
      setPastChampions((current) => current.length > 0 ? current : memoryCache.champs!);
    }
    if (memoryCache.bracket) {
      setBracket((current) => current ?? memoryCache.bracket);
      const b = memoryCache.bracket;
      setActiveMatch(firstOpenBracketMatch(b));
    }

    // 3. Skip background fetch if we did one in the last 1 second (reduced from 3s to prevent stale data)
    const now = Date.now();
    if (memoryCache.products && (now - memoryCache.lastFetchTime < 1000)) {
      isInitialSyncDone.current = true;
      return;
    }

    // 4. Background revalidation: fetch fresh database records in parallel
    try {
      const [prods, champs, b] = await Promise.all([
        fetchCloudProducts(),
        fetchCloudPastChampions(),
        fetchCloudBracket()
      ]);

      memoryCache.lastFetchTime = Date.now();

      if (prods) {
        setProducts(prods);
        memoryCache.products = prods;
      }
      
      if (champs) {
        setPastChampions(champs);
        memoryCache.champs = champs;
      }
      
      if (b) {
        setBracket(b);
        memoryCache.bracket = b;
        setActiveMatch(firstOpenBracketMatch(b));
      } else {
        setBracket(null);
        memoryCache.bracket = null;
        setActiveMatch(null);
      }

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("indieclash_client_cache", JSON.stringify(memoryCache));
        } catch {}
      }
    } catch (e) {
      console.error("Error syncing data:", e);
    } finally {
      isInitialSyncDone.current = true;
    }
  }, [setPastChampions]);

  // Initial Load
  useEffect(() => {
    // Populate memory cache with fresh server initial props immediately on mount to prevent cache downgrade & redundant DB queries
    memoryCache.products = initialProducts;
    memoryCache.champs = initialPastChampions;
    memoryCache.bracket = initialBracket;
    // An empty server payload can be a transient database/cache fallback. Do
    // not treat it as a successful fresh fetch or the client will suppress the
    // immediate Supabase revalidation and incorrectly render zero products.
    // Always perform one anonymous client revalidation. Public product logos
    // must not depend on a later authentication event to replace stale SSR or
    // browser-cached product data.
    memoryCache.lastFetchTime = 0;
    isInitialSyncDone.current = true;

    const animationFrame = window.requestAnimationFrame(() => {
      if (supabase) {
        void syncCloudData();
      } else {
        setProducts(loadProducts());
        const saved = loadBracket();
        setBracket(saved);
        if (saved) {
          setActiveMatch(firstOpenBracketMatch(saved));
        }
      }

    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [initialBracket, initialPastChampions, initialProducts, syncCloudData]);

  // Poll safe public views instead of subscribing to private base-table WAL rows.
  useEffect(() => {
    if (!supabase) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void syncCloudData();
    };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [syncCloudData]);

  // Load critiques for the active match dynamically from Supabase or localStorage
  useEffect(() => {
    if (!activeMatch) {
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
  }, [activeMatch]);

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
  }, [bracket, activeMatch, syncCloudData, tryAutoRollover, userLoggedIn]);

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
        shipTimeframe: Math.random() > 0.5 ? "24h" : Math.random() > 0.5 ? "48h" : "7d",
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
    memoryCache = {
      products: mockShowcase,
      bracket: null,
      champs: [],
      lastFetchTime: Date.now()
    };
    
    // Synchronously write cache defaults back to localStorage immediately
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("indieclash_client_cache", JSON.stringify(memoryCache));
        localStorage.setItem("arena_products_v1", JSON.stringify(mockShowcase));
      } catch {}
    }

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
        shipTimeframe: Math.random() > 0.5 ? "24h" : Math.random() > 0.5 ? "48h" : "7d",
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

  // Onboard Submission
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingProduct) return;
    setSubmitError(null);

    if (!userLoggedIn) {
      const message = "Please link and verify your Google or GitHub identity before submitting.";
      synthClick(150, "sawtooth", 0.12);
      setSubmitError(message);
      setIsAuthOpen(true);
      return;
    }
    if (!newTitle || !newTagline || !newUrl || !newDescription) {
      const message = "Please fill in the title, tagline, URL, and description.";
      synthClick(150, "sawtooth", 0.12);
      setSubmitError(message);
      return;
    }
    if (newDescription.trim().length < 80) {
      setSubmitError("Please describe the product in at least 80 characters so visitors can understand what makes it useful.");
      return;
    }

    const normalizedUrl = newUrl.startsWith("http") ? newUrl : `https://${newUrl}`;

    isSyncLockedRef.current = true;
    setIsSubmittingProduct(true);
    try {
      let newProd: Product;
      const makerName = newMaker || "Anonymous Maker";
      const makerTwitter = newTwitter ? (newTwitter.startsWith("@") ? newTwitter : `@${newTwitter}`) : "@anonymous";
      const makerAvatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces";

      if (supabase) {
        const uploadedLogo = await uploadArenaLogo(newLogo);
        const input = {
          title: newTitle,
          tagline: newTagline,
          url: normalizedUrl,
          shipTimeframe: editingProduct?.shipTimeframe || newTimeframe,
          makerName,
          makerTwitter,
          makerAvatar,
          logo: uploadedLogo,
          description: newDescription,
          category: editingProduct?.category,
          pricingModel: newPricingModel,
          platforms: newPlatforms.split(",").map((item) => item.trim()).filter(Boolean),
          targetAudience: newTargetAudience,
          makerStory: newMakerStory,
          feedbackRequest: newFeedbackRequest,
        };
        newProd = editingProduct
          ? await updateArenaProduct(editingProduct.id, input)
          : await submitArenaProduct(input);
      } else {
        let parsedSlug = newTitle.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
        try {
          const host = new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, "");
          parsedSlug = host.split(".")[0].replace(/[^a-z0-9-]/g, "") || parsedSlug;
        } catch {}
        if (!parsedSlug) parsedSlug = `product-${Date.now()}`;
        let uniqueSlug = parsedSlug;
        while (products.some(p => p.id.toLowerCase() === uniqueSlug.toLowerCase())) {
          uniqueSlug = `${parsedSlug}-${Math.random().toString(36).slice(2, 8)}`;
        }
        newProd = {
          ...(editingProduct || {}),
          id: editingProduct?.id || uniqueSlug,
          title: newTitle,
          tagline: newTagline,
          url: normalizedUrl,
          shipTimeframe: editingProduct?.shipTimeframe || newTimeframe,
          makerName,
          makerTwitter,
          makerAvatar: `${makerAvatar}#creator=${encodeURIComponent(mockUserTwitter)}&uid=${encodeURIComponent(userSupabaseId)}&pushed=false`,
          logo: newLogo,
          submittedAt: editingProduct?.submittedAt || new Date().toISOString(),
          queueStatus: editingProduct?.queueStatus || "waiting",
          votesCount: editingProduct?.votesCount || 0,
          creatorUsername: mockUserTwitter,
          creator_uid: userSupabaseId,
          arenaEnqueued: editingProduct?.arenaEnqueued || false,
          description: newDescription,
          category: editingProduct?.category,
          pricingModel: newPricingModel,
          platforms: newPlatforms.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean),
          targetAudience: newTargetAudience || undefined,
          makerStory: newMakerStory || undefined,
          feedbackRequest: newFeedbackRequest || undefined,
          publishedAt: editingProduct?.publishedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          qualifiedImpressions: editingProduct?.qualifiedImpressions || 0,
          exposureStatus: editingProduct?.exposureStatus || "new",
        };
      }

      const updated = editingProduct
        ? products.map((product) => product.id === editingProduct.id ? newProd : product)
        : [...products, newProd];
      synthClick(600, "sine", 0.15, 0.06);
      setProducts(updated);
      saveProducts(updated);
      if (supabase) retryOwnership();

      if (!supabase && typeof window !== "undefined") {
        try {
          const myIds = JSON.parse(localStorage.getItem("my_arena_products") || "[]");
          if (!myIds.includes(newProd.id)) myIds.push(newProd.id);
          localStorage.setItem("my_arena_products", JSON.stringify(myIds));
        } catch {}
      }

      const wasEditing = Boolean(editingProduct);
      resetProductForm();
      setSubmitError(null);
      setIsSubmitOpen(false);
      setEditingProduct(null);
      if (wasEditing) {
        pushToast("Product profile updated!", "success");
      } else if (submitSource === "home") {
        setSuccessModalTitle("PROJECT SUBMITTED 🛡️");
        setSuccessModalText("Your product has been successfully submitted and is now live on the Releases list!\n\nTo enter the 1v1 Arena matchmaking queue, click 'ENTER THE CONSOLE' below and click 'Push to Arena'.");
        setIsSuccessOpen(true);
      } else {
        pushToast("Product successfully submitted!", "success");
      }
      if (supabase) await syncCloudData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit this product.";
      setSubmitError(message);
      pushToast(message, "info");
    } finally {
      setIsSubmittingProduct(false);
      isSyncLockedRef.current = false;
    }
  };

  // Push project to arena waitlist matchmaking queue
  const handlePushToQueue = async (productId: string) => {
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
    if (!userLoggedIn) {
      synthClick(150, "sawtooth", 0.12);
      setVoteError("Please link your Google or GitHub account first to authorize your vote.");
      return;
    }
    if (voteWinnerFeedback.length < 10 || voteLoserFeedback.length < 10) {
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
      const next = current.map((product) => (
        (userSupabaseId && (product.creator_uid === userSupabaseId || (ownership.userId === userSupabaseId && ownership.ids.includes(product.id)))) || locallyOwnedIds.has(product.id)
          ? { ...product, discoveryBoostUntil }
          : product
      ));
      if (!supabase) saveProducts(next);
      return next;
    });

    setVotingMatch(null);
    setVotingTarget(null);
    setVoteWinnerFeedback("");
    setVoteLoserFeedback("");
    setVoteError("");
  };

  const handleDiscoveryAdvance = useCallback(() => playHaptics(320, "sine", 0.04, 0.02), []);
  const renderLogo = useCallback((logoStr: string, className = "w-6 h-6 object-contain") => {
    const trustedImage = trustedProductImageUrl(logoStr);
    const localPreview = !supabase && logoStr?.startsWith("data:image") ? logoStr : undefined;
    if (trustedImage || localPreview) {
      return (
        <span className={`${className} relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md`}>
          <span aria-hidden="true" className="text-base leading-none">🚀</span>
          <img
            src={trustedImage || localPreview}
            alt="Logo"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full bg-[#0b0b0d] object-contain"
            onError={(event) => {
              event.currentTarget.remove();
            }}
          />
        </span>
      );
    }
    const compactSymbol = logoStr && logoStr.length <= 8 && !logoStr.includes(":") && !logoStr.includes("/") ? logoStr : "🚀";
    return <span className="inline-block shrink-0">{compactSymbol}</span>;
  }, []);

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
  const showcaseProducts = useMemo(() => {
    // Preserve the newest-first rolling feed while keeping it bounded to the
    // latest 50 permanent product profiles.
    const sorted = [...products].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    return sorted.slice(0, 50);
  }, [products]);
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
    setVotingMatch(null); setVotingTarget(null); setVoteError("");
  });
  useModalAccessibility(isSuccessOpen, successDialogRef, () => setIsSuccessOpen(false));

  useHomeMotion(currentView === "home", arenaRootRef);

  useEffect(() => {
    if (currentView !== "home" || !currentRoundMatches.length) return;
    const media = gsap.matchMedia(arenaRootRef);
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(".match-card-item", { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.25, stagger: 0.025, ease: "power2.out", clearProps: "opacity,transform" });
    });
    return () => media.revert();
  }, [currentView, activeRoundNum, currentRoundMatches]);

  useEffect(() => {
    if (currentView !== "home" || !activeMatch) return;
    const media = gsap.matchMedia(arenaRootRef);
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(".inspector-title, .inspector-card-a, .inspector-card-b, .inspector-vs",
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.25, stagger: 0.02, ease: "power2.out", clearProps: "opacity,transform" });
    });
    return () => media.revert();
  }, [currentView, activeMatch]);

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
    <div ref={arenaRootRef} className={`arena-app min-h-screen bg-[#030303] text-[#E4E4E7] font-sans selection:bg-[#E4E4E7] selection:text-black antialiased relative pb-24 overflow-x-hidden ${isShaking ? "animate-arena-shake" : ""}`}>
      
      {/* HIGH PERFORMANCE DYNAMIC CANVAS BACKGROUND */}
      <InteractiveGrid />

      {/* FIXED TOAST NOTIFICATION CONTAINER */}
      <div role="status" aria-live="polite" className="fixed top-6 right-6 z-[200] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className="bg-[#0b0b0c] border border-white/[0.08] text-xs font-mono text-zinc-100 p-4 rounded-md flex items-center justify-between pointer-events-auto animate-fade-in-blur"
          >
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${t.type === 'success' ? 'bg-emerald-400' : 'bg-cyan-400'}`} />
              <span>{t.message}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sticky Header Navbar */}
      <header className="site-glass-nav sticky top-0 z-50 w-full border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-16 flex items-center justify-between gap-2">
          
          <div className="flex min-w-0 items-center gap-6">
            <button type="button" aria-label="Indie Clash home"
              className="flex min-h-11 items-center gap-2 cursor-pointer"
              onClick={() => {
                synthClick(300, "sine", 0.05);
                showHomeSection();
                pushToast("Welcome back to Indie-Clash!", "success");
              }}
            >
              <ClashLogo size="md" />
              <span className="font-bold text-white tracking-tight text-base sm:text-xl font-sans">
                Indie-Clash
              </span>
            </button>

            <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-zinc-200 font-sans">
              <Link href="/products" prefetch className="hover:text-white transition duration-200">Products</Link>
              <span className="text-zinc-700">/</span>
              <Link
                href="/#arena-section"
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  showHomeSection("arena-section");
                }}
                className="hover:text-white transition duration-200"
              >Arena</Link>
              <span className="text-zinc-700">/</span>
              <Link
                href="/#champions-section"
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  showHomeSection("champions-section");
                }}
                className="hover:text-white transition duration-200"
              >Champion</Link>
              <span className="text-zinc-700">/</span>
              <Link
                href="/#how-it-works-section"
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  showHomeSection("how-it-works-section");
                }}
                className="hover:text-white transition duration-200"
              >How It Works</Link>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">

            {userLoggedIn && (
              <button
                onClick={() => {
                  synthClick(300, "sine", 0.05);
                  if (currentView === "console") {
                    showHomeSection("arena-section");
                  } else {
                    setCurrentView("console");
                  }
                }}
                className="hidden sm:block py-1.5 px-3 bg-zinc-900 text-white border border-white/[0.1] hover:bg-white/[0.04] text-[10px] font-mono uppercase tracking-wider rounded-md cursor-pointer transition mr-2"
              >
                {currentView === 'console' ? "Return to Arena ➔" : "My Console"}
              </button>
            )}

            {userLoggedIn ? (
              <div className="hidden lg:flex items-center gap-3 text-xs px-3 py-1.5 text-white">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse"></span>
                <span className="hidden xl:inline text-zinc-400 text-[10px] font-mono">
                  CONNECTED: <span className="text-white font-sans font-bold">{mockUserTwitter}</span>
                </span>
                <button 
                  onClick={handleLogout}
                  className="px-2 py-0.5 text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button 
                disabled={!authReady}
                aria-busy={!authReady}
                onClick={() => setIsAuthOpen(true)}
                className="bg-[#121215] text-white border border-white/[0.1] hover:bg-white/[0.04] text-xs font-semibold px-3 py-2 rounded-md transition-all cursor-pointer"
              >
                {authReady ? "Sign in" : "Checking sign-in…"}
              </button>
            )}

            {/* Top Right Main Conversion button */}
            {currentView !== 'console' && (
              <button
                type="button"
                onClick={() => {
                  synthClick(420, "sine", 0.08, 0.04);
                  openSubmitModal('home');
                }}
                className="bg-white hover:bg-zinc-200 text-black py-2 px-3 rounded-md text-xs font-semibold tracking-tight transition duration-250 cursor-pointer"
              >
                Submit Product
              </button>
            )}

          </div>

        </div>
        <nav aria-label="Mobile navigation" className="flex items-center gap-1 overflow-x-auto border-t border-white/[0.06] px-3 lg:hidden">
          <Link href="/products" prefetch className="flex min-h-11 items-center px-3 text-sm text-zinc-300">Products</Link>
          <button type="button" onClick={() => showHomeSection("arena-section")} className="min-h-11 px-3 text-sm text-zinc-300">Arena</button>
          <button type="button" onClick={() => showHomeSection("new-and-unseen-section")} className="min-h-11 whitespace-nowrap px-3 text-sm text-zinc-300">Discover</button>
          {userLoggedIn && <button type="button" onClick={() => currentView === "console" ? showHomeSection("arena-section") : setCurrentView("console")} className="min-h-11 whitespace-nowrap px-3 text-sm text-[#A78BFA]">{currentView === "console" ? "Back to Arena" : "My Console"}</button>}
          {userLoggedIn && <button type="button" onClick={handleLogout} className="min-h-11 whitespace-nowrap px-3 text-sm text-zinc-400 xl:hidden">Sign out</button>}
        </nav>
      </header>

      {authError && !isSubmitOpen && !isAuthOpen && !votingMatch && <div role="alert" data-auth-error className="mx-auto mt-4 max-w-4xl rounded-md border border-red-400/25 bg-red-950/30 px-5 py-4 text-sm leading-6 text-red-200">
        {authError}
      </div>}

      {currentView === "console" ? (
        <MakerConsole 
          isOpen={true}
          products={consoleProducts}
          ownershipStatus={!supabase ? "ready" : ownership.userId === userSupabaseId ? ownership.status : "loading"}
          onRetryOwnership={retryOwnership}
          allProducts={products}
          activeBracket={bracket}
          userTwitter={mockUserTwitter}
          userSubId={userSupabaseId}
          onPushToQueue={handlePushToQueue}
          renderLogo={renderLogo}
          onExportCsv={handleExportCritiquesCsv}
          onSubmitProductClick={() => {
            openSubmitModal('console');
          }}
          onEditProduct={openEditProduct}
        />
      ) : (
      <div>
          {/* Hero Banner */}
          <section className="py-14 sm:py-16 border-b border-white/[0.05] relative overflow-hidden bg-gradient-to-b from-white/[0.01] to-transparent">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              
              {/* Micro monospace badge on top */}
              <div className="inline-block text-[10px] font-mono uppercase tracking-widest text-[#A78BFA] bg-[#A78BFA]/[0.05] border border-[#A78BFA]/[0.15] px-3 py-1 rounded-md mb-5 hero-badge">
                FREE PRODUCT DISCOVERY &amp; LAUNCH PLATFORM
              </div>

              {/* Extreme large title font bold tracking tight */}
              <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight text-white uppercase mb-6 leading-none hero-title">
                Every Indie Product<br />
                <span className="text-zinc-300 font-mono font-medium">DESERVES TO BE SEEN</span>
              </h1>

              {/* Centered brief description, restricted width */}
              <p className="max-w-[780px] mx-auto text-sm sm:text-base text-zinc-300 leading-relaxed font-sans tracking-wide hero-desc">
                Launch for free. Discover overlooked indie products. Join optional Arena battles for honest feedback.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-zinc-400 hero-stats">
                <span className="bg-[#0b0b0c] border border-white/[0.05] px-2.5 py-1 rounded-md uppercase tracking-wider">
                  Products Submitted: <span className="text-white font-semibold">{products.length}</span>
                </span>
              </div>

            </div>
          </section>

      {/* CORE APP WRAPPER LAYOUT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">



        {/* LIVE ARENA CLASHES (1v1 Live Showdowns) */}
        {/* LATEST RELEASES (System Audit Logs Terminal Style Grid Layout) */}
        <section id="launches-section" className="py-12 md:py-16">
          
          <div data-home-reveal="launches-heading" className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="text-left space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-white border-l-2 border-white pl-4 font-sans">
                  LATEST LAUNCHES
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-mono font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full animate-pulse flex items-center gap-1.5 shrink-0" style={{ transform: "translateZ(0)" }}>
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  Newest 50: Rolling
                </span>
              </div>
              <p className="text-sm text-zinc-400 mt-2">
                Freshly launched by indie makers.
              </p>
            </div>
          </div>
          {/* Motion stops on hover or keyboard focus without an extra control. */}
          <div 
            data-home-reveal="launches-feed"
            tabIndex={0}
            aria-label="Latest products. Focus to pause scrolling."
            onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
            className="release-feed border border-white/[0.05] bg-[#070709]/40 rounded-md overflow-hidden h-[440px] sm:h-[520px] relative"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.02) 2%, black 15%, black 85%, rgba(0,0,0,0.02) 98%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.02) 2%, black 15%, black 85%, rgba(0,0,0,0.02) 98%, transparent)',
            }}
          >
            {showcaseProducts.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-zinc-650 font-mono text-xs">
                [ No waitlist submissions enqueued in waiting room. ]
              </div>
            ) : (
              <div 
                className="flex flex-col marquee-vertical-container"
                style={{
                  animationName: 'marquee-vertical',
                  animationDuration: `${Math.max(15, showcaseProducts.length * 2.2)}s`,
                  animationTimingFunction: 'linear',
                  animationIterationCount: 'infinite',
                  willChange: 'transform'
                }}
              >
                {/* Double the list to make seamless looping possible */}
                {[...showcaseProducts, ...showcaseProducts].map((item, index) => {
                  const website = publicHttpUrl(item.url);
                  return (
                    <div 
                      key={`${item.id}-dup-${index}`} 
                      data-feed-duplicate={index >= showcaseProducts.length || undefined}
                      aria-hidden={index >= showcaseProducts.length || undefined}
                      inert={index >= showcaseProducts.length || undefined}
                      className="px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#0c0c0e]/80 transition duration-150 border-b border-white/[0.03] h-auto sm:min-h-[80px] box-border"
                    >
                      {/* Left segment */}
                      <div className="flex items-center gap-3 shrink-0">
                        {!(item.arenaEnqueued ?? (!item.makerAvatar || !item.makerAvatar.includes("pushed=false"))) ? (
                          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-white/[0.06] uppercase tracking-wider">
                            showcase
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[#A78BFA] bg-[#A78BFA]/[0.05] px-2 py-0.5 rounded border border-[#A78BFA]/[0.15] uppercase tracking-wider">
                            queued
                          </span>
                        )}
                        <span className="w-6 h-6 flex items-center justify-center shrink-0 text-base">
                          {renderLogo(item.logo, "w-6 h-6")}
                        </span>
                      </div>

                      {/* Main Product Tagline truncate flex list */}
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/products/${encodeURIComponent(item.id)}`}
                            className="font-bold text-white text-sm hover:underline hover:text-[#ffbe18] transition relative z-10 cursor-pointer"
                          >
                            {item.title}
                          </Link>
                          <span className="text-[10px] font-mono text-zinc-550">
                            by{" "}
                            <a 
                              href={`https://x.com/${item.makerTwitter ? item.makerTwitter.replace(/^@/, "") : ""}`}
                              target="_blank"
                              rel="ugc noopener noreferrer"
                              className="hover:underline hover:text-white transition duration-150 relative z-10 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              {item.makerTwitter}
                            </a>
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 truncate mt-0.5 max-w-xl">
                          {item.tagline}
                        </p>
                      </div>

                      {/* Sandbox code base external sandbox link */}
                      <div className="shrink-0 flex items-center gap-6">
                        {website ? (
                          <a
                            href={website}
                            target="_blank"
                            rel="noopener"
                            className="text-[10px] font-mono text-zinc-500 hover:text-white inline-flex items-center gap-1"
                          >
                            Demo Link <ExternalLinkIcon className="w-3 h-3 text-zinc-650" />
                          </a>
                        ) : null}


                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/products"
              className="inline-flex items-center gap-2 text-xs font-mono text-zinc-500 hover:text-white transition"
              onClick={() => synthClick(280, "sine", 0.05)}
            >
              Browse all products →
            </Link>
          </div>
        </section>

        <FairDiscoverySection
          products={products}
          renderLogo={renderLogo}
          onAdvance={handleDiscoveryAdvance}
        />

        <section id="arena-section" className="scroll-mt-20 py-20 md:py-28 relative border-t border-white/[0.05]">
          
          <div data-home-reveal="arena-heading" className="mb-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-white border-l-2 border-white pl-4 font-sans">
                ARENA · PRODUCT BATTLES
              </h2>
              <p className="text-xs text-zinc-500 mt-2">
                Two products. Honest feedback. Your vote.
              </p>
            </div>
            {bracket && bracket.status === "active" && (
              <div className="flex shrink-0">
                <span className="bg-[#0b0b0c] border border-white/[0.08] px-3.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ffbe18] animate-pulse inline-block" />
                  Round Closes In: <span className="text-white font-semibold">{formatToHMS(activeRoundRemainingMs)}</span>
                </span>
              </div>
            )}
          </div>

          {/* Arena Queue Status Bar */}
          <div data-home-reveal="arena-status" className="mb-8 bg-[#0b0b0d] border border-white/[0.06] rounded-md px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                {bracket && activeBracketSize < 16 ? "Adaptive Run" : <>Season <span className="text-white font-bold">{currentSeasonStr}</span></>}
              </span>
              {bracket ? (
                <>
                  <span className="text-white/10">|</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#A78BFA]">{getArenaFormatName(activeBracketSize)}</span>
                </>
              ) : null}
              <span className="text-white/10">|</span>
              {bracket && (bracket.status === "active" || bracket.status === "preparing") ? (
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                  <span className="text-amber-400 font-bold">LIVE</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 inline-block" />
                  Accepting entries
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                Queue: <span className="text-white font-bold">{queuedProducts.length}</span>
                {!bracket && queuedProducts.length >= 16 ? (
                  <> <span className="text-zinc-700">|</span> <span className="font-bold text-emerald-400">Locking championship</span></>
                ) : !bracket && fallbackBracketSize ? (
                  <> <span className="text-zinc-700">|</span> Daily auto-run: <span className="font-bold text-[#A78BFA]">{fallbackBracketSize} players</span> in <span className="font-bold text-zinc-300"><DailyArenaRunCountdown /></span></>
                ) : !bracket ? (
                  <> <span className="text-zinc-700">|</span> Daily minimum: <span className="font-bold text-zinc-300">2 players</span></>
                ) : (
                  <> <span className="text-zinc-700">|</span> Next full run starts at <span className="font-bold text-zinc-300">16</span></>
                )}
                {!bracket && queuedProducts.length > rosterTarget && (
                  <>
                    {" "}<span className="text-zinc-600">|</span>{" "}
                    FIFO carryover: <span className="text-[#ffbe18] font-bold">+{queuedProducts.length - rosterTarget}</span> first in the next run
                  </>
                )}
              </span>
              <div className="w-20 h-1.5 bg-white/[0.04] rounded-full overflow-hidden shrink-0">
                <div 
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ 
                    width: `${Math.min((queuedProducts.length / (bracket ? 16 : rosterTarget)) * 100, 100)}%`,
                    backgroundColor: queuedProducts.length >= (bracket ? 16 : rosterTarget) ? '#34d399' : '#a78bfa'
                  }}
                />
              </div>
            </div>
          </div>

          {bracket && bracket.status === "active" ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column: Matchup Slate (Grid of matches) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-[#0b0b0d] border border-white/[0.05] p-4 rounded-md">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
                    MATCH SLATE // ROUND STATUS
                  </span>
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-xs font-mono font-bold text-white uppercase">
                      {activeRoundNum === 1 ? "Round of 16" : activeRoundNum === 2 ? "Quarterfinals" : activeRoundNum === 3 ? "Semifinals" : "Grand Finals"}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400">
                      {currentRoundMatches.filter(m => !m.winnerId).length} Active Duels
                    </span>
                  </div>
                </div>

                <div className="space-y-3 max-h-[70vh] lg:max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
                  {currentRoundMatches.map((duel) => {
                    const isDuelActive = !duel.winnerId && activeRoundRemainingMs > 0;
                    const awaitingSettlement = !duel.winnerId && activeRoundRemainingMs <= 0;
                    const isSelected = activeMatch?.id === duel.id;
                    const sumVotes = duel.votesA + duel.votesB;
                    const ratioA = sumVotes > 0 ? Math.round((duel.votesA / sumVotes) * 100) : 50;
                    const ratioB = sumVotes > 0 ? 100 - ratioA : 50;

                    return (
                      <div
                        key={duel.id}
                        onClick={() => {
                          synthClick(250, "sine", 0.05);
                          setActiveMatch(duel);
                          pushToast(`Inspecting matchup: ${duel.productA.title} vs ${duel.productB.title}`, "info");
                        }}
                        className={`p-4 bg-[#0a0a0c]/80 border rounded-md cursor-pointer transition-all duration-200 text-left hover:border-white/[0.15] hover:bg-[#0e0e11]/80 hover:-translate-y-0.5 match-card-item ${
                          isSelected ? "border-white/[0.2] bg-[#121215]/90 shadow-[0_0_15px_rgba(255,255,255,0.02)]" : "border-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3 text-[9px] font-mono text-zinc-500">
                          <span>MATCH ID: {duel.id.slice(0, 8)}</span>
                          {isDuelActive ? (
                            <span className="text-emerald-400 bg-emerald-400/[0.05] border border-emerald-400/[0.15] px-1.5 py-0.2 rounded flex items-center gap-1 uppercase tracking-wider font-semibold">
                              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                              Active
                            </span>
                          ) : (
                            <span className="text-zinc-500 bg-white/[0.03] border border-white/[0.06] px-1.5 py-0.2 rounded uppercase tracking-wider">
                              {awaitingSettlement ? "Awaiting settlement" : "Concluded"}
                            </span>
                          )}
                        </div>

                        {/* Versus Symmetrical Lineup */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-base shrink-0">{renderLogo(duel.productA?.logo, "w-5 h-5")}</span>
                            <span className={`text-xs font-bold truncate ${isSelected ? "text-white" : "text-zinc-350"}`}>
                              {duel.productA?.title || "Pending"}
                            </span>
                          </div>
                          
                          <span className="text-[10px] font-mono font-medium text-zinc-650 shrink-0 px-2">VS</span>

                          <div className="flex-1 min-w-0 flex items-center justify-end gap-2 text-right">
                            <span className={`text-xs font-bold truncate ${isSelected ? "text-white" : "text-zinc-350"}`}>
                              {duel.productB?.title || "Pending"}
                            </span>
                            <span className="text-base shrink-0">{renderLogo(duel.productB?.logo, "w-5 h-5")}</span>
                          </div>
                        </div>

                        {/* Settle status preview / Score slider */}
                        <div className="mt-3.5 space-y-1">
                          <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                            <span>{ratioA}% ({duel.votesA}v)</span>
                            <span>{duel.votesB}v ({ratioB}%)</span>
                          </div>
                          <div className="h-1 bg-zinc-900 w-full rounded-full overflow-hidden flex">
                            <div className="bg-white h-full transition-all duration-500 ease-out" style={{ width: `${ratioA}%` }} />
                            <div className="bg-zinc-800 h-full flex-1" />
                          </div>
                        </div>

                        {/* Winner stamp if concluded */}
                        {!isDuelActive && duel.winnerId && (
                          <div className="mt-2 text-[9px] font-mono text-center text-[#A78BFA] bg-[#A78BFA]/[0.05] border border-[#A78BFA]/[0.12] py-0.5 rounded uppercase tracking-wider font-semibold">
                            Winner: {duel.winnerId === duel.productA?.id ? (duel.productA?.title || "Pending") : (duel.productB?.title || "Pending")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Combat Inspector Panel (Sticky) */}
              <div className="lg:col-span-7 lg:sticky lg:top-20 space-y-4">
                {activeMatch ? (
                  (() => {
                    const duel = activeMatch;
                    const isDuelActive = !duel.winnerId && activeRoundRemainingMs > 0;
                    const awaitingSettlement = !duel.winnerId && activeRoundRemainingMs <= 0;
                    const sumVotes = duel.votesA + duel.votesB;
                    const ratioA = sumVotes > 0 ? Math.round((duel.votesA / sumVotes) * 100) : 50;
                    const ratioB = sumVotes > 0 ? 100 - ratioA : 50;
                    

                    return (
                      <div className="bg-[#0a0a0c]/80 border border-white/[0.08] rounded-md overflow-hidden premium-glass p-6 md:p-8 space-y-6 transition-all duration-300 animate-fade-in-blur inspector-panel">
                        
                        {/* Title Bar */}
                        <div className="flex items-center justify-between border-b border-white/[0.04] pb-4 inspector-title">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[9px] uppercase tracking-wider font-semibold bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded text-zinc-300">
                              ROUND {activeRoundNum} {"//"} BATTLE INSPECTOR
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            {duel.productA && duel.productB ? (
                              <a
                                href={`/versus/${duel.productA.id}-vs-${duel.productB.id}`}
                                className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 transition hover:text-white"
                              >
                                Public matchup ↗
                              </a>
                            ) : null}
                            {isDuelActive ? (
                              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-400/[0.05] border border-emerald-400/[0.15] px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                DECISION OPEN
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono text-zinc-500 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded uppercase tracking-wider">
                                {awaitingSettlement ? "AWAITING SETTLEMENT" : "CONCLUDED"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Interactive Duel Clash Head to Head */}
                        <div className="grid grid-cols-1 md:grid-cols-7 gap-4 items-center">
                          
                          {/* Product A block */}
                          <div className="md:col-span-3 p-4 bg-zinc-950/40 border border-white/[0.03] rounded-md text-left flex flex-col justify-between min-h-[160px] inspector-card-a">
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-base">{renderLogo(duel.productA?.logo, "w-6 h-6")}</span>
                                <span className="text-[9px] font-mono text-zinc-500">{duel.productA?.makerTwitter}</span>
                              </div>
                              <h3 className="truncate text-base font-bold text-white">
                                {duel.productA ? <a href={`/products/${duel.productA.id}`} className="transition hover:text-[#ffbe18]">{duel.productA.title}</a> : "Pending"}
                              </h3>
                              <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed">{duel.productA?.tagline}</p>
                            </div>
                            <div className="mt-4 space-y-2">
                              {publicHttpUrl(duel.productA?.url) && (
                                <a
                                  href={publicHttpUrl(duel.productA?.url)}
                                  target="_blank"
                                  rel="noopener"
                                  className="w-full py-1.5 px-3 text-[10px] font-bold rounded border border-white/[0.08] bg-zinc-950 hover:bg-white/[0.03] text-zinc-300 hover:text-white transition-all text-center flex items-center justify-center gap-1 uppercase tracking-wider cursor-pointer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Visit Demo 🔗
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  setVotingMatch(duel);
                                  setVotingTarget(duel.productA);
                                  setVoteWinnerFeedback("");
                                  setVoteLoserFeedback("");
                                  setVoteError("");
                                }}
                                disabled={!isDuelActive || !duel.productA}
                                className={`w-full py-2 px-3 text-[10px] font-bold rounded transition-all cursor-pointer uppercase tracking-wider ${
                                  !isDuelActive
                                  ? duel.winnerId === duel.productA?.id 
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-not-allowed" 
                                    : "bg-zinc-950 text-zinc-650 border border-white/[0.02] cursor-not-allowed"
                                  : !duel.productA
                                    ? "bg-zinc-950 text-zinc-650 border border-white/[0.02] cursor-not-allowed"
                                    : "bg-white text-black hover:bg-zinc-200"
                                }`}
                              >
                                {duel.winnerId === duel.productA?.id ? "🏆 WINNER" : isDuelActive ? "VOTE FOR A" : awaitingSettlement ? "VOTING CLOSED" : "DEFEATED"}
                              </button>
                            </div>
                          </div>

                          {/* VS center block */}
                          <div className="md:col-span-1 flex flex-col items-center justify-center py-2 inspector-vs">
                            <span className="text-zinc-700 font-mono tracking-widest text-[9px] uppercase">VS</span>
                            <div className="flex flex-col items-center mt-2 leading-tight">
                              <span className="font-mono font-bold text-lg text-white">{ratioA}%</span>
                              <span className="font-mono font-semibold text-zinc-500 text-[10px]">{ratioB}%</span>
                            </div>
                            <span className="text-[8px] font-mono text-zinc-500 mt-2 uppercase tracking-widest">{sumVotes} Voted</span>
                          </div>

                          {/* Product B block */}
                          <div className="md:col-span-3 p-4 bg-zinc-950/40 border border-white/[0.03] rounded-md text-left flex flex-col justify-between min-h-[160px] inspector-card-b">
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-base">{renderLogo(duel.productB?.logo, "w-6 h-6")}</span>
                                <span className="text-[9px] font-mono text-zinc-500">{duel.productB?.makerTwitter}</span>
                              </div>
                              <h3 className="truncate text-base font-bold text-white">
                                {duel.productB ? <a href={`/products/${duel.productB.id}`} className="transition hover:text-[#ffbe18]">{duel.productB.title}</a> : "Pending"}
                              </h3>
                              <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed">{duel.productB?.tagline}</p>
                            </div>
                            <div className="mt-4 space-y-2">
                              {publicHttpUrl(duel.productB?.url) && (
                                <a
                                  href={publicHttpUrl(duel.productB?.url)}
                                  target="_blank"
                                  rel="noopener"
                                  className="w-full py-1.5 px-3 text-[10px] font-bold rounded border border-white/[0.08] bg-zinc-950 hover:bg-white/[0.03] text-zinc-300 hover:text-white transition-all text-center flex items-center justify-center gap-1 uppercase tracking-wider cursor-pointer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Visit Demo 🔗
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  setVotingMatch(duel);
                                  setVotingTarget(duel.productB);
                                  setVoteWinnerFeedback("");
                                  setVoteLoserFeedback("");
                                  setVoteError("");
                                }}
                                disabled={!isDuelActive || !duel.productB}
                                className={`w-full py-2 px-3 text-[10px] font-bold rounded transition-all cursor-pointer uppercase tracking-wider ${
                                  !isDuelActive
                                  ? duel.winnerId === duel.productB?.id 
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-not-allowed" 
                                    : "bg-zinc-950 text-zinc-650 border border-white/[0.02] cursor-not-allowed"
                                  : !duel.productB
                                    ? "bg-zinc-950 text-zinc-650 border border-white/[0.02] cursor-not-allowed"
                                    : "bg-white text-black hover:bg-zinc-200"
                                }`}
                              >
                                {duel.winnerId === duel.productB?.id ? "🏆 WINNER" : isDuelActive ? "VOTE FOR B" : awaitingSettlement ? "VOTING CLOSED" : "DEFEATED"}
                              </button>
                            </div>
                          </div>

                        </div>

                        {/* Symmetrical Tug of War Slider bar */}
                        <div className="space-y-1.5">
                          <div className="h-1.5 bg-zinc-900 w-full rounded-full overflow-hidden flex">
                            <div className="bg-white h-full transition-all duration-500 ease-out" style={{ width: `${ratioA}%` }} />
                            <div className="bg-zinc-800 h-full flex-1" />
                          </div>
                        </div>



                        {/* Peer Critiques chronicles */}
                        <div className="pt-4 border-t border-white/[0.04] space-y-4">
                          <div className="flex items-center justify-between border-b border-white/[0.03] pb-2">
                            <h4 className="text-[9px] font-mono uppercase tracking-widest text-zinc-400">
                              PEER CRITIQUE CHRONICLES ({activeMatchCritiques.length})
                            </h4>
                            <span className="text-[8px] font-mono text-zinc-500 uppercase">
                              verified feedback stream
                            </span>
                          </div>



                          {/* Comments list inside inspector */}
                          <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                            {activeMatchCritiques.map((c) => {
                              const isProductA = c.role.includes(duel.productA.title) || c.text.toLowerCase().includes(duel.productA.title.toLowerCase());
                              const badgeColor = isProductA
                                ? "bg-white/[0.04] text-white border border-white/[0.08]"
                                : "bg-zinc-950 text-zinc-400 border border-white/[0.04]";
                              const auditedName = isProductA ? duel.productA.title : duel.productB.title;
                              return (
                                <div
                                  key={c.id}
                                  className="p-3 bg-zinc-950/20 border border-white/[0.03] hover:border-white/[0.08] transition duration-150 rounded text-left space-y-1"
                                >
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] font-mono font-bold text-white">{c.voter}</span>
                                      <span className={`text-[8px] font-mono uppercase px-1.5 py-0.2 rounded ${badgeColor}`}>
                                        audited {auditedName}
                                      </span>
                                    </div>
                                    <span className="text-[9px] text-zinc-600 font-mono">{c.date}</span>
                                  </div>
                                  <p className="text-[11px] text-zinc-450 leading-relaxed pl-1">
                                    {c.text}
                                  </p>
                                </div>
                              );
                            })}

                            {activeMatchCritiques.length === 0 && (
                              <div className="p-6 text-center text-zinc-650 font-mono text-[10px] border border-dashed border-white/[0.04] rounded">
                                [ No verified peer critiques enqueued for this matchup. ]
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })()
                ) : (
                  <div className="bg-[#0a0a0c]/80 border border-white/[0.05] rounded-md p-12 text-center text-zinc-500 font-mono text-xs">
                    [ SELECT A MATCHUP FROM THE LEFT SLATE TO INSPECT ]
                  </div>
                )}
              </div>

            </div>
          ) : (
            /* ========================================================
                WAITLIST QUEUE PREPARING SCREEN
               ======================================================== */
            <div className="bg-[#121215] border border-white/[0.06] p-8 sm:p-12 text-white text-center max-w-2xl mx-auto rounded-lg">
              
              {/* Sleek countdown timer pill */}
              {lineupProducts.length >= 16 && (
                <div className="flex justify-center mb-6">
                  <span className="bg-[#0b0b0c] border border-white/[0.08] px-3.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    Cycle Closes: <span className="text-white font-semibold">{formatToHMS(countdownToMidnightMs)}</span>
                  </span>
                </div>
              )}

              <div className="inline-block relative w-36 h-36 mb-6">
                <svg className="w-full h-full transform -rotate-90">
                  <circle 
                    cx="72" 
                    cy="72" 
                    r="62" 
                    stroke="rgba(255,255,255,0.04)" 
                    strokeWidth="6" 
                    fill="transparent" 
                  />
                  <circle 
                    cx="72" 
                    cy="72" 
                    r="62" 
                    stroke="#ffffff" 
                    strokeWidth="6" 
                    fill="transparent" 
                    strokeDasharray={390}
                    strokeDashoffset={390 - (390 * Math.min(lineupProducts.length, rosterTarget)) / rosterTarget}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col justify-center items-center">
                  {bracket?.status === "preparing" ? (
                    <>
                      <span className="text-xl font-bold text-white font-mono tracking-tight">{formatToHMS(countdownToMidnightMs)}</span>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider mt-1">Starts In</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-semibold text-white">{Math.min(lineupProducts.length, rosterTarget)} / {rosterTarget}</span>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mt-1">Ready</span>
                    </>
                  )}
                </div>
              </div>

              <h2 className="text-lg sm:text-xl font-sans font-semibold tracking-tight uppercase mb-3 text-white">
                {bracket?.status === "preparing" ? `${getArenaFormatName(activeBracketSize)} Ready` : "Assembling Next Arena"}
              </h2>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Sixteen products lock a Championship roster immediately, with voting opening at the next New York midnight. The daily cutoff also starts the largest ready 8, 4, or 2-product run automatically.
              </p>
              <p className="mt-3 text-[9px] font-mono uppercase tracking-wider text-zinc-600">
                Tie rule: the higher verified vote total wins, and every vote contains two critiques. A tied count advances the earlier submission; exact timestamp ties use a stable product-ID decision. Zero-vote matches still advance.
              </p>

              {/* Roster Slots Grid (Street Fighter style character select) */}
              <div className="mt-8 pt-6 border-t border-white/[0.05] max-w-md mx-auto">
                <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-4">
                  Roster Lineup ({Math.min(lineupProducts.length, rosterTarget)} / {rosterTarget})
                </span>
                <div className="grid gap-2.5 justify-center" style={{ gridTemplateColumns: `repeat(${Math.min(rosterTarget, 8)}, 2.75rem)` }}>
                  {Array.from({ length: rosterTarget }).map((_, idx) => {
                    const prod = lineupProducts[idx];
                    if (prod) {
                      return (
                        <button 
                          key={idx} 
                          onClick={(e) => {
                            e.preventDefault();
                            synthClick(300, "sine", 0.05);
                            setActiveCardProduct(prod);
                          }}
                          className="w-11 h-11 rounded-lg flex items-center justify-center text-lg select-none border transition-all duration-300 bg-[#141417] border-white/[0.12] text-white shadow-md shadow-black/40 hover:scale-105 cursor-pointer hover:border-amber-400/50 hover:shadow-[0_0_8px_rgba(245,158,11,0.15)]"
                          title={prod.title}
                        >
                          {renderLogo(prod.logo, "w-7 h-7 object-contain")}
                        </button>
                      );
                    }
                    return (
                      <div 
                        key={idx} 
                        className="w-11 h-11 rounded-lg flex items-center justify-center text-lg select-none border transition-all duration-300 bg-black/40 border-dashed border-white/[0.06] text-zinc-700"
                        title="Empty Slot"
                      >
                        <span className="text-[10px] font-mono font-light opacity-30">?</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* THE HALL OF VALOR — HISTORIC CHAMPIONS */}
        <section id="champions-section" className="scroll-mt-20 py-20 md:py-28 border-t border-white/[0.05]">
          <div data-home-reveal="champions-heading" className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="text-left">
              <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-white border-l-2 border-white pl-4 font-sans">
                THE HALL OF VALOR
              </h2>
              <p className="text-xs text-zinc-500 mt-2">
                Conquerors of the 1v1 arena who have secured eternal glory and completed their seasons.
              </p>
            </div>
          </div>

          {pastChampions && pastChampions.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {pastChampions.map((c, idx) => (
                <div 
                  key={c.id} 
                  className="p-5 border border-white/[0.06] bg-[#09090b]/80 rounded-md hover:border-white/[0.15] hover:-translate-y-1 hover:bg-[#0c0c0f]/95 hover:shadow-[0_4px_20px_rgba(255,255,255,0.02)] transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-2xl flex items-center justify-center">
                        {renderLogo(c.logo, "w-8 h-8")}
                      </span>
                      <span className="border border-white/[0.08] text-[9px] font-mono px-2 py-0.5 uppercase bg-white/[0.04] text-zinc-300 rounded tracking-wider">
                        SEASON {String(idx + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <a 
                      href={`/products/${c.id}`}
                      className="font-sans text-xs hover:underline uppercase block mb-1 text-white font-semibold tracking-wide hover:text-[#ffbe18] transition"
                    >
                      {c.title}
                    </a>
                    <p className="text-[10px] leading-relaxed line-clamp-2 mb-4 text-zinc-400 font-sans">{c.tagline}</p>
                  </div>
                  
                  <div className="flex items-center justify-between border-t border-white/[0.06] pt-3.5 text-[10px] font-mono text-zinc-400">
                    <div className="flex items-center space-x-2">
                      <img src={c.makerAvatar} alt="Maker" className="w-5 h-5 border border-white/[0.08] rounded-md shrink-0" />
                      <a 
                        href={`https://x.com/${c.makerTwitter.replace(/^@/, "")}`}
                        target="_blank"
                        rel="ugc noopener noreferrer"
                        className="hover:underline font-semibold text-zinc-400 hover:text-white"
                      >
                        {c.makerTwitter}
                      </a>
                    </div>
                    {publicHttpUrl(c.url) ? (
                      <a
                        href={publicHttpUrl(c.url)}
                        target="_blank"
                        rel="noopener"
                        className="text-[10px] uppercase font-mono underline text-white hover:text-zinc-300 transition-colors"
                      >
                        DEMO
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-white/[0.06] bg-[#070709]/30 rounded-md p-16 text-center text-zinc-500 font-mono text-xs max-w-xl mx-auto flex flex-col items-center justify-center space-y-3">
              <svg className="w-8 h-8 text-zinc-650 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
              </svg>
              <span>[ NO CHAMPION HAS CONQUERED THE ARENA YET ]</span>
              <span className="text-[10px] text-zinc-600">Be the first to claim eternal glory and enter the Hall of Valor!</span>
            </div>
          )}
        </section>

        {/* HOW IT WORKS SECTION */}
        <section id="how-it-works-section" className="scroll-mt-20 py-16 border-t border-white/[0.05]">
          <div data-home-reveal="how-heading" className="mb-12">
            <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-white border-l-2 border-white pl-4 font-sans">
              HOW IT WORKS
            </h2>
            <p className="text-xs text-zinc-500 mt-2 font-sans">
              Here, victory isn&apos;t bought with upvotes. It is earned through authentic, peer-reviewed execution.
            </p>
          </div>

          <div data-home-reveal="how-steps" className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Step 1 */}
            <div className="bg-[#0b0b0d] border border-white/[0.06] rounded-md p-6 flex flex-col justify-between hover:border-white/[0.12] transition-all duration-200">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-4xl font-extrabold font-mono text-zinc-700">01</span>
                  <span className="text-[9px] font-mono text-zinc-500 tracking-wider">STEP_01</span>
                </div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-white mb-3 font-semibold">
                  SUBMIT & QUEUE
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed font-sans font-medium">
                  Submit for free, then opt into matchmaking from My Console. Sixteen entries lock a Championship roster automatically; otherwise the daily cutoff opens the largest ready 8, 4, or 2-product FIFO run.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-white/[0.03] text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
                [ STAGE_1 : $0 FEE ]
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-[#0b0b0d] border border-white/[0.06] rounded-md p-6 flex flex-col justify-between hover:border-white/[0.12] transition-all duration-200">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-4xl font-extrabold font-mono text-zinc-700">02</span>
                  <span className="text-[9px] font-mono text-zinc-500 tracking-wider">STEP_02</span>
                </div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-white mb-3 font-semibold">
                  CRITIQUE-LOCKED VOTING
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed font-sans font-medium">
                  No casual clicks. Every voter must connect via Google or GitHub and leave a constructive dual critique of 10+ characters. This friction drastically minimizes automated bot rigging and coordinate spamming.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-white/[0.03] text-[9px] font-mono text-emerald-400 uppercase tracking-widest">
                [ MINIMIZED MANIPULATION DESIGN ]
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-[#0b0b0d] border border-white/[0.06] rounded-md p-6 flex flex-col justify-between hover:border-white/[0.12] transition-all duration-200">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-4xl font-extrabold font-mono text-zinc-700">03</span>
                  <span className="text-[9px] font-mono text-zinc-500 tracking-wider">STEP_03</span>
                </div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-white mb-3 font-semibold">
                  DUAL-FEEDBACK VALUE
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed font-sans font-medium">
                  Winners advance to the next bracket, but runners-up win where it matters: walking away with structured, highly valuable peer critiques. This feedback is 100x more valuable than empty clicks.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t border-white/[0.03] text-[9px] font-mono text-cyan-400 uppercase tracking-widest">
                [ DUAL CRITIQUE FEEDBACK ]
              </div>
            </div>

          </div>
        </section>

      </main>

      <footer className="border-t border-white/[0.05] bg-[#070709]/40 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6 text-zinc-500 text-xs">
          <div className="flex items-center space-x-1.5 font-mono">
            <span>© {new Date().getFullYear()} Indie Clash.</span>
            <span>Created by</span>
            <a 
              href="https://x.com/MaberFate" 
              target="_blank" 
              rel="noreferrer" 
              className="text-white hover:underline hover:text-amber-400 transition"
            >
              Vesper
            </a>
          </div>
          <div className="flex items-center gap-6 font-medium">
            <Link
              href="/privacy"
              className="hover:text-white transition cursor-pointer bg-transparent border-none p-0 text-zinc-550 hover:text-white text-xs font-medium"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="hover:text-white transition cursor-pointer bg-transparent border-none p-0 text-zinc-550 hover:text-white text-xs font-medium"
            >
              Terms of Use
            </Link>
            <a 
              href="mailto:support@maber.xyz" 
              className="hover:text-white transition"
            >
              Contact Support
            </a>
          </div>
        </div>
      </footer>
      </div>
      )}

      {/* ========================================================
          Tactile Slide-over Drawer for new submissions
         ======================================================== */}
      {isSubmitOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in"
            onClick={closeSubmitModal}
          />
          <div ref={submitDialogRef} role="dialog" aria-modal="true" aria-labelledby="product-form-title" tabIndex={-1} className="product-form-dialog max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-md border border-white/[0.12] bg-[#0b0b0d] p-4 sm:p-6 text-sm text-[#E4E4E7] relative z-10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
              <h3 id="product-form-title" className="text-base font-semibold text-white tracking-tight font-sans flex items-center gap-2 uppercase">
                <PlusIcon className="w-4 h-4 text-[#A78BFA]" /> {editingProduct ? "EDIT PRODUCT PROFILE" : "SUBMIT PROJECT"}
              </h3>
              <button 
                type="button"
                onClick={closeSubmitModal}
                disabled={isSubmittingProduct}
                className="text-zinc-500 hover:text-white bg-zinc-950 p-1 rounded-md border border-white/[0.05] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={editingProduct ? "Close product editor" : "Close product submission"}
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-zinc-400 font-sans text-[11px] leading-relaxed">
              {editingProduct
                ? "Complete this permanent profile without changing its URL, submission date, votes, or Arena history."
                : "Publish a permanent product profile first. Arena participation is optional and can be enabled from your console after submission."}
            </p>

            {/* Auth Status Segment */}
            {authError && <p role="alert" data-auth-error className="rounded-md border border-red-400/25 bg-red-950/30 p-3 text-sm leading-6 text-red-200">{authError}</p>}
            <div className="p-4 bg-[#141417] border border-white/[0.06] rounded-md flex flex-col gap-3 text-left">
              <div className="flex items-center space-x-3">
                <span className="w-8 h-8 bg-[#0b0b0d] border border-white/[0.06] flex items-center justify-center text-sm rounded-md">
                  {userAuthType === "github" ? "🐙" : "🔑"}
                </span>
                <div>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block">ACCOUNT</span>
                  {userLoggedIn ? (
                    <span className="text-xs font-semibold text-white">
                      {mockUserTwitter} <span className="text-zinc-500 font-mono">({userAuthType === "github" ? "GitHub" : "Google"})</span>
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-300 font-bold uppercase">{authReady ? "Sign in to publish" : "Checking sign-in…"}</span>
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
                  onClick={handleLogout}
                  className="text-zinc-400 hover:text-stone-200 text-[10px] underline font-mono font-bold transition duration-150 cursor-pointer self-start"
                >
                  Disconnect
                </button>
              )}
            </div>

            {submitError && (
              <div
                role="alert"
                aria-live="polite"
                className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-red-300"
              >
                {submitError}
              </div>
            )}

            <form
              onSubmit={handleSubmitProduct}
              noValidate
              aria-busy={isSubmittingProduct}
              className="space-y-4 text-left"
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="product-title" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Product Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SiteShot 📸"
                  id="product-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-black border border-white/[0.08] text-zinc-100 placeholder:text-zinc-800 p-2 text-xs rounded-md focus:border-white/[0.2] outline-none h-9"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="product-tagline" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">One-Sentence Tagline *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. High-def screenshot API with full-page scrolling..."
                  id="product-tagline"
                  value={newTagline}
                  onChange={(e) => setNewTagline(e.target.value)}
                  className="w-full bg-black border border-white/[0.08] text-zinc-100 placeholder:text-zinc-800 p-2 text-xs rounded-md focus:border-white/[0.2] outline-none h-9"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="product-url" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Demo URL *</label>
                <input
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  required
                  placeholder="https://siteshot.net"
                  id="product-url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full bg-black border border-white/[0.08] text-zinc-100 placeholder:text-zinc-800 p-2 text-xs rounded-md focus:border-white/[0.2] outline-none h-9"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="product-description" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Product Description *</label>
                  <span className="font-mono text-[9px] text-zinc-600">{newDescription.length}/2000</span>
                </div>
                <textarea
                  required
                  minLength={80}
                  maxLength={2000}
                  rows={5}
                  placeholder="Explain what the product does, who it helps, and what makes it different. This becomes the main content of your permanent profile."
                  id="product-description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full resize-y rounded-md border border-white/[0.08] bg-black p-2.5 text-xs leading-5 text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-white/[0.2]"
                />
                <p className="text-[10px] leading-4 text-zinc-600">Minimum 80 characters. Write for humans—no keyword stuffing.</p>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="product-pricing" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Pricing</label>
                <select
                  id="product-pricing"
                  value={newPricingModel}
                  onChange={(e) => setNewPricingModel(e.target.value as PricingModel)}
                  className="h-9 w-full rounded-md border border-white/[0.08] bg-black p-2 text-xs text-zinc-100 outline-none focus:border-white/[0.2]"
                >
                  {PRICING_MODELS.map((pricing) => <option key={pricing.value} value={pricing.value}>{pricing.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="product-audience" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Target Audience</label>
                  <input
                    type="text"
                    maxLength={300}
                    placeholder="e.g. Solo SaaS founders"
                    id="product-audience"
                  value={newTargetAudience}
                    onChange={(e) => setNewTargetAudience(e.target.value)}
                    className="h-9 w-full rounded-md border border-white/[0.08] bg-black p-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-800 focus:border-white/[0.2]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="product-platforms" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Platforms</label>
                  <input
                    type="text"
                    maxLength={320}
                    placeholder="Web, iOS, Windows"
                    id="product-platforms"
                  value={newPlatforms}
                    onChange={(e) => setNewPlatforms(e.target.value)}
                    className="h-9 w-full rounded-md border border-white/[0.08] bg-black p-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-800 focus:border-white/[0.2]"
                  />
                </div>
              </div>

              <details className="rounded-md border border-white/[0.07] bg-white/[0.02] p-3">
                <summary className="cursor-pointer select-none text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Tell the maker story (optional)</summary>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest" htmlFor="product-story">Why did you build it?</label>
                    <textarea
                      maxLength={1000}
                      rows={3}
                      placeholder="The problem, moment, or personal experience behind the product."
                      id="product-story" value={newMakerStory}
                      onChange={(e) => setNewMakerStory(e.target.value)}
                      className="w-full resize-y rounded-md border border-white/[0.08] bg-black p-2.5 text-xs leading-5 text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-white/[0.2]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest" htmlFor="product-feedback">What feedback would help most?</label>
                    <textarea
                      maxLength={500}
                      rows={2}
                      placeholder="e.g. Is the onboarding clear? Would this workflow save you time?"
                      id="product-feedback" value={newFeedbackRequest}
                      onChange={(e) => setNewFeedbackRequest(e.target.value)}
                      className="w-full resize-y rounded-md border border-white/[0.08] bg-black p-2.5 text-xs leading-5 text-zinc-100 outline-none placeholder:text-zinc-700 focus:border-white/[0.2]"
                    />
                  </div>
                </div>
              </details>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="product-maker" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Maker Name</label>
                  <input
                    type="text"
                    placeholder="Sarah"
                    id="product-maker"
                  value={newMaker}
                    onChange={(e) => setNewMaker(e.target.value)}
                    className="w-full bg-black border border-white/[0.08] text-zinc-100 placeholder:text-zinc-800 p-2 text-xs rounded-md focus:border-white/[0.2] outline-none h-9"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="product-twitter" className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Twitter (X)</label>
                  <input
                    type="text"
                    placeholder="@sarah_dev"
                    id="product-twitter"
                  value={newTwitter}
                    onChange={(e) => setNewTwitter(e.target.value)}
                    className="w-full bg-black border border-white/[0.08] text-zinc-100 placeholder:text-zinc-800 p-2 text-xs rounded-md focus:border-white/[0.2] outline-none h-9"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Product Logo (Max 2MB)</label>
                <div className="flex items-center space-x-4">
                  <label 
                    htmlFor="logo-upload" 
                    className="cursor-pointer flex flex-col items-center justify-center border border-dashed border-white/[0.08] hover:border-white/[0.15] bg-black w-16 h-16 rounded-md transition-all relative overflow-hidden group select-none"
                  >
                    {newLogo ? (
                      newLogo.startsWith("data:image") || newLogo.startsWith("http") ? (
                        <img src={newLogo} alt="Preview" className="w-full h-full object-contain p-1.5" />
                      ) : (
                        <span className="text-xl animate-pixel-bounce">{newLogo}</span>
                      )
                    ) : (
                      <span className="text-xl text-stone-600">＋</span>
                    )}
                    
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-[9px] uppercase text-zinc-400">Upload</span>
                    </div>
                  </label>
                  
                  <input
                    type="file"
                    id="logo-upload"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 2 * 1024 * 1024) {
                          alert("File size exceeds the 2MB limit!");
                          e.target.value = "";
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          const result = reader.result;
                          if (result && typeof result === "string") {
                            const img = new Image();
                            img.onload = () => {
                              const canvas = document.createElement("canvas");
                              const MAX_WIDTH = 128;
                              const MAX_HEIGHT = 128;
                              let width = img.width;
                              let height = img.height;
                              if (width > height) {
                                if (width > MAX_WIDTH) {
                                  height *= MAX_WIDTH / width;
                                  width = MAX_WIDTH;
                                }
                              } else {
                                if (height > MAX_HEIGHT) {
                                  width *= MAX_HEIGHT / height;
                                  height = MAX_HEIGHT;
                                }
                              }
                              canvas.width = width;
                              canvas.height = height;
                              const ctx = canvas.getContext("2d");
                              if (ctx) {
                                ctx.drawImage(img, 0, 0, width, height);
                                const resizedBase64 = canvas.toDataURL("image/jpeg", 0.85);
                                setNewLogo(resizedBase64);
                              } else {
                                setNewLogo(result);
                              }
                            };
                            img.src = result;
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                  />
                  
                  <div className="text-left flex-1">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase block mb-0.5">Image Specs</span>
                    <p className="text-[10px] text-zinc-500 leading-normal">
                      PNG, JPG, or WebP image. If skipped, default 🚀 rocket booster is used.
                    </p>
                  </div>
                </div>
              </div>

              <div className="sticky -bottom-4 sm:-bottom-6 z-20 flex justify-end gap-3 border-t border-white/[0.1] bg-[#0b0b0d] py-4">
                <button
                  type="button"
                  onClick={closeSubmitModal}
                  disabled={isSubmittingProduct}
                  className="px-4 py-2 border border-white/[0.08] hover:bg-white/[0.02] text-zinc-400 rounded-md text-xs transition duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProduct}
                  className="min-w-28 px-5 py-2 bg-white hover:bg-zinc-200 text-black font-semibold rounded-md text-xs transition duration-150 cursor-pointer disabled:cursor-wait disabled:bg-zinc-400 disabled:text-zinc-700"
                >
                  {isSubmittingProduct ? (editingProduct ? "Saving…" : "Submitting…") : (editingProduct ? "Save Changes" : "Submit Project")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          Dual-Input Voting Modal
         ======================================================== */}
      {votingMatch && votingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in"
            onClick={() => {
              setVotingMatch(null);
              setVotingTarget(null);
              setVoteWinnerFeedback("");
              setVoteLoserFeedback("");
              setVoteError("");
            }}
          />
          <div ref={voteDialogRef} role="dialog" aria-modal="true" aria-label="Vote and give feedback" tabIndex={-1} className="product-form-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain bg-[#0b0b0d] border border-white/[0.12] rounded-md p-6 w-full max-w-md relative z-10 text-sm space-y-4 text-[#E4E4E7]">
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
              <h3 className="text-sm font-semibold text-white tracking-tight font-sans flex items-center gap-2 uppercase">
                <GitCommitIcon className="w-4 h-4 text-cyan-400" /> DUELING VOTE BOX
              </h3>
              <button 
                aria-label="Close voting" onClick={() => {
                  setVotingMatch(null);
                  setVotingTarget(null);
                  setVoteWinnerFeedback("");
                  setVoteLoserFeedback("");
                  setVoteError("");
                }}
                className="text-zinc-500 hover:text-white bg-zinc-950 p-1 rounded-md border border-white/[0.05] cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">VOTING FOR</span>
              <div className="text-sm font-bold text-white uppercase mt-0.5">{votingTarget.title}</div>
            </div>

            <p className="text-zinc-400 font-sans text-[11px] leading-relaxed">
              Tell one maker what works well and give the other a useful suggestion. Sign in to submit your vote with both pieces of feedback.
            </p>

            <form onSubmit={handleVoteSubmit} noValidate className="space-y-4 text-left">
              {authError && <p role="alert" data-auth-error className="rounded-md border border-red-400/25 bg-red-950/30 p-3 text-sm leading-6 text-red-200">{authError}</p>}
              {/* Auth Verification Card */}
              <div className="p-4 bg-[#141417] border border-white/[0.06] rounded-md flex flex-col gap-3">
                <div className="flex items-center space-x-3">
                  <span className="w-8 h-8 bg-[#0b0b0d] border border-white/[0.06] flex items-center justify-center text-sm rounded-md">
                    {userAuthType === "github" ? "🐙" : "🔑"}
                  </span>
                  <div>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block">AUTHORIZATION</span>
                    {userLoggedIn ? (
                      <span className="text-xs font-semibold text-white">
                        {mockUserTwitter} <span className="text-zinc-500 font-mono">({userAuthType === "github" ? "GitHub" : "Google"})</span>
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-300 font-bold uppercase">{authReady ? "Sign in to vote" : "Checking sign-in…"}</span>
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
                    onClick={handleLogout}
                    className="text-zinc-400 hover:text-stone-200 text-[10px] underline font-mono font-bold transition duration-150 cursor-pointer self-start"
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
                  className="bg-black border border-white/[0.08] text-xs text-zinc-300 p-2.5 rounded-md focus:outline-none focus:border-white/[0.2] resize-none"
                />
                <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                  <span>Chars: {voteWinnerFeedback.length}</span>
                  <span className={voteWinnerFeedback.length >= 10 ? "text-emerald-500 font-semibold" : "text-zinc-500"}>
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
                  className="bg-black border border-white/[0.08] text-xs text-zinc-300 p-2.5 rounded-md focus:outline-none focus:border-white/[0.2] resize-none"
                />
                <div className="flex justify-between text-[9px] font-mono text-zinc-500">
                  <span>Chars: {voteLoserFeedback.length}</span>
                  <span className={voteLoserFeedback.length >= 10 ? "text-emerald-500 font-semibold" : "text-zinc-500"}>
                    {voteLoserFeedback.length >= 10 ? "✓ Ready" : `Need ${Math.max(0, 10 - voteLoserFeedback.length)} more`}
                  </span>
                </div>
              </div>

              {voteError && (
                <div className="p-2.5 bg-red-950/20 text-red-400 text-[10px] border border-red-900/30 font-mono rounded-md">
                  [ERROR]: {voteError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.05]">
                <button
                  type="button"
                  onClick={() => {
                    setVotingMatch(null);
                    setVotingTarget(null);
                    setVoteWinnerFeedback("");
                    setVoteLoserFeedback("");
                    setVoteError("");
                  }}
                  className="px-4 py-2 border border-white/[0.08] hover:bg-white/[0.02] text-zinc-400 rounded-md text-xs transition duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-white hover:bg-zinc-200 text-black font-semibold rounded-md text-xs transition duration-150 cursor-pointer"
                >
                  Submit Dual Vote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          Developer testing console (PM control panel)
         ======================================================== */}
      {process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-4 right-4 z-40 bg-[#0b0b0d]/98 border border-white/[0.12] rounded-md p-4 max-w-xs transition-all text-white text-xs space-y-3" style={{ willChange: "transform" }}>
          <div className="flex justify-between items-center pb-2 border-b border-white/[0.05]">
            <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">
              DEV_CONSOLE
            </span>
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
          </div>
          <div className="space-y-2">
            {!bracket || bracket.status === "preparing" ? (
              <>
                {bracket && (
                  <div className="p-2 bg-white/[0.02] border border-white/[0.06] text-[10px] font-mono space-y-1 text-zinc-400 rounded mb-2">
                    <div>STATUS: <strong className="text-emerald-400">{bracket.status}</strong></div>
                    <div>STAGE: <strong className="text-white">WAITLIST</strong></div>
                  </div>
                )}
                <button 
                  onClick={handleInject16}
                  className="w-full text-left px-2.5 py-1.5 bg-white text-black hover:bg-zinc-200 transition-all rounded-md font-semibold flex justify-between items-center p-2 cursor-pointer mb-2"
                >
                  <span>🚀 Inject 16 Arena Competitors</span>
                  <span className="font-mono">➔</span>
                </button>
                <button 
                  onClick={handleInject20}
                  className="w-full text-left px-2.5 py-1.5 border border-white/[0.08] hover:bg-white/[0.02] transition-all rounded-md font-mono flex justify-between items-center text-[#ffbe18] p-2 cursor-pointer mb-2"
                >
                  <span>＋ Inject 20 Showcase Products</span>
                  <span className="font-mono">⚡</span>
                </button>
                {bracket && (
                  <button
                    onClick={handleAdvanceRound}
                    className="w-full text-left px-2.5 py-1.5 bg-white text-black hover:bg-zinc-200 transition-all rounded-md font-semibold flex justify-between items-center p-2 cursor-pointer"
                  >
                    <span>⚡ Force Start (Skip Midnight)</span>
                    <span className="font-mono">➔</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="p-2 bg-white/[0.02] border border-white/[0.06] text-[10px] font-mono space-y-1 text-zinc-400 rounded">
                  <div>STATUS: <strong className="text-emerald-400">{bracket.status}</strong></div>
                  <div>STAGE: <strong className="text-white">{
                    bracket.status === "completed" ? "COMPLETED" : 
                    activeRoundNum === 1 ? "ROUND_16" : 
                    activeRoundNum === 2 ? "QUARTERS" : 
                    activeRoundNum === 3 ? "SEMIS" : "FINALS"
                  }</strong></div>
                </div>
                {bracket.status === "completed" ? (
                  <button
                    onClick={handleReset}
                    className="w-full text-left px-2.5 py-1.5 bg-[#121215] border border-white/[0.1] text-zinc-350 hover:bg-white/[0.04] transition-all rounded-md font-mono flex justify-between items-center p-2 cursor-pointer"
                  >
                    <span>🔄 Start New Season (Reset)</span>
                    <span className="font-mono">➔</span>
                  </button>
                ) : (
                  <button
                    onClick={handleAdvanceRound}
                    className="w-full text-left px-2.5 py-1.5 bg-white text-black hover:bg-zinc-200 transition-all rounded-md font-semibold flex justify-between items-center p-2 cursor-pointer"
                  >
                    <span>🏆 Settle & Advance Round</span>
                    <span className="font-mono">➔</span>
                  </button>
                )}
              </>
            )}
            <button 
              onClick={handleReset}
              className="w-full text-center py-1.5 bg-red-950/20 border border-red-900/30 text-red-400 hover:bg-red-950/40 transition-all font-mono rounded-md text-[10px] cursor-pointer"
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
          <div ref={authDialogRef} role="dialog" aria-modal="true" aria-label="Sign in" tabIndex={-1} className="product-form-dialog auth-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto p-8 w-full max-w-sm relative z-10 text-sm text-[#E4E4E7]">
            <div className="flex flex-col items-center text-center">
              <ClashLogo size="md" />
              <h3 className="mt-5 text-2xl font-semibold text-white tracking-tight">
                <span>Welcome back.</span>
              </h3>
              <button 
                aria-label="Close sign in" onClick={closeAuthDialog}
                className="auth-close absolute right-3 top-3 flex w-11 items-center justify-center rounded-full text-zinc-400 hover:bg-white/[0.06] hover:text-white"
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
          <div ref={successDialogRef} role="dialog" aria-modal="true" aria-label="Confirmation" tabIndex={-1} className="product-form-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto bg-[#0b0b0d] border border-white/[0.12] rounded-md p-6 w-full max-w-md relative z-10 text-sm space-y-4 text-center text-[#E4E4E7]">
            
            <div className="w-10 h-10 bg-white/[0.02] border border-white/[0.06] rounded-md mx-auto flex items-center justify-center text-xl font-mono">
              🛡️
            </div>
            
            <h3 className="text-sm font-semibold text-white uppercase tracking-tight font-sans">
              {successModalTitle}
            </h3>
            
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block">
              Submission Confirmed
            </span>

            <div className="bg-white/[0.02] border border-white/[0.06] p-4 text-left font-mono text-[10px] text-zinc-400 leading-relaxed whitespace-pre-line rounded-md">
              {successModalText}
            </div>

            {successModalTitle.includes("PROJECT SUBMITTED") ? (
              <button
                onClick={() => {
                  setIsSuccessOpen(false);
                  setCurrentView('console');
                }}
                className="w-full py-2.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold rounded-md transition duration-150 cursor-pointer"
              >
                ENTER THE CONSOLE ➔
              </button>
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
                className="w-full py-2.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold rounded-md transition duration-150 cursor-pointer"
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
          <div className="bg-[#0b0b0d] border border-white/[0.12] rounded-md p-6 w-full max-w-2xl relative z-10 text-xs space-y-4 text-[#E4E4E7]">
            <button 
              onClick={() => setIsPrivacyOpen(false)}
              className="absolute top-4 right-4 text-zinc-555 hover:text-white bg-zinc-950 p-1 rounded-md border border-white/[0.05] cursor-pointer"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center space-x-3 mb-2 border-b border-white/[0.05] pb-3">
              <div>
                <h3 className="font-sans text-sm uppercase tracking-wider text-white font-semibold">
                  Privacy Policy
                </h3>
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block mt-0.5">SECURE SYSTEM MATCH DATA</span>
              </div>
            </div>
            
            <div className="max-h-[50vh] overflow-y-auto pr-3 custom-scrollbar font-sans text-xs text-zinc-400 space-y-5 leading-relaxed text-left">
              <div className="bg-white/[0.02] border border-white/[0.06] px-4 py-2.5 rounded-md mb-2 flex items-center justify-between">
                <span className="text-[9px] font-mono text-zinc-450">STATUS: ACTIVE // VERIFIED</span>
                <span className="text-[9px] font-mono text-zinc-500 font-semibold">UPDATED: MAY 29, 2026</span>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-white uppercase mb-1.5 border-l-2 border-white pl-2">1. Scope & Commitment</h4>
                <p className="text-zinc-450">
                  At Indie Clash (operated by @MaberFate), we respect your privacy. This policy outlines how we handle data for our 1v1 tournament arena website. We are committed to data minimization and user security.
                </p>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-white uppercase mb-1.5 border-l-2 border-white pl-2">2. Information We Collect</h4>
                <div className="bg-white/[0.02] border border-white/[0.06] p-4 rounded-md space-y-3">
                  <div>
                    <span className="inline-block bg-white/[0.04] border border-white/[0.08] text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">OAUTH ACCOUNT METADATA</span>
                    <p className="text-zinc-450 text-[10px] leading-relaxed">
                      When you connect via Google or GitHub OAuth, we collect your verified email address, public profile name, avatar image URL, and auth provider details. This is necessary to verify your identity.
                    </p>
                  </div>
                  <div>
                    <span className="inline-block bg-white/[0.04] border border-white/[0.08] text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">PROJECT SUBMISSION DATA</span>
                    <p className="text-zinc-450 text-[10px] leading-relaxed">
                      If you submit an indie product, we collect the title, tagline, logo/emoji, maker Twitter/X handle, and live demo URL.
                    </p>
                  </div>
                  <div>
                    <span className="inline-block bg-white/[0.04] border border-white/[0.08] text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">CRITIQUES & PUBLIC VOTES</span>
                    <p className="text-zinc-450 text-[10px] leading-relaxed">
                      To participate in the arena voting process, you must submit a constructive critique. We store and publicly display the critique texts you write, alongside your voting selection.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-white uppercase mb-1.5 border-l-2 border-white pl-2">3. How We Use Your Data</h4>
                <ul className="space-y-2 text-zinc-450">
                  <li className="flex items-start space-x-2">
                    <span className="text-zinc-600 mt-0.5 shrink-0">✔</span>
                    <span><strong>Spam & Vote Rigging Prevention:</strong> Connected accounts help us prevent bots, duplicate voting, and coordinated manipulation rings.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-zinc-600 mt-0.5 shrink-0">✔</span>
                    <span><strong>Public Duel Transparency:</strong> Constructive critiques are published on the battle whiteboard. The identity linked to your account may be shown next to your feedback.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-zinc-600 mt-0.5 shrink-0">✔</span>
                    <span><strong>Tournament Operation:</strong> We use project details for matching, voting updates, rankings, and historical champion boards.</span>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-white uppercase mb-1.5 border-l-2 border-white pl-2">4. Data Sharing & Retention</h4>
                <p className="text-zinc-450">
                  We do not sell, rent, or lease your personal information. Your public display name, submitted critiques, and project links may be displayed as part of the core Indie Clash experience. Email addresses and account UUIDs remain in private, access-controlled Supabase tables.
                </p>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-white uppercase mb-1.5 border-l-2 border-white pl-2">5. Contact Us</h4>
                <p className="text-zinc-450">
                  For any privacy inquiries, data deletion requests, or support, reach out to us at:
                  <a href="mailto:support@maber.xyz" className="text-white hover:underline font-semibold ml-1">support@maber.xyz</a>.
                </p>
              </div>
            </div>

            <div className="mt-4 text-right border-t border-white/[0.05] pt-4 flex justify-between items-center">
              <span className="text-[9px] font-mono text-zinc-500 uppercase">INDIE CLASH PROTOCOL v1.0</span>
              <button
                onClick={() => setIsPrivacyOpen(false)}
                className="py-2.5 px-6 text-xs font-mono transition-all bg-white hover:bg-zinc-200 text-black font-semibold rounded-md cursor-pointer"
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
          <div className="bg-[#0b0b0d] border border-white/[0.12] rounded-md p-6 w-full max-w-2xl relative z-10 text-xs space-y-4 text-[#E4E4E7]">
            <button 
              onClick={() => setIsTermsOpen(false)}
              className="absolute top-4 right-4 text-zinc-555 hover:text-white bg-zinc-950 p-1 rounded-md border border-white/[0.05] cursor-pointer"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center space-x-3 mb-2 border-b border-white/[0.05] pb-3">
              <div>
                <h3 className="font-sans text-sm uppercase tracking-wider text-white font-semibold">
                  Terms of Use
                </h3>
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block mt-0.5">ARENA DEPLOY RULES & POLICY</span>
              </div>
            </div>
            
            <div className="max-h-[50vh] overflow-y-auto pr-3 custom-scrollbar font-sans text-xs text-zinc-400 space-y-5 leading-relaxed text-left">
              <div className="bg-white/[0.02] border border-white/[0.06] px-4 py-2.5 rounded-md mb-2 flex items-center justify-between">
                <span className="text-[9px] font-mono text-zinc-450">LICENSE AGREEMENT: PUBLIC ACCESS</span>
                <span className="text-[9px] font-mono text-zinc-500 font-semibold">UPDATED: MAY 29, 2026</span>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-white uppercase mb-1.5 border-l-2 border-white pl-2">1. Acceptance of Terms</h4>
                <p className="text-zinc-450">
                  By accessing and using Indie Clash (located at this website, created by @MaberFate), you agree to be bound by these Terms of Use. If you do not agree, please discontinue use immediately.
                </p>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-white uppercase mb-1.5 border-l-2 border-white pl-2">2. Description of Service</h4>
                <p className="text-zinc-450">
                  Indie Clash is a 1v1 product tournament bracket platform. Users submit project details, connect identity via OAuth, and participate in peer-critique voting to rank products in live battles.
                </p>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-white uppercase mb-1.5 border-l-2 border-white pl-2">3. Battle Arena Fair Play Policy</h4>
                <div className="bg-white/[0.02] border border-white/[0.06] p-4 rounded-md space-y-3 text-[10px] text-zinc-455 leading-relaxed">
                  <div>
                    <span className="inline-block bg-white/[0.04] border border-white/[0.08] text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">ZERO TOLERANCE: BOT ACTIVITY</span>
                    <p>You may not use automated scripts, bots, or fake accounts to generate votes or project queues.</p>
                  </div>
                  <div>
                    <span className="inline-block bg-white/[0.04] border border-white/[0.08] text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">ZERO TOLERANCE: COORDINATED MANIPULATION</span>
                    <p>Coordinated upvote manipulation, review exchanges, or purchasing of votes is strictly prohibited.</p>
                  </div>
                  <div>
                    <span className="inline-block bg-white/[0.04] border border-white/[0.08] text-white font-mono text-[9px] px-2 py-0.5 rounded-md mb-1 font-semibold">REQUIRED: DUAL CRITIQUE LOCK</span>
                    <p>You must leave a constructive critique of at least 10 characters summarizing positive points for the winner and actionable feedback for the runner-up. Low-effort or spam text will invalidate the vote.</p>
                  </div>
                  <p className="text-zinc-450 font-medium border-t border-white/[0.06] pt-2 font-mono text-[9px] uppercase">
                    ※ Violation results in permanent disqualification of products from current brackets & hall of valor.
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-white uppercase mb-1.5 border-l-2 border-white pl-2">4. Intellectual Property & Submissions</h4>
                <p className="text-zinc-450">
                  You retain ownership of all intellectual property rights to the products you submit. By submitting a product, you grant Indie Clash a worldwide, non-exclusive, royalty-free license to display your product details (title, tagline, logo/emoji, screenshots, maker info, and URL) publicly in the arena.
                </p>
              </div>

              <div>
                <h4 className="font-mono text-[10px] text-white uppercase mb-1.5 border-l-2 border-white pl-2">5. Limitation of Liability</h4>
                <p className="text-zinc-455">
                  Indie Clash is provided &quot;as is&quot; and &quot;as available&quot;. We do not guarantee uninterrupted service or error-free matchups. We reserve the right to modify, pause, or terminate tournament systems, brackets, or database values at our sole discretion without notice.
                </p>
              </div>
            </div>

            <div className="mt-4 text-right border-t border-white/[0.05] pt-4 flex justify-between items-center">
              <span className="text-[9px] font-mono text-zinc-500 uppercase">INDIE CLASH PROTOCOL v1.0</span>
              <button
                onClick={() => setIsTermsOpen(false)}
                className="py-2.5 px-6 text-xs font-mono transition-all bg-white hover:bg-zinc-200 text-black font-semibold rounded-md cursor-pointer"
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
            className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" 
            onClick={() => setActiveCardProduct(null)}
          />
          <div className="bg-[#0b0b0d] border border-white/[0.12] rounded-xl p-5 w-full max-w-sm relative z-10 text-xs space-y-4 text-left text-[#E4E4E7] shadow-2xl shadow-black/80">
            {/* Top close button */}
            <button 
              onClick={() => setActiveCardProduct(null)}
              className="absolute top-4 right-4 text-zinc-555 hover:text-white bg-zinc-950 p-1.5 rounded-md border border-white/[0.05] cursor-pointer"
            >
              <XIcon className="w-3 h-3" />
            </button>

            {/* Main product display */}
            <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
              <div className="w-12 h-12 bg-white/[0.03] border border-white/[0.08] rounded-xl flex items-center justify-center text-2xl shadow-inner">
                {renderLogo(activeCardProduct.logo, "w-8 h-8 object-contain")}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                  {activeCardProduct.title}
                </h3>
              </div>
            </div>

            {/* Tagline */}
            <p className="text-zinc-350 text-[11px] leading-relaxed font-sans">
              {activeCardProduct.tagline}
            </p>

            {/* URL Link Section */}
            {publicHttpUrl(activeCardProduct.url) ? <div className="bg-white/[0.02] border border-white/[0.05] p-3 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <span className="font-mono text-[9px] text-zinc-400 uppercase tracking-wider">LIVE DEMO URL</span>
              </div>
              <a 
                href={publicHttpUrl(activeCardProduct.url)}
                target="_blank" 
                rel="noopener"
                onClick={() => synthClick(400, "sine", 0.08)}
                className="text-amber-400 hover:text-amber-300 font-semibold transition-colors flex items-center gap-1 group text-[11px] border-b border-amber-400/30 hover:border-amber-300"
              >
                VIEW DEMO <span className="group-hover:translate-x-0.5 transition-transform">➔</span>
              </a>
            </div> : null}

            {/* Maker details footer */}
            <div className="pt-3 border-t border-dashed border-white/[0.08] flex items-center justify-between text-[10px] text-zinc-500 font-mono">
              <div className="flex items-center gap-2">
                {activeCardProduct.makerAvatar ? (
                  <img 
                    src={activeCardProduct.makerAvatar.split("#")[0]} 
                    alt={activeCardProduct.makerName} 
                    className="w-5 h-5 rounded-full border border-white/[0.1] object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-white/[0.1] bg-white/[0.03] flex items-center justify-center text-[8px]">👤</div>
                )}
                <span className="text-zinc-300 hover:text-white transition-colors">
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
