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
  const [isRealtimeSimulating, setIsRealtimeSimulating] = useState(false);
  const [simIntervalId, setSimIntervalId] = useState<any>(null);

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
        userAuthType: provider === "google" ? "google" : "github"
      }));
    }
  };

  const handleSandboxLogin = (provider: "google" | "github") => {
    const mockUser = provider === "google" ? "Google_Hacker_Sandbox" : "@GitHub_Indie_Sandbox";
    setUserLoggedIn(true);
    setMockUserTwitter(mockUser);
    setUserAuthType(provider);
    setIsAuthOpen(false);
    
    if (typeof window !== "undefined") {
      localStorage.setItem("ship_duel_sandbox_user", JSON.stringify({
        userLoggedIn: true,
        mockUserTwitter: mockUser,
        userAuthType: provider
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

  // Auto-fill Maker details from verified account
  useEffect(() => {
    if (userLoggedIn && mockUserTwitter) {
      setNewMaker(mockUserTwitter.replace(/^@/, ""));
      setNewTwitter(mockUserTwitter);
    }
  }, [userLoggedIn, mockUserTwitter]);

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
          const b = await fetchCloudBracket();
          if (b) {
            // Guard against database replication latency/WAL race conditions during Force Start:
            // If the local state is already "active" or "completed", but the database fetched state 
            // is still "preparing", do NOT let the stale database state overwrite our local advanced state.
            const localStatus = latestBracketRef.current?.status;
            if (b.status === "preparing" && (localStatus === "active" || localStatus === "completed")) {
              console.warn("⚠️ [SHIP OR DUEL] Ignored stale 'preparing' database status to prevent downgrade race condition.");
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
        const ms = getMillisecondsToNextNYMidnight();
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
          setIsRealtimeSimulating(false);
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

  // Realtime simulation logic (offline sandbox votes)
  useEffect(() => {
    if (isRealtimeSimulating && bracket) {
      const interval = setInterval(() => {
        setBracket(prev => {
          if (!prev) return null;
          const updated = injectMockVotes(prev);
          if (activeMatch) {
            let freshMatch = null;
            const round = getActiveRound(updated);
            if (round === 1) freshMatch = updated.round1.find(m => m.id === activeMatch.id);
            else if (round === 2) freshMatch = updated.round2.find(m => m.id === activeMatch.id);
            else if (round === 3) freshMatch = updated.round3.find(m => m.id === activeMatch.id);
            else if (round === 4) freshMatch = updated.round4.find(m => m.id === activeMatch.id);
            if (freshMatch) {
              setActiveMatch(freshMatch);
            }
          }
          return updated;
        });
      }, 1500);
      setSimIntervalId(interval);
    } else {
      if (simIntervalId) {
        clearInterval(simIntervalId);
        setSimIntervalId(null);
      }
    }
    return () => {
      if (simIntervalId) clearInterval(simIntervalId);
    };
  }, [isRealtimeSimulating, activeMatch]);

  // Reset Sandbox
  const handleReset = () => {
    localStorage.clear();
    const freshProds = loadProducts();
    setProducts(freshProds);
    setBracket(null);
    setActiveMatch(null);
    setIsRealtimeSimulating(false);
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
      alert("Verification Required!\n\nPlease link and verify your Twitter/X or GitHub identity before submitting your product to the waiting list.");
      setIsAuthOpen(true);
      return;
    }
    if (!newTitle || !newTagline || !newUrl) {
      alert("Please fill in all required product fields.");
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
      makerAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces",
      logo: newLogo,
      submittedAt: new Date().toISOString(),
      queueStatus: "waiting",
      votesCount: 0
    };

    const updated = [...products, newProd];
    setProducts(updated);
    saveProducts(updated);

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
    setIsRealtimeSimulating(false);
    
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
      supabase
        .from("shipandbattle_votes")
        .insert({
          shipandbattle_match_id: freshMatch.id,
          shipandbattle_voter_username: mockUserTwitter,
          shipandbattle_voter_auth_type: userAuthType,
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

    // Append to live marquee stream
    const newComment = `Critique: ${voteLoserFeedback.slice(0, 32)}...`;
    setDanmakus(prev => [newComment, ...prev]);

    setVotingMatch(null);
    setVotingTarget(null);
    setVoteWinnerFeedback("");
    setVoteLoserFeedback("");
    setVoteError("");
  };

  const getPercentages = (match: Match) => {
    const total = match.votesA + match.votesB;
    if (total === 0) return { pctA: 50, pctB: 50 };
    const pctA = Math.round((match.votesA / total) * 100);
    const pctB = 100 - pctA;
    return { pctA, pctB };
  };

  const getLeaderboardData = () => {
    return products.map(p => {
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
      
      const isShiplogActive = p.queueStatus === "active" || p.id === "p1" || p.id === "p5" || p.id === "p11";
      const shiplogBonus = isShiplogActive ? 50 : 0;
      const points = bracketVotes + (wins * 150) + shiplogBonus;
      
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

  return (
    <div className={`flex-1 bg-[#121110] text-[#181715] font-sans selection:bg-[#fdf2e9] crt-screen min-h-screen relative ${isShaking ? "animate-arena-shake" : ""}`}>
      
      {/* Main page content wrapped with the CRT boot screen-on animation */}
      <div className={`transition-all duration-300 ${isBooted ? "animate-crt-boot" : "opacity-0"}`}>
      
      {/* ========================================================
          ACT 1: IMMERSIVE HERO ARENA (First Fold)
         ======================================================== */}
      <section 
        className="w-full h-screen relative flex flex-col justify-between overflow-hidden border-b-4 border-pixel"
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
            <span className="text-xl sm:text-2xl font-pixel tracking-wider text-[#faf5ef] animate-pixel-bounce">SHIP_DUEL ⚔️</span>
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
                <span className="drop-shadow-[0_4px_0_rgba(0,0,0,0.95)]">SHIP</span>
                <span className="text-[#dc2626] drop-shadow-[0_4px_0_rgba(0,0,0,0.95)]">OR DUEL</span>
              </h1>
              <p className="text-[#dc2626] font-mono text-2xs font-bold tracking-widest mt-4 uppercase animate-hero-sub">
                miss the launch date, get fed to the lions.
              </p>
            </div>
            
            <p className="text-[#e7e3db] font-sans text-xs sm:text-sm mt-6 leading-relaxed max-w-md drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] animate-hero-sub">
              The ultimate 1v1 tournament arena for creators. Duel openly, collect genuine double-sided peer critiques, minimize vote manipulation, and rise to the top of the leaderboard.
            </p>

            {/* Dual Core CTAs */}
            <div className="mt-8 flex flex-wrap gap-4 items-center animate-hero-cta">
              {!bracket ? (
                <button
                  onClick={() => setIsSubmitOpen(true)}
                  className="btn-pixel btn-pixel-primary py-3.5 px-8 text-2xs tracking-wider shadow-pixel-lg hover:-translate-y-0.5 active:translate-y-0 transition-all font-pixel bg-[#d97706] hover:bg-[#c25e00] text-white border-2 border-[#181715]"
                >
                  ➕ SUBMIT MATCH REQUEST →
                </button>
              ) : (
                <button
                  onClick={scrollToDuel}
                  className="btn-pixel btn-pixel-primary py-3.5 px-8 text-2xs tracking-wider shadow-pixel-lg hover:-translate-y-0.5 active:translate-y-0 transition-all font-pixel bg-[#d97706] hover:bg-[#c25e00] text-white border-2 border-[#181715]"
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
                        <span className="text-3xl shrink-0 mt-1">{reigning.logo}</span>
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
                  <span className="font-pixel text-4xs text-stone-500 uppercase block mb-1">Season 01 Active</span>
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

          {/* Glow sweep lines */}
          <div className="absolute top-0 left-0 right-0 glow-line" />
          <div className="absolute bottom-0 left-0 right-0 glow-line" />
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
                  No casual clicks. Every voter must connect via Twitter/X and leave a constructive dual critique of 10+ characters. This friction drastically minimizes automated bot rigging and coordinate spamming.
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
              Track tournament standings and live duels in real-time. Use the Sandbox Console in the bottom-right to test immediate matchmaking, simulated voting, and settlement updates.
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
                <h3 className="font-pixel text-xs uppercase text-[#181715]">GLOBAL AP RANKINGS (SEASON 01)</h3>
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
                      <th className="py-3 px-4 text-center">Shiplog Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-250 font-mono text-2xs">
                    {getLeaderboardData().map((p, idx) => {
                      const isTop3 = idx < 3;
                      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
                      const isShiplogActive = p.queueStatus === "active" || p.id === "p1" || p.id === "p5" || p.id === "p11";
                      return (
                        <tr key={p.id} className={`hover:bg-stone-50 transition-all ${isTop3 ? "bg-[#fdf2e9]/20 font-semibold" : ""}`}>
                          <td className="py-3.5 px-4 text-center font-pixel text-xs text-[#d97706]">
                            {medal}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-3">
                              <span className="text-xl shrink-0">{p.logo}</span>
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
                            {isShiplogActive ? (
                              <a 
                                href="https://www.ship-or-die.com/" 
                                target="_blank" 
                                rel="noreferrer"
                                className="inline-flex items-center space-x-1 bg-emerald-50 border border-emerald-300 text-emerald-700 px-2 py-0.5 text-3xs font-pixel rounded-none hover:bg-emerald-100 hover:border-emerald-500 transition-all"
                              >
                                <span>🔥 ACTIVE</span>
                              </a>
                            ) : (
                              <span className="text-stone-400 text-4xs uppercase">UNLINKED</span>
                            )}
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
                      Once 16 products are queued up, the double-elimination tournament generates automatically. Click the Sandbox Console in the bottom-right to immediately inject simulated projects and start the duel!
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
                        [ No submissions in queue. Use the Sandbox Console in bottom-right to inject competitors instantly! ]
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {waitingProducts.map((p) => (
                          <div key={p.id} className="p-5 border-2 border-pixel bg-[#faf5ef]/90 hover:bg-[#faf5ef] backdrop-blur-xs transition-all duration-200 flex flex-col justify-between shadow-pixel-sm">
                            <div>
                              <div className="flex justify-between items-start mb-3">
                                <span className="text-2xl">{p.logo}</span>
                                <span className="bg-[#fdf2e9] border border-pixel text-[#d97706] text-3xs font-pixel px-2 py-0.5 uppercase">
                                  SHIP: {p.shipTimeframe}
                                </span>
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

                            {/* Display Shiplog status tag */}
                            <a 
                              href={p.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="mb-4 bg-[#faf5ef] border border-pixel p-2 text-3xs font-mono text-stone-700 hover:bg-[#fdf2e9] hover:border-[#d97706] transition-all flex items-center justify-between shadow-pixel-xs"
                            >
                              <span>🚀 Shiplog Track: <strong className="text-emerald-700 font-pixel">ACTIVE ✓</strong></span>
                              <span className="text-4xs text-[#d97706] underline font-pixel">VERIFY ➔</span>
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
                                  <span className="text-2xl">{p.logo}</span>
                                  <span className="bg-[#fdf2e9] border border-pixel text-[#d97706] text-3xs font-pixel px-2 py-0.5 uppercase">
                                    SHIP: {p.shipTimeframe}
                                  </span>
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
                                className="mb-4 bg-[#faf5ef] border border-pixel p-2 text-3xs font-mono text-stone-700 hover:bg-[#fdf2e9] hover:border-[#d97706] transition-all flex items-center justify-between shadow-pixel-xs"
                              >
                                <span>🚀 Shiplog Track: <strong className="text-emerald-700 font-pixel">ACTIVE ✓</strong></span>
                                <span className="text-4xs text-[#d97706] underline font-pixel">VERIFY ➔</span>
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
                        <div className="flex items-center space-x-3">
                          {bracket.status === "active" && (
                            <button
                              onClick={() => setIsRealtimeSimulating(!isRealtimeSimulating)}
                              className={`font-pixel text-3xs px-3 py-1.5 border border-pixel ${
                                isRealtimeSimulating
                                  ? "bg-red-100 text-red-700 animate-pulse"
                                  : "bg-[#faf5ef] text-stone-600 hover:bg-[#fdf2e9]"
                              }`}
                            >
                              {isRealtimeSimulating ? "⏸ Stop Realtime Simulation" : "⚡ Simulate Realtime Votes"}
                            </button>
                          )}
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
                              <span className="text-3xl">{activeMatch.productA.logo}</span>
                              <span className="bg-[#fdf2e9] border border-pixel text-[#d97706] text-4xs font-pixel px-2 py-0.5 uppercase">
                                SHIP: {activeMatch.productA.shipTimeframe}
                              </span>
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
                              className="bg-[#faf5ef] border border-pixel p-1.5 text-4xs font-mono text-stone-700 hover:bg-[#fdf2e9] hover:border-[#d97706] transition-all flex items-center justify-between"
                            >
                              <span>🚀 Shiplog Track: <strong className="text-emerald-700 font-pixel">ACTIVE ✓</strong></span>
                              <span className="text-5xs text-[#d97706] underline font-pixel">VERIFY</span>
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
                              <span className="text-3xl">{activeMatch.productB.logo}</span>
                              <span className="bg-[#fdf2e9] border border-pixel text-[#d97706] text-4xs font-pixel px-2 py-0.5 uppercase">
                                SHIP: {activeMatch.productB.shipTimeframe}
                              </span>
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
                              className="bg-[#faf5ef] border border-pixel p-1.5 text-4xs font-mono text-stone-700 hover:bg-[#fdf2e9] hover:border-[#d97706] transition-all flex items-center justify-between"
                            >
                              <span>🚀 Shiplog Track: <strong className="text-emerald-700 font-pixel">ACTIVE ✓</strong></span>
                              <span className="text-5xs text-[#d97706] underline font-pixel">VERIFY</span>
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
                        <span>🏆</span> <span>SEASON 01 COLOSEUM CHAMPION</span> <span>🏆</span>
                      </div>

                      {/* Winner Info */}
                      <h2 className="text-4xl sm:text-5xl font-sans font-black tracking-tighter leading-none text-[#181715] uppercase mb-4">
                        {bracket.winner.logo} {bracket.winner.title} {bracket.winner.logo}
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
                            🥈 HONORABLE RUNNER-UP: <span className="font-pixel text-[#181715]">{runnerUp.logo} {runnerUp.title}</span> BY <span className="text-stone-700 font-semibold">{runnerUp.makerTwitter}</span>
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
                              <span className={m.winnerId === m.productA.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}>
                                {m.productA.logo} {m.productA.title}
                              </span>
                              <span>{m.votesA}</span>
                            </div>
                            <div className="text-center font-pixel text-5xs text-stone-400 my-1">vs</div>
                            <div className="flex justify-between font-semibold">
                              <span className={m.winnerId === m.productB.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}>
                                {m.productB.logo} {m.productB.title}
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
                                <span className={m.winnerId === m.productA.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}>
                                  {m.productA.logo} {m.productA.title}
                                </span>
                                <span>{m.votesA}</span>
                              </div>
                              <div className="text-center font-pixel text-5xs text-stone-400 my-1">vs</div>
                              <div className="flex justify-between font-semibold">
                                <span className={m.winnerId === m.productB.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}>
                                  {m.productB.logo} {m.productB.title}
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
                                <span className={m.winnerId === m.productA.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}>
                                  {m.productA.logo} {m.productA.title}
                                </span>
                                <span>{m.votesA}</span>
                              </div>
                              <div className="text-center font-pixel text-5xs text-stone-400 my-1">vs</div>
                              <div className="flex justify-between font-semibold">
                                <span className={m.winnerId === m.productB.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}>
                                  {m.productB.logo} {m.productB.title}
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
                                <span className={m.winnerId === m.productA.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}>
                                  {m.productA.logo} {m.productA.title}
                                </span>
                                <span>{m.votesA}</span>
                              </div>
                              <div className="text-center font-pixel text-5xs text-stone-400 my-1">vs</div>
                              <div className="flex justify-between font-semibold">
                                <span className={m.winnerId === m.productB.id ? "text-emerald-700 font-bold" : m.winnerId ? "text-stone-400 line-through" : ""}>
                                  {m.productB.logo} {m.productB.title}
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

      {/* Narrative commentary danmakus stream bar at the bottom boundary of dashboard */}
      <div className="w-full bg-[#181715] border-t-2 border-pixel py-3 overflow-hidden select-none relative z-10 font-pixel text-4xs text-[#faf5ef]">
        <div className="danmaku-stream flex space-x-12 animate-danmaku-roll">
          {danmakus.map((comment, index) => (
            <span key={index} className="inline-block shrink-0 uppercase tracking-widest bg-stone-900 px-3 py-1 border border-stone-850">
              💬 {comment}
            </span>
          ))}
          {/* Duplicate to guarantee continuous roll loop */}
          {danmakus.map((comment, index) => (
            <span key={`dup-${index}`} className="inline-block shrink-0 uppercase tracking-widest bg-stone-900 px-3 py-1 border border-stone-850">
              💬 {comment}
            </span>
          ))}
        </div>
      </div>

      </div>

      {/* ========================================================
          Tactile Slide-over Drawer for new submissions
         ======================================================== */}
      {isSubmitOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-xs animate-fade-in">
          <div 
            className="fixed inset-0" 
            onClick={() => setIsSubmitOpen(false)}
          />
          <div className="relative w-full max-w-md h-full bg-[#faf5ef]/95 backdrop-blur-md border-l-4 border-pixel shadow-2xl p-6 sm:p-10 flex flex-col justify-between overflow-y-auto animate-slide-in text-[#181715]">
            <div>
              <div className="flex justify-between items-center mb-8 border-b-2 border-pixel pb-4">
                <h2 className="text-base sm:text-lg font-pixel uppercase text-[#181715]">SUBMIT_PROJECT</h2>
                <button 
                  onClick={() => setIsSubmitOpen(false)}
                  className="text-stone-405 hover:text-stone-700 text-xl font-bold font-mono"
                >
                  ✕
                </button>
              </div>

              {/* Functional Dual Google & GitHub Auth Card inside Submit Drawer */}
              <div className="p-3 bg-[#faf5ef]/80 border-2 border-pixel flex items-center justify-between shadow-pixel-sm mb-6">
                <div className="flex items-center space-x-3">
                  <span className="w-8 h-8 bg-stone-100 border border-pixel flex items-center justify-center text-sm font-pixel">
                    {userAuthType === "github" ? "🐙" : "🔑"}
                  </span>
                  <div>
                    <span className="text-3xs font-pixel block text-stone-500">IDENTITY VERIFICATION</span>
                    {userLoggedIn ? (
                      <span className="text-3xs font-pixel text-[#d97706]">
                        {mockUserTwitter} <span className="text-stone-400 font-mono">({userAuthType === "github" ? "GitHub" : "Google"})</span>
                      </span>
                    ) : (
                      <span className="text-3xs text-red-650 font-pixel uppercase font-bold text-3xs">Unverified</span>
                    )}
                  </div>
                </div>
                {!userLoggedIn ? (
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTempAuthType("google");
                        setIsAuthOpen(true);
                      }}
                      className="btn-pixel py-1.5 px-3 text-3xs"
                    >
                      Link Google
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTempAuthType("github");
                        setIsAuthOpen(true);
                      }}
                      className="btn-pixel py-1.5 px-3 text-3xs"
                    >
                      Link GitHub
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-stone-400 hover:text-stone-700 text-3xs underline font-pixel font-bold"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmitProduct} className="space-y-6">
                <div>
                  <label className="block text-3xs font-pixel text-stone-500 mb-1.5 uppercase">
                    Product Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SiteShot 📸"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-pixel rounded-none bg-white text-sm focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-3xs font-pixel text-stone-500 mb-1.5 uppercase">
                    One-Sentence Tagline *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. High-def screenshot API with full-page scrolling..."
                    value={newTagline}
                    onChange={(e) => setNewTagline(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-pixel rounded-none bg-white text-sm focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-3xs font-pixel text-stone-500 mb-1.5 uppercase">
                    Demo URL *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="https://siteshot.net"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-pixel rounded-none bg-white text-sm focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-3xs font-pixel text-stone-500 mb-1.5 uppercase">
                    Ship Duration *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {["24h", "48h", "7d"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewTimeframe(t as any)}
                        className={`py-2 text-xs border-2 border-pixel font-pixel ${
                          newTimeframe === t 
                            ? "bg-[#d97706] text-white" 
                            : "bg-white text-[#181715] hover:bg-[#fdf2e9]"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-3xs font-pixel text-stone-500 mb-1.5 uppercase">
                      Maker Name
                    </label>
                    <input
                      type="text"
                      placeholder="Sarah"
                      value={newMaker}
                      onChange={(e) => setNewMaker(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-pixel rounded-none bg-white text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-3xs font-pixel text-stone-500 mb-1.5 uppercase">
                      Twitter (X)
                    </label>
                    <input
                      type="text"
                      placeholder="@sarah_dev"
                      value={newTwitter}
                      onChange={(e) => setNewTwitter(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-pixel rounded-none bg-white text-sm focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-3xs font-pixel text-stone-500 mb-1.5 uppercase">
                    Emoji Icon *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="🚀"
                    value={newLogo}
                    onChange={(e) => setNewLogo(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-pixel rounded-none bg-white text-sm focus:outline-none w-20 text-center text-xl"
                  />
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="btn-pixel btn-pixel-primary w-full py-3 text-xs tracking-wider"
                  >
                    Submit Project (Stage 1: $0)
                  </button>
                </div>
              </form>
            </div>

            <div className="text-3xs text-stone-400 mt-6 border-t border-stone-200 pt-4 font-mono">
              * Note: In Stage 1, submissions are 100% free. Once 16 products are queued, the tournament system begins automatically.
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          Dual-Input Voting Modal
         ======================================================== */}
      {votingMatch && votingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-scale-in text-[#181715]">
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
          <div className="relative w-full max-w-md bg-[#faf5ef]/95 backdrop-blur-md border-4 border-pixel shadow-pixel-lg p-6 sm:p-8 rounded-none z-10">
            <h3 className="font-pixel text-xs uppercase mb-1 text-[#181715]">
              Dueling Vote Box
            </h3>
            <span className="text-3xs font-pixel text-[#d97706] block mb-3">
              VOTING FOR: {votingTarget.title}
            </span>
            
            <p className="text-xs text-stone-500 mb-5 leading-relaxed">
              We enforce a **Dual Feedback Loop**. To register your vote, you must bind your account and write positive critique for the winner AND constructive advice for the loser. **Every competitor leaves with real value.**
            </p>

            <form onSubmit={handleVoteSubmit} className="space-y-4">
              {/* Functional Dual Google & GitHub Auth Card */}
              <div className="p-3 bg-[#faf5ef]/80 border-2 border-pixel flex items-center justify-between shadow-pixel-sm">
                <div className="flex items-center space-x-3">
                  <span className="w-8 h-8 bg-stone-100 border border-pixel flex items-center justify-center text-sm font-pixel">
                    {userAuthType === "github" ? "🐙" : "🔑"}
                  </span>
                  <div>
                    <span className="text-3xs font-pixel block text-stone-500">AUTHORIZATION</span>
                    {userLoggedIn ? (
                      <span className="text-3xs font-pixel text-[#d97706]">
                        {mockUserTwitter} <span className="text-stone-400 font-mono">({userAuthType === "github" ? "GitHub" : "Google"})</span>
                      </span>
                    ) : (
                      <span className="text-3xs text-red-650 font-pixel uppercase font-bold text-3xs">Unauthenticated</span>
                    )}
                  </div>
                </div>
                {!userLoggedIn ? (
                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTempAuthType("google");
                        setIsAuthOpen(true);
                      }}
                      className="btn-pixel py-1.5 px-3 text-3xs"
                    >
                      Link Google
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTempAuthType("github");
                        setIsAuthOpen(true);
                      }}
                      className="btn-pixel py-1.5 px-3 text-3xs"
                    >
                      Link GitHub
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-stone-400 hover:text-stone-700 text-3xs underline font-pixel font-bold"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {/* Input 1: Why vote for winner */}
              <div>
                <label className="block text-3xs font-pixel text-stone-500 mb-1.5 uppercase">
                  1. Why are you voting for {votingTarget.title}? (min 10 chars) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g., The core user interface is incredibly fast and intuitive."
                  value={voteWinnerFeedback}
                  onChange={(e) => setVoteWinnerFeedback(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-pixel rounded-none bg-white text-sm focus:outline-none"
                />
                <div className="flex justify-between text-3xs font-mono text-stone-400 mt-1">
                  <span>Chars: {voteWinnerFeedback.length}</span>
                  <span className={voteWinnerFeedback.length >= 10 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
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
                  className="w-full px-3 py-2 border-2 border-[#d97706] rounded-none bg-white text-sm focus:outline-none"
                />
                <div className="flex justify-between text-3xs font-mono text-stone-400 mt-1">
                  <span>Chars: {voteLoserFeedback.length}</span>
                  <span className={voteLoserFeedback.length >= 10 ? "text-emerald-600 font-semibold" : "text-orange-600 font-semibold"}>
                    {voteLoserFeedback.length >= 10 ? "✓ Ready" : `Need ${Math.max(0, 10 - voteLoserFeedback.length)} more`}
                  </span>
                </div>
              </div>

              {voteError && (
                <div className="p-2.5 bg-red-50 text-red-600 text-3xs border border-red-200 font-mono">
                  [ERROR]: {voteError}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-stone-200 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setVotingMatch(null);
                    setVotingTarget(null);
                    setVoteWinnerFeedback("");
                    setVoteLoserFeedback("");
                    setVoteError("");
                  }}
                  className="btn-pixel py-1.5 px-3 text-3xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-pixel btn-pixel-primary py-1.5 px-4 text-3xs"
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
          <div className="relative w-full max-w-sm bg-[#faf5ef]/95 backdrop-blur-md border-4 border-pixel shadow-pixel-lg p-6 sm:p-8 rounded-none z-10 animate-scale-in" style={{ borderColor: '#181715' }}>
            <div className="flex justify-between items-center mb-6 border-b-2 border-pixel pb-3" style={{ borderColor: '#181715' }}>
              <h3 className="font-pixel text-xs uppercase text-[#181715]">
                Link Identity
              </h3>
              <button 
                onClick={() => {
                  setIsAuthOpen(false);
                }}
                className="text-stone-400 hover:text-stone-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-3xs text-stone-500 mb-6 font-mono leading-relaxed">
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
                className="btn-pixel w-full py-3 text-3xs font-pixel border-2 flex items-center justify-center space-x-2 transition-all shadow-pixel-sm"
                style={{ color: '#181715', borderColor: '#181715', backgroundColor: '#faf5ef' }}
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
                className="btn-pixel w-full py-3 text-3xs font-pixel border-2 flex items-center justify-center space-x-2 transition-all shadow-pixel-sm"
                style={{ color: '#181715', borderColor: '#181715', backgroundColor: '#faf5ef' }}
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
              onClick={() => setIsSuccessOpen(false)}
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
            <h2 className="text-3xl sm:text-4xl font-sans font-black tracking-tighter leading-none uppercase mb-4" style={{ color: '#181715' }}>
              {championWinner.logo} {championWinner.title} {championWinner.logo}
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
                        <span className="text-2xl">{c.logo}</span>
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

    </div>
  );
}
