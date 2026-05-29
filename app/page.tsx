"use client";

import React, { useState, useEffect, useRef } from "react";
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
  saveLocalPastChampions
} from "@/lib/arenaStore";
import { supabase } from "@/lib/supabaseClient";
import {
  getMillisecondsToNextNYMidnight,
  getRoundRemainingMs,
  formatDuration,
  formatToHMS
} from "@/lib/timeHelpers";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);

  // Window scroll position tracking state
  const [scrollY, setScrollY] = useState(0);

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
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newTagline, setNewTagline] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newTimeframe, setNewTimeframe] = useState<"24h" | "48h" | "7d">("48h");
  const [newMaker, setNewMaker] = useState("");
  const [newTwitter, setNewTwitter] = useState("");
  const [newLogo, setNewLogo] = useState("🚀");

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
        userSupabaseId: authUser.id || ""
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
  const [pastChampions, setPastChampions] = useState<Product[]>([]);
  const [isChampionModalOpen, setIsChampionModalOpen] = useState(false);
  const [championWinner, setChampionWinner] = useState<Product | null>(null);
  const [isPastChampsOpen, setIsPastChampsOpen] = useState(false);
  
  // Auth Form Inputs
  const [authInputVal, setAuthInputVal] = useState("");
  const [tempAuthType, setTempAuthType] = useState<"google" | "github">("google");

  // Keep latestBracketRef synchronized with bracket state to avoid closure staleness
  const latestBracketRef = useRef<Bracket | null>(null);
  useEffect(() => {
    latestBracketRef.current = bracket;
  }, [bracket]);

  const syncDebounceTimeoutRef = useRef<any>(null);
  const latestRequestTimeRef = useRef<number>(0);



  // Act refs & trigger states for scroll effects
  const narrativeRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [narrativeActive, setNarrativeActive] = useState(0);
  const [maxActiveReached, setMaxActiveReached] = useState(0);
  const [stepsRevealed, setStepsRevealed] = useState(false);
  const [dashRevealed, setDashRevealed] = useState(false);

  // Sync products and bracket from cloud or local storage
  const syncCloudData = async () => {
    try {
      const prods = await fetchCloudProducts();
      if (prods && prods.length > 0) {
        setProducts(prods);
      }
      
      // Load past champions from cloud database
      const champs = await fetchCloudPastChampions();
      setPastChampions(champs);
      
      const b = await fetchCloudBracket();
      const previousBracket = latestBracketRef.current;

      if (b) {
        setBracket(b);
        const round = getActiveRound(b);
        let active = null;
        if (round === 1) active = b.round1.find(m => !m.winnerId) || b.round1[0];
        else if (round === 2) active = b.round2.find(m => !m.winnerId) || b.round2[0];
        else if (round === 3) active = b.round3.find(m => !m.winnerId) || b.round3[0];
        else if (round === 4) active = b.round4.find(m => !m.winnerId) || b.round4[0];
        setActiveMatch(active || null);
      } else {
        setBracket(null);
        setActiveMatch(null);
      }
    } catch (e) {
      console.error("Error syncing data:", e);
    }
  };

  // Initial Load
  useEffect(() => {
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
    setTimeout(() => {
      setIsBooted(true);
    }, 100);

    // Generate random pixel particles for background atmosphere
    const generated = Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: `${Math.floor(Math.random() * 5) + 3}px`,
      delay: `${Math.random() * 10}s`,
      duration: `${Math.random() * 6 + 10}s`
    }));
    setParticles(generated);

    // Scroll listener for smooth fold transitions and visual parallax
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrollY(currentScrollY);
      
      if (narrativeRef.current) {
        const offsetTop = narrativeRef.current.offsetTop;
        const sectionHeight = narrativeRef.current.offsetHeight;
        const totalScrollable = sectionHeight - window.innerHeight;
        
        if (totalScrollable > 0) {
          const sectionScroll = currentScrollY - offsetTop;
          const progress = sectionScroll / (totalScrollable * 0.85);
          const clampedProgress = Math.max(0, Math.min(0.999, progress));
          const activeIndex = Math.floor(clampedProgress * 8);
          setNarrativeActive(activeIndex);
          setMaxActiveReached(prev => Math.max(prev, activeIndex));
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true } as any);
    };
  }, []);

  // Supabase Realtime Synchronization Hook
  useEffect(() => {
    if (!supabase) return;

    // Listen to changes in the matches table
    const matchesChannel = supabase
      .channel("matches-realtime-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shipandbattle_matches" },
        async (payload) => {
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
                if (activeMatch.id === row.shipandbattle_id) {
                  // Find products A and B in in-memory state
                  const prodA = products.find(p => p.id === row.shipandbattle_product_a_id);
                  const prodB = products.find(p => p.id === row.shipandbattle_product_b_id);
                  if (prodA && prodB) {
                    setActiveMatch({
                      id: row.shipandbattle_id,
                      roundNumber: row.shipandbattle_round_number,
                      productA: prodA,
                      productB: prodB,
                      votesA: row.shipandbattle_votes_a,
                      votesB: row.shipandbattle_votes_b,
                      winnerId: row.shipandbattle_winner_id || undefined,
                      votedUserIds: row.shipandbattle_voted_user_ids || []
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
        { event: "INSERT", schema: "public", table: "shipandbattle_votes" },
        (payload) => {
          console.log("Realtime Critique sync trigger received:", payload);
          const row = payload.new as any;
          if (row) {
            const comment = `Critique: ${row.shipandbattle_feedback_loser.slice(0, 32)}...`;
            setDanmakus(prev => [comment, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(matchesChannel);
        supabase.removeChannel(votesChannel);
      }
      if (syncDebounceTimeoutRef.current) {
        clearTimeout(syncDebounceTimeoutRef.current);
      }
    };
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
          const activeBracket = {
            ...bracket,
            status: "active" as const,
            roundStartedAt: new Date().toISOString()
          };
          setBracket(activeBracket);
          setActiveMatch(activeBracket.round1[0]);
          saveBracket(activeBracket);
          if (supabase) {
            saveCloudBracket(activeBracket).then(() => syncCloudData());
          }
        }
      }
      
      if (bracket && bracket.status === "active") {
        const roundNum = getActiveRound(bracket);
        const ms = getRoundRemainingMs(roundNum, bracket.roundStartedAt || new Date().toISOString());
        setActiveRoundRemainingMs(ms);
        
        if (ms <= 0) {
          const advanced = advanceTournamentRound(bracket);
          
          if (advanced.status === "completed" && advanced.winner) {
            const champ = advanced.winner;
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
              saveCloudBracket(advanced).then(() => syncCloudData());
            }
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
            if (supabase) {
              saveCloudBracket(advanced).then(() => syncCloudData());
            }
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [bracket, activeMatch]);

  // Reset Sandbox
  const handleReset = () => {
    localStorage.clear();
    const freshProds = loadProducts();
    setProducts(freshProds);
    setBracket(null);
    setActiveMatch(null);
    setIsSubmitOpen(false);
    setVotingMatch(null);
    setVotingTarget(null);
    setVoteWinnerFeedback("");
    setVoteLoserFeedback("");
    if (supabase) {
      clearCloudData().then(() => syncCloudData());
    }
  };

  // Smooth scroll down to live duel battle arena
  const scrollToDuel = () => {
    const el = document.getElementById("tournament-dashboard");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Add Competitor
  const handleAddDummy = () => {
    const currentWaiting = products.filter(p => p.queueStatus === "waiting");
    if (currentWaiting.length >= 16) {
      alert("The Waiting Room queue is already full with 16 competitors!");
      return;
    }
    const updated = addDummyMaker(products);
    setProducts(updated);
    const addedProd = updated[updated.length - 1];

    if (supabase && addedProd) {
      upsertCloudProduct(addedProd);
    }
    
    // Auto-launch the tournament bracket once we hit 16 in the sandbox!
    const newWaiting = updated.filter(p => p.queueStatus === "waiting");
    if (newWaiting.length === 16 && !bracket) {
      setTimeout(() => {
        alert("Waitlist reached 16! Automatically generating the double-elimination tournament bracket!");
        const newB = buildInitialBracket(updated);
        setBracket(newB);
        setActiveMatch(newB.round1[0]);
        if (supabase) {
          saveCloudBracket(newB).then(() => syncCloudData());
        }
      }, 300);
    }
  };

  // Fill & Start
  const handleAutoFillAndStart = () => {
    let currentProducts = [...products];
    let currentWaiting = currentProducts.filter(p => p.queueStatus === "waiting");
    while (currentWaiting.length < 16) {
      currentProducts = addDummyMaker(currentProducts);
      currentWaiting = currentProducts.filter(p => p.queueStatus === "waiting");
      const added = currentProducts[currentProducts.length - 1];
      if (supabase && added) {
        upsertCloudProduct(added);
      }
    }
    setProducts(currentProducts);
    const newB = buildInitialBracket(currentProducts);
    setBracket(newB);
    setActiveMatch(newB.round1[0]);
    if (supabase) {
      saveCloudBracket(newB).then(() => syncCloudData());
    }
  };

  // Onboard Submission
  const handleSubmitProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userLoggedIn) {
      alert("Verification Required!\n\nPlease link and verify your Google or GitHub identity before submitting your product to the waiting list.");
      setIsAuthOpen(true);
      return;
    }
    if (!newTitle || !newTagline || !newUrl) {
      alert("Please fill in all required product fields.");
      return;
    }

    // Limit to one product per person in the current season (waiting or active)
    const hasExisting = products.some(p => {
      if (p.queueStatus !== "waiting" && p.queueStatus !== "active") return false;
      if (userSupabaseId && p.creator_uid === userSupabaseId) return true;
      if (mockUserTwitter && p.creatorUsername && p.creatorUsername.toLowerCase() === mockUserTwitter.toLowerCase()) return true;
      const inputTwitter = newTwitter ? newTwitter.replace(/^@/, "").toLowerCase() : "";
      const existingTwitter = p.makerTwitter ? p.makerTwitter.replace(/^@/, "").toLowerCase() : "";
      if (inputTwitter && inputTwitter !== "anonymous" && inputTwitter === existingTwitter) return true;
      return false;
    });

    if (hasExisting) {
      alert("Submission Limit Exceeded!\n\nTo ensure fair play, each maker is allowed only ONE product in the waiting list or active queue per tournament cycle.");
      return;
    }

    const newProd: Product = {
      id: `p_user_${Date.now()}`,
      title: newTitle,
      tagline: newTagline,
      url: newUrl.startsWith("http") ? newUrl : `https://${newUrl}`,
      shipTimeframe: newTimeframe,
      makerName: newMaker || "Anonymous Maker",
      makerTwitter: newTwitter ? (newTwitter.startsWith("@") ? newTwitter : `@${newTwitter}`) : "@anonymous",
      makerAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces" + 
        (userLoggedIn ? `#creator=${encodeURIComponent(mockUserTwitter)}&uid=${encodeURIComponent(userSupabaseId)}` : ""),
      logo: newLogo,
      submittedAt: new Date().toISOString(),
      queueStatus: "waiting",
      votesCount: 0,
      creatorUsername: mockUserTwitter,
      creator_uid: userSupabaseId
    } as any;

    const updated = [...products, newProd];
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

    if (supabase) {
      upsertCloudProduct(newProd);
    }

    setNewTitle("");
    setNewTagline("");
    setNewUrl("");
    setNewMaker("");
    setNewTwitter("");
    setIsSubmitOpen(false);

    const waitingList = updated.filter(p => p.queueStatus === "waiting");
    if (waitingList.length >= 16 && !bracket) {
      setTimeout(() => {
        setSuccessModalTitle("ARENA BRACKET ACTIVE ⚔️");
        setSuccessModalText("Your project has been successfully queued in the 16-competitor roster, and the head-to-head tournament bracket has been automatically generated!\n\nIMPORTANT NOTICE: This platform does NOT provide any organic promotion, marketing, or advertising. To win your live 1v1 duels, you must actively campaign, promote, and rally votes yourself across Twitter/X, GitHub, and other social media channels!");
        setIsSuccessOpen(true);
        const newB = buildInitialBracket(updated);
        setBracket(newB);
        setActiveMatch(newB.round1[0]);
        if (supabase) {
          saveCloudBracket(newB).then(() => syncCloudData());
        }
      }, 500);
    } else {
      setSuccessModalTitle("PROJECT QUEUED 🛡️");
      setSuccessModalText("Your product has been queued in the waiting room list. Note: This platform does NOT provide any organic promotion or marketing for your project. To win your live 1v1 duels, you must actively campaign, promote, and rally votes yourself across Twitter/X, GitHub, and other social media channels!");
      setIsSuccessOpen(true);
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
        saveCloudBracket(updated).then(() => syncCloudData());
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
        saveCloudBracket(updated).then(() => syncCloudData());
      }
    }
  };

  // Submit vote with dual-input feedback
  const handleVoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userLoggedIn) {
      setVoteError("Please link your Google or GitHub account first to authorize your vote.");
      return;
    }
    if (voteWinnerFeedback.length < 10 || voteLoserFeedback.length < 10) {
      setVoteError("Dual feedback inputs must both be at least 10 characters long.");
      return;
    }
    if (!bracket || !votingMatch || !votingTarget) return;

    const round = getActiveRound(bracket);

    // Limit to one vote per user per separate 1v1 matchup (within a round)
    const alreadyVotedOnThisMatch = votingMatch.votedUserIds && votingMatch.votedUserIds.includes(mockUserTwitter);
    if (alreadyVotedOnThisMatch) {
      setVoteError("Voting Limit Reached! To ensure fair play, you can only cast ONE vote per separate 1v1 matchup.");
      return;
    }
    const voteForA = votingTarget.id === votingMatch.productA.id;

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
        .from("shipandbattle_votes")
        .insert({
          shipandbattle_match_id: freshMatch.id,
          shipandbattle_voter_username: mockUserTwitter,
          shipandbattle_voter_auth_type: userAuthType === "google" ? "twitter" : userAuthType,
          shipandbattle_voted_product_id: votingTarget.id,
          shipandbattle_feedback_winner: voteWinnerFeedback,
          shipandbattle_feedback_loser: voteLoserFeedback
        })
        .then(({ error }) => {
          if (error) console.error("Error inserting realtime vote:", error);
        });

      // 2. Update match votes in database
      supabase
        .from("shipandbattle_matches")
        .upsert({
          shipandbattle_id: freshMatch.id,
          shipandbattle_bracket_id: nextBracket.id,
          shipandbattle_round_number: freshMatch.roundNumber,
          shipandbattle_product_a_id: freshMatch.productA.id,
          shipandbattle_product_b_id: freshMatch.productB.id,
          shipandbattle_votes_a: freshMatch.votesA,
          shipandbattle_votes_b: freshMatch.votesB,
          shipandbattle_winner_id: freshMatch.winnerId || null,
          shipandbattle_voted_user_ids: freshMatch.votedUserIds
        })
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
          product_a_id: votingMatch.productA.id,
          product_b_id: votingMatch.productB.id,
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
    const isOwner = isProductOwner(product, mockUserTwitter, userSupabaseId);
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
          .from("shipandbattle_matches")
          .select("shipandbattle_id")
          .or(`shipandbattle_product_a_id.eq.${product.id},shipandbattle_product_b_id.eq.${product.id}`);

        if (mErr) throw mErr;

        if (matches && matches.length > 0) {
          const matchIds = matches.map(m => m.shipandbattle_id);
          
          // B. Fetch all votes for these matches
          const { data: votes, error: vErr } = await supabase
            .from("shipandbattle_votes")
            .select("*")
            .in("shipandbattle_match_id", matchIds);

          if (vErr) throw vErr;

          if (votes) {
            critiques = votes.map(v => {
              const isWinner = v.shipandbattle_voted_product_id === product.id;
              // Map database-compatible provider 'twitter' back to 'google' if voter has a google/email style signature
              const rawProvider = v.shipandbattle_voter_auth_type;
              const provider = rawProvider === "twitter" ? "google" : rawProvider;
              return {
                voter: v.shipandbattle_voter_username,
                provider: provider,
                role: isWinner ? "Winner (Voted For)" : "Loser (Opponent Voted For)",
                text: isWinner ? v.shipandbattle_feedback_winner : v.shipandbattle_feedback_loser,
                date: new Date(v.shipandbattle_created_at || Date.now()).toLocaleDateString()
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
  const waitingProducts = products.filter(p => p.queueStatus === "waiting");
  const currentSeasonNum = pastChampions.length + 1;
  const currentSeasonStr = String(currentSeasonNum).padStart(2, "0");

  return (
    <div className={`flex-1 bg-[#121110] text-[#181715] font-sans selection:bg-[#fdf2e9] crt-screen min-h-screen relative ${isShaking ? "animate-arena-shake" : ""}`}>
      
      {/* Main page content wrapped with the CRT boot screen-on animation */}
      <div className={`transition-all duration-300 ${isBooted ? "animate-crt-boot" : "opacity-0"}`}>
      
      {/* ========================================================
          ACT 1: IMMERSIVE HERO ARENA (First Fold)
         ======================================================== */}
      <section 
        className="w-full h-screen relative flex flex-col justify-between overflow-hidden"
        style={{
          backgroundImage: "linear-gradient(to bottom, rgba(24, 23, 21, 0.45) 0%, rgba(24, 23, 21, 0.15) 30%, rgba(24, 23, 21, 0.35) 75%, rgba(24, 23, 21, 0.85) 100%), url('/colosseum_arena_pixel.png')",
          backgroundSize: "cover",
          backgroundPosition: "center 75%",
          backgroundAttachment: "fixed",
        }}
      >
        {/* Absolute floating retro pixel particles */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          {particles.map(p => (
            <div
              key={p.id}
              className="pixel-particle"
              style={{
                left: p.left,
                width: p.size,
                height: p.size,
                animation: `particle-up ${p.duration} linear infinite`,
                animationDelay: p.delay
              }}
            />
          ))}
        </div>

        {/* 8-Bit Pixel-Art Elegant Header inside First Fold */}
        <header className="border-b border-stone-850 py-5 px-6 sm:px-12 flex justify-between items-center bg-[#181715]/75 backdrop-blur-xs relative z-20 text-[#faf5ef] shadow-sm">
          <div className="flex items-center space-x-4">
            <span className="text-xl sm:text-2xl font-pixel tracking-wider text-[#faf5ef] animate-pixel-bounce">INDIE_CLASH ⚔️</span>
            <span className="bg-[#181715] border border-stone-700 text-xs font-pixel px-2 py-0.5 text-[#d97706] uppercase">
              {supabase ? "LIVE_CLOUD" : "STAGE_1"}
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {userLoggedIn ? (
              <div className="flex items-center space-x-3 text-2xs bg-[#181715] px-3.5 py-1.5 border border-stone-850 font-pixel text-[#faf5ef] shadow-pixel-sm relative z-20">
                <span className="w-2.5 h-2.5 bg-emerald-500 animate-pulse rounded-full inline-block"></span>
                <span className="tracking-wide text-4xs text-[#faf5ef]/80 uppercase">
                  Connected: <span className="text-[#faf5ef] font-sans font-bold text-3xs hover:text-[#d97706]">{mockUserTwitter}</span>
                </span>
                <button 
                  onClick={handleLogout}
                  className="px-2 py-0.5 text-4xs uppercase bg-red-950/40 text-red-400 hover:bg-red-900/60 hover:text-white border border-red-900/50 transition-all font-pixel cursor-pointer rounded-none font-bold"
                >
                  Exit
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsAuthOpen(true)}
                className="btn-pixel !bg-[#181715] !text-[#faf5ef] border-stone-700 hover:!bg-[#d97706] hover:!text-white"
              >
                Link Identity
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Backdrop Blur & Darken DissOverlay */}
        <div 
          className="absolute inset-0 pointer-events-none z-1"
          style={{
            backgroundColor: `rgba(18, 17, 16, ${Math.min(0.85, scrollY / 400)})`,
            backdropFilter: `blur(${Math.min(12, scrollY / 30)}px)`,
            WebkitBackdropFilter: `blur(${Math.min(12, scrollY / 30)}px)`,
          }}
        />

        {/* First Fold Main Info Overlay - 2 Column Grid Layout on Large Screens */}
        <div 
          className="flex-1 flex flex-col lg:flex-row lg:items-center justify-between max-w-7xl mx-auto px-6 sm:px-12 w-full z-10 select-none pb-24 relative gap-12 transition-all duration-100 ease-out"
          style={{
            transform: `translateY(${scrollY * -0.45}px)`,
            opacity: Math.max(0, 1 - scrollY / 300),
          }}
        >
          {/* Left Column: Slogan and details */}
          <div className="max-w-xl relative z-20">
            <div className="flex flex-col">
              <h1 className="font-sans font-black tracking-tighter leading-[0.85] text-[#faf5ef] text-6xl sm:text-7xl md:text-8xl flex flex-col animate-hero-title">
                <span className="drop-shadow-[0_4px_0_rgba(0,0,0,0.95)]">INDIE</span>
                <span className="text-[#dc2626] drop-shadow-[0_4px_0_rgba(0,0,0,0.95)]">CLASH</span>
              </h1>
              <p className="text-[#fbbf24] font-mono text-2xs font-bold tracking-widest mt-4 uppercase animate-hero-sub drop-shadow-[0_2px_2px_rgba(0,0,0,0.95)]">
                1v1 head-to-head product duels & peer critiques.
              </p>
            </div>
            
            {/* 3-Step Action Guide */}
            <div className="mt-8 border-2 border-dashed border-[#d97706]/40 bg-[#181715]/90 p-4 sm:p-5 font-mono text-xs sm:text-sm text-stone-300 space-y-3.5 uppercase leading-normal shadow-pixel-xs select-none max-w-md animate-hero-sub">
              <span className="text-sm font-pixel text-[#d97706] block mb-2">🛡️ HOW TO PLAY:</span>
              <div className="flex items-start space-x-2">
                <span className="text-[#d97706] font-bold shrink-0">1. 🔑 LINK IDENTITY</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-[#d97706] font-bold shrink-0">2. ⚔️ ENTER ARENA</span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-[#d97706] font-bold shrink-0">3. 🛡️ DUEL & VOTE</span>
              </div>
            </div>

            {/* Dual Core CTAs */}
            <div className="mt-8 max-w-md w-full animate-hero-cta">
              {!bracket ? (
                <button
                  onClick={() => setIsSubmitOpen(true)}
                  className="btn-pixel btn-pixel-primary w-full py-4 px-8 text-xs sm:text-sm tracking-wider shadow-pixel-lg hover:-translate-y-0.5 active:translate-y-0 transition-all font-pixel bg-[#d97706] hover:bg-[#c25e00] text-white border-2 border-[#181715] font-black"
                >
                  ➕ SUBMIT MATCH REQUEST →
                </button>
              ) : (
                <button
                  onClick={scrollToDuel}
                  className="btn-pixel btn-pixel-primary w-full py-4 px-8 text-xs sm:text-sm tracking-wider shadow-pixel-lg hover:-translate-y-0.5 active:translate-y-0 transition-all font-pixel bg-[#d97706] hover:bg-[#c25e00] text-white border-2 border-[#181715] font-black"
                >
                  ⚔️ VOTE IN LIVE DUEL →
                </button>
              )}
            </div>

            {/* Premium Trust Badges */}
            <div className="mt-12 flex flex-wrap gap-4 items-center animate-hero-badge">
              <span className="flex items-center space-x-2 bg-[#181715]/75 border border-stone-800/80 px-3 py-1.5 text-3xs font-pixel text-stone-200 shadow-pixel-sm">
                <span>🛡️</span> <span>100% Verifiable & Public</span>
              </span>
              <span className="flex items-center space-x-2 bg-[#181715]/75 border border-stone-800/80 px-3 py-1.5 text-3xs font-pixel text-[#d97706] shadow-pixel-sm">
                <span>🤖</span> <span>Minimized Vote Rigging</span>
              </span>
              <span className="flex items-center space-x-2 bg-[#181715]/75 border border-stone-800/80 px-3 py-1.5 text-3xs font-pixel text-emerald-500 shadow-pixel-sm">
                <span>💬</span> <span>Authentic Peer Critique</span>
              </span>
            </div>
          </div>

          {/* Right Column: Reigning Champion Card */}
          <div className="w-full lg:max-w-sm relative z-20 animate-hero-sub">
            <div className="bg-[#faf5ef]/90 backdrop-blur-md border-4 border-pixel shadow-pixel-lg p-5 text-[#181715] relative overflow-hidden" style={{ borderColor: '#d97706' }}>
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-300 via-[#d97706] to-amber-300" />
              
              <div className="flex justify-between items-center mb-4 border-b border-pixel pb-2">
                <span className="text-3xs font-pixel text-[#d97706] uppercase tracking-wider">
                  🏆 Reigning Champion
                </span>
                <span className="text-5xs font-mono text-stone-400">LAST SEASON</span>
              </div>
              
              {pastChampions.length > 0 ? (
                (() => {
                  const reigning = pastChampions[pastChampions.length - 1];
                  return (
                    <>
                      <div className="flex items-start space-x-3 mb-4">
                        <span className="text-3xl shrink-0 mt-1 flex items-center justify-center">
                          {renderLogo(reigning.logo, "w-8 h-8")}
                        </span>
                        <div>
                          <a 
                            href={reigning.url} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="font-pixel text-xs text-[#181715] hover:text-[#d97706] hover:underline uppercase block leading-tight"
                          >
                            {reigning.title}
                          </a>
                          <p className="text-4xs text-stone-500 mt-1.5 line-clamp-2 leading-relaxed font-sans font-medium">
                            {reigning.tagline}
                          </p>
                        </div>
                      </div>
                      
                      <a 
                        href={reigning.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="mb-4 bg-[#faf5ef] border border-pixel p-2 text-3xs font-mono text-stone-700 hover:bg-[#fdf2e9] hover:border-[#d97706] transition-all flex items-center justify-between shadow-pixel-xs uppercase font-semibold"
                      >
                        <span>🌐 LIVE DEMO URL</span>
                        <span className="text-4xs text-[#d97706] underline font-pixel">view demo ➔</span>
                      </a>
                      
                      <div className="flex items-center justify-between border-t border-dashed border-stone-300 pt-3 text-4xs font-mono text-stone-600 mb-2">
                        <div className="flex items-center space-x-1.5">
                          <img src={reigning.makerAvatar} alt="Maker" className="w-5 h-5 border border-pixel shrink-0" />
                          <a 
                            href={`https://x.com/${reigning.makerTwitter.replace(/^@/, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-[#d97706] hover:underline font-bold"
                          >
                            {reigning.makerTwitter}
                          </a>
                        </div>
                        <span className="text-5xs uppercase font-pixel bg-amber-50 border border-amber-200 text-[#d97706] px-1 py-0.2">CHAMP</span>
                      </div>
                    </>
                  );
                })()
              ) : (
                <div className="py-4 text-center">
                  <span className="text-3xl block mb-2">🛡️</span>
                  <span className="font-pixel text-4xs text-stone-500 uppercase block mb-1">Season {currentSeasonStr} Active</span>
                  <p className="text-5xs font-mono text-stone-400 leading-relaxed px-2">
                    No champion has conquered the arena yet. Be the first to secure eternal glory!
                  </p>
                </div>
              )}
            </div>

            {/* View All Past Champions Button below the card */}
            {pastChampions.length > 0 && (
              <button
                onClick={() => setIsPastChampsOpen(true)}
                className="btn-pixel w-full py-2.5 mt-3 text-3xs tracking-wider font-pixel transition-all shadow-pixel-sm border-2"
                style={{
                  color: '#181715',
                  backgroundColor: '#faf5ef',
                  borderColor: '#181715',
                }}
              >
                🏆 VIEW ALL PAST CHAMPIONS
              </button>
            )}
          </div>
        </div>

        {/* Pulsing Scroll Indicator */}
        <div 
          className="flex flex-col items-center pb-6 animate-scroll-cue z-20 pointer-events-none select-none transition-opacity duration-200"
          style={{
            opacity: Math.max(0, 1 - scrollY / 120),
          }}
        >
          <span className="text-3xs font-pixel uppercase tracking-widest text-[#e7e3db] drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
            👇 scroll to duel / enter the arena
          </span>
        </div>

      </section>

      {/* ========================================================
          ACT 2: NARRATIVE STICKY SCROLL STORYTELLING
         ======================================================== */}
      <section 
        ref={narrativeRef} 
        className="relative bg-[#0d0c0b] border-b-4 border-pixel noise-overlay" 
        style={{ minHeight: "120vh" }}
      >
        <div className="sticky top-0 h-screen w-full flex flex-col justify-center items-center px-6 max-w-4xl mx-auto overflow-hidden">
          
          <div className="text-center space-y-8 md:space-y-12 max-w-3xl">
            <div className={`transition-all duration-500 mb-6 ${narrativeActive >= 0 ? "opacity-100" : "opacity-0"}`}>
              <span className="font-pixel text-[#d97706] text-3xs sm:text-2xs uppercase tracking-widest bg-[#181715] border border-stone-800 px-3 py-1">
                ARENA MANIFESTO // THE BATTLE FOR REAL VALUE
              </span>
            </div>

             {/* Narrative Lines */}
             <div className="space-y-6 md:space-y-8 text-xl sm:text-2xl md:text-3xl font-sans font-black tracking-tight leading-relaxed">
              <p className={`narrative-line ${maxActiveReached >= 0 ? "active" : ""}`}>
                Traditional public launches? <span className="text-[#d97706] font-pixel text-sm sm:text-base ml-2">🤖 BOT INFLATION</span>
              </p>
              
              <p className={`narrative-line ${maxActiveReached >= 1 ? "active" : ""}`}>
                Rigged upvotes and coordination rings dictate the game.
              </p>

              <p className={`narrative-line ${maxActiveReached >= 2 ? "active" : ""}`}>
                You spent <span className="text-[#faf5ef]">6 months</span> pouring your soul into code...
              </p>

              <p className={`narrative-line ${maxActiveReached >= 3 ? "active" : ""}`}>
                ...only to be buried by a low-effort clone backed by purchased hype.
              </p>

              <p className={`narrative-line ${maxActiveReached >= 4 ? "active" : ""}`}>
                Genuine, actionable feedback from real creators? Drowned out.
              </p>

              <p className={`narrative-line ${maxActiveReached >= 5 ? "active" : ""}`}>
                We aren't claiming to eradicate 100% of manipulation.
              </p>

              <p className={`narrative-line ${maxActiveReached >= 6 ? "active" : ""}`}>
                But we can drastically minimize it through transparent, critique-locked duels.
              </p>

              <p className={`narrative-line ${maxActiveReached >= 7 ? "active" : ""}`}>
                <span className="text-[#d97706] font-pixel">Write your peer review</span>, and let the authentic community decide.
              </p>
            </div>
          </div>

          {/* Smooth seamless transition boundary */}
        </div>
      </section>

      {/* ========================================================
          ACT 3: HOW IT WORKS — STAGGERED REVEAL MECHANISM
         ======================================================== */}
      <section 
        ref={stepsRef} 
        className="relative bg-[#0f0e0d] py-32 border-b-4 border-pixel noise-overlay" 
        style={{
          backgroundImage: "radial-gradient(circle at center, rgba(217, 119, 6, 0.04) 0%, transparent 70%)"
        }}
      >
        <div className="max-w-7xl mx-auto px-6 sm:px-12 relative z-10">
          
          {/* Header */}
          <div className="text-center max-w-xl mx-auto mb-20">
            <span className="font-pixel text-[#d97706] text-3xs uppercase tracking-widest bg-[#181715] border border-stone-800 px-3 py-1 inline-block mb-4">
              RULES OF ENGAGEMENT // MECHANICS OF THE DUEL
            </span>
            <h2 className="text-2xl sm:text-3xl font-pixel uppercase tracking-tight text-[#faf5ef]">
              How it Works
            </h2>
            <p className="text-xs sm:text-sm text-stone-400 mt-4 leading-relaxed font-sans">
              Here, victory isn't bought with upvotes. It is earned through authentic, peer-reviewed execution.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            <div className={`step-card p-8 border-2 border-pixel bg-[#181715]/60 backdrop-blur-xs flex flex-col justify-between shadow-pixel ${
              stepsRevealed ? "revealed" : ""
            }`}>
              <div>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-4xl sm:text-5xl font-pixel text-[#d97706] step-number">01</span>
                  <span className="text-stone-500 font-mono text-3xs">STEP_01</span>
                </div>
                <h3 className="font-pixel text-xs text-[#faf5ef] uppercase mb-4 tracking-wide">
                  Submit & Queue
                </h3>
                <p className="text-xs text-stone-400 leading-relaxed font-sans">
                  Submit your indie product for free. Provide a live demo URL and maker credentials to stand by in the staging area for matching.
                </p>
              </div>
              <div className="mt-8 border-t border-stone-800 pt-4 text-3xs font-mono text-stone-500">
                [ STAGE_1 : $0 FEE ]
              </div>
            </div>

            <div className={`step-card p-8 border-2 border-pixel bg-[#181715]/60 backdrop-blur-xs flex flex-col justify-between shadow-pixel ${
              stepsRevealed ? "revealed" : ""
            }`}>
              <div>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-4xl sm:text-5xl font-pixel text-[#d97706] step-number">02</span>
                  <span className="text-stone-500 font-mono text-3xs">STEP_02</span>
                </div>
                <h3 className="font-pixel text-xs text-[#faf5ef] uppercase mb-4 tracking-wide">
                  Critique-Locked Voting
                </h3>
                <p className="text-xs text-stone-400 leading-relaxed font-sans">
                  No casual clicks. Every voter must connect via Google or GitHub and leave a constructive dual critique of 10+ characters. This friction drastically minimizes automated bot rigging and coordinate spamming.
                </p>
              </div>
              <div className="mt-8 border-t border-stone-800 pt-4 text-3xs font-mono text-[#d97706]">
                [ MINIMIZED MANIPULATION DESIGN ]
              </div>
            </div>

            <div className={`step-card p-8 border-2 border-pixel bg-[#181715]/60 backdrop-blur-xs flex flex-col justify-between shadow-pixel ${
              stepsRevealed ? "revealed" : ""
            }`}>
              <div>
                <div className="flex justify-between items-center mb-6">
                  <span className="text-4xl sm:text-5xl font-pixel text-[#d97706] step-number">03</span>
                  <span className="text-stone-500 font-mono text-3xs">STEP_03</span>
                </div>
                <h3 className="font-pixel text-xs text-[#faf5ef] uppercase mb-4 tracking-wide">
                  Dual-Feedback Value
                </h3>
                <p className="text-xs text-stone-400 leading-relaxed font-sans">
                  Winners advance to the next bracket, but runners-up win where it matters: walking away with structured, highly valuable peer critiques. This feedback is 100x more valuable than empty clicks.
                </p>
              </div>
              <div className="mt-8 border-t border-stone-800 pt-4 text-3xs font-mono text-emerald-500">
                [ DUAL CRITIQUE FEEDBACK ]
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================
          ACT 4: TOURNAMENT & CAMPAIGN ARENA (Dashboard Fold)
         ======================================================== */}
      <section 
        id="tournament-dashboard"
        ref={dashboardRef}
        className="w-full min-h-screen bg-[#11100f] text-[#faf5ef] relative z-10 border-b-4 border-pixel py-20 noise-overlay"
        style={{
          backgroundImage: "radial-gradient(circle at top, rgba(217, 119, 6, 0.06) 0%, transparent 60%), linear-gradient(to bottom, #11100f 0%, #0d0c0c 100%)",
        }}
      >
        <div className={`max-w-7xl mx-auto px-6 sm:px-12 relative z-10 dashboard-card ${
          dashRevealed ? "revealed" : ""
        }`}>
          
          {/* Header */}
          <div className="text-center max-w-xl mx-auto mb-16">
            <span className="font-pixel text-[#d97706] text-3xs uppercase tracking-widest bg-[#181715] border border-stone-800 px-3 py-1 inline-block mb-4">
              COMBAT ARENA // HEAD-TO-HEAD BRACKETS
            </span>
            <h2 className="text-2xl sm:text-3xl font-pixel uppercase tracking-tight text-[#faf5ef]">
              The Arena Standings
            </h2>
            <p className="text-xs sm:text-sm text-stone-400 mt-4 leading-relaxed font-sans">
              Track tournament standings and live duels in real-time. Solo builders compete face-to-face, voted by real authenticated developers.
            </p>
          </div>

          {/* 8-Bit Retro Tab Selector */}
          <div className="flex justify-center space-x-4 mb-10">
            <button
              onClick={() => setActiveTab("duel")}
              className={`btn-pixel py-2 px-6 text-xs font-pixel ${
                activeTab === "duel" 
                  ? "!bg-[#d97706] !text-white shadow-pixel-sm" 
                  : "!bg-[#181715] !text-[#faf5ef] border-stone-700 hover:!bg-[#181715]/80"
              }`}
            >
              ⚔️ LIVE COMBAT STAGE
            </button>
            <button
              onClick={() => setActiveTab("leaderboard")}
              className={`btn-pixel py-2 px-6 text-xs font-pixel ${
                activeTab === "leaderboard" 
                  ? "!bg-[#d97706] !text-white shadow-pixel-sm" 
                  : "!bg-[#181715] !text-[#faf5ef] border-stone-700 hover:!bg-[#181715]/80"
              }`}
            >
              🏆 COLOSEUM LEADERBOARD
            </button>
          </div>

          {activeTab === "leaderboard" ? (
            /* ========================================================
                VIEW 3: Global Colosseum Leaderboard
               ======================================================== */
            <div className="bg-[#faf5ef]/95 backdrop-blur-md border-2 border-pixel shadow-pixel-lg p-6 sm:p-10 text-[#181715] animate-scale-in">
              <div className="flex justify-between items-center mb-6 border-b-2 border-pixel pb-3">
                <h3 className="font-pixel text-xs uppercase text-[#181715]">GLOBAL AP RANKINGS (SEASON {currentSeasonStr})</h3>
                <span className="text-3xs font-pixel text-[#d97706]">ARENA POINTS = VOTES + (WINS * 150)</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-pixel font-pixel text-4xs text-stone-500 uppercase tracking-widest bg-stone-100">
                      <th className="py-3 px-4 w-16 text-center">Rank</th>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4 hidden md:table-cell">Maker</th>
                      <th className="py-3 px-4 text-center hidden sm:table-cell">Wins</th>
                      <th className="py-3 px-4 text-center">Votes</th>
                      <th className="py-3 px-4 text-center">AP Score</th>
                      <th className="py-3 px-4 text-center">Critiques</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-250 font-mono text-2xs">
                    {getLeaderboardData().map((p, idx) => {
                      const isTop3 = idx < 3;
                      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
                      return (
                        <tr key={p.id} className={`hover:bg-stone-50 transition-all ${isTop3 ? "bg-[#fdf2e9]/20 font-semibold" : ""}`}>
                          <td className="py-3.5 px-4 text-center font-pixel text-xs text-[#d97706]">
                            {medal}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-3">
                              {renderLogo(p.logo, "w-6 h-6")}
                              <div className="min-w-0">
                                <a 
                                  href={p.url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="font-pixel text-stone-900 hover:text-[#d97706] hover:underline block uppercase truncate"
                                >
                                  {p.title}
                                </a>
                                <span className="text-stone-400 font-sans text-3xs block truncate max-w-xs">{p.tagline}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 hidden md:table-cell">
                            <div className="flex items-center space-x-2">
                              <img src={p.makerAvatar} alt="Maker" className="w-5 h-5 border border-pixel shrink-0" />
                              <a 
                                href={`https://x.com/${p.makerTwitter.replace(/^@/, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-stone-600 hover:text-[#d97706] hover:underline truncate"
                              >
                                {p.makerTwitter}
                              </a>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center text-stone-600 hidden sm:table-cell font-pixel text-3xs">
                            {p.wins || 0}W
                          </td>
                          <td className="py-3.5 px-4 text-center text-stone-600 font-pixel text-3xs">
                            {p.bracketVotes || 0}P
                          </td>
                          <td className="py-3.5 px-4 text-center font-pixel text-3xs text-[#d97706]">
                            {p.points} AP
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {(() => {
                              const isOwner = userLoggedIn && mockUserTwitter && isProductOwner(p, mockUserTwitter, userSupabaseId);
                              return isOwner ? (
                                <button
                                  onClick={() => handleExportCritiquesCsv(p)}
                                  className="inline-flex items-center space-x-1 bg-amber-50 border border-amber-300 text-[#d97706] px-2 py-0.5 text-3xs font-pixel rounded-none hover:bg-amber-100 hover:border-amber-500 transition-all cursor-pointer font-bold uppercase shadow-pixel-xs"
                                  title="Export your critiques as CSV"
                                >
                                  <span>📥 CSV</span>
                                </button>
                              ) : (
                                <span 
                                  className="text-stone-400 font-pixel text-4xs uppercase flex items-center justify-center gap-1 select-none" 
                                  title="Only the verified project owner can export critiques"
                                >
                                  🔒 PRIVATE
                                </span>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              {/* GLADIATOR DASHBOARD FOR COMPETITORS */}
              {userLoggedIn && mockUserTwitter && (() => {
                const myShips = getLeaderboardData().filter(p => isProductOwner(p, mockUserTwitter, userSupabaseId));
                const archivedShips = products
                  .filter(p => isProductOwner(p, mockUserTwitter, userSupabaseId))
                  .map(p => {
                    const activeMatch = getLeaderboardData().find(x => x.id === p.id);
                    if (activeMatch) return activeMatch;
                    return { ...p, wins: 0, bracketVotes: p.votesCount, points: p.votesCount } as any;
                  });
                
                return (
                  <div className="bg-[#181715]/90 border-2 border-[#d97706]/40 p-6 mb-8 text-[#faf5ef] shadow-pixel-md text-left">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-stone-850 pb-4 mb-4 gap-2">
                      <div>
                        <h3 className="font-pixel text-xs text-[#d97706] uppercase tracking-wider flex items-center gap-1.5">
                          <span className="animate-pulse w-2 h-2 rounded-full bg-[#d97706]"></span>
                          🛡️ COMPETITOR STANDING & CRITIQUES
                        </h3>
                        <p className="text-5xs font-pixel text-stone-500 uppercase mt-0.5 font-mono">
                          Verified Handler: {mockUserTwitter}
                        </p>
                      </div>
                      <span className="text-5xs font-mono text-stone-400 bg-stone-900 border border-stone-850 px-2 py-0.5 uppercase">
                        GLADIATOR PORTAL ACTIVE
                      </span>
                    </div>

                    {myShips.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-4xs font-pixel text-stone-400 uppercase">
                          No projects registered under your verified handle yet.
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsSubmitOpen(true)}
                          className="mt-2 text-5xs font-pixel text-[#d97706] hover:underline uppercase cursor-pointer bg-transparent border-none p-0"
                        >
                          ⚔️ Submit your project to enter the waiting list now!
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {myShips.map(ship => {
                          // Determine standing status
                          let statusLabel = "⏳ QUEUED";
                          let statusColor = "text-[#d97706] bg-[#d97706]/10 border-[#d97706]/35";
                          let statusDesc = "Waiting in queue for the next tournament to start.";
                          
                          if (bracket) {
                            const standing = getProductBracketStatus(ship.id);
                            if (standing.status === "FIGHTING") {
                              statusLabel = `⚔️ FIGHTING (R${standing.round})`;
                              statusColor = "text-amber-500 bg-amber-500/10 border-amber-500/35";
                              statusDesc = `Actively competing in Round ${standing.round} of the tournament.`;
                            } else if (standing.status === "ADVANCED") {
                              statusLabel = `🛡️ ADVANCED (R${standing.round})`;
                              statusColor = "text-emerald-500 bg-emerald-500/10 border-emerald-500/35";
                              statusDesc = `Successfully advanced through Round ${standing.round}!`;
                            } else if (standing.status === "ELIMINATED") {
                              statusLabel = `💀 ELIMINATED (R${standing.round})`;
                              statusColor = "text-red-500 bg-red-500/10 border-red-500/35 animate-pulse";
                              statusDesc = `Eliminated in Round ${standing.round}. Time to analyze peer advice!`;
                            } else if (standing.status === "CHAMPION") {
                              statusLabel = "🏆 ARENA CHAMPION";
                              statusColor = "text-yellow-400 bg-yellow-400/10 border-yellow-400/35 animate-bounce";
                              statusDesc = "The ultimate victor of the tournament! Hail the champion!";
                            }
                          }

                          return (
                            <div key={ship.id} className="p-4 bg-[#11100f] border border-stone-850 flex flex-col justify-between shadow-pixel-xs">
                              <div>
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center space-x-2">
                                    {renderLogo(ship.logo, "w-6 h-6")}
                                    <div>
                                      <h4 className="font-pixel text-2xs uppercase text-[#faf5ef]">{ship.title}</h4>
                                      <span className={`inline-block text-5xs font-pixel px-1.5 py-0.5 border uppercase ${statusColor} mt-1`}>
                                        {statusLabel}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <p className="text-4xs text-stone-400 leading-relaxed font-sans mb-3 line-clamp-1">
                                  {ship.tagline}
                                </p>
                                <p className="text-5xs font-mono text-stone-500 leading-relaxed italic mb-4">
                                  💡 {statusDesc}
                                </p>
                              </div>

                              <div className="border-t border-stone-900 pt-3 flex flex-wrap gap-2 justify-between items-center">
                                <div className="text-5xs font-pixel text-stone-500 uppercase">
                                  Votes: <span className="text-[#faf5ef] font-mono">{ship.bracketVotes || 0}</span> | Wins: <span className="text-[#faf5ef] font-mono font-bold">{ship.wins || 0}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleExportCritiquesCsv(ship)}
                                  className="inline-flex items-center space-x-1.5 bg-[#d97706] border border-[#d97706] text-white px-3 py-1 text-4xs font-pixel rounded-none hover:bg-[#c25e00] hover:border-[#c25e00] transition-all cursor-pointer font-bold uppercase shadow-pixel-xs"
                                  title="Export critiques as CSV"
                                >
                                  <span>📥 EXPORT MY ARENA CRITIQUES (CSV)</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Permanent Historical Archive Section */}
                    <div className="border-t border-dashed border-stone-850 mt-6 pt-6 text-left">
                      <h4 className="font-pixel text-4xs text-[#d97706] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        📜 HISTORICAL ARCHIVES & CRITIQUE VAULT
                      </h4>
                      <p className="text-5xs font-sans text-stone-400 mb-4 leading-relaxed">
                        Even after tournament slates are reset or 7-day rounds expire, your historical peer critiques are securely archived. Access and export your dual critiques at any time in the future.
                      </p>
                      {archivedShips.length === 0 ? (
                        <p className="text-5xs font-mono text-stone-500 italic uppercase">
                          No archived projects found in the colosseum records.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {archivedShips.map(ship => (
                            <div key={`archived_${ship.id}`} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#11100f] border border-[#d97706]/10 p-3 shadow-pixel-xs gap-3">
                              <div className="flex items-center space-x-3">
                                {renderLogo(ship.logo, "w-5 h-5")}
                                <div>
                                  <span className="font-pixel text-3xs uppercase block text-[#faf5ef]">{ship.title}</span>
                                  <span className="text-5xs font-mono text-stone-500 uppercase">
                                    Submitted: {new Date(ship.submittedAt).toLocaleDateString()} | Total AP Score: {ship.points || 0}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleExportCritiquesCsv(ship)}
                                className="inline-flex items-center space-x-1.5 bg-stone-900 border border-stone-800 text-stone-300 px-3 py-1 text-5xs font-pixel rounded-none hover:bg-stone-800 hover:text-white transition-all cursor-pointer font-bold uppercase shadow-pixel-xs self-end sm:self-auto"
                                title="Export archived critiques as CSV"
                              >
                                <span>📥 DOWNLOAD CSV ARCHIVE</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                );
              })()}

              {!bracket ? (
                /* ========================================================
                    WAITLIST QUEUE PREPARING SCREEN
                   ======================================================== */
                <>
                  <div className="bg-[#faf5ef]/95 backdrop-blur-md border-2 border-pixel shadow-pixel-lg p-8 sm:p-12 mb-12 text-[#181715]">
                  <div className="text-center max-w-xl mx-auto mb-12">
                    <div className="inline-block relative w-36 h-36 mb-6">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle 
                          cx="72" 
                          cy="72" 
                          r="62" 
                          stroke="#d97706" 
                          strokeWidth="10" 
                          fill="transparent" 
                          strokeDasharray={390}
                          strokeDashoffset={390 - (390 * Math.min(waitingProducts.length, 16)) / 16}
                          className="transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col justify-center items-center">
                        <span className="text-2xl font-pixel text-[#181715]">{waitingProducts.length} / 16</span>
                        <span className="text-3xs font-pixel text-stone-400 uppercase tracking-widest mt-1">Ready</span>
                      </div>
                    </div>

                    <h2 className="text-lg sm:text-xl font-pixel uppercase mb-3 text-[#181715]">Bracket No. 01 Preparing</h2>
                    <p className="text-xs sm:text-sm text-stone-500 mb-8 max-w-md mx-auto leading-relaxed">
                      Once 16 products are queued up, the double-elimination tournament generates automatically. Real developers link their Google or GitHub identities to cast double-critique votes and determine the champion!
                    </p>

                    <button 
                      onClick={() => setIsSubmitOpen(true)}
                      className="btn-pixel btn-pixel-primary px-8 py-3.5 text-xs tracking-wider"
                    >
                      Submit Project For Free (⚔️)
                    </button>
                  </div>

                  {/* Product Gallery Waitlist */}
                  <div>
                    <div className="flex justify-between items-center mb-6 border-b-2 border-pixel pb-3">
                      <h3 className="font-pixel text-xs uppercase text-stone-500">Waiting Room List ({waitingProducts.length})</h3>
                      <span className="text-3xs font-pixel text-stone-450">Queue Index</span>
                    </div>

                    {waitingProducts.length === 0 ? (
                      <div className="text-center py-10 font-mono text-stone-500 text-xs">
                        [ No submissions in queue yet. Be the first to submit your product and claim your spot! ]
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {waitingProducts.map((p) => (
                          <div key={p.id} className="p-5 border-2 border-pixel bg-[#faf5ef]/90 hover:bg-[#faf5ef] backdrop-blur-xs transition-all duration-200 flex flex-col justify-between shadow-pixel-sm">
                            <div>
                              <div className="flex justify-between items-start mb-3">
                                {renderLogo(p.logo, "w-8 h-8")}
                              </div>
                              <a 
                                href={p.url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="font-pixel text-xs text-[#181715] hover:text-[#d97706] hover:underline mb-2 uppercase block"
                              >
                                {p.title}
                              </a>
                              <p className="text-xs text-stone-500 leading-relaxed mb-4 line-clamp-2">{p.tagline}</p>
                            </div>

                            <a 
                              href={p.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="mb-4 bg-[#faf5ef] border border-pixel p-2 text-3xs font-mono text-stone-700 hover:bg-[#fdf2e9] hover:border-[#d97706] transition-all flex items-center justify-between shadow-pixel-xs uppercase font-semibold"
                            >
                              <span>🌐 LIVE DEMO URL</span>
                              <span className="text-4xs text-[#d97706] underline font-pixel">view demo ➔</span>
                            </a>

                            <div className="flex justify-between items-center border-t border-dashed border-stone-300 pt-3">
                              <div className="flex items-center space-x-2">
                                <img src={p.makerAvatar} alt={p.makerName} className="w-5 h-5 border border-pixel" />
                                <a 
                                  href={`https://x.com/${p.makerTwitter.replace(/^@/, "")}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-3xs text-stone-500 font-mono font-semibold hover:text-[#d97706] hover:underline"
                                >
                                  {p.makerTwitter}
                                </a>
                              </div>
                              <span className="text-3xs text-stone-400 font-mono">
                                {new Date(p.submittedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
              ) : (
                /* ========================================================
                    VIEW 2: Tournament Live & Completed Stage (RECONSTRUCTED)
                   ======================================================== */
                <div className="space-y-10">
                  
                  {bracket.status === "preparing" ? (
                    /* ========================================================
                        A. NEW YORK TIME MIDNIGHT opening countdown
                       ======================================================== */
                    <>
                      <div className="bg-[#faf5ef]/95 backdrop-blur-md border-4 border-pixel shadow-pixel-lg p-8 sm:p-12 mb-12 text-[#181715] text-center max-w-2xl mx-auto">
                        <div className="w-16 h-16 bg-amber-100 border-2 border-pixel rounded-none mx-auto flex items-center justify-center text-3xl mb-4 animate-pixel-bounce" style={{ borderColor: '#d97706' }}>
                          ⏳
                        </div>
                        <h2 className="text-md sm:text-lg font-pixel uppercase mb-3 text-[#181715]">COMPETITORS ASSEMBLED</h2>
                        <p className="text-xs text-stone-500 mb-6 leading-relaxed">
                          The 16-competitor roster is fully assembled and locked! The double-elimination tournament is preparing to start automatically at the upcoming New York Time Midnight (0:00 EST/EDT).
                        </p>
                        <div className="p-4 bg-stone-900 border-2 border-[#d97706] text-[#faf5ef] font-mono text-xl sm:text-2xl font-black rounded-none shadow-pixel-sm tracking-wider inline-block">
                          ⏱️ STARTING IN: {formatToHMS(countdownToMidnightMs)}
                        </div>
                        <div className="text-5xs font-pixel text-stone-400 mt-4 uppercase">
                          New York Midnight Timezone Calibration Active (EST/EDT)
                        </div>
                      </div>

                      {/* Waiting Room Gallery (LOCKED) */}
                      <div>
                        <div className="flex justify-between items-center mb-6 border-b-2 border-pixel pb-3">
                          <h3 className="font-pixel text-xs uppercase text-stone-500">Waitlist Roster (LOCKED)</h3>
                          <span className="text-4xs text-[#d97706] font-pixel">READY FOR ACTION</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                          {products.slice(0, 16).map((p) => (
                            <div key={p.id} className="p-5 border-2 border-pixel bg-[#faf5ef]/90 backdrop-blur-xs flex flex-col justify-between shadow-pixel-sm opacity-90">
                              <div>
                                <div className="flex justify-between items-start mb-3">
                                  {renderLogo(p.logo, "w-8 h-8")}
                                </div>
                                <a 
                                  href={p.url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="font-pixel text-xs text-[#181715] hover:text-[#d97706] hover:underline mb-2 uppercase block"
                                >
                                  {p.title}
                                </a>
                                <p className="text-xs text-stone-500 leading-relaxed mb-4 line-clamp-2">{p.tagline}</p>
                              </div>

                              <a 
                                href={p.url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="mb-4 bg-[#faf5ef] border border-pixel p-2 text-3xs font-mono text-stone-700 hover:bg-[#fdf2e9] hover:border-[#d97706] transition-all flex items-center justify-between shadow-pixel-xs uppercase font-semibold"
                              >
                                <span>🌐 LIVE DEMO URL</span>
                                <span className="text-4xs text-[#d97706] underline font-pixel">view demo ➔</span>
                              </a>

                              <div className="flex justify-between items-center border-t border-dashed border-stone-300 pt-3">
                                <div className="flex items-center space-x-2">
                                  <img src={p.makerAvatar} alt={p.makerName} className="w-5 h-5 border border-pixel" />
                                  <a 
                                    href={`https://x.com/${p.makerTwitter.replace(/^@/, "")}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-3xs text-stone-500 font-mono font-semibold hover:text-[#d97706] hover:underline"
                                  >
                                    {p.makerTwitter}
                                  </a>
                                </div>
                                <span className="text-3xs text-stone-400 font-mono">
                                  {new Date(p.submittedAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    /* ========================================================
                        B. COMBAT ACTIVE STAGE
                       ======================================================== */
                    <>
                      {/* High-fidelity 3-2-1-1 active schedule timeline pipeline */}
                      <div className="flex flex-col md:flex-row justify-between items-center bg-[#181715] border border-pixel p-3 mb-6 font-pixel text-4xs text-[#faf5ef] shadow-pixel-sm">
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className={`px-2 py-0.5 border ${activeRoundNum === 1 ? "bg-[#d97706] text-white border-pixel" : "border-stone-850 text-stone-500"}`}>
                            R1: 16-TEAMS (3 DAYS)
                          </span>
                          <span className="text-stone-700">➔</span>
                          <span className={`px-2 py-0.5 border ${activeRoundNum === 2 ? "bg-[#d97706] text-white border-pixel" : "border-stone-850 text-stone-500"}`}>
                            R2: QUARTERS (2 DAYS)
                          </span>
                          <span className="text-stone-700">➔</span>
                          <span className={`px-2 py-0.5 border ${activeRoundNum === 3 ? "bg-[#d97706] text-white border-pixel" : "border-stone-850 text-stone-500"}`}>
                            R3: SEMIS (1 DAY)
                          </span>
                          <span className="text-stone-700">➔</span>
                          <span className={`px-2 py-0.5 border ${activeRoundNum === 4 ? "bg-[#d97706] text-white border-pixel" : "border-stone-850 text-stone-500"}`}>
                            R4: FINALS (1 DAY)
                          </span>
                        </div>
                        <div className="mt-3 md:mt-0 bg-[#dc2626]/10 border border-[#dc2626]/40 text-[#dc2626] font-mono px-3 py-1 font-bold animate-pulse">
                          ⏱️ ROUND {activeRoundNum} REMAINING: {formatDuration(activeRoundRemainingMs)}
                        </div>
                      </div>

                      {/* Top Status Alert Bar */}
                      <div className="bg-[#faf5ef]/95 backdrop-blur-md border-2 border-pixel shadow-pixel-lg p-4 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0 text-[#181715]">
                        <div className="flex items-center space-x-3">
                          <span className="w-3 h-3 bg-red-600 inline-block border border-pixel animate-pulse"></span>
                          <span className="font-pixel uppercase text-xs text-[#181715]">
                            {bracket.status === "completed" 
                              ? "✨ Tournament Finished — Champion Declared!" 
                              : `Active Duel Matchups — Round ${activeRoundNum} [${
                                  activeRoundNum === 1 ? "Round of 16" : 
                                  activeRoundNum === 2 ? "Quarterfinals" : 
                                  activeRoundNum === 3 ? "Semifinals" : "Grand Finals"
                                }]`}
                          </span>
                        </div>

                      </div>

                  {/* ACTIVE 1V1 DUEL MATCHUP STAGE CARD */}
                  {activeMatch ? (
                    <div className="bg-[#faf5ef]/95 backdrop-blur-md border-4 border-pixel shadow-pixel-lg p-6 sm:p-10 text-[#181715]">
                      <div className="flex justify-between items-center mb-8 border-b-2 border-pixel pb-3">
                        <span className="font-pixel text-xs text-[#181715]">⚔️ LIVE ARENA STAGE FEATURING MATCH {activeMatch.id}</span>
                        <span className="font-pixel text-3xs text-[#d97706]">ROUND {activeMatch.roundNumber}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-center">
                        
                        {/* PRODUCT A (Left Fighter) */}
                        <div className="md:col-span-2 p-5 border-2 border-pixel bg-stone-50 flex flex-col justify-between min-h-[220px]">
                          <div>
                            <div className="flex justify-between items-start mb-3">
                              {renderLogo(activeMatch.productA.logo, "w-10 h-10")}
                            </div>
                            <a 
                              href={activeMatch.productA.url} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="font-pixel text-sm text-stone-900 hover:text-[#d97706] hover:underline block uppercase mb-1"
                            >
                              {activeMatch.productA.title}
                            </a>
                            <p className="text-3xs text-stone-500 font-sans leading-relaxed mb-4">{activeMatch.productA.tagline}</p>
                          </div>

                          <div className="flex flex-col space-y-3">
                            <a 
                              href={activeMatch.productA.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="bg-[#faf5ef] border border-pixel p-1.5 text-4xs font-mono text-stone-700 hover:bg-[#fdf2e9] hover:border-[#d97706] transition-all flex items-center justify-between uppercase font-semibold"
                            >
                              <span>🌐 LIVE DEMO URL</span>
                              <span className="text-5xs text-[#d97706] underline font-pixel">view demo ➔</span>
                            </a>

                            <div className="flex justify-between items-center border-t border-dashed border-stone-300 pt-3">
                              <div className="flex items-center space-x-2">
                                <img src={activeMatch.productA.makerAvatar} alt="Maker" className="w-5 h-5 border border-pixel shrink-0" />
                                <a 
                                  href={`https://x.com/${activeMatch.productA.makerTwitter.replace(/^@/, "")}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-4xs text-stone-500 font-mono font-semibold hover:text-[#d97706] hover:underline"
                                >
                                  {activeMatch.productA.makerTwitter}
                                </a>
                              </div>
                              <span className="text-4xs font-pixel text-stone-400">MAKER</span>
                            </div>
                          </div>

                          {/* Vote Trigger Button */}
                          {bracket.status === "active" && !activeMatch.winnerId && (
                            <button
                              onClick={() => {
                                setVotingMatch(activeMatch);
                                setVotingTarget(activeMatch.productA);
                              }}
                              className="btn-pixel btn-pixel-primary py-2 w-full text-3xs font-pixel bg-[#d97706] hover:bg-[#c25e00] text-white border border-pixel mt-4"
                            >
                              VOTE FOR {activeMatch.productA.title} (🗡️)
                            </button>
                          )}
                        </div>

                        {/* VS MIDDLE BAR (Tug of war & Sword clash emoji) */}
                        <div className="md:col-span-1 flex flex-col items-center justify-center space-y-4">
                          <span className={`text-3xl filter drop-shadow-md select-none ${isSwordsClashing ? "animate-pixel-bounce scale-125" : ""}`}>
                            ⚔️
                          </span>
                          
                          {/* Tug of war health bar */}
                          <div className="w-full bg-stone-250 border border-pixel h-4 rounded-none overflow-hidden flex relative shadow-pixel-xs">
                            <div 
                              className="bg-red-650 h-full transition-all duration-300"
                              style={{ width: `${getPercentages(activeMatch).pctA}%` }}
                            />
                            <div 
                              className="bg-blue-650 h-full transition-all duration-300 flex-1"
                            />
                          </div>

                          {/* Score labels */}
                          <div className="flex justify-between w-full font-pixel text-4xs text-stone-500">
                            <span>{getPercentages(activeMatch).pctA}% ({activeMatch.votesA}P)</span>
                            <span>{getPercentages(activeMatch).pctB}% ({activeMatch.votesB}P)</span>
                          </div>

                          {activeMatch.winnerId && (
                            <div className="bg-emerald-50 border border-emerald-300 text-emerald-700 px-3 py-1 text-4xs font-pixel uppercase shadow-pixel-xs mt-2">
                              🛡️ WINNER: {
                                activeMatch.winnerId === activeMatch.productA.id 
                                  ? activeMatch.productA.title 
                                  : activeMatch.productB.title
                              }
                            </div>
                          )}
                        </div>

                        {/* PRODUCT B (Right Fighter) */}
                        <div className="md:col-span-2 p-5 border-2 border-pixel bg-stone-50 flex flex-col justify-between min-h-[220px]">
                          <div>
                            <div className="flex justify-between items-start mb-3">
                              {renderLogo(activeMatch.productB.logo, "w-10 h-10")}
                            </div>
                            <a 
                              href={activeMatch.productB.url} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="font-pixel text-sm text-stone-900 hover:text-[#d97706] hover:underline block uppercase mb-1"
                            >
                              {activeMatch.productB.title}
                            </a>
                            <p className="text-3xs text-stone-500 font-sans leading-relaxed mb-4">{activeMatch.productB.tagline}</p>
                          </div>

                          <div className="flex flex-col space-y-3">
                            <a 
                              href={activeMatch.productB.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="bg-[#faf5ef] border border-pixel p-1.5 text-4xs font-mono text-stone-700 hover:bg-[#fdf2e9] hover:border-[#d97706] transition-all flex items-center justify-between uppercase font-semibold"
                            >
                              <span>🌐 LIVE DEMO URL</span>
                              <span className="text-5xs text-[#d97706] underline font-pixel">view demo ➔</span>
                            </a>

                            <div className="flex justify-between items-center border-t border-dashed border-stone-300 pt-3">
                              <div className="flex items-center space-x-2">
                                <img src={activeMatch.productB.makerAvatar} alt="Maker" className="w-5 h-5 border border-pixel shrink-0" />
                                <a 
                                  href={`https://x.com/${activeMatch.productB.makerTwitter.replace(/^@/, "")}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-4xs text-stone-500 font-mono font-semibold hover:text-[#d97706] hover:underline"
                                >
                                  {activeMatch.productB.makerTwitter}
                                </a>
                              </div>
                              <span className="text-4xs font-pixel text-stone-400">MAKER</span>
                            </div>
                          </div>

                          {/* Vote Trigger Button */}
                          {bracket.status === "active" && !activeMatch.winnerId && (
                            <button
                              onClick={() => {
                                setVotingMatch(activeMatch);
                                setVotingTarget(activeMatch.productB);
                              }}
                              className="btn-pixel btn-pixel-primary py-2 w-full text-3xs font-pixel bg-stone-900 hover:bg-stone-850 text-white border border-pixel mt-4"
                            >
                              VOTE FOR {activeMatch.productB.title} (🗡️)
                            </button>
                          )}
                        </div>

                      </div>
                    </div>
                  ) : bracket.status === "completed" && bracket.winner ? (
                    /* GORGEOUS CHAMPION CARD */
                    <div className="bg-[#faf5ef]/95 backdrop-blur-md border-4 border-pixel shadow-pixel-lg p-8 sm:p-12 text-[#181715] text-center max-w-3xl mx-auto relative overflow-hidden" style={{ borderColor: '#d97706' }}>
                      
                      {/* Golden decorative elements */}
                      <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-amber-300 via-[#d97706] to-amber-300" />
                      <div className="absolute -top-10 -right-10 w-24 h-24 bg-amber-50 rotate-45 border border-dashed border-amber-300 pointer-events-none" />
                      <div className="absolute -top-10 -left-10 w-24 h-24 bg-amber-50 -rotate-45 border border-dashed border-amber-300 pointer-events-none" />

                      {/* Header Badge */}
                      <div className="inline-flex items-center space-x-2 bg-amber-50 border border-amber-300 text-[#d97706] font-pixel text-3xs px-4 py-1.5 uppercase mb-6 shadow-pixel-xs animate-pixel-bounce">
                        <span>🏆</span> <span>SEASON {currentSeasonStr} COLOSEUM CHAMPION</span> <span>🏆</span>
                      </div>

                      {/* Winner Info */}
                      <h2 className="text-4xl sm:text-5xl font-sans font-black tracking-tighter leading-none text-[#181715] uppercase mb-4 flex items-center justify-center flex-wrap gap-2">
                        {renderLogo(bracket.winner.logo, "w-12 h-12")}
                        <span>{bracket.winner.title}</span>
                        {renderLogo(bracket.winner.logo, "w-12 h-12")}
                      </h2>
                      <p className="text-stone-500 font-sans text-xs max-w-lg mx-auto mb-8 font-semibold">
                        {bracket.winner.tagline}
                      </p>

                      {/* Maker Spotlight Card */}
                      <div className="max-w-md mx-auto p-5 border-2 border-pixel bg-stone-50 shadow-pixel-sm mb-8">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 text-left">
                            <img src={bracket.winner.makerAvatar} alt="Maker" className="w-12 h-12 border border-pixel" />
                            <div>
                              <span className="text-4xs font-pixel text-stone-400 block">ARENA CONQUEROR</span>
                              <span className="text-sm font-sans font-extrabold text-stone-850 block">{bracket.winner.makerName}</span>
                            </div>
                          </div>
                          
                          <a 
                            href={`https://x.com/${bracket.winner.makerTwitter.replace(/^@/, "")}`}
                            target="_blank" 
                            rel="noreferrer"
                            className="btn-pixel !py-1.5 !px-3 text-4xs bg-stone-900 text-white font-pixel hover:!bg-[#d97706]"
                          >
                            FOLLOW {bracket.winner.makerTwitter} ➔
                          </a>
                        </div>
                      </div>

                      {/* Runner-up Recognition */}
                      {(() => {
                        const r4Match = bracket.round4[0];
                        const runnerUp = r4Match 
                          ? (r4Match.winnerId === r4Match.productA.id ? r4Match.productB : r4Match.productA) 
                          : null;
                        if (!runnerUp) return null;
                        return (
                          <div className="text-3xs font-mono text-stone-500 uppercase mb-8">
                            🥈 HONORABLE RUNNER-UP: <span className="font-pixel text-[#181715] inline-flex items-center">{renderLogo(runnerUp.logo, "w-4 h-4 mr-1")} {runnerUp.title}</span> BY <span className="text-stone-700 font-semibold">{runnerUp.makerTwitter}</span>
                          </div>
                        );
                      })()}

                      {/* CTAs */}
                      <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                        <a 
                          href={bracket.winner.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-pixel btn-pixel-primary py-3.5 px-8 text-xs tracking-wider shadow-pixel-md hover:-translate-y-0.5 active:translate-y-0 transition-all font-pixel bg-[#d97706] hover:bg-[#c25e00] text-white border-2 border-[#181715]"
                        >
                          🌐 EXPLORE CHAMPION DEMO URL ➔
                        </a>
                        
                        <button 
                          onClick={handleReset}
                          className="btn-pixel py-3.5 px-8 text-xs tracking-wider font-pixel bg-stone-900 hover:bg-stone-800 text-white border-2 border-pixel shadow-pixel-md hover:-translate-y-0.5 active:translate-y-0 transition-all"
                        >
                          🔄 START NEW TOURNAMENT (RESET SLATE)
                        </button>
                      </div>

                    </div>
                  ) : null}

                  {/* VISUAL BRACKET TREE DISPLAY */}
                  <div className="bg-[#faf5ef]/95 backdrop-blur-md border-2 border-pixel shadow-pixel-lg p-6 sm:p-10 text-[#181715]">
                    <div className="flex justify-between items-center mb-6 border-b-2 border-pixel pb-3">
                      <h3 className="font-pixel text-xs uppercase text-stone-500">🏆 COMPLETE TOURNAMENT BRACKET</h3>
                      <span className="text-4xs font-pixel text-stone-400">CLICK ANY UNRESOLVED DUEL MATCHUP TO VOTE</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                      
                      {/* ROUND 1: ROUND OF 16 */}
                      <div className="space-y-4">
                        <div className="bg-stone-100 border border-pixel p-1.5 text-center text-4xs font-pixel text-stone-600 uppercase">
                          Round of 16 (R1)
                        </div>
                        {bracket.round1.map(m => (
                          <div 
                            key={m.id} 
                            onClick={() => setActiveMatch(m)}
                            className={`p-3 border-2 border-pixel text-4xs font-mono cursor-pointer transition-all hover:bg-stone-100 ${
                              activeMatch?.id === m.id ? "bg-[#fdf2e9] border-[#d97706]" : "bg-white"
                            }`}
                          >
                            <div className="flex justify-between font-semibold">
                              <span className={`inline-flex items-center ${m.winnerId === m.productA.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}`}>
                                {renderLogo(m.productA.logo, "w-4 h-4 mr-1")} {m.productA.title}
                              </span>
                              <span>{m.votesA}</span>
                            </div>
                            <div className="text-center font-pixel text-5xs text-stone-400 my-1">vs</div>
                            <div className="flex justify-between font-semibold">
                              <span className={`inline-flex items-center ${m.winnerId === m.productB.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}`}>
                                {renderLogo(m.productB.logo, "w-4 h-4 mr-1")} {m.productB.title}
                              </span>
                              <span>{m.votesB}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* ROUND 2: QUARTERFINALS */}
                      <div className="space-y-4">
                        <div className="bg-stone-100 border border-pixel p-1.5 text-center text-4xs font-pixel text-stone-600 uppercase">
                          Quarterfinals (R2)
                        </div>
                        {bracket.round2.length === 0 ? (
                          <div className="text-center py-20 text-stone-400 font-pixel text-5xs">[ WAITING FOR R1 ]</div>
                        ) : (
                          bracket.round2.map(m => (
                            <div 
                              key={m.id} 
                              onClick={() => setActiveMatch(m)}
                              className={`p-3 border-2 border-pixel text-4xs font-mono cursor-pointer transition-all hover:bg-stone-100 ${
                                activeMatch?.id === m.id ? "bg-[#fdf2e9] border-[#d97706]" : "bg-white"
                              }`}
                            >
                              <div className="flex justify-between font-semibold">
                                <span className={`inline-flex items-center ${m.winnerId === m.productA.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}`}>
                                  {renderLogo(m.productA.logo, "w-4 h-4 mr-1")} {m.productA.title}
                                </span>
                                <span>{m.votesA}</span>
                              </div>
                              <div className="text-center font-pixel text-5xs text-stone-400 my-1">vs</div>
                              <div className="flex justify-between font-semibold">
                                <span className={`inline-flex items-center ${m.winnerId === m.productB.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}`}>
                                  {renderLogo(m.productB.logo, "w-4 h-4 mr-1")} {m.productB.title}
                                </span>
                                <span>{m.votesB}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* ROUND 3: SEMIFINALS */}
                      <div className="space-y-4">
                        <div className="bg-stone-100 border border-pixel p-1.5 text-center text-4xs font-pixel text-stone-600 uppercase">
                          Semifinals (R3)
                        </div>
                        {bracket.round3.length === 0 ? (
                          <div className="text-center py-20 text-stone-400 font-pixel text-5xs">[ WAITING FOR R2 ]</div>
                        ) : (
                          bracket.round3.map(m => (
                            <div 
                              key={m.id} 
                              onClick={() => setActiveMatch(m)}
                              className={`p-3 border-2 border-pixel text-4xs font-mono cursor-pointer transition-all hover:bg-stone-100 ${
                                activeMatch?.id === m.id ? "bg-[#fdf2e9] border-[#d97706]" : "bg-white"
                              }`}
                            >
                              <div className="flex justify-between font-semibold">
                                <span className={`inline-flex items-center ${m.winnerId === m.productA.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}`}>
                                  {renderLogo(m.productA.logo, "w-4 h-4 mr-1")} {m.productA.title}
                                </span>
                                <span>{m.votesA}</span>
                              </div>
                              <div className="text-center font-pixel text-5xs text-stone-400 my-1">vs</div>
                              <div className="flex justify-between font-semibold">
                                <span className={`inline-flex items-center ${m.winnerId === m.productB.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}`}>
                                  {renderLogo(m.productB.logo, "w-4 h-4 mr-1")} {m.productB.title}
                                </span>
                                <span>{m.votesB}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* ROUND 4: GRAND FINALS */}
                      <div className="space-y-4">
                        <div className="bg-stone-100 border border-pixel p-1.5 text-center text-4xs font-pixel text-stone-600 uppercase">
                          Grand Finals (R4)
                        </div>
                        {bracket.round4.length === 0 ? (
                          <div className="text-center py-20 text-stone-400 font-pixel text-5xs">[ WAITING FOR R3 ]</div>
                        ) : (
                          bracket.round4.map(m => (
                            <div 
                              key={m.id} 
                              onClick={() => setActiveMatch(m)}
                              className={`p-3 border-2 border-pixel text-4xs font-mono cursor-pointer transition-all hover:bg-stone-100 ${
                                activeMatch?.id === m.id ? "bg-[#fdf2e9] border-[#d97706]" : "bg-white"
                              }`}
                            >
                              <div className="flex justify-between font-semibold">
                                <span className={`inline-flex items-center ${m.winnerId === m.productA.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}`}>
                                  {renderLogo(m.productA.logo, "w-4 h-4 mr-1")} {m.productA.title}
                                </span>
                                <span>{m.votesA}</span>
                              </div>
                              <div className="text-center font-pixel text-5xs text-stone-400 my-1">vs</div>
                              <div className="flex justify-between font-semibold">
                                <span className={`inline-flex items-center ${m.winnerId === m.productB.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}`}>
                                  {renderLogo(m.productB.logo, "w-4 h-4 mr-1")} {m.productB.title}
                                </span>
                                <span>{m.votesB}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                    </div>
                  </div>
                </>)}
                </div>
              )}
            </>
          )}

        </div>
      </section>



      {/* Premium Footer with Creator Credit and Policy Links */}
      <footer className="w-full bg-[#0c0c0b] border-t border-stone-900 py-10 px-6 max-w-7xl mx-auto z-10 relative select-none text-center">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-3xs font-mono text-stone-500 uppercase tracking-widest">
            © {new Date().getFullYear()} THE ARENA. All Rights Reserved.
          </div>
          <div className="flex items-center space-x-2 text-3xs font-pixel uppercase">
            <span className="text-stone-400">Created by</span>
            <a 
              href="https://x.com/MaberFate" 
              target="_blank" 
              rel="noreferrer"
              className="text-[#d97706] hover:underline font-bold"
            >
              @MaberFate
            </a>
          </div>
          <div className="flex space-x-6 text-3xs font-mono uppercase">
            <button 
              onClick={() => setIsPrivacyOpen(true)}
              className="text-stone-500 hover:text-stone-300 transition-all cursor-pointer hover:underline bg-transparent border-none p-0"
            >
              Privacy Policy
            </button>
            <button 
              onClick={() => setIsTermsOpen(true)}
              className="text-stone-500 hover:text-stone-300 transition-all cursor-pointer hover:underline bg-transparent border-none p-0"
            >
              Terms of Use
            </button>
          </div>
        </div>
      </footer>

      </div>

      {/* ========================================================
          Tactile Slide-over Drawer for new submissions
         ======================================================== */}
      {isSubmitOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-fade-in">
          <div 
            className="fixed inset-0" 
            onClick={() => setIsSubmitOpen(false)}
          />
          <div className="relative w-full max-w-md h-full bg-[#131312]/95 backdrop-blur-md border-l border-stone-850 shadow-2xl p-6 sm:p-10 flex flex-col justify-between overflow-y-auto animate-slide-in text-[#faf5ef]">
            <div>
              <div className="flex justify-between items-center mb-8 border-b border-stone-850 pb-4">
                <h2 className="text-base sm:text-lg font-pixel uppercase text-[#faf5ef]">SUBMIT_PROJECT</h2>
                <button 
                  onClick={() => setIsSubmitOpen(false)}
                  className="text-stone-400 hover:text-stone-200 text-xl font-bold font-mono transition-all cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Functional Dual Google & GitHub Auth Card inside Submit Drawer */}
              <div className="p-4 bg-[#1c1a18] border border-stone-850 flex flex-col gap-3 shadow-pixel-sm mb-6 rounded-lg text-left">
                <div className="flex items-center space-x-3">
                  <span className="w-8 h-8 bg-stone-900 border border-stone-800 flex items-center justify-center text-sm font-pixel rounded-md">
                    {userAuthType === "github" ? "🐙" : "🔑"}
                  </span>
                  <div>
                    <span className="text-3xs font-pixel block text-stone-400">IDENTITY VERIFICATION</span>
                    {userLoggedIn ? (
                      <span className="text-3xs font-pixel text-[#d97706]">
                        {mockUserTwitter} <span className="text-stone-400 font-mono">({userAuthType === "github" ? "GitHub" : "Google"})</span>
                      </span>
                    ) : (
                      <span className="text-3xs text-red-500 font-pixel uppercase font-bold">Unverified</span>
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
                      className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-white text-stone-900 border border-stone-300 hover:bg-stone-100 text-3xs font-pixel uppercase font-bold rounded-md transition-all cursor-pointer shadow-pixel-xs animate-pixel-bounce"
                    >
                      Link Google
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTempAuthType("github");
                        setIsAuthOpen(true);
                      }}
                      className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-stone-950 text-white border border-stone-850 hover:bg-stone-900 text-3xs font-pixel uppercase font-bold rounded-md transition-all cursor-pointer shadow-pixel-xs animate-pixel-bounce"
                    >
                      Link GitHub
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-stone-400 hover:text-stone-200 text-3xs underline font-pixel font-bold transition-all cursor-pointer self-start"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmitProduct} className="space-y-6">
                <div>
                  <label className="block text-3xs font-pixel text-stone-400 mb-1.5 uppercase">
                    Product Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SiteShot 📸"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-850 rounded-lg bg-stone-900 text-[#faf5ef] text-sm focus:outline-none focus:border-amber-600 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-3xs font-pixel text-stone-400 mb-1.5 uppercase">
                    One-Sentence Tagline *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. High-def screenshot API with full-page scrolling..."
                    value={newTagline}
                    onChange={(e) => setNewTagline(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-850 rounded-lg bg-stone-900 text-[#faf5ef] text-sm focus:outline-none focus:border-amber-600 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-3xs font-pixel text-stone-400 mb-1.5 uppercase">
                    Demo URL *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="https://siteshot.net"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-850 rounded-lg bg-stone-900 text-[#faf5ef] text-sm focus:outline-none focus:border-amber-600 transition-all"
                  />
                </div>



                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-3xs font-pixel text-stone-400 mb-1.5 uppercase">
                      Maker Name
                    </label>
                    <input
                      type="text"
                      placeholder="Sarah"
                      value={newMaker}
                      onChange={(e) => setNewMaker(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-850 rounded-lg bg-stone-900 text-[#faf5ef] text-sm focus:outline-none focus:border-amber-600 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-3xs font-pixel text-stone-400 mb-1.5 uppercase">
                      Twitter (X)
                    </label>
                    <input
                      type="text"
                      placeholder="@sarah_dev"
                      value={newTwitter}
                      onChange={(e) => setNewTwitter(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-850 rounded-lg bg-stone-900 text-[#faf5ef] text-sm focus:outline-none focus:border-amber-600 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-3xs font-pixel text-stone-400 mb-1.5 uppercase">
                    Product Logo * (Max 2MB)
                  </label>
                  <div className="flex items-center space-x-4">
                    <label 
                      htmlFor="logo-upload" 
                      className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed border-stone-850 hover:border-[#d97706]/85 bg-stone-900 w-24 h-24 rounded-lg transition-all shadow-inner relative overflow-hidden group select-none"
                    >
                      {newLogo ? (
                        newLogo.startsWith("data:image") || newLogo.startsWith("http") ? (
                          <img src={newLogo} alt="Preview" className="w-full h-full object-contain p-2" />
                        ) : (
                          <span className="text-3xl animate-pixel-bounce">{newLogo}</span>
                        )
                      ) : (
                        <span className="text-3xl text-stone-600">➕</span>
                      )}
                      
                      {/* Subtle hover overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="text-5xs font-pixel uppercase text-stone-300">Upload</span>
                      </div>
                    </label>
                    
                    <input
                      type="file"
                      id="logo-upload"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // Enforce 2MB size limit
                          if (file.size > 2 * 1024 * 1024) {
                            alert("File size exceeds the 2MB limit!\n\nPlease choose a smaller image (under 2MB) to ensure smooth performance.");
                            e.target.value = "";
                            return;
                          }
                          
                          const reader = new FileReader();
                          reader.onload = () => {
                            const result = reader.result;
                            if (result && typeof result === "string") {
                              const img = new Image();
                              img.onload = () => {
                                // Create canvas to resize logo to optimal size (max 128x128)
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
                                  // Compress as lightweight JPEG
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
                    
                    <div className="text-left">
                      <span className="text-5xs font-pixel text-[#d97706] uppercase block mb-1">Image Specs</span>
                      <p className="text-5xs text-stone-400 leading-normal max-w-[200px]">
                        PNG, JPG, or SVG image. If skipped, your project will start with the default booster rocket (🚀).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="btn-pixel btn-pixel-primary w-full py-3 text-xs tracking-wider cursor-pointer"
                  >
                    Submit Project (Stage 1: $0)
                  </button>
                </div>
              </form>
            </div>

            <div className="text-3xs text-stone-550 mt-6 border-t border-stone-850 pt-4 font-mono">
              * Note: In Stage 1, submissions are 100% free. Once 16 products are queued, the tournament system begins automatically.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          Dual-Input Voting Modal
         ======================================================== */}
      {votingMatch && votingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-scale-in text-[#faf5ef]">
          <div 
            className="fixed inset-0" 
            onClick={() => {
              setVotingMatch(null);
              setVotingTarget(null);
              setVoteWinnerFeedback("");
              setVoteLoserFeedback("");
              setVoteError("");
            }}
          />
          <div className="relative w-full max-w-md bg-[#131312]/95 border border-stone-850 shadow-2xl p-6 sm:p-8 rounded-xl z-10">
            <h3 className="font-pixel text-xs uppercase mb-1 text-[#faf5ef]">
              Dueling Vote Box
            </h3>
            <span className="text-3xs font-pixel text-[#d97706] block mb-3">
              VOTING FOR: {votingTarget.title}
            </span>

            <p className="text-xs text-stone-400 mb-5 leading-relaxed">
              We enforce a **Dual Feedback Loop**. To register your vote, you must bind your account and write positive critique for the winner AND constructive advice for the loser. **Every competitor leaves with real value.**
            </p>

            <form onSubmit={handleVoteSubmit} className="space-y-4">
              {/* Functional Dual Google & GitHub Auth Card */}
              <div className="p-4 bg-[#1c1a18] border border-stone-850 flex flex-col gap-3 shadow-pixel-sm rounded-lg text-left">
                <div className="flex items-center space-x-3">
                  <span className="w-8 h-8 bg-stone-900 border border-stone-800 flex items-center justify-center text-sm font-pixel rounded-md">
                    {userAuthType === "github" ? "🐙" : "🔑"}
                  </span>
                  <div>
                    <span className="text-3xs font-pixel block text-stone-400">AUTHORIZATION</span>
                    {userLoggedIn ? (
                      <span className="text-3xs font-pixel text-[#d97706]">
                        {mockUserTwitter} <span className="text-stone-400 font-mono">({userAuthType === "github" ? "GitHub" : "Google"})</span>
                      </span>
                    ) : (
                      <span className="text-3xs text-red-500 font-pixel uppercase font-bold">Unauthenticated</span>
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
                      className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-white text-stone-900 border border-stone-300 hover:bg-stone-100 text-3xs font-pixel uppercase font-bold rounded-md transition-all cursor-pointer shadow-pixel-xs animate-pixel-bounce"
                    >
                      Link Google
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTempAuthType("github");
                        setIsAuthOpen(true);
                      }}
                      className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-stone-950 text-white border border-stone-850 hover:bg-stone-900 text-3xs font-pixel uppercase font-bold rounded-md transition-all cursor-pointer shadow-pixel-xs animate-pixel-bounce"
                    >
                      Link GitHub
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-stone-400 hover:text-stone-200 text-3xs underline font-pixel font-bold transition-all cursor-pointer self-start"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {/* Input 1: Why vote for winner */}
              <div>
                <label className="block text-3xs font-pixel text-stone-400 mb-1.5 uppercase">
                  1. Why are you voting for {votingTarget.title}? (min 10 chars) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g., The core user interface is incredibly fast and intuitive."
                  value={voteWinnerFeedback}
                  onChange={(e) => setVoteWinnerFeedback(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-850 rounded-lg bg-stone-900 text-[#faf5ef] text-sm focus:outline-none focus:border-amber-600 transition-all"
                />
                <div className="flex justify-between text-3xs font-mono text-stone-400 mt-1">
                  <span>Chars: {voteWinnerFeedback.length}</span>
                  <span className={voteWinnerFeedback.length >= 10 ? "text-emerald-500 font-semibold" : "text-amber-500 font-semibold"}>
                    {voteWinnerFeedback.length >= 10 ? "✓ Ready" : `Need ${Math.max(0, 10 - voteWinnerFeedback.length)} more`}
                  </span>
                </div>
              </div>

              {/* Input 2: Constructive advice for loser */}
              <div>
                <label className="block text-3xs font-pixel text-[#d97706] mb-1.5 uppercase">
                  2. Constructive Advice for {votingTarget.id === votingMatch.productA.id ? votingMatch.productB.title : votingMatch.productA.title} (min 10 chars) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g., The tagline needs more clarity; should clarify if it exports in SVG."
                  value={voteLoserFeedback}
                  onChange={(e) => setVoteLoserFeedback(e.target.value)}
                  className="w-full px-3 py-2 border border-amber-600/40 rounded-lg bg-stone-900 text-[#faf5ef] text-sm focus:outline-none focus:border-amber-600 transition-all"
                />
                <div className="flex justify-between text-3xs font-mono text-stone-400 mt-1">
                  <span>Chars: {voteLoserFeedback.length}</span>
                  <span className={voteLoserFeedback.length >= 10 ? "text-emerald-500 font-semibold" : "text-orange-500 font-semibold"}>
                    {voteLoserFeedback.length >= 10 ? "✓ Ready" : `Need ${Math.max(0, 10 - voteLoserFeedback.length)} more`}
                  </span>
                </div>
              </div>

              {voteError && (
                <div className="p-2.5 bg-red-950/30 text-red-400 text-3xs border border-red-900/50 font-mono">
                  [ERROR]: {voteError}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-stone-850 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setVotingMatch(null);
                    setVotingTarget(null);
                    setVoteWinnerFeedback("");
                    setVoteLoserFeedback("");
                    setVoteError("");
                  }}
                  className="btn-pixel py-1.5 px-3 text-3xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-pixel btn-pixel-primary py-1.5 px-4 text-3xs cursor-pointer"
                >
                  Submit Dual Vote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          Developer testing console (PM Sandbox control panel)
         ======================================================== */}
      <div className="fixed bottom-4 right-4 z-40 bg-[#faf5ef]/95 backdrop-blur-md border-2 border-pixel shadow-pixel p-4 max-w-xs hover:-translate-y-1 transition-all text-[#181715]">
        <div className="flex justify-between items-center mb-3 pb-1 border-b border-pixel">
          <span className="text-3xs font-pixel text-[#d97706]">
            SANDBOX_CONSOLE
          </span>
          <span className="w-2 h-2 bg-blue-600 border border-pixel animate-ping"></span>
        </div>
        <div className="space-y-2">
          {!bracket ? (
            <>
              <button 
                onClick={handleAddDummy}
                className="w-full text-left px-2.5 py-1.5 border border-pixel hover:bg-[#fdf2e9] transition-all text-3xs rounded-none font-pixel flex justify-between items-center"
              >
                <span>➕ Inject Mock Competitor</span>
                <span className="bg-[#fdf2e9] px-1 py-0.2 rounded font-mono font-bold text-[#181715]">{waitingProducts.length}/16</span>
              </button>
              <button 
                onClick={handleAutoFillAndStart}
                className="w-full text-left px-2.5 py-1.5 bg-[#181715] text-[#fcfbfa] hover:bg-[#d97706] transition-all text-3xs rounded-none font-pixel flex justify-between items-center"
              >
                <span>🚀 Autofill 16 & Launch</span>
                <span className="font-mono">➔</span>
              </button>
            </>
          ) : (
            <>
              <div className="p-2 bg-[#fdf2e9] border border-pixel text-3xs font-pixel space-y-1 text-stone-700">
                <div>STATUS: <strong className="text-emerald-700">{bracket.status}</strong></div>
                <div>STAGE: <strong className="text-[#d97706]">{
                  activeRoundNum === 1 ? "ROUND_16" : 
                  activeRoundNum === 2 ? "QUARTERS" : 
                  activeRoundNum === 3 ? "SEMIS" : "FINALS"
                }</strong></div>
              </div>
              {bracket.status === "completed" ? (
                <button
                  onClick={handleReset}
                  className="w-full text-left px-2.5 py-1.5 bg-stone-900 text-white hover:bg-stone-850 transition-all text-3xs rounded-none font-pixel flex justify-between items-center"
                >
                  <span>🔄 Start New Season (Reset)</span>
                  <span className="font-mono">➔</span>
                </button>
              ) : (
                <button
                  onClick={handleAdvanceRound}
                  className="w-full text-left px-2.5 py-1.5 bg-[#d97706] text-white hover:bg-[#181715] transition-all text-3xs rounded-none font-pixel flex justify-between items-center"
                >
                  <span>
                    {bracket.status === "preparing" 
                      ? "⚡ Force Start (Skip Midnight)" 
                      : "🏆 Settle & Advance Round"}
                  </span>
                  <span className="font-mono">➔</span>
                </button>
              )}
            </>
          )}
          <button 
            onClick={handleReset}
            className="w-full text-left px-2.5 py-1.5 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-all text-3xs font-pixel"
          >
            🔄 Reset Sandbox
          </button>
        </div>
      </div>

      {/* ========================================================
          Retro Pixel Authentication Selector Modal (Twitter/X & GitHub)
         ======================================================== */}
      {isAuthOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in text-[#181715]" style={{ zIndex: 100 }}>
          <div 
            className="fixed inset-0" 
            onClick={() => {
              setIsAuthOpen(false);
            }}
          />
          <div className="relative w-full max-w-sm bg-[#131312]/95 border border-stone-850 shadow-2xl p-6 sm:p-8 rounded-xl z-10 animate-scale-in">
            <div className="flex justify-between items-center mb-6 border-b border-stone-850 pb-3">
              <h3 className="font-pixel text-xs uppercase text-[#faf5ef]">
                Link Identity
              </h3>
              <button 
                onClick={() => {
                  setIsAuthOpen(false);
                }}
                className="text-stone-400 hover:text-stone-200 text-sm font-bold transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-3xs text-stone-400 mb-6 font-mono leading-relaxed">
              * Connect your real social profile to authorize your dual-critique voting in the combat arena. Real identity makes your feedback globally verifiable and high-trust.
            </p>

            <div className="space-y-4">
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
                    alert("Sandbox Mock: Google authorization linked successfully!");
                  }
                }}
                className="w-full py-3 text-3xs font-pixel flex items-center justify-center space-x-2 bg-white text-stone-900 border border-stone-300 hover:bg-stone-100 rounded-md transition-all cursor-pointer shadow-pixel-md font-bold"
              >
                <span className="text-sm">🔑</span> <span>CONNECT WITH GOOGLE</span>
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
                    alert("Sandbox Mock: GitHub authorization linked successfully!");
                  }
                }}
                className="w-full py-3 text-3xs font-pixel flex items-center justify-center space-x-2 bg-stone-950 text-white border border-stone-850 hover:bg-stone-900 rounded-md transition-all cursor-pointer shadow-pixel-md font-bold"
              >
                <span className="text-sm">🐙</span> <span>CONNECT WITH GITHUB</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          Custom Success Card Modal (Premium 8-Bit Notification Card)
         ======================================================== */}
      {isSuccessOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in" style={{ zIndex: 100 }}>
          <div 
            className="fixed inset-0" 
            onClick={() => setIsSuccessOpen(false)}
          />
          <div className="relative w-full max-w-md bg-[#faf5ef]/95 backdrop-blur-md border-4 border-pixel shadow-pixel-lg p-6 sm:p-8 rounded-none z-10 text-center animate-scale-in">
            
            {/* Animated Shield/Trophy Checked Icon */}
            <div className="w-16 h-16 bg-amber-100 border-2 border-pixel rounded-none mx-auto flex items-center justify-center text-3xl mb-4 animate-pixel-bounce" style={{ borderColor: '#d97706' }}>
              🛡️
            </div>
            
            <h3 className="font-pixel text-xs uppercase text-[#181715] mb-2 tracking-wide">
              {successModalTitle}
            </h3>
            
            <p className="text-3xs font-pixel text-[#d97706] uppercase tracking-widest block mb-4">
              Submission Confirmed
            </p>

            <div className="bg-[#faf5ef] border-2 border-pixel p-4 text-left font-mono text-3xs text-stone-700 leading-relaxed mb-6 whitespace-pre-line shadow-pixel-sm">
              {successModalText}
            </div>

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
              className="btn-pixel btn-pixel-primary w-full py-2.5 text-3xs tracking-wider"
            >
              ENTER THE ARENA ➔
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          Victory Champion Modal (Premium 8-Bit Celebration Card)
         ======================================================== */}
      {isChampionModalOpen && championWinner && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" style={{ zIndex: 110, color: '#181715' }}>
          <div 
            className="fixed inset-0" 
            onClick={() => setIsChampionModalOpen(false)}
          />
          <div className="relative w-full max-w-xl bg-[#faf5ef]/95 backdrop-blur-md border-4 border-pixel shadow-pixel-lg p-8 sm:p-10 rounded-none z-10 text-center animate-scale-in" style={{ borderColor: '#d97706', color: '#181715' }}>
            
            {/* Golden decorative elements */}
            <div className="absolute top-0 inset-x-0 h-2" style={{ background: 'linear-gradient(90deg, #fcd34d, #d97706, #fcd34d)' }} />
            <button 
              onClick={() => setIsChampionModalOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center border-2 border-pixel font-pixel text-xs transition-all cursor-pointer"
              style={{ color: '#44403c', backgroundColor: '#f5f5f4', borderColor: '#181715' }}
            >
              ✕
            </button>

            {/* Header Badge */}
            <div className="inline-flex items-center space-x-2 border font-pixel text-3xs px-4 py-1.5 uppercase mb-6 shadow-pixel-xs animate-pixel-bounce" style={{ backgroundColor: '#fffbeb', borderColor: '#fcd34d', color: '#d97706' }}>
              <span>🏆</span> <span>COLOSEUM CHAMPION DECLARED</span> <span>🏆</span>
            </div>

            {/* Winner Info */}
            <h2 className="text-3xl sm:text-4xl font-sans font-black tracking-tighter leading-none uppercase mb-4 flex items-center justify-center flex-wrap gap-2" style={{ color: '#181715' }}>
              {renderLogo(championWinner.logo, "w-10 h-10")}
              <span>{championWinner.title}</span>
              {renderLogo(championWinner.logo, "w-10 h-10")}
            </h2>
            <p className="font-sans text-xs max-w-lg mx-auto mb-8 font-semibold" style={{ color: '#78716c' }}>
              {championWinner.tagline}
            </p>

            {/* Maker Spotlight Card */}
            <div className="max-w-md mx-auto p-5 border-2 border-pixel shadow-pixel-sm mb-8" style={{ backgroundColor: '#f5f5f4', borderColor: '#181715', color: '#181715' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 text-left">
                  <img src={championWinner.makerAvatar} alt="Maker" className="w-12 h-12 border border-pixel" style={{ borderColor: '#181715' }} />
                  <div>
                    <span className="text-4xs font-pixel block" style={{ color: '#a8a29e' }}>ARENA CONQUEROR</span>
                    <span className="text-sm font-sans font-extrabold block" style={{ color: '#1c1917' }}>{championWinner.makerName}</span>
                  </div>
                </div>
                
                <a 
                  href={`https://x.com/${championWinner.makerTwitter.replace(/^@/, "")}`}
                  target="_blank" 
                  rel="noreferrer"
                  className="btn-pixel !py-1.5 !px-3 text-4xs font-pixel"
                  style={{ color: '#ffffff', backgroundColor: '#1c1917', borderColor: '#181715' }}
                >
                  FOLLOW {championWinner.makerTwitter} ➔
                </a>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              <a 
                href={championWinner.url}
                target="_blank"
                rel="noreferrer"
                className="btn-pixel py-3.5 px-8 text-xs tracking-wider shadow-pixel-md hover:-translate-y-0.5 active:translate-y-0 transition-all font-pixel"
                style={{ backgroundColor: '#d97706', color: '#ffffff', borderColor: '#181715' }}
              >
                🌐 EXPLORE DEMO URL ➔
              </a>
              
              <button 
                onClick={() => setIsChampionModalOpen(false)}
                className="btn-pixel py-3.5 px-8 text-xs tracking-wider font-pixel shadow-pixel-md hover:-translate-y-0.5 active:translate-y-0 transition-all"
                style={{ backgroundColor: '#1c1917', color: '#ffffff', borderColor: '#181715' }}
              >
                ⚔️ RETURN TO WHITEBOARD
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================
          Past Champions Hall of Valor Drawer/Modal
         ======================================================== */}
      {isPastChampsOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" style={{ zIndex: 120, color: '#181715' }}>
          <div 
            className="fixed inset-0" 
            onClick={() => setIsPastChampsOpen(false)}
          />
          <div className="relative w-full max-w-4xl bg-[#faf5ef]/95 backdrop-blur-md border-4 border-pixel shadow-pixel-lg p-6 sm:p-8 rounded-none z-10 animate-scale-in" style={{ borderColor: '#d97706', color: '#181715' }}>
            
            {/* Header */}
            <div className="flex justify-between items-center mb-6 border-b-2 border-pixel pb-3" style={{ borderColor: '#181715' }}>
              <div className="flex items-center space-x-2">
                <span className="text-xl">🏆</span>
                <h3 className="font-pixel text-xs sm:text-sm uppercase tracking-wide" style={{ color: '#d97706' }}>
                  THE HALL OF VALOR — HISTORIC CHAMPIONS
                </h3>
              </div>
              <button 
                onClick={() => setIsPastChampsOpen(false)}
                className="w-8 h-8 flex items-center justify-center border-2 border-pixel font-pixel text-xs transition-all cursor-pointer"
                style={{ color: '#44403c', backgroundColor: '#f5f5f4', borderColor: '#181715' }}
              >
                ✕
              </button>
            </div>

            {/* List Grid */}
            <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-1">
                {pastChampions.map((c, idx) => (
                  <div 
                    key={c.id} 
                    className="p-4 border-2 border-pixel shadow-pixel-xs flex flex-col justify-between hover:-translate-y-0.5 transition-all"
                    style={{ backgroundColor: '#f5f5f4', borderColor: '#181715', color: '#181715' }}
                  >
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-2xl flex items-center justify-center">
                          {renderLogo(c.logo, "w-8 h-8")}
                        </span>
                        <span className="border text-5xs font-pixel px-2 py-0.5 uppercase" style={{ backgroundColor: '#fffbeb', borderColor: '#fcd34d', color: '#d97706' }}>
                          SEASON {String(idx + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <a 
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-pixel text-xs hover:underline uppercase block mb-1"
                        style={{ color: '#181715' }}
                      >
                        {c.title}
                      </a>
                      <p className="text-4xs leading-relaxed line-clamp-2 mb-3 font-sans font-medium" style={{ color: '#78716c' }}>{c.tagline}</p>
                    </div>
                    
                    <div className="flex items-center justify-between border-t border-dashed pt-3 text-4xs font-mono" style={{ borderColor: '#e7e5e4', color: '#78716c' }}>
                      <div className="flex items-center space-x-1.5">
                        <img src={c.makerAvatar} alt="Maker" className="w-5 h-5 border border-pixel shrink-0" style={{ borderColor: '#181715' }} />
                        <a 
                          href={`https://x.com/${c.makerTwitter.replace(/^@/, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline font-bold"
                          style={{ color: '#78716c' }}
                        >
                          {c.makerTwitter}
                        </a>
                      </div>
                      <a 
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-5xs uppercase font-pixel underline"
                        style={{ color: '#d97706' }}
                      >
                        DEMO
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer close CTA */}
            <div className="mt-6 text-right border-t border-pixel pt-4" style={{ borderColor: '#181715' }}>
              <button
                onClick={() => setIsPastChampsOpen(false)}
                className="btn-pixel py-2 px-6 text-3xs font-pixel shadow-pixel-xs transition-all"
                style={{ backgroundColor: '#1c1917', color: '#ffffff', borderColor: '#181715' }}
              >
                ⚔️ CLOSE GALLERY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          Privacy Policy Modal (Premium Retro-Dark Dialog)
         ======================================================== */}
      {isPrivacyOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in text-[#faf5ef]" style={{ zIndex: 150 }}>
          <div 
            className="fixed inset-0" 
            onClick={() => setIsPrivacyOpen(false)}
          />
          <div className="relative w-full max-w-2xl bg-[#0f0e0d]/98 border-2 border-pixel shadow-[0_25px_60px_-15px_rgba(217,119,6,0.15)] p-6 sm:p-8 rounded-2xl z-10 animate-scale-in text-left" style={{ borderColor: '#d97706' }}>
            <button 
              onClick={() => setIsPrivacyOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center border border-stone-850 font-pixel text-xs transition-all cursor-pointer text-stone-400 hover:text-stone-200 hover:border-stone-600 bg-[#181715] rounded-lg shadow-sm"
            >
              ✕
            </button>
            <div className="flex items-center space-x-3 mb-6 border-b border-stone-850 pb-4">
              <span className="text-2xl animate-pixel-bounce">🛡️</span>
              <div>
                <h3 className="font-pixel text-xs sm:text-sm uppercase tracking-wider text-[#d97706] leading-none mb-1">
                  Privacy Policy
                </h3>
                <span className="text-5xs font-mono text-stone-500 uppercase tracking-widest block">SECURE SYSTEM MATCH DATA</span>
              </div>
            </div>
            
            <div className="max-h-[55vh] overflow-y-auto pr-3 custom-scrollbar font-sans text-xs text-stone-300 space-y-5 leading-relaxed">
              <div className="bg-[#181715] border border-stone-850 px-4 py-2.5 rounded-lg mb-2 flex items-center justify-between">
                <span className="text-3xs font-mono text-stone-400">STATUS: ACTIVE // VERIFIED</span>
                <span className="text-3xs font-mono text-[#d97706] font-bold">UPDATED: MAY 29, 2026</span>
              </div>

              <div>
                <h4 className="font-pixel text-3xs text-[#faf5ef] uppercase mb-1.5 border-l-2 border-[#d97706] pl-2">1. Scope & Commitment</h4>
                <p className="text-stone-350">
                  At Indie Clash (operated by @MaberFate), we respect your privacy. This policy outlines how we handle data for our 1v1 tournament arena website. We are committed to data minimization and user security.
                </p>
              </div>

              <div>
                <h4 className="font-pixel text-3xs text-[#faf5ef] uppercase mb-1.5 border-l-2 border-[#d97706] pl-2">2. Information We Collect</h4>
                <div className="bg-[#181715] border border-stone-850 p-4 rounded-lg space-y-3">
                  <div>
                    <span className="inline-block bg-stone-900 border border-stone-800 text-[#d97706] font-mono text-3xs px-2 py-0.5 rounded-md mb-1 font-bold">OAUTH ACCOUNT METADATA</span>
                    <p className="text-stone-350 text-3xs leading-relaxed">
                      When you connect via Google or GitHub OAuth, we collect your verified email address, public profile name, avatar image URL, and auth provider details. This is necessary to verify your identity.
                    </p>
                  </div>
                  <div>
                    <span className="inline-block bg-stone-900 border border-stone-800 text-[#d97706] font-mono text-3xs px-2 py-0.5 rounded-md mb-1 font-bold">PROJECT SUBMISSION DATA</span>
                    <p className="text-stone-350 text-3xs leading-relaxed">
                      If you submit an indie product, we collect the title, tagline, logo/emoji, maker Twitter/X handle, and live demo URL.
                    </p>
                  </div>
                  <div>
                    <span className="inline-block bg-stone-900 border border-stone-800 text-[#d97706] font-mono text-3xs px-2 py-0.5 rounded-md mb-1 font-bold">CRITIQUES & PUBLIC VOTES</span>
                    <p className="text-stone-350 text-3xs leading-relaxed">
                      To participate in the arena voting process, you must submit a constructive critique. We store and publicly display the critique texts you write, alongside your voting selection.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-pixel text-3xs text-[#faf5ef] uppercase mb-1.5 border-l-2 border-[#d97706] pl-2">3. How We Use Your Data</h4>
                <ul className="space-y-2 text-stone-350">
                  <li className="flex items-start space-x-2">
                    <span className="text-[#d97706] mt-0.5 shrink-0">✔</span>
                    <span><strong>Spam & Vote Rigging Prevention:</strong> Connected accounts help us prevent bots, duplicate voting, and coordinated manipulation rings.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-[#d97706] mt-0.5 shrink-0">✔</span>
                    <span><strong>Public Duel Transparency:</strong> Constructive critiques are published on the battle whiteboard. The identity linked to your account may be shown next to your feedback.</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-[#d97706] mt-0.5 shrink-0">✔</span>
                    <span><strong>Tournament Operation:</strong> We use project details for matching, voting updates, rankings, and historical champion boards.</span>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-pixel text-3xs text-[#faf5ef] uppercase mb-1.5 border-l-2 border-[#d97706] pl-2">4. Data Sharing & Retention</h4>
                <p className="text-stone-350">
                  We do not sell, rent, or lease your personal information. Your profile details, submitted critiques, and project links are publicly displayed as part of the core Indie Clash experience. All transaction sessions are handled via encrypted Supabase storage.
                </p>
              </div>

              <div>
                <h4 className="font-pixel text-3xs text-[#faf5ef] uppercase mb-1.5 border-l-2 border-[#d97706] pl-2">5. Contact Us</h4>
                <p className="text-stone-350">
                  For any privacy inquiries, data deletion requests, or support, reach out to us at:
                  <a href="mailto:support@maber.xyz" className="text-[#d97706] hover:underline font-bold ml-1">support@maber.xyz</a>.
                </p>
              </div>
            </div>

            <div className="mt-6 text-right border-t border-stone-850 pt-4 flex justify-between items-center">
              <span className="text-5xs font-mono text-stone-555 uppercase">INDIE CLASH PROTOCOL v1.0</span>
              <button
                onClick={() => setIsPrivacyOpen(false)}
                className="btn-pixel py-2.5 px-6 text-3xs font-pixel shadow-pixel-xs transition-all bg-[#1c1917] text-white border-2 hover:bg-stone-900 rounded-lg cursor-pointer"
                style={{ borderColor: '#d97706' }}
              >
                ACCEPT & CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          Terms of Use Modal (Premium Retro-Dark Dialog)
         ======================================================== */}
      {isTermsOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in text-[#faf5ef]" style={{ zIndex: 150 }}>
          <div 
            className="fixed inset-0" 
            onClick={() => setIsTermsOpen(false)}
          />
          <div className="relative w-full max-w-2xl bg-[#0f0e0d]/98 border-2 border-pixel shadow-[0_25px_60px_-15px_rgba(217,119,6,0.15)] p-6 sm:p-8 rounded-2xl z-10 animate-scale-in text-left" style={{ borderColor: '#d97706' }}>
            <button 
              onClick={() => setIsTermsOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center border border-stone-850 font-pixel text-xs transition-all cursor-pointer text-stone-400 hover:text-stone-200 hover:border-stone-600 bg-[#181715] rounded-lg shadow-sm"
            >
              ✕
            </button>
            <div className="flex items-center space-x-3 mb-6 border-b border-stone-850 pb-4">
              <span className="text-2xl animate-pixel-bounce">📜</span>
              <div>
                <h3 className="font-pixel text-xs sm:text-sm uppercase tracking-wider text-[#d97706] leading-none mb-1">
                  Terms of Use
                </h3>
                <span className="text-5xs font-mono text-stone-500 uppercase tracking-widest block">ARENA DEPLOY RULES & POLICY</span>
              </div>
            </div>
            
            <div className="max-h-[55vh] overflow-y-auto pr-3 custom-scrollbar font-sans text-xs text-stone-300 space-y-5 leading-relaxed">
              <div className="bg-[#181715] border border-stone-850 px-4 py-2.5 rounded-lg mb-2 flex items-center justify-between">
                <span className="text-3xs font-mono text-stone-400">LICENSE AGREEMENT: PUBLIC ACCESS</span>
                <span className="text-3xs font-mono text-[#d97706] font-bold">UPDATED: MAY 29, 2026</span>
              </div>

              <div>
                <h4 className="font-pixel text-3xs text-[#faf5ef] uppercase mb-1.5 border-l-2 border-[#d97706] pl-2">1. Acceptance of Terms</h4>
                <p className="text-stone-350">
                  By accessing and using Indie Clash (located at this website, created by @MaberFate), you agree to be bound by these Terms of Use. If you do not agree, please discontinue use immediately.
                </p>
              </div>

              <div>
                <h4 className="font-pixel text-3xs text-[#faf5ef] uppercase mb-1.5 border-l-2 border-[#d97706] pl-2">2. Description of Service</h4>
                <p className="text-stone-350">
                  Indie Clash is a 1v1 product tournament bracket platform. Users submit project details, connect identity via OAuth, and participate in peer-critique voting to rank products in live battles.
                </p>
              </div>

              <div>
                <h4 className="font-pixel text-3xs text-[#faf5ef] uppercase mb-1.5 border-l-2 border-[#d97706] pl-2">3. Battle Arena Fair Play Policy</h4>
                <div className="bg-[#181715] border border-stone-850 p-4 rounded-lg space-y-3 text-3xs text-stone-350 leading-relaxed">
                  <div>
                    <span className="inline-block bg-stone-900 border border-stone-800 text-[#dc2626] font-mono text-4xs px-2 py-0.5 rounded-md mb-1 font-bold">ZERO TOLERANCE: BOT ACTIVITY</span>
                    <p>You may not use automated scripts, bots, or fake accounts to generate votes or project queues.</p>
                  </div>
                  <div>
                    <span className="inline-block bg-stone-900 border border-stone-800 text-[#dc2626] font-mono text-4xs px-2 py-0.5 rounded-md mb-1 font-bold">ZERO TOLERANCE: COORDINATED MANIPULATION</span>
                    <p>Coordinated upvote manipulation, review exchanges, or purchasing of votes is strictly prohibited.</p>
                  </div>
                  <div>
                    <span className="inline-block bg-stone-900 border border-stone-800 text-[#d97706] font-mono text-4xs px-2 py-0.5 rounded-md mb-1 font-bold">REQUIRED: DUAL CRITIQUE LOCK</span>
                    <p>You must leave a constructive critique of at least 10 characters summarizing positive points for the winner and actionable feedback for the runner-up. Low-effort or spam text will invalidate the vote.</p>
                  </div>
                  <p className="text-amber-500 font-bold border-t border-stone-800 pt-2 font-pixel text-4xs uppercase">
                    ※ Violation results in permanent disqualification of products from current brackets & hall of valor.
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-pixel text-3xs text-[#faf5ef] uppercase mb-1.5 border-l-2 border-[#d97706] pl-2">4. Intellectual Property & Submissions</h4>
                <p className="text-stone-350">
                  You retain ownership of all intellectual property rights to the products you submit. By submitting a product, you grant Indie Clash a worldwide, non-exclusive, royalty-free license to display your product details (title, tagline, emoji, screenshots, maker info, and URL) publicly in the arena.
                </p>
              </div>

              <div>
                <h4 className="font-pixel text-3xs text-[#faf5ef] uppercase mb-1.5 border-l-2 border-[#d97706] pl-2">5. Limitation of Liability</h4>
                <p className="text-stone-350">
                  Indie Clash is provided "as is" and "as available". We do not guarantee uninterrupted service or error-free matchups. We reserve the right to modify, pause, or terminate tournament systems, brackets, or database values at our sole discretion without notice.
                </p>
              </div>

              <div>
                <h4 className="font-pixel text-3xs text-[#faf5ef] uppercase mb-1.5 border-l-2 border-[#d97706] pl-2">6. Contact & Support</h4>
                <p className="text-stone-350">
                  If you have questions, reports of abuse, or need support, contact our team at:
                  <a href="mailto:support@maber.xyz" className="text-[#d97706] hover:underline font-bold ml-1">support@maber.xyz</a>.
                </p>
              </div>
            </div>

            <div className="mt-6 text-right border-t border-stone-850 pt-4 flex justify-between items-center">
              <span className="text-5xs font-mono text-stone-555 uppercase">ARENA CORE CODE CONDITIONS v1.0</span>
              <button
                onClick={() => setIsTermsOpen(false)}
                className="btn-pixel py-2.5 px-6 text-3xs font-pixel shadow-pixel-xs transition-all bg-[#1c1917] text-white border-2 hover:bg-stone-900 rounded-lg cursor-pointer"
                style={{ borderColor: '#d97706' }}
              >
                ACCEPT & CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
