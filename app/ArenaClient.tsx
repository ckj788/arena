"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { gsap } from "gsap";
import { Product, Match, Bracket } from "@/lib/mockData";
import {
  loadProducts,
  saveProducts,
  loadBracket,
  saveBracket,
  buildInitialBracket,
  injectMockVotes,
  getActiveRound,
  advanceTournamentRound,
  addDummyMaker,
  fetchCloudProducts,
  upsertCloudProduct,
  saveCloudBracket,
  fetchCloudBracket,
  clearCloudData,
  fetchCloudPastChampions,
  loadLocalPastChampions,
  saveLocalPastChampions,
  fromDbProduct
} from "@/lib/arenaStore";
import { supabase, DB_PREFIX } from "@/lib/supabaseClient";
import {
  getMillisecondsToNextNYMidnight,
  getRoundRemainingMs,
  formatDuration,
  formatToHMS
} from "@/lib/timeHelpers";
import InteractiveGrid from "@/app/components/InteractiveGrid";
import ClashLogo from "@/app/components/ClashLogo";
import MakerConsole from "@/app/components/MakerConsole";

// --- GLOBAL AUDIO UTILITY FOR GEEK HAPTIC SOUNDS ---
let audioCtx: AudioContext | null = null;
const playHaptics = (freq = 220, type: OscillatorType = "sine", duration = 0.08, volume = 0.03) => {
  try {
    if (typeof window === "undefined") return;
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
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
  } catch (e) {
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

const SearchIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
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

const AlertCircleIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
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

interface ArenaClientProps {
  initialProducts: Product[];
  initialPastChampions: Product[];
  initialBracket: Bracket | null;
}

export default function ArenaClient({
  initialProducts,
  initialPastChampions,
  initialBracket
}: ArenaClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [isMuted, setIsMuted] = useState(false);
  const synthClick = (freq = 300, type: OscillatorType = "sine", duration = 0.06, vol = 0.02) => {
    if (!isMuted) {
      playHaptics(freq, type, duration, vol);
    }
  };
  const [toasts, setToasts] = useState<{ id: string; message: string; type?: "success" | "info" }[]>([]);
  const pushToast = (message: string, type: "success" | "info" = "success") => {
    const id = Math.random().toString(36).substring(4);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };
  const [activeMatchCritiques, setActiveMatchCritiques] = useState<Array<{
    id: string;
    voter: string;
    provider: string;
    role: string;
    text: string;
    date: string;
  }>>([]);
  const [searchValue, setSearchValue] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [bracket, setBracket] = useState<Bracket | null>(initialBracket);
  const [activeMatch, setActiveMatch] = useState<Match | null>(() => {
    if (!initialBracket) return null;
    const round = getActiveRound(initialBracket);
    if (round === 1) return initialBracket.round1.find(m => !m.winnerId) || initialBracket.round1[0];
    else if (round === 2) return initialBracket.round2.find(m => !m.winnerId) || initialBracket.round2[0];
    else if (round === 3) return initialBracket.round3.find(m => !m.winnerId) || initialBracket.round3[0];
    else if (round === 4) return initialBracket.round4.find(m => !m.winnerId) || initialBracket.round4[0];
    return null;
  });
  const isInitialSyncDone = useRef(false);



  // Screen shake animation state
  const [isShaking, setIsShaking] = useState(false);

  // Boot up CRT flash state
  const [isBooted, setIsBooted] = useState(false);

  // Visual dynamic clashing swords animation key state
  const [isSwordsClashing, setIsSwordsClashing] = useState(false);

  // Floating background pixel particles state
  const [particles, setParticles] = useState<Array<{ id: number; left: string; size: string; delay: string; duration: string }>>([]);

  // Live danmaku commentary simulation
  const [danmakus, setDanmakus] = useState<string[]>([
    "ZenJournal is so clean! I love the font choice",
    "LogoCraft needs to support SVG export ASAP",
    "QuickCron timing works perfectly in testing",
    "CardioAI camera tracking is amazingly responsive",
    "TypeFlow pure-keyboard design is an indie dream!",
    "SiteShot needs to support custom watermarks",
    "TailwindGlass saved me 3 hours of CSS tweaking"
  ]);

  // Submit Drawer State
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [submitSource, setSubmitSource] = useState<'home' | 'console'>('home');
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTagline, setNewTagline] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newTimeframe, setNewTimeframe] = useState<"24h" | "48h" | "7d">("48h");
  const [newMaker, setNewMaker] = useState("");
  const [newTwitter, setNewTwitter] = useState("");
  const [newLogo, setNewLogo] = useState("🚀");
  const [activeCardProduct, setActiveCardProduct] = useState<Product | null>(null);

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

  // Real-time Supabase Authentication session listener
  useEffect(() => {
    // 1. Recover mock sandbox session first if present in storage
    if (typeof window !== "undefined") {
      const savedSandbox = localStorage.getItem("ship_duel_sandbox_user");
      if (savedSandbox) {
        try {
          const parsed = JSON.parse(savedSandbox);
          if (parsed.userLoggedIn) {
            setUserLoggedIn(true);
            setMockUserTwitter(parsed.mockUserTwitter);
            setUserAuthType(parsed.userAuthType);
            setUserSupabaseId(parsed.userSupabaseId || "");
            setUserEmail(parsed.userEmail || "");
          }
        } catch (e) {
          console.warn("Failed to parse sandbox session from localStorage:", e);
        }
      }
    }

    if (!supabase) return;
    
    // 2. Manually parse OAuth fragments & parameters from URL (handles both PKCE code flow & implicit hash flow)
    if (typeof window !== "undefined") {
      // 2a. Check for PKCE flow query parameters (e.g. ?code=... or ?error=...)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const queryError = urlParams.get("error") || urlParams.get("error_description");

      if (code) {
        supabase.auth.exchangeCodeForSession(code).then(({ data, error: exchangeErr }) => {
          if (exchangeErr) {
            console.error("Error exchanging code for session manually:", exchangeErr);
          } else if (data.session?.user) {
            handleUserSession(data.session.user);
            
            // Check if we are executing inside an OAuth popup window
            if (window.opener) {
              window.opener.postMessage({
                type: "oauth_success",
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token
              }, window.location.origin);
              window.close();
            } else {
              // Clean query parameters from URL cleanly
              window.history.replaceState(null, "", window.location.pathname);
            }
          }
        }).catch(err => {
          console.error("Unhandled error exchanging code:", err);
        });
      } else if (queryError) {
        console.log("OAuth error detected in query parameters:", queryError);
        if (window.opener) {
          window.opener.postMessage({
            type: "oauth_cancel"
          }, window.location.origin);
          window.close();
        } else {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }

      // 2b. Check for implicit flow hash fragments (e.g. #access_token=... or #error=...)
      const hash = window.location.hash.substring(1);
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const hashError = hashParams.get("error") || hashParams.get("error_description");

        if (accessToken && refreshToken) {
          supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          }).then(({ data, error: sessionErr }) => {
            if (sessionErr) {
              console.error("Error setting session manually:", sessionErr);
            } else if (data.session?.user) {
              handleUserSession(data.session.user);
            }
            
            if (window.opener) {
              window.opener.postMessage({
                type: "oauth_success",
                accessToken: accessToken,
                refreshToken: refreshToken
              }, window.location.origin);
              window.close();
            } else {
              window.history.replaceState(null, "", window.location.pathname + window.location.search);
            }
          }).catch(err => {
            console.error("Unhandled error setting session manually:", err);
          });
        } else if (hashError) {
          console.log("OAuth error detected in hash fragments:", hashError);
          if (window.opener) {
            window.opener.postMessage({
              type: "oauth_cancel"
            }, window.location.origin);
            window.close();
          } else {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        }
      }
    }
    
    // 3. Get initial session safely from storage (works even with detectSessionInUrl: false)
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          handleUserSession(session.user);
        }
      })
      .catch(err => {
        console.warn("Supabase Auth session parsing warning:", err);
      });

    // 4. Listen for postMessages from popups (anti-blackscreen trick)
    const handlePopupMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      const payload = event.data;
      if (payload && typeof payload === "object") {
        if (payload.type === "oauth_success") {
          console.log("🎯 Parent window: OAuth success message with tokens received!");
          
          // Automatically close the identity modal
          setIsAuthOpen(false);
          
          if (supabase && payload.accessToken && payload.refreshToken) {
            supabase.auth.setSession({
              access_token: payload.accessToken,
              refresh_token: payload.refreshToken,
            }).then(({ data, error: sessionErr }) => {
              if (sessionErr) {
                console.error("Parent failed to set session manually:", sessionErr);
              } else if (data.session?.user) {
                handleUserSession(data.session.user);
              }
            }).catch(err => {
              console.error("Parent unhandled error setting session manually:", err);
            });
          }
        } else if (payload.type === "oauth_cancel") {
          console.log("🎯 Parent window: OAuth cancellation received!");
          // Automatically close the identity modal on cancel as well
          setIsAuthOpen(false);
        }
      }
    };
    window.addEventListener("message", handlePopupMessage);

    // 5. Listen for auth changes
    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          handleUserSession(session.user);
        } else if (event === "SIGNED_OUT") {
          setUserLoggedIn(false);
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
      subscription?.unsubscribe();
      window.removeEventListener("message", handlePopupMessage);
    };
  }, []);

  const handleUserSession = (authUser: any) => {
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
      const googleName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email || "google_user";
      username = googleName;
    }
    setMockUserTwitter(username);

    // Save sandbox backup just in case of local offline previews
    if (typeof window !== "undefined") {
      localStorage.setItem("ship_duel_sandbox_user", JSON.stringify({
        userLoggedIn: true,
        mockUserTwitter: username,
        userAuthType: provider === "google" ? "google" : "github",
        userSupabaseId: authUser.id || "",
        userEmail: authUser.email || ""
      }));
    }
  };

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
    if (typeof window !== "undefined") {
      localStorage.removeItem("ship_duel_sandbox_user");
    }
  };
  
  // Custom Success Modal States
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [successModalTitle, setSuccessModalTitle] = useState("");
  const [successModalText, setSuccessModalText] = useState("");
  
  // Leaderboard active view tab state
  const [activeTab, setActiveTab] = useState<"duel" | "leaderboard">("duel");
  
  // New York countdown & 3-2-1-1 active timer states
  const [countdownToMidnightMs, setCountdownToMidnightMs] = useState<number>(0);
  const [activeRoundRemainingMs, setActiveRoundRemainingMs] = useState<number>(0);
  
  // Past Champions & Victory Modal states
  const [pastChampions, setPastChampions] = useState<Product[]>(initialPastChampions);
  const [isChampionModalOpen, setIsChampionModalOpen] = useState(false);
  const [championWinner, setChampionWinner] = useState<Product | null>(null);
  const [currentView, setCurrentView] = useState<'home' | 'console'>('home');
  
  // Auth Form Inputs
  const [authInputVal, setAuthInputVal] = useState("");
  const [tempAuthType, setTempAuthType] = useState<"google" | "github">("google");

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
        } catch (e) {}
      }
    }
  }, [products]);

  useEffect(() => {
    if (!isInitialSyncDone.current) return;
    memoryCache.bracket = bracket;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("indieclash_client_cache", JSON.stringify(memoryCache));
      } catch (e) {}
    }
  }, [bracket]);

  useEffect(() => {
    if (!isInitialSyncDone.current) return;
    if (pastChampions) {
      memoryCache.champs = pastChampions;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("indieclash_client_cache", JSON.stringify(memoryCache));
        } catch (e) {}
      }
    }
  }, [pastChampions]);

  const syncDebounceTimeoutRef = useRef<any>(null);
  const latestRequestTimeRef = useRef<number>(0);



  // Act refs & trigger states for scroll effects
  const stepsRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [stepsRevealed, setStepsRevealed] = useState(false);
  const [dashRevealed, setDashRevealed] = useState(false);

  // Sync products and bracket from cloud or local storage with Stale-While-Revalidate
  const syncCloudData = async () => {
    if (isResettingRef.current || isSyncLockedRef.current) {
      console.log("ℹ️ [INDIE CLASH] syncCloudData bypassed because operation lock is active.");
      return;
    }
    // 1. Load cache from localStorage if memory is empty
    if (!memoryCache.products && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("indieclash_client_cache");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed) {
            memoryCache = parsed;
          }
        }
      } catch (e) {}
    }

    // 2. Render cached data instantly in 0ms if it exists, ONLY if current state is empty
    const isProductsEmpty = !products || products.length === 0;
    const isChampsEmpty = !pastChampions || pastChampions.length === 0;
    const isBracketEmpty = !bracket;

    if (isProductsEmpty && memoryCache.products && memoryCache.products.length > 0) {
      setProducts(memoryCache.products);
    }
    if (isChampsEmpty && memoryCache.champs && memoryCache.champs.length > 0) {
      setPastChampions(memoryCache.champs);
    }
    if (isBracketEmpty && memoryCache.bracket) {
      setBracket(memoryCache.bracket);
      const b = memoryCache.bracket;
      const round = getActiveRound(b);
      let active = null;
      if (round === 1) active = b.round1.find(m => !m.winnerId) || b.round1[0];
      else if (round === 2) active = b.round2.find(m => !m.winnerId) || b.round2[0];
      else if (round === 3) active = b.round3.find(m => !m.winnerId) || b.round3[0];
      else if (round === 4) active = b.round4.find(m => !m.winnerId) || b.round4[0];
      setActiveMatch(active || null);
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
        const round = getActiveRound(b);
        let active = null;
        if (round === 1) active = b.round1.find(m => !m.winnerId) || b.round1[0];
        else if (round === 2) active = b.round2.find(m => !m.winnerId) || b.round2[0];
        else if (round === 3) active = b.round3.find(m => !m.winnerId) || b.round3[0];
        else if (round === 4) active = b.round4.find(m => !m.winnerId) || b.round4[0];
        setActiveMatch(active || null);
      } else {
        setBracket(null);
        memoryCache.bracket = null;
        setActiveMatch(null);
      }

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("indieclash_client_cache", JSON.stringify(memoryCache));
        } catch (e) {}
      }
    } catch (e) {
      console.error("Error syncing data:", e);
    } finally {
      isInitialSyncDone.current = true;
    }
  };

  // Initial Load
  useEffect(() => {
    // Populate memory cache with fresh server initial props immediately on mount to prevent cache downgrade & redundant DB queries
    memoryCache.products = initialProducts;
    memoryCache.champs = initialPastChampions;
    memoryCache.bracket = initialBracket;
    memoryCache.lastFetchTime = Date.now();
    isInitialSyncDone.current = true;

    // Check if Supabase keys exist
    if (supabase) {
      syncCloudData();
    } else {
      setProducts(loadProducts());
      const saved = loadBracket();
      setBracket(saved);
      if (saved) {
        const round = getActiveRound(saved);
        let active = null;
        if (round === 1) active = saved.round1.find(m => !m.winnerId) || saved.round1[0];
        else if (round === 2) active = saved.round2.find(m => !m.winnerId) || saved.round2[0];
        else if (round === 3) active = saved.round3.find(m => !m.winnerId) || saved.round3[0];
        else if (round === 4) active = saved.round4.find(m => !m.winnerId) || saved.round4[0];
        setActiveMatch(active || null);
      }
    }

    // Trigger CRT power-on tube boot up
    setIsBooted(true);

    // Generate random pixel particles for background atmosphere
    const generated = Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: `${Math.floor(Math.random() * 5) + 3}px`,
      delay: `${Math.random() * 10}s`,
      duration: `${Math.random() * 6 + 10}s`
    }));
    setParticles(generated);


  }, []);

  // Supabase Realtime Synchronization Hook
  useEffect(() => {
    if (!supabase) return;

    // Listen to changes in the matches table
    const matchesChannel = supabase
      .channel("matches-realtime-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: `${DB_PREFIX}matches` },
        async (payload) => {
          if (isResettingRef.current || isSyncLockedRef.current) return;
          console.log("Realtime Match sync trigger received:", payload);
          
          // Debounce parallel realtime triggers to prevent WAL replication race conditions and network query spams
          if (syncDebounceTimeoutRef.current) {
            clearTimeout(syncDebounceTimeoutRef.current);
          }

          syncDebounceTimeoutRef.current = setTimeout(async () => {
            const reqTime = Date.now();
            latestRequestTimeRef.current = reqTime;

            const b = await fetchCloudBracket();
            
            // If a newer query request has already been dispatched, discard this stale response immediately
            // to completely prevent out-of-order latency rollbacks/pullbacks in GUI!
            if (reqTime < latestRequestTimeRef.current) {
              console.warn("⚠️ [INDIE CLASH] Discarded out-of-order stale fetchCloudBracket response.");
              return;
            }

            if (b) {
              // Guard against database replication latency/WAL race conditions during Force Start:
              // If the local state is already "active" or "completed", but the database fetched state 
              // is still "preparing", do NOT let the stale database state overwrite our local advanced state.
              const localStatus = latestBracketRef.current?.status;
              if (b.status === "preparing" && (localStatus === "active" || localStatus === "completed")) {
                console.warn("⚠️ [INDIE CLASH] Ignored stale 'preparing' database status to prevent downgrade race condition.");
              } else {
                setBracket(b);
              }
              // If the updated match is our currently viewed match, sync its states
              if (activeMatch && payload.new) {
                const row = payload.new as any;
                if (activeMatch.id === row[`${DB_PREFIX}id`]) {
                  // Find products A and B in in-memory state
                  const prodA = products.find(p => p.id === row[`${DB_PREFIX}product_a_id`]);
                  const prodB = products.find(p => p.id === row[`${DB_PREFIX}product_b_id`]);
                  if (prodA && prodB) {
                    setActiveMatch({
                      id: row[`${DB_PREFIX}id`],
                      roundNumber: row[`${DB_PREFIX}round_number`],
                      productA: prodA,
                      productB: prodB,
                      votesA: row[`${DB_PREFIX}votes_a`],
                      votesB: row[`${DB_PREFIX}votes_b`],
                      winnerId: row[`${DB_PREFIX}winner_id`] || undefined,
                      votedUserIds: row[`${DB_PREFIX}voted_user_ids`] || []
                    });
                  }
                }
              }
              // Trigger 1v1 Battle Screen Clash Rumble
              setIsShaking(true);
              setIsSwordsClashing(true);
              setTimeout(() => {
                setIsShaking(false);
                setIsSwordsClashing(false);
              }, 450);
            } else {
              // Cloud bracket transitioned to null (completed/cleared), run sync to catch state shift
              syncCloudData();
            }
          }, 150);
        }
      )
      .subscribe();

    // Listen to changes in the votes table (to stream positive/negative critiques)
    const votesChannel = supabase
      .channel("votes-realtime-channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: `${DB_PREFIX}votes` },
        (payload) => {
          if (isResettingRef.current || isSyncLockedRef.current) return;
          console.log("Realtime Critique sync trigger received:", payload);
          const row = payload.new as any;
          if (row) {
            const comment = `Critique: ${row[`${DB_PREFIX}feedback_loser`].slice(0, 32)}...`;
            setDanmakus(prev => [comment, ...prev]);
          }
        }
      )
      .subscribe();

    // Listen to changes in the products table (ensures new submissions and status changes are reflected in real-time)
    const productsChannel = supabase
      .channel("products-realtime-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: `${DB_PREFIX}products` },
        (payload) => {
          if (isResettingRef.current || isSyncLockedRef.current) return;
          console.log("Realtime Product sync trigger received:", payload);
          
          if (payload.eventType === "INSERT" && payload.new) {
            const newProd = fromDbProduct(payload.new);
            setProducts(prev => {
              // Avoid duplicates
              if (prev.some(p => p.id === newProd.id)) return prev;
              return [...prev, newProd];
            });
          } else if (payload.eventType === "UPDATE" && payload.new) {
            const updatedProd = fromDbProduct(payload.new);
            setProducts(prev => prev.map(p => p.id === updatedProd.id ? updatedProd : p));
          } else if (payload.eventType === "DELETE" && payload.old) {
            const deletedId = (payload.old as any)[`${DB_PREFIX}id`];
            if (deletedId) {
              setProducts(prev => prev.filter(p => p.id !== deletedId));
            }
          }
        }
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(matchesChannel);
        supabase.removeChannel(votesChannel);
        supabase.removeChannel(productsChannel);
      }
      if (syncDebounceTimeoutRef.current) {
        clearTimeout(syncDebounceTimeoutRef.current);
      }
    };
  }, []);

  // Load critiques for the active match dynamically from Supabase or localStorage
  useEffect(() => {
    if (!activeMatch) {
      setActiveMatchCritiques([]);
      return;
    }
    
    const loadCritiques = async () => {
      if (supabase) {
        const { data: votes, error } = await supabase
          .from(`${DB_PREFIX}votes`)
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
          setActiveMatchCritiques(mapped);
        }
      } else {
        // Local mode
        const localVotesStr = localStorage.getItem("arena_votes_v1") || "[]";
        const localVotes = JSON.parse(localVotesStr);
        const filtered = localVotes.filter((v: any) => v.match_id === activeMatch.id);
        const mapped = filtered.map((v: any) => {
          const isWinner = activeMatch?.productA && v.voted_product_id === activeMatch.productA.id;
          return {
            id: v.id || `vote-${Math.random()}`,
            voter: v.voter_username,
            provider: v.voter_auth_type,
            role: isWinner ? "Winner (Voted For)" : "Loser (Opponent Voted For)",
            text: isWinner ? v.feedback_winner : v.feedback_loser,
            date: new Date(v.created_at || Date.now()).toLocaleDateString()
          };
        });
        setActiveMatchCritiques(mapped);
      }
    };

    loadCritiques();
  }, [activeMatch, products]);

  // IntersectionObserver for Act 3 Staggered Steps
  useEffect(() => {
    const stepsEl = stepsRef.current;
    if (!stepsEl) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStepsRevealed(true);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(stepsEl);
    return () => observer.disconnect();
  }, []);

  // IntersectionObserver for Act 4 Tournament Dashboard
  useEffect(() => {
    const dashEl = dashboardRef.current;
    if (!dashEl) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDashRevealed(true);
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(dashEl);
    return () => observer.disconnect();
  }, []);

  // Master Clock & Settle & Simulated Votes Loop
  useEffect(() => {
    const timer = setInterval(() => {
      // A. Active bracket countdown and automatic round settlement
      if (bracket && bracket.status === "preparing") {
        const ms = getMillisecondsToNextNYMidnight(bracket.roundStartedAt);
        setCountdownToMidnightMs(ms);
        
        if (ms <= 0) {
          if (!supabase) {
            const activeBracket = {
              ...bracket,
              status: "active" as const,
              roundStartedAt: new Date().toISOString()
            };
            setBracket(activeBracket);
            setActiveMatch(activeBracket.round1[0]);
            saveBracket(activeBracket);
          } else {
            // Trigger JIT start for preparing bracket
            if (!isSettleRequestedRef.current) {
              isSettleRequestedRef.current = true;
              fetch("/api/arena/settle")
                .then(res => res.json())
                .then(data => {
                  console.log("[INDIE CLASH] JIT Season Start:", data);
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
        const ms = getRoundRemainingMs(roundNum, bracket.roundStartedAt || new Date().toISOString());
        setActiveRoundRemainingMs(ms);
        
        if (ms <= 0) {
          if (!supabase) {
            const advanced = advanceTournamentRound(bracket);
            
            if (advanced.status === "completed" && advanced.winner) {
              const champ = advanced.winner;
              setPastChampions(prev => {
                if (prev.some(x => x.id === champ.id)) return prev;
                return [...prev, champ];
              });
              const localChamps = loadLocalPastChampions();
              if (!localChamps.some(c => c.id === champ.id)) {
                localChamps.push(champ);
                saveLocalPastChampions(localChamps);
              }
              setBracket(null);
              setActiveMatch(null);
              saveBracket(null);
              // Auto-rollover for local mode
              const latestProds = loadProducts();
              tryAutoRollover(latestProds);
            } else {
              setBracket(advanced);
              const nextRound = getActiveRound(advanced);
              let nextActive = null;
              if (nextRound === 1) nextActive = advanced.round1.find(m => !m.winnerId) || advanced.round1[0];
              else if (nextRound === 2) nextActive = advanced.round2.find(m => !m.winnerId) || advanced.round2[0];
              else if (nextRound === 3) nextActive = advanced.round3.find(m => !m.winnerId) || advanced.round3[0];
              else if (nextRound === 4) nextActive = advanced.round4.find(m => !m.winnerId) || advanced.round4[0];
              
              setActiveMatch(nextActive || null);
              saveBracket(advanced);
            }
          } else {
            // Trigger JIT settlement for active bracket
            if (!isSettleRequestedRef.current) {
              isSettleRequestedRef.current = true;
              fetch("/api/arena/settle")
                .then(res => res.json())
                .then(data => {
                  console.log("[INDIE CLASH] JIT Settle:", data);
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
  }, [bracket, activeMatch]);

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
      } as any;

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
      } catch (e) {}
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
      pushToast("Resetting cloud database...", "info");
      clearCloudData()
        .then(() => Promise.all(mockShowcase.map(p => upsertCloudProduct(p))))
        .then(() => {
          pushToast("Database reset successfully!", "success");
          // Hold the isResettingRef = true lock for an extra 1500ms so all delayed
          // database deletion events from the WebSocket channel are safely ignored.
          setTimeout(() => {
            isResettingRef.current = false;
            syncCloudData();
          }, 1500);
        })
        .catch((e) => {
          isResettingRef.current = false;
          console.error("Error resetting sandbox cloud database:", e);
          pushToast(`Reset failed: ${e.message || "Unknown error"}`, "info");
        });
    } else {
      isResettingRef.current = false;
      pushToast("Local sandbox reset successfully!", "success");
    }
  };

  // Smooth scroll down to live duel battle arena
  const scrollToDuel = () => {
    const el = document.getElementById("tournament-dashboard");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Inject 16 Arena Competitors
  const handleInject16 = () => {
    // Acquire Sync Lock to prevent race condition pullbacks
    isSyncLockedRef.current = true;
    
    let currentProducts = [...products];
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
      } as any;

      currentProducts.push(newProduct);
      newAdded.push(newProduct);
    }

    setProducts(currentProducts);
    saveProducts(currentProducts);

    const startTournament = () => {
      const { bracket: newB, updatedProducts: newProds } = buildInitialBracket(currentProducts);
      setProducts(newProds);
      setBracket(newB);
      setActiveMatch(newB.round1[0]);
      if (supabase) {
        // Sync updated product statuses to cloud
        Promise.all(newProds.filter(p => p.queueStatus === "active").map(p => upsertCloudProduct(p)))
          .then(() => saveCloudBracket(newB))
          .then(() => {
            setTimeout(() => {
              isSyncLockedRef.current = false;
              syncCloudData();
            }, 800);
          }).catch((err) => {
            isSyncLockedRef.current = false;
            console.error("Error saving initial cloud bracket:", err);
          });
      } else {
        isSyncLockedRef.current = false;
      }
    };

    if (supabase) {
      Promise.all(newAdded.map(p => upsertCloudProduct(p))).then(() => {
        pushToast("16 Arena Competitors successfully injected!");
        if (!bracket && !isRolloverPendingRef.current) {
          setTimeout(startTournament, 300);
        } else {
          setTimeout(() => {
            isSyncLockedRef.current = false;
            syncCloudData();
          }, 800);
        }
      }).catch((err) => {
        isSyncLockedRef.current = false;
        console.error("Error uploading injected competitors:", err);
      });
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
      Promise.all(newAdded.map(p => upsertCloudProduct(p))).then(() => {
        pushToast("20 Mock Competitors successfully injected!");
        setTimeout(() => {
          isSyncLockedRef.current = false;
          syncCloudData();
        }, 800);
      }).catch((err) => {
        isSyncLockedRef.current = false;
        console.error("Error uploading showcase products:", err);
      });
    } else {
      isSyncLockedRef.current = false;
      pushToast("20 Mock Competitors successfully injected (Local)!");
    }
  };

  // Onboard Submission
  const handleSubmitProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userLoggedIn) {
      synthClick(150, "sawtooth", 0.12);
      alert("Verification Required!\n\nPlease link and verify your Google or GitHub identity before submitting your product to the waiting list.");
      setIsAuthOpen(true);
      return;
    }
    if (!newTitle || !newTagline || !newUrl) {
      synthClick(150, "sawtooth", 0.12);
      alert("Please fill in all required product fields.");
      return;
    }

    // Limit to one product per person in the current season (waiting or active)
    const isAdmin = userEmail && ["zyc729@outlook.com", "easoncheung9@gmail.com"].includes(userEmail.toLowerCase());
    const hasExisting = products.some(p => {
      if (p.queueStatus !== "waiting" && p.queueStatus !== "active") return false;
      if (userSupabaseId && p.creator_uid === userSupabaseId) return true;
      if (mockUserTwitter && p.creatorUsername && p.creatorUsername.toLowerCase() === mockUserTwitter.toLowerCase()) return true;
      const inputTwitter = newTwitter ? newTwitter.replace(/^@/, "").toLowerCase() : "";
      const existingTwitter = p.makerTwitter ? p.makerTwitter.replace(/^@/, "").toLowerCase() : "";
      if (inputTwitter && inputTwitter !== "anonymous" && inputTwitter === existingTwitter) return true;
      return false;
    });

    if (hasExisting && !isAdmin) {
      synthClick(150, "sawtooth", 0.12);
      alert("Submission Limit Exceeded!\n\nTo ensure fair play, each maker is allowed only ONE product in the waiting list or active queue per tournament cycle.");
      return;
    }

    const normalizedUrl = newUrl.startsWith("http") ? newUrl : `https://${newUrl}`;

    // Generate clean semantic URL slug from product website domain
    let parsedSlug = "product";
    try {
      const parsedUrl = new URL(normalizedUrl);
      let host = parsedUrl.hostname.toLowerCase();
      host = host.replace(/^www\./, "");
      const hostParts = host.split(".");
      if (hostParts.length > 2 && ["app", "dev", "www", "play", "get", "use", "try", "go", "my"].includes(hostParts[0])) {
        parsedSlug = hostParts[1];
      } else {
        parsedSlug = hostParts[0];
      }
      parsedSlug = parsedSlug.replace(/[^a-z0-9-]/g, "");
    } catch (e) {
      parsedSlug = newTitle.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    }
    if (!parsedSlug) {
      parsedSlug = `product-${Date.now()}`;
    }

    // Ensure 100% uniqueness in DB to prevent primary key collision
    let uniqueSlug = parsedSlug;
    let collisionCount = 1;
    while (products.some(p => p.id.toLowerCase() === uniqueSlug.toLowerCase())) {
      uniqueSlug = `${parsedSlug}-${Math.random().toString(36).substring(2, 5)}`;
      collisionCount++;
      if (collisionCount > 10) break;
    }

    const newProd: Product = {
      id: uniqueSlug,
      title: newTitle,
      tagline: newTagline,
      url: normalizedUrl,
      shipTimeframe: newTimeframe,
      makerName: newMaker || "Anonymous Maker",
      makerTwitter: newTwitter ? (newTwitter.startsWith("@") ? newTwitter : `@${newTwitter}`) : "@anonymous",
      makerAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces" + 
        (userLoggedIn ? `#creator=${encodeURIComponent(mockUserTwitter)}&uid=${encodeURIComponent(userSupabaseId)}&pushed=false` : ""),
      logo: newLogo,
      submittedAt: new Date().toISOString(),
      queueStatus: "waiting",
      votesCount: 0,
      creatorUsername: mockUserTwitter,
      creator_uid: userSupabaseId
    } as any;

    const updated = [...products, newProd];
    synthClick(600, "sine", 0.15, 0.06);
    setProducts(updated);
    saveProducts(updated);

    // Save project ID to local browser's claimed products list for 100% reliable local claim
    if (typeof window !== "undefined") {
      try {
        const myIds = JSON.parse(localStorage.getItem("my_arena_products") || "[]");
        myIds.push(newProd.id);
        localStorage.setItem("my_arena_products", JSON.stringify(myIds));
      } catch (e) {}
    }

    // Acquire Sync Lock to prevent race condition pullbacks
    isSyncLockedRef.current = true;

    setNewTitle("");
    setNewTagline("");
    setNewUrl("");
    setNewMaker("");
    setNewTwitter("");
    setIsSubmitOpen(false);

    const finishSubmit = () => {
      const queuedList = updated.filter(p => p.queueStatus === "waiting" && (!p.makerAvatar || !p.makerAvatar.includes("pushed=false")));
      if (queuedList.length >= 16 && !bracket && !isRolloverPendingRef.current) {
        setTimeout(() => {
          setSuccessModalTitle("ARENA BRACKET ACTIVE ⚔️");
          setSuccessModalText("Your project has been successfully queued in the 16-competitor roster, and the head-to-head tournament bracket has been automatically generated!\n\nIMPORTANT NOTICE: This platform does NOT provide any organic promotion, marketing, or advertising. To win your live 1v1 duels, you must actively campaign, promote, and rally votes yourself across Twitter/X, GitHub, and other social media channels!");
          setIsSuccessOpen(true);
          const { bracket: newB, updatedProducts: newProds } = buildInitialBracket(updated);
          setProducts(newProds);
          setBracket(newB);
          setActiveMatch(newB.round1[0]);
          if (supabase) {
            Promise.all(newProds.filter(p => p.queueStatus === "active").map(p => upsertCloudProduct(p)))
              .then(() => saveCloudBracket(newB))
              .then(() => {
                setTimeout(() => {
                  isSyncLockedRef.current = false;
                  syncCloudData();
                }, 800);
              }).catch(() => {
                isSyncLockedRef.current = false;
              });
          } else {
            isSyncLockedRef.current = false;
          }
        }, 500);
      } else {
        if (submitSource === 'home') {
          setSuccessModalTitle("PROJECT SUBMITTED 🛡️");
          setSuccessModalText("Your product has been successfully submitted and is now live on the Releases list!\n\nTo enter the 1v1 Arena matchmaking queue, click 'ENTER THE CONSOLE' below and click 'Push to Arena'.");
          setIsSuccessOpen(true);
        } else {
          pushToast("Product successfully submitted!", "success");
        }
        setTimeout(() => {
          isSyncLockedRef.current = false;
          syncCloudData();
        }, 800);
      }
    };

    if (supabase) {
      upsertCloudProduct(newProd).then(() => {
        finishSubmit();
      }).catch((err) => {
        isSyncLockedRef.current = false;
        console.error("Error submitting product:", err);
      });
    } else {
      finishSubmit();
    }
  };

  // Push project to arena waitlist matchmaking queue
  const handlePushToQueue = (productId: string) => {
    synthClick(300, "sine", 0.05);
    const updated = products.map(p => {
      if (p.id === productId && p.makerAvatar) {
        const cleanedAvatar = p.makerAvatar.replace("pushed=false", "pushed=true");
        return { ...p, makerAvatar: cleanedAvatar };
      }
      return p;
    });
    setProducts(updated);
    saveProducts(updated);

    // Acquire Sync Lock to prevent race condition pullbacks
    isSyncLockedRef.current = true;

    const pushedProduct = updated.find(p => p.id === productId);
    
    const finishPush = () => {
      pushToast(`Product successfully enqueued in matchmaking waitlist!`, "success");

      // Check if we hit 16 queued products to trigger matchmaking
      const queuedList = updated.filter(p => p.queueStatus === "waiting" && (!p.makerAvatar || !p.makerAvatar.includes("pushed=false")));
      if (queuedList.length >= 16 && !bracket && !isRolloverPendingRef.current) {
        setTimeout(() => {
          setSuccessModalTitle("ARENA BRACKET ACTIVE ⚔️");
          setSuccessModalText("Your project has been successfully queued in the 16-competitor roster, and the head-to-head tournament bracket has been automatically generated!\n\nIMPORTANT NOTICE: This platform does NOT provide any organic promotion, marketing, or advertising. To win your live 1v1 duels, you must actively campaign, promote, and rally votes yourself across Twitter/X, GitHub, and other social media channels!");
          setIsSuccessOpen(true);
          const { bracket: newB, updatedProducts: newProds } = buildInitialBracket(updated);
          setProducts(newProds);
          setBracket(newB);
          setActiveMatch(newB.round1[0]);
          if (supabase) {
            Promise.all(newProds.filter(p => p.queueStatus === "active").map(p => upsertCloudProduct(p)))
              .then(() => saveCloudBracket(newB))
              .then(() => {
                setTimeout(() => {
                  isSyncLockedRef.current = false;
                  syncCloudData();
                }, 800);
              }).catch(() => {
                isSyncLockedRef.current = false;
              });
          } else {
            isSyncLockedRef.current = false;
          }
        }, 500);
      } else {
        setTimeout(() => {
          isSyncLockedRef.current = false;
          syncCloudData();
        }, 800);
      }
    };

    if (pushedProduct && supabase) {
      upsertCloudProduct(pushedProduct).then(() => {
        finishPush();
      }).catch((err) => {
        isSyncLockedRef.current = false;
        console.error("Error pushing product to queue:", err);
      });
    } else {
      finishPush();
    }
  };


  // Auto-Rollover: After a season completes, check if ≥16 products are queued and auto-start the next season
  const tryAutoRollover = (currentProducts: Product[]) => {
    const waitingQueue = currentProducts.filter(
      p => p.queueStatus === "waiting" && (!p.makerAvatar || !p.makerAvatar.includes("pushed=false"))
    );
    if (waitingQueue.length >= 16) {
      isRolloverPendingRef.current = true;
      // Delay slightly so champion modal can show first
      setTimeout(() => {
        const latestProducts = [...currentProducts];
        const { bracket: newB, updatedProducts: newProds } = buildInitialBracket(latestProducts);
        setProducts(newProds);
        setBracket(newB);
        setActiveMatch(newB.round1[0]);
        pushToast("New season started automatically! 16 products matched.", "success");
        if (supabase) {
          Promise.all(newProds.filter(p => p.queueStatus === "active").map(p => upsertCloudProduct(p)))
            .then(() => saveCloudBracket(newB))
            .then(() => {
              setTimeout(() => {
                isSyncLockedRef.current = false;
                isRolloverPendingRef.current = false;
                syncCloudData();
              }, 800);
            }).catch((err) => {
              isSyncLockedRef.current = false;
              isRolloverPendingRef.current = false;
              console.error("Error matching next season in cloud:", err);
            });
        } else {
          isSyncLockedRef.current = false;
          isRolloverPendingRef.current = false;
        }
      }, 3000);
    } else {
      isRolloverPendingRef.current = false;
    }
  };

  // Advance Round
  const handleAdvanceRound = () => {
    if (!bracket) return;
    
    let updated;
    if (bracket.status === "preparing") {
      // Force start the tournament (skip New York Midnight countdown)
      updated = {
        ...bracket,
        status: "active" as const,
        roundStartedAt: new Date().toISOString()
      };
    } else {
      updated = advanceTournamentRound(bracket);
    }
    
    // Acquire Sync Lock to prevent race condition pullbacks
    isSyncLockedRef.current = true;

    const finishAdvance = () => {
      setTimeout(() => {
        isSyncLockedRef.current = false;
        syncCloudData();
      }, 800);
    };

    if (updated.status === "completed" && updated.winner) {
      const champ = updated.winner;
      setPastChampions(prev => {
        if (prev.some(x => x.id === champ.id)) return prev;
        return [...prev, champ];
      });
      if (!supabase) {
        const localChamps = loadLocalPastChampions();
        if (!localChamps.some(c => c.id === champ.id)) {
          localChamps.push(champ);
          saveLocalPastChampions(localChamps);
        }
      }
      setBracket(null);
      setActiveMatch(null);
      saveBracket(null);
      if (supabase) {
        saveCloudBracket(updated).then(() => {
          finishAdvance();
          // Auto-rollover: check if next season can start
          fetchCloudProducts().then(latestProds => {
            tryAutoRollover(latestProds);
          });
        }).catch((err) => {
          isSyncLockedRef.current = false;
          console.error("Error saving cloud bracket:", err);
        });
      } else {
        isSyncLockedRef.current = false;
        // Auto-rollover for local mode
        const latestProds = loadProducts();
        tryAutoRollover(latestProds);
      }
    } else {
      setBracket(updated);
      
      const round = getActiveRound(updated);
      let nextActive = null;
      if (round === 1) nextActive = updated.round1.find(m => !m.winnerId) || updated.round1[0];
      else if (round === 2) nextActive = updated.round2.find(m => !m.winnerId) || updated.round2[0];
      else if (round === 3) nextActive = updated.round3.find(m => !m.winnerId) || updated.round3[0];
      else if (round === 4) nextActive = updated.round4.find(m => !m.winnerId) || updated.round4[0];
      
      setActiveMatch(nextActive || null);

      if (supabase) {
        saveCloudBracket(updated).then(finishAdvance).catch((err) => {
          isSyncLockedRef.current = false;
          console.error("Error saving cloud bracket:", err);
        });
      } else {
        isSyncLockedRef.current = false;
      }
    }
  };

  // Submit vote with dual-input feedback
  const handleVoteSubmit = (e: React.FormEvent) => {
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
    const alreadyVotedOnThisMatch = votingMatch.votedUserIds && votingMatch.votedUserIds.includes(mockUserTwitter);
    if (alreadyVotedOnThisMatch) {
      synthClick(180, "sawtooth", 0.1);
      setVoteError("Voting Limit Reached! To ensure fair play, you can only cast ONE vote per separate 1v1 matchup.");
      return;
    }
    const voteForA = votingMatch?.productA && votingTarget.id === votingMatch.productA.id;

    const updateVotes = (matches: Match[]): Match[] => {
      return matches.map(m => {
        if (m.id === votingMatch.id) {
          return {
            ...m,
            votesA: voteForA ? m.votesA + 1 : m.votesA,
            votesB: !voteForA ? m.votesB + 1 : m.votesB,
            votedUserIds: [...m.votedUserIds, mockUserTwitter]
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
    saveBracket(nextBracket);

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

    // Sync to Supabase
    if (supabase && freshMatch) {
      // 1. Insert dual critique vote
      // Rigid database CHECK constraint restricts auth type column to 'twitter' or 'github'.
      // Bypassed database constraint by mapping 'google' login provider to 'twitter' during DB insertion.
      supabase
        .from(`${DB_PREFIX}votes`)
        .insert({
          [`${DB_PREFIX}match_id`]: freshMatch.id,
          [`${DB_PREFIX}voter_username`]: mockUserTwitter,
          [`${DB_PREFIX}voter_auth_type`]: userAuthType === "google" ? "twitter" : userAuthType,
          [`${DB_PREFIX}voted_product_id`]: votingTarget.id,
          [`${DB_PREFIX}feedback_winner`]: voteWinnerFeedback,
          [`${DB_PREFIX}feedback_loser`]: voteLoserFeedback
        } as any)
        .then(({ error }) => {
          if (error) console.error("Error inserting realtime vote:", error);
        });

      // 2. Update match votes in database
      supabase
        .from(`${DB_PREFIX}matches`)
        .upsert({
          [`${DB_PREFIX}id`]: freshMatch.id,
          [`${DB_PREFIX}bracket_id`]: nextBracket.id,
          [`${DB_PREFIX}round_number`]: freshMatch.roundNumber,
          [`${DB_PREFIX}product_a_id`]: freshMatch.productA?.id || "",
          [`${DB_PREFIX}product_b_id`]: freshMatch.productB?.id || "",
          [`${DB_PREFIX}votes_a`]: freshMatch.votesA,
          [`${DB_PREFIX}votes_b`]: freshMatch.votesB,
          [`${DB_PREFIX}winner_id`]: freshMatch.winnerId || null,
          [`${DB_PREFIX}voted_user_ids`]: freshMatch.votedUserIds
        } as any)
        .then(({ error }) => {
          if (error) console.error("Error updating realtime match:", error);
        });
    }

    // Also save locally for local mode
    if (typeof window !== "undefined") {
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

    // Append to live marquee stream
    const newComment = `Critique: ${voteLoserFeedback.slice(0, 32)}...`;
    setDanmakus(prev => [newComment, ...prev]);

    setVotingMatch(null);
    setVotingTarget(null);
    setVoteWinnerFeedback("");
    setVoteLoserFeedback("");
    setVoteError("");
  };

  const renderLogo = (logoStr: string, className = "w-6 h-6 object-contain") => {
    if (!logoStr) return null;
    const isImg = logoStr.startsWith("data:image") || logoStr.startsWith("http") || logoStr.startsWith("/");
    if (isImg) {
      return <img src={logoStr} alt="Logo" className={`${className} inline-block shrink-0 rounded-md object-contain`} />;
    }
    return <span className="inline-block shrink-0">{logoStr}</span>;
  };

  const isProductOwner = (p: Product, userTwitter: string, userSubId?: string) => {
    // 1. Local Browser Claim Check: If this product was submitted from this browser (100% reliable locally)
    if (typeof window !== "undefined") {
      try {
        const myIds = JSON.parse(localStorage.getItem("my_arena_products") || "[]");
        if (myIds.includes(p.id)) return true;
      } catch (e) {}
    }

    // 2. Primary Secure Check: Parse creator identity bound permanently inside makerAvatar URL query/hash fragment
    if (p.makerAvatar && p.makerAvatar.includes("#")) {
      try {
        const hash = p.makerAvatar.split("#")[1];
        const params = new URLSearchParams(hash);
        const creator = params.get("creator");
        const uid = params.get("uid");
        
        if (userSubId && uid && uid === userSubId) return true;
        if (userTwitter && creator && creator.replace(/^@/, "").toLowerCase() === userTwitter.replace(/^@/, "").toLowerCase()) return true;
      } catch (e) {}
    }

    // 3. Secondary Secure Check: Immutable Supabase Auth User ID matching (100% secure)
    if (userSubId && (p as any).creator_uid && (p as any).creator_uid === userSubId) {
      return true;
    }

    if (!userTwitter) return false;
    
    // Normalize string: removes all spaces, punctuation, @, and non-alphanumeric characters
    const normalize = (str: string) => str.replace(/[^a-zA-Z0-9]/g, "").trim().toLowerCase();
    
    const cleanTwitter = normalize(userTwitter);
    const cleanMakerTwitter = p.makerTwitter ? normalize(p.makerTwitter) : "";
    const cleanMakerName = p.makerName ? normalize(p.makerName) : "";
    const cleanCreator = (p as any).creatorUsername ? normalize((p as any).creatorUsername) : "";
    
    return (
      (cleanMakerTwitter && cleanMakerTwitter === cleanTwitter) ||
      (cleanMakerName && cleanMakerName === cleanTwitter) ||
      (cleanCreator && cleanCreator === cleanTwitter)
    );
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
          .from(`${DB_PREFIX}matches`)
          .select(`${DB_PREFIX}id`)
          .or(`${DB_PREFIX}product_a_id.eq.${product.id},${DB_PREFIX}product_b_id.eq.${product.id}`);

        if (mErr) throw mErr;

        if (matches && matches.length > 0) {
          const matchIds = matches.map((m: any) => m[`${DB_PREFIX}id`]);
          
          // B. Fetch all votes for these matches
          const { data: votes, error: vErr } = await supabase
            .from(`${DB_PREFIX}votes`)
            .select("*")
            .in(`${DB_PREFIX}match_id`, matchIds);

          if (vErr) throw vErr;

          if (votes) {
            critiques = votes.map((v: any) => {
              const isWinner = v[`${DB_PREFIX}voted_product_id`] === product.id;
              // Map database-compatible provider 'twitter' back to 'google' if voter has a google/email style signature
              const rawProvider = v[`${DB_PREFIX}voter_auth_type`];
              const provider = rawProvider === "twitter" ? "google" : rawProvider;
              return {
                voter: v[`${DB_PREFIX}voter_username`],
                provider: provider,
                role: isWinner ? "Winner (Voted For)" : "Loser (Opponent Voted For)",
                text: isWinner ? v[`${DB_PREFIX}feedback_winner`] : v[`${DB_PREFIX}feedback_loser`],
                date: new Date(v[`${DB_PREFIX}created_at`] || Date.now()).toLocaleDateString()
              };
            });
          }
        }
      } else {
        // 2. Local/Sandbox Mode: Load from localStorage + generate mock if empty
        const localVotesStr = localStorage.getItem("arena_votes_v1") || "[]";
        const localVotes = JSON.parse(localVotesStr);
        
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
        const filteredVotes = localVotes.filter((v: any) => 
          (v.product_a_id && (v.product_a_id === product.id || v.product_b_id === product.id)) ||
          v.voted_product_id === product.id || 
          matchIds.has(v.match_id)
        );
        
        if (filteredVotes.length > 0) {
          critiques = filteredVotes.map((v: any) => {
            const isWinner = v.voted_product_id === product.id;
            return {
              voter: v.voter_username,
              provider: v.voter_auth_type,
              role: isWinner ? "Winner (Voted For)" : "Loser (Opponent Voted For)",
              text: isWinner ? v.feedback_winner : v.feedback_loser,
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
        // Escape double quotes and commas for safe CSV format
        const escapeCSV = (str: string) => `"${str.replace(/"/g, '""')}"`;
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
      link.setAttribute("download", `${product.title.replace(/\s+/g, "_")}_critiques.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error("CSV Export failed:", err);
      alert(`Error exporting critiques: ${err.message || err}`);
    }
  };

  const getPercentages = (match: Match) => {
    const total = match.votesA + match.votesB;
    if (total === 0) return { pctA: 50, pctB: 50 };
    const pctA = Math.round((match.votesA / total) * 100);
    const pctB = 100 - pctA;
    return { pctA, pctB };
  };

  const getProductBracketStatus = (prodId: string) => {
    if (!bracket) return { status: "WAITLIST", round: 0 };
    
    const allMatches = [
      ...bracket.round1,
      ...bracket.round2,
      ...bracket.round3,
      ...bracket.round4
    ];
    
    // Find the last match the product participated in
    const matches = allMatches.filter(m => m.productA.id === prodId || m.productB.id === prodId);
    if (matches.length === 0) {
      return { status: "QUEUED", round: 0 };
    }
    
    // Sort by round number descending
    matches.sort((a, b) => b.roundNumber - a.roundNumber);
    const lastMatch = matches[0];
    
    if (!lastMatch.winnerId) {
      return { status: "FIGHTING", round: lastMatch.roundNumber };
    }
    
    if (lastMatch.winnerId === prodId) {
      if (lastMatch.roundNumber === 4) {
        return { status: "CHAMPION", round: 4 };
      }
      // Check if there is a match in the next round for this product
      const nextRoundMatches = allMatches.filter(
        m => m.roundNumber === lastMatch.roundNumber + 1 && (m.productA.id === prodId || m.productB.id === prodId)
      );
      if (nextRoundMatches.length > 0) {
        const nextMatch = nextRoundMatches[0];
        if (!nextMatch.winnerId) {
          return { status: "FIGHTING", round: nextMatch.roundNumber };
        }
        if (nextMatch.winnerId === prodId) {
          return { status: "ADVANCED", round: nextMatch.roundNumber };
        } else {
          return { status: "ELIMINATED", round: nextMatch.roundNumber };
        }
      }
      return { status: "ADVANCED", round: lastMatch.roundNumber };
    } else {
      return { status: "ELIMINATED", round: lastMatch.roundNumber };
    }
  };

  const getLeaderboardData = () => {
    // If the active bracket is completed, show the completed competitors on the leaderboard so users can see the final standing of the season.
    // Otherwise, filter to show only the current season's active/waiting competitors to keep it clean.
    const showCompleted = bracket && bracket.status === "completed";

    return products
      .filter(p => {
        if (showCompleted) {
          // Show only products that participated in the completed bracket
          if (bracket) {
            const allMatches = [
              ...bracket.round1,
              ...bracket.round2,
              ...bracket.round3,
              ...bracket.round4
            ];
            return allMatches.some(m => m.productA.id === p.id || m.productB.id === p.id);
          }
        }
        // During preparing/active, show only current season active/waiting products
        return p.queueStatus === "active" || p.queueStatus === "waiting";
      })
      .map(p => {
        let bracketVotes = 0;
        let wins = 0;
        if (bracket) {
          const allMatches = [
            ...bracket.round1,
            ...bracket.round2,
            ...bracket.round3,
            ...bracket.round4
          ];
          allMatches.forEach(m => {
            if (m.productA.id === p.id) {
              bracketVotes += m.votesA;
              if (m.winnerId === p.id) wins += 1;
            }
            if (m.productB.id === p.id) {
              bracketVotes += m.votesB;
              if (m.winnerId === p.id) wins += 1;
            }
          });
        }
        
        const points = bracketVotes + (wins * 150);
        
        return {
          ...p,
          wins,
          bracketVotes,
          points
        };
      }).sort((a, b) => b.points - a.points);
  };

  const activeRoundNum = bracket ? getActiveRound(bracket) : 0;
  const queuedProducts = useMemo(() => {
    return products
      .filter(p => p.queueStatus === "waiting" && (!p.makerAvatar || !p.makerAvatar.includes("pushed=false")))
      .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
  }, [products]);
  const lineupProducts = useMemo(() => {
    if (bracket && bracket.round1 && bracket.round1.length > 0) {
      const list: Product[] = [];
      bracket.round1.forEach(m => {
        if (m.productA) list.push(m.productA);
        if (m.productB) list.push(m.productB);
      });
      return list;
    }
    return queuedProducts;
  }, [bracket, queuedProducts]);
  const showcaseProducts = useMemo(() => {
    // Show ALL products in the showcase list, regardless of queue status
    const sorted = [...products].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    return sorted;
  }, [products]);
  const currentSeasonNum = pastChampions.length + 1;
  const currentSeasonStr = String(currentSeasonNum).padStart(2, "0");

  const currentRoundMatches = useMemo(() => {
    if (!bracket) return [];
    const round = getActiveRound(bracket);
    if (round === 1) return bracket.round1;
    if (round === 2) return bracket.round2;
    if (round === 3) return bracket.round3;
    if (round === 4) return bracket.round4;
    return [];
  }, [bracket]);

  // 1. GSAP: Animate Hero and page intro on boot
  useEffect(() => {
    if (isBooted) {
      // Animate Hero Monospace Badge
      gsap.fromTo(
        ".hero-badge",
        { opacity: 0, scale: 0.3, y: -20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: "back.out(1.7)" }
      );
      // Animate Hero main title
      gsap.fromTo(
        ".hero-title",
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.8, delay: 0.15, ease: "power3.out" }
      );
      // Animate Hero tagline/description
      gsap.fromTo(
        ".hero-desc",
        { opacity: 0, y: 25 },
        { opacity: 1, y: 0, duration: 0.8, delay: 0.3, ease: "power3.out" }
      );
      // Animate Hero stats badge
      gsap.fromTo(
        ".hero-stats",
        { opacity: 0, scale: 0.8, y: 15 },
        { opacity: 1, scale: 1, y: 0, duration: 0.5, delay: 0.45, ease: "back.out(1.2)" }
      );
      // Animate Today's Releases section
      gsap.fromTo(
        "#launches-section",
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 1, delay: 0.6, ease: "power2.out" }
      );
    }
  }, [isBooted]);

  // 2. GSAP: Animate match slate list items on mount/round change
  useEffect(() => {
    if (currentRoundMatches && currentRoundMatches.length > 0) {
      gsap.fromTo(
        ".match-card-item",
        { opacity: 0, x: -25 },
        { opacity: 1, x: 0, duration: 0.45, stagger: 0.06, ease: "power2.out", overwrite: "auto" }
      );
    }
  }, [activeRoundNum, currentRoundMatches]);

  // 3. GSAP: Animate Battle Inspector contents when activeMatch changes
  useEffect(() => {
    if (activeMatch) {
      // Intro animations for cards and center VS block
      gsap.fromTo(
        ".inspector-panel",
        { borderAlpha: 0.08, backgroundColor: "rgba(10, 10, 12, 0.4)" },
        { duration: 0.4, ease: "power1.out" }
      );
      gsap.fromTo(
        ".inspector-title",
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }
      );
      gsap.fromTo(
        ".inspector-card-a",
        { opacity: 0, x: -40, scale: 0.96 },
        { opacity: 1, x: 0, scale: 1, duration: 0.45, ease: "power3.out" }
      );
      gsap.fromTo(
        ".inspector-card-b",
        { opacity: 0, x: 40, scale: 0.96 },
        { opacity: 1, x: 0, scale: 1, duration: 0.45, ease: "power3.out" }
      );
      gsap.fromTo(
        ".inspector-vs",
        { scale: 0.3, rotation: -90, opacity: 0 },
        { scale: 1, rotation: 0, opacity: 1, duration: 0.55, ease: "back.out(1.8)" }
      );
    }
  }, [activeMatch?.id]);

  // 4. GSAP: Rumble impact effect when swords clash (on new vote)
  useEffect(() => {
    if (isSwordsClashing) {
      // Scale pop and bounce the central VS block
      gsap.timeline()
        .to(".inspector-vs", { scale: 1.35, duration: 0.08, ease: "power1.out" })
        .to(".inspector-vs", { scale: 1, duration: 0.25, ease: "bounce.out" });

      // Stiff side-shake for product cards to emulate shockwave
      gsap.fromTo(
        ".inspector-card-a",
        { x: -12 },
        { x: 0, duration: 0.25, ease: "elastic.out(1, 0.35)", overwrite: "auto" }
      );
      gsap.fromTo(
        ".inspector-card-b",
        { x: 12 },
        { x: 0, duration: 0.25, ease: "elastic.out(1, 0.35)", overwrite: "auto" }
      );
    }
  }, [isSwordsClashing]);

  return (
    <div className={`min-h-screen bg-[#030303] text-[#E4E4E7] font-sans selection:bg-[#E4E4E7] selection:text-black antialiased relative pb-24 overflow-x-hidden ${isShaking ? "animate-arena-shake" : ""}`}>
      
      {/* HIGH PERFORMANCE DYNAMIC CANVAS BACKGROUND */}
      <InteractiveGrid />

      {/* FIXED TOAST NOTIFICATION CONTAINER */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
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
      <header className="sticky top-0 z-50 w-full bg-[#030303]/95 border-b border-white/[0.06]" style={{ willChange: "transform" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          <div className="flex items-center gap-8">
            <div 
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => {
                synthClick(300, "sine", 0.05);
                setCurrentView('home');
                pushToast("Welcome back to Indie-Clash!", "success");
              }}
            >
              <ClashLogo size="md" />
              <span className="font-bold text-white tracking-tight text-xl font-sans">
                Indie-Clash
              </span>
            </div>

            <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-zinc-200 font-sans">
              <a href="#launches-section" className="hover:text-white transition duration-200">Releases</a>
              <span className="text-zinc-700">/</span>
              <a href="#arena-section" className="hover:text-white transition duration-200">Arena</a>
              <span className="text-zinc-700">/</span>
              <a href="#champions-section" className="hover:text-white transition duration-200">Champion</a>
              <span className="text-zinc-700">/</span>
              <a href="#how-it-works-section" className="hover:text-white transition duration-200">How it Work</a>
            </nav>
          </div>

          <div className="flex items-center gap-4">

            {userLoggedIn && (
              <button
                onClick={() => {
                  synthClick(300, "sine", 0.05);
                  setCurrentView(currentView === 'console' ? 'home' : 'console');
                }}
                className="py-1.5 px-3 bg-zinc-900 text-white border border-white/[0.1] hover:bg-white/[0.04] text-[10px] font-mono uppercase tracking-wider rounded-md cursor-pointer transition mr-2"
              >
                {currentView === 'console' ? "Return to Arena ➔" : "My Console"}
              </button>
            )}

            {userLoggedIn ? (
              <div className="flex items-center gap-3 text-xs bg-[#121215] px-3.5 py-1.5 border border-white/[0.06] text-white">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse"></span>
                <span className="text-zinc-400 text-[10px] font-mono">
                  CONNECTED: <span className="text-white font-sans font-bold">{mockUserTwitter}</span>
                </span>
                <button 
                  onClick={handleLogout}
                  className="px-2 py-0.5 text-[10px] font-mono uppercase bg-red-950/40 text-red-400 hover:bg-red-900/60 hover:text-white border border-red-900/50 transition-all cursor-pointer font-bold"
                >
                  Exit
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsAuthOpen(true)}
                className="bg-[#121215] text-white border border-white/[0.1] hover:bg-white/[0.04] text-xs font-semibold px-3 py-2 rounded-md transition-all cursor-pointer"
              >
                Link Identity
              </button>
            )}

            {/* Top Right Main Conversion button */}
            {currentView !== 'console' && (
              <button
                onClick={() => {
                  synthClick(420, "sine", 0.08, 0.04);
                  setSubmitSource('home');
                  setIsSubmitOpen(true);
                }}
                className="bg-white hover:bg-zinc-200 text-black py-2 px-4 rounded-md text-xs font-semibold tracking-tight transition duration-250 cursor-pointer"
              >
                Submit Product
              </button>
            )}

          </div>

        </div>
      </header>

      {currentView === 'console' ? (
        <MakerConsole 
          isOpen={true}
          onClose={() => setCurrentView('home')}
          products={products}
          allProducts={products}
          activeBracket={bracket}
          userTwitter={mockUserTwitter}
          userSubId={userSupabaseId}
          onPushToQueue={handlePushToQueue}
          renderLogo={renderLogo}
          onExportCsv={handleExportCritiquesCsv}
          onSubmitProductClick={() => {
            setSubmitSource('console');
            setIsSubmitOpen(true);
          }}
        />
      ) : (
        <>
          {/* Hero Banner */}
          <section className="py-24 border-b border-white/[0.05] relative overflow-hidden bg-gradient-to-b from-white/[0.01] to-transparent">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              
              {/* Micro monospace badge on top */}
              <div className="inline-block text-[10px] font-mono uppercase tracking-widest text-[#A78BFA] bg-[#A78BFA]/[0.05] border border-[#A78BFA]/[0.15] px-3 py-1 rounded-md mb-8 hero-badge">
                FREE INDIE LAUNCH PLATFORM
              </div>

              {/* Extreme large title font bold tracking tight */}
              <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight text-white uppercase mb-6 leading-none hero-title">
                Every Indie Product<br />
                <span className="text-zinc-500 font-mono font-medium">DESERVES TO BE SEEN</span>
              </h1>

              {/* Centered brief description, restricted width */}
              <p className="max-w-[780px] mx-auto text-sm sm:text-base md:text-md text-zinc-400 leading-relaxed font-sans tracking-wide hero-desc">
                Submit for free. Get real exposure and a permanent SEO backlink. Then prove it in the 1v1 Arena, where builders compete through honest peer critiques, not vanity upvotes.
              </p>

              <div className="mt-8 flex flex-wrap justify-center gap-4 text-[10px] font-mono text-zinc-500 hero-stats">
                <span className="bg-[#0b0b0c] border border-white/[0.05] px-2.5 py-1 rounded-md uppercase tracking-wider">
                  Products Submitted: <span className="text-white font-semibold">{products.length}</span>
                </span>
              </div>

            </div>
          </section>

      {/* CORE APP WRAPPER LAYOUT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">



        {/* LIVE ARENA CLASHES (1v1 Live Showdowns) */}
        {/* TODAY'S RELEASES (System Audit Logs Terminal Style Grid Layout) */}
        <section id="launches-section" className="py-20 md:py-28">
          
          <div className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="text-left space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-white border-l-2 border-white pl-4 font-sans">
                  TODAY'S RELEASES
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-mono font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full animate-pulse flex items-center gap-1.5 shrink-0" style={{ transform: "translateZ(0)" }}>
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  Live Feed: 24h Rolling
                </span>
              </div>
              <p className="text-sm text-zinc-400 mt-2">
                Upcoming products queued for matchmaking. Seamless 24h rolling waitlist stream.
              </p>
            </div>
          </div>

          {/* Audit logs stream table format only, strictly no cards */}
          <div 
            className="border border-white/[0.05] bg-[#070709]/40 rounded-md overflow-hidden h-[960px] relative"
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
                  const originalIndex = index % showcaseProducts.length;
                  return (
                    <div 
                      key={`${item.id}-dup-${index}`} 
                      className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#0c0c0e]/80 transition duration-150 border-b border-white/[0.03] h-auto sm:h-[64px] box-border"
                    >
                      {/* Left segment */}
                      <div className="flex items-center gap-3 shrink-0">
                        {item.makerAvatar && item.makerAvatar.includes("pushed=false") ? (
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
                          <a 
                            href={`/reviews/${item.id}`}
                            className="font-bold text-white text-sm hover:underline hover:text-[#ffbe18] transition relative z-10 cursor-pointer"
                          >
                            {item.title}
                          </a>
                          <span className="text-[10px] font-mono text-zinc-550">
                            by{" "}
                            <a 
                              href={`https://x.com/${item.makerTwitter ? item.makerTwitter.replace(/^@/, "") : ""}`}
                              target="_blank"
                              rel="noopener noreferrer"
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
                        <a 
                          href={item.url}
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[10px] font-mono text-zinc-500 hover:text-white inline-flex items-center gap-1"
                        >
                          Demo Link <ExternalLinkIcon className="w-3 h-3 text-zinc-650" />
                        </a>


                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 text-center">
            <a 
              href="#champions-section"
              className="inline-flex items-center gap-2 text-xs font-mono text-zinc-500 hover:text-white transition"
              onClick={() => synthClick(280, "sine", 0.05)}
            >
              View past champions and hall of valor →
            </a>
          </div>
        </section>

        <section id="arena-section" className="py-20 md:py-28 relative border-t border-white/[0.05]">
          
          <div className="mb-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-white border-l-2 border-white pl-4 font-sans">
                LIVE ARENA MATCHUPS
              </h2>
              <p className="text-xs text-zinc-500 mt-2">
                Skins in the game. Inspect core trade-offs, voice your technical feedback, and vote to declare champions.
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
          <div className="mb-8 bg-[#0b0b0d] border border-white/[0.06] rounded-md px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                Season <span className="text-white font-bold">{currentSeasonStr}</span>
              </span>
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
                Next Season: <span className="text-white font-bold">{Math.min(queuedProducts.length, 16)}</span>/16
                {queuedProducts.length > 16 && (
                  <>
                    {" "}<span className="text-zinc-600">|</span>{" "}
                    Waitlist: <span className="text-[#ffbe18] font-bold">+{queuedProducts.length - 16}</span> in line ({Math.floor(queuedProducts.length / 16)} season{Math.floor(queuedProducts.length / 16) > 1 ? 's' : ''} queued)
                  </>
                )}
              </span>
              <div className="w-20 h-1.5 bg-white/[0.04] rounded-full overflow-hidden shrink-0">
                <div 
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ 
                    width: `${Math.min((queuedProducts.length / 16) * 100, 100)}%`,
                    backgroundColor: queuedProducts.length >= 16 ? '#34d399' : '#a78bfa'
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
                    const isDuelActive = !duel.winnerId;
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
                              Concluded
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
                    const isDuelActive = !duel.winnerId;
                    const sumVotes = duel.votesA + duel.votesB;
                    const ratioA = sumVotes > 0 ? Math.round((duel.votesA / sumVotes) * 100) : 50;
                    const ratioB = sumVotes > 0 ? 100 - ratioA : 50;
                    

                    return (
                      <div className="bg-[#0a0a0c]/80 border border-white/[0.08] rounded-md overflow-hidden premium-glass p-6 md:p-8 space-y-6 transition-all duration-300 animate-fade-in-blur inspector-panel">
                        
                        {/* Title Bar */}
                        <div className="flex items-center justify-between border-b border-white/[0.04] pb-4 inspector-title">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[9px] uppercase tracking-wider font-semibold bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded text-zinc-300">
                              ROUND {activeRoundNum} // BATTLE INSPECTOR
                            </span>
                          </div>
                          <div>
                            {isDuelActive ? (
                              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-400/[0.05] border border-emerald-400/[0.15] px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                DECISION OPEN
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono text-zinc-500 bg-white/[0.03] border border-white/[0.06] px-2 py-0.5 rounded uppercase tracking-wider">
                                CONCLUDED
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
                              <h3 className="text-base font-bold text-white truncate">{duel.productA?.title || "Pending"}</h3>
                              <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed">{duel.productA?.tagline}</p>
                            </div>
                            <div className="mt-4 space-y-2">
                              {duel.productA?.url && (
                                <a
                                  href={duel.productA.url}
                                  target="_blank"
                                  rel="noreferrer"
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
                                {duel.winnerId === duel.productA?.id ? "🏆 WINNER" : isDuelActive ? "VOTE FOR A" : "DEFEATED"}
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
                              <h3 className="text-base font-bold text-white truncate">{duel.productB?.title || "Pending"}</h3>
                              <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed">{duel.productB?.tagline}</p>
                            </div>
                            <div className="mt-4 space-y-2">
                              {duel.productB?.url && (
                                <a
                                  href={duel.productB.url}
                                  target="_blank"
                                  rel="noreferrer"
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
                                {duel.winnerId === duel.productB?.id ? "🏆 WINNER" : isDuelActive ? "VOTE FOR B" : "DEFEATED"}
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
                    strokeDashoffset={390 - (390 * Math.min(lineupProducts.length, 16)) / 16}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col justify-center items-center">
                  {lineupProducts.length >= 16 ? (
                    <>
                      <span className="text-xl font-bold text-white font-mono tracking-tight">{formatToHMS(countdownToMidnightMs)}</span>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider mt-1">Starts In</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-semibold text-white">{lineupProducts.length} / 16</span>
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mt-1">Ready</span>
                    </>
                  )}
                </div>
              </div>

              <h2 className="text-lg sm:text-xl font-sans font-semibold tracking-tight uppercase mb-3 text-white">Assembling Next Season</h2>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Once 16 products are queued, the bracket generates automatically. When a season ends, the next one starts instantly if enough entries are waiting.
              </p>

              {/* Roster Slots Grid (Street Fighter style character select) */}
              <div className="mt-8 pt-6 border-t border-white/[0.05] max-w-md mx-auto">
                <span className="block text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-4">
                  Roster Lineup ({lineupProducts.length} / 16)
                </span>
                <div className="grid grid-cols-8 gap-2.5 justify-center">
                  {Array.from({ length: 16 }).map((_, idx) => {
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
        <section id="champions-section" className="py-20 md:py-28 border-t border-white/[0.05]">
          <div className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                      href={`/reviews/${c.id}`}
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
                        rel="noreferrer"
                        className="hover:underline font-semibold text-zinc-400 hover:text-white"
                      >
                        {c.makerTwitter}
                      </a>
                    </div>
                    <a 
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] uppercase font-mono underline text-white hover:text-zinc-300 transition-colors"
                    >
                      DEMO
                    </a>
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
        <section id="how-it-works-section" className="py-16 border-t border-white/[0.05]">
          <div className="mb-12">
            <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-white border-l-2 border-white pl-4 font-sans">
              HOW IT WORKS
            </h2>
            <p className="text-xs text-zinc-500 mt-2 font-sans">
              Here, victory isn't bought with upvotes. It is earned through authentic, peer-reviewed execution.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
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
                  Submit your project for free. Once registered, head over to "My Console" to queue it for the 1v1 Arena matchmaking.
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
            <button 
              onClick={() => setIsPrivacyOpen(true)} 
              className="hover:text-white transition cursor-pointer bg-transparent border-none p-0 text-zinc-550 hover:text-white text-xs font-medium"
            >
              Privacy Policy
            </button>
            <button 
              onClick={() => setIsTermsOpen(true)} 
              className="hover:text-white transition cursor-pointer bg-transparent border-none p-0 text-zinc-550 hover:text-white text-xs font-medium"
            >
              Terms of Use
            </button>
            <a 
              href="mailto:support@maber.xyz" 
              className="hover:text-white transition"
            >
              Contact Support
            </a>
          </div>
        </div>
      </footer>
        </>
      )}

      {/* ========================================================
          Tactile Slide-over Drawer for new submissions
         ======================================================== */}
      {isSubmitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/90 backdrop-blur-md animate-fade-in" 
            onClick={() => setIsSubmitOpen(false)}
          />
          <div className="bg-[#0b0b0d] border border-white/[0.12] rounded-md p-6 w-full max-w-md relative z-10 text-xs space-y-4 animate-scale-in text-[#E4E4E7]">
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
              <h3 className="text-sm font-semibold text-white tracking-tight font-sans flex items-center gap-2 uppercase">
                <PlusIcon className="w-4 h-4 text-[#A78BFA]" /> SUBMIT PROJECT
              </h3>
              <button 
                onClick={() => setIsSubmitOpen(false)}
                className="text-zinc-500 hover:text-white bg-zinc-950 p-1 rounded-md border border-white/[0.05] cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-zinc-400 font-sans text-[11px] leading-relaxed">
              Enlist your product launch. Once verified and 16 entries are queued, matches generate automatically.
            </p>

            {/* Auth Status Segment */}
            <div className="p-4 bg-[#141417] border border-white/[0.06] rounded-md flex flex-col gap-3 text-left">
              <div className="flex items-center space-x-3">
                <span className="w-8 h-8 bg-[#0b0b0d] border border-white/[0.06] flex items-center justify-center text-sm rounded-md">
                  {userAuthType === "github" ? "🐙" : "🔑"}
                </span>
                <div>
                  <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block">IDENTITY VERIFICATION</span>
                  {userLoggedIn ? (
                    <span className="text-xs font-semibold text-white">
                      {mockUserTwitter} <span className="text-zinc-500 font-mono">({userAuthType === "github" ? "GitHub" : "Google"})</span>
                    </span>
                  ) : (
                    <span className="text-xs text-red-500 font-bold uppercase">Unverified</span>
                  )}
                </div>
              </div>
              {!userLoggedIn ? (
                <div className="flex gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setTempAuthType("google");
                      setIsAuthOpen(true);
                    }}
                    className="flex-1 py-1.5 px-3 bg-white text-black hover:bg-zinc-200 text-xs font-semibold rounded-md transition duration-150 cursor-pointer"
                  >
                    Link Google
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTempAuthType("github");
                      setIsAuthOpen(true);
                    }}
                    className="flex-1 py-1.5 px-3 bg-zinc-900 text-white border border-white/[0.1] hover:bg-white/[0.04] text-xs font-semibold rounded-md transition duration-150 cursor-pointer"
                  >
                    Link GitHub
                  </button>
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

            <form onSubmit={handleSubmitProduct} noValidate className="space-y-4 text-left">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Product Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SiteShot 📸"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-black border border-white/[0.08] text-zinc-100 placeholder:text-zinc-800 p-2 text-xs rounded-md focus:border-white/[0.2] outline-none h-9"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">One-Sentence Tagline *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. High-def screenshot API with full-page scrolling..."
                  value={newTagline}
                  onChange={(e) => setNewTagline(e.target.value)}
                  className="w-full bg-black border border-white/[0.08] text-zinc-100 placeholder:text-zinc-800 p-2 text-xs rounded-md focus:border-white/[0.2] outline-none h-9"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Demo URL *</label>
                <input
                  type="text"
                  required
                  placeholder="https://siteshot.net"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full bg-black border border-white/[0.08] text-zinc-100 placeholder:text-zinc-800 p-2 text-xs rounded-md focus:border-white/[0.2] outline-none h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Maker Name</label>
                  <input
                    type="text"
                    placeholder="Sarah"
                    value={newMaker}
                    onChange={(e) => setNewMaker(e.target.value)}
                    className="w-full bg-black border border-white/[0.08] text-zinc-100 placeholder:text-zinc-800 p-2 text-xs rounded-md focus:border-white/[0.2] outline-none h-9"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Twitter (X)</label>
                  <input
                    type="text"
                    placeholder="@sarah_dev"
                    value={newTwitter}
                    onChange={(e) => setNewTwitter(e.target.value)}
                    className="w-full bg-black border border-white/[0.08] text-zinc-100 placeholder:text-zinc-800 p-2 text-xs rounded-md focus:border-white/[0.2] outline-none h-9"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Product Logo * (Max 2MB)</label>
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
                    accept="image/*"
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
                      PNG, JPG, or SVG image. If skipped, default 🚀 rocket booster is used.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.05]">
                <button
                  type="button"
                  onClick={() => setIsSubmitOpen(false)}
                  className="px-4 py-2 border border-white/[0.08] hover:bg-white/[0.02] text-zinc-400 rounded-md text-xs transition duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-white hover:bg-zinc-200 text-black font-semibold rounded-md text-xs transition duration-150 cursor-pointer"
                >
                  Submit Project
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
            className="absolute inset-0 bg-black/90 backdrop-blur-md animate-fade-in" 
            onClick={() => {
              setVotingMatch(null);
              setVotingTarget(null);
              setVoteWinnerFeedback("");
              setVoteLoserFeedback("");
              setVoteError("");
            }}
          />
          <div className="bg-[#0b0b0d] border border-white/[0.12] rounded-md p-6 w-full max-w-md relative z-10 text-xs space-y-4 animate-scale-in text-[#E4E4E7]">
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-3">
              <h3 className="text-sm font-semibold text-white tracking-tight font-sans flex items-center gap-2 uppercase">
                <GitCommitIcon className="w-4 h-4 text-cyan-400" /> DUELING VOTE BOX
              </h3>
              <button 
                onClick={() => {
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
              We enforce a **Dual Feedback Loop**. To register your vote, you must bind your account and write positive critique for the winner AND constructive advice for the loser.
            </p>

            <form onSubmit={handleVoteSubmit} noValidate className="space-y-4 text-left">
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
                      <span className="text-xs text-red-500 font-bold uppercase">Unauthenticated</span>
                    )}
                  </div>
                </div>
                {!userLoggedIn ? (
                  <div className="flex gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        setTempAuthType("google");
                        setIsAuthOpen(true);
                      }}
                      className="flex-1 py-1.5 px-3 bg-white text-black hover:bg-zinc-200 text-xs font-semibold rounded-md transition duration-150 cursor-pointer"
                    >
                      Link Google
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTempAuthType("github");
                        setIsAuthOpen(true);
                      }}
                      className="flex-1 py-1.5 px-3 bg-zinc-900 text-white border border-white/[0.1] hover:bg-white/[0.04] text-xs font-semibold rounded-md transition duration-155 cursor-pointer"
                    >
                      Link GitHub
                    </button>
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
            className="absolute inset-0 bg-black/90 backdrop-blur-md animate-fade-in" 
            onClick={() => {
              setIsAuthOpen(false);
            }}
          />
          <div className="bg-[#0b0b0d] border border-white/[0.12] rounded-md p-6 w-full max-w-sm relative z-10 text-xs space-y-4 animate-scale-in text-[#E4E4E7]">
            <div className="flex justify-between items-center border-b border-white/[0.05] pb-3">
              <h3 className="text-sm font-semibold text-white tracking-tight font-sans flex items-center gap-2 uppercase">
                <span>🔑 Link Identity</span>
              </h3>
              <button 
                onClick={() => {
                  setIsAuthOpen(false);
                }}
                className="text-zinc-550 hover:text-white bg-zinc-950 p-1 rounded-md border border-white/[0.05] cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-zinc-400 font-sans text-[11px] leading-relaxed">
              Connect your verified developer profile to authorize dual-critique voting in the combat arena. Real identity makes feedback globally verifiable and high-trust.
            </p>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={async () => {
                  if (supabase) {
                    const { data, error } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: {
                        redirectTo: window.location.origin,
                        skipBrowserRedirect: true,
                      },
                    });
                    if (data?.url) {
                      window.open(data.url, "_blank");
                    }
                    if (error) console.error("Google OAuth error:", error);
                  } else {
                    handleSandboxLogin("google");
                    alert("Mock: Google authorization linked successfully!");
                  }
                }}
                className="w-full py-2.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold rounded-md transition duration-150 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>🔑 CONNECT WITH GOOGLE</span>
              </button>
 
              <button
                type="button"
                onClick={async () => {
                  if (supabase) {
                    const { data, error } = await supabase.auth.signInWithOAuth({
                      provider: 'github',
                      options: {
                        redirectTo: window.location.origin,
                        skipBrowserRedirect: true,
                      },
                    });
                    if (data?.url) {
                      window.open(data.url, "_blank");
                    }
                    if (error) console.error("GitHub OAuth error:", error);
                  } else {
                    handleSandboxLogin("github");
                    alert("Mock: GitHub authorization linked successfully!");
                  }
                }}
                className="w-full py-2.5 bg-[#121215] text-white border border-white/[0.1] hover:bg-white/[0.04] text-xs font-semibold rounded-md transition duration-150 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>🐙 CONNECT WITH GITHUB</span>
              </button>
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
            className="absolute inset-0 bg-black/90 backdrop-blur-md animate-fade-in" 
            onClick={() => setIsSuccessOpen(false)}
          />
          <div className="bg-[#0b0b0d] border border-white/[0.12] rounded-md p-6 w-full max-w-md relative z-10 text-xs space-y-4 animate-scale-in text-center text-[#E4E4E7]">
            
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
          Victory Champion Modal
         ======================================================== */}
      {isChampionModalOpen && championWinner && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ zIndex: 110 }}>
          <div 
            className="absolute inset-0 bg-black/90 backdrop-blur-md animate-fade-in" 
            onClick={() => setIsChampionModalOpen(false)}
          />
          <div className="bg-[#0b0b0d] border border-white/[0.12] rounded-md p-6 w-full max-w-lg relative z-10 text-xs space-y-5 animate-scale-in text-center text-[#E4E4E7]">
            
            <button 
              onClick={() => setIsChampionModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white bg-zinc-950 p-1 rounded-md border border-white/[0.05] cursor-pointer"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>

            <div className="inline-flex items-center space-x-2 bg-white/[0.04] border border-white/[0.08] text-white font-mono text-[9px] px-3 py-1 uppercase rounded-md">
              <span>COLOSSEUM CHAMPION DECLARED</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white uppercase flex items-center justify-center gap-2">
              {renderLogo(championWinner.logo, "w-8 h-8")}
              <span>{championWinner.title}</span>
              {renderLogo(championWinner.logo, "w-8 h-8")}
            </h2>
            <p className="text-zinc-400 text-xs max-w-md mx-auto leading-relaxed">
              {championWinner.tagline}
            </p>

            {/* Maker Spotlight Card */}
            <div className="p-4 border border-white/[0.06] bg-[#141417] rounded-md text-left flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <img src={championWinner.makerAvatar} alt="Maker" className="w-10 h-10 border border-white/[0.08] rounded-md" />
                <div>
                  <span className="text-[9px] font-mono block text-zinc-500">ARENA CONQUEROR</span>
                  <span className="text-xs font-semibold text-zinc-200">{championWinner.makerName}</span>
                </div>
              </div>
              
              <a 
                href={`https://x.com/${championWinner.makerTwitter.replace(/^@/, "")}`}
                target="_blank" 
                rel="noreferrer"
                className="px-3 py-1.5 bg-white/[0.02] border border-white/[0.06] text-zinc-300 font-mono text-[9px] hover:bg-white/[0.04] hover:border-white/[0.1] hover:text-white rounded-md transition duration-150 cursor-pointer"
              >
                FOLLOW {championWinner.makerTwitter} ➔
              </a>
            </div>

            <div className="flex flex-col sm:flex-row justify-center items-center gap-3 pt-3 border-t border-white/[0.05]">
              <a 
                href={championWinner.url}
                target="_blank"
                rel="noreferrer"
                className="bg-white text-black hover:bg-zinc-200 px-5 py-2.5 text-xs rounded-md font-semibold tracking-tight transition duration-150 cursor-pointer w-full sm:w-auto text-center"
              >
                EXPLORE DEMO URL ➔
              </a>
              
              <button 
                onClick={() => setIsChampionModalOpen(false)}
                className="bg-[#121215] border border-white/[0.1] text-zinc-300 hover:bg-white/[0.04] hover:text-white px-5 py-2.5 text-xs rounded-md font-semibold tracking-tight transition duration-150 cursor-pointer w-full sm:w-auto"
              >
                RETURN TO WHITEBOARD
              </button>
            </div>

          </div>
        </div>
      )}



      {/* ========================================================
          Privacy Policy Modal
         ======================================================== */}
      {isPrivacyOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" style={{ zIndex: 150 }}>
          <div 
            className="absolute inset-0 bg-black/90 backdrop-blur-md animate-fade-in" 
            onClick={() => setIsPrivacyOpen(false)}
          />
          <div className="bg-[#0b0b0d] border border-white/[0.12] rounded-md p-6 w-full max-w-2xl relative z-10 text-xs space-y-4 animate-scale-in text-[#E4E4E7]">
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
                  We do not sell, rent, or lease your personal information. Your profile details, submitted critiques, and project links are publicly displayed as part of the core Indie Clash experience. All transaction sessions are handled via encrypted Supabase storage.
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
            className="absolute inset-0 bg-black/90 backdrop-blur-md animate-fade-in" 
            onClick={() => setIsTermsOpen(false)}
          />
          <div className="bg-[#0b0b0d] border border-white/[0.12] rounded-md p-6 w-full max-w-2xl relative z-10 text-xs space-y-4 animate-scale-in text-[#E4E4E7]">
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
                  Indie Clash is provided "as is" and "as available". We do not guarantee uninterrupted service or error-free matchups. We reserve the right to modify, pause, or terminate tournament systems, brackets, or database values at our sole discretion without notice.
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
          <div className="bg-[#0b0b0d] border border-white/[0.12] rounded-xl p-5 w-full max-w-sm relative z-10 text-xs space-y-4 animate-scale-in text-left text-[#E4E4E7] shadow-2xl shadow-black/80">
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
            <div className="bg-white/[0.02] border border-white/[0.05] p-3 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <span className="font-mono text-[9px] text-zinc-400 uppercase tracking-wider">LIVE DEMO URL</span>
              </div>
              <a 
                href={activeCardProduct.url} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={() => synthClick(400, "sine", 0.08)}
                className="text-amber-400 hover:text-amber-300 font-semibold transition-colors flex items-center gap-1 group text-[11px] border-b border-amber-400/30 hover:border-amber-300"
              >
                VIEW DEMO <span className="group-hover:translate-x-0.5 transition-transform">➔</span>
              </a>
            </div>

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
                  } catch (e) {
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
