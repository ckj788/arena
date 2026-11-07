"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withDeadline } from "@/lib/requestSafety";
import { isSubmissionPath, OAUTH_RETURN_TO_KEY, OAUTH_SUBMISSION_TARGET_KEY } from "@/lib/browserOAuth";
import AuthProviderButton from "./AuthProviderButton";
import ClashLogo from "./ClashLogo";
import useModalAccessibility from "./useModalAccessibility";

type AuthStatus = "checking" | "signed-in" | "signed-out" | "error";
type SubmissionAccess = { status: AuthStatus; userId: string | null; requestSubmission: (path?: string) => Promise<void> };
export const SubmissionAccessContext = createContext<SubmissionAccess | null>(null);

export function useSubmissionAccess() {
  const access = useContext(SubmissionAccessContext);
  if (!access) throw new Error("SubmissionAccessProvider is required.");
  return access;
}

export default function SubmissionAccessProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [userId, setUserId] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [provider, setProvider] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState("");
  const checking = useRef(false);
  const starting = useRef(false);
  const destinationRef = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabase) { queueMicrotask(() => setStatus("signed-out")); return; }
    let active = true;
    let changed = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      changed = true;
      if (active) { setUserId(session?.user.id ?? null); setStatus(session ? "signed-in" : "signed-out"); }
      if (active && session && destinationRef.current) {
        const path = destinationRef.current;
        destinationRef.current = null;
        setDestination(null);
        router.push(path);
      }
    });
    void withDeadline(supabase.auth.getSession(), 10_000).then(result => {
      if (active && !changed) {
        setUserId(result.data.session?.user.id ?? null);
        setStatus(result.error ? "error" : result.data.session ? "signed-in" : "signed-out");
      }
    }).catch(() => { if (active && !changed) setStatus("error"); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [router]);

  function close() {
    if (starting.current) return;
    destinationRef.current = null;
    setDestination(null);
    setError("");
  }
  useModalAccessibility(destination !== null, dialogRef, close);

  async function requestSubmission(path = "/submit") {
    if (checking.current) return;
    if (!isSubmissionPath(path)) throw new Error("Invalid submission destination.");
    if (status === "signed-in" && userId) { router.push(path); return; }
    checking.current = true;
    setError("");
    try {
      if (!supabase) throw new Error("Sign-in is not configured. Please try again once it is available.");
      const result = await withDeadline(supabase.auth.getSession(), 10_000);
      if (result.error) throw result.error;
      setUserId(result.data.session?.user.id ?? null);
      setStatus(result.data.session ? "signed-in" : "signed-out");
      if (result.data.session) { router.push(path); return; }
    } catch {
      setStatus("error");
      setError("Could not verify your sign-in. Please sign in to continue.");
    } finally { checking.current = false; }
    destinationRef.current = path;
    setDestination(path);
  }

  async function signIn(selected: "google" | "github") {
    if (starting.current || !destinationRef.current) return;
    starting.current = true;
    setProvider(selected);
    setError("");
    try {
      if (!supabase) throw new Error("Sign-in is not configured.");
      sessionStorage.setItem(OAUTH_RETURN_TO_KEY, `${window.location.pathname}${window.location.search}`);
      sessionStorage.setItem(OAUTH_SUBMISSION_TARGET_KEY, destinationRef.current);
      const { data, error } = await withDeadline(supabase.auth.signInWithOAuth({ provider: selected,
        options: { redirectTo: new URL("/auth/callback", window.location.origin).href, skipBrowserRedirect: true },
      }), 15_000);
      if (error) throw error;
      if (!data.url) throw new Error("Could not open sign-in.");
      window.location.assign(data.url);
    } catch (failure) {
      sessionStorage.removeItem(OAUTH_RETURN_TO_KEY);
      sessionStorage.removeItem(OAUTH_SUBMISSION_TARGET_KEY);
      setError(failure instanceof Error ? failure.message : "Could not open sign-in. Please try again.");
      starting.current = false;
      setProvider(null);
    }
  }

  return <SubmissionAccessContext.Provider value={{ status, userId, requestSubmission }}>
    {children}
    {destination && <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={close} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="submission-signin-heading" tabIndex={-1} className="product-form-dialog auth-dialog relative z-10 w-full max-w-sm rounded-2xl border border-zinc-200/90 bg-white p-8 text-zinc-900 shadow-xl">
        <button type="button" aria-label="Close sign in" disabled={provider !== null} onClick={close} className="auth-close absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100">×</button>
        <div className="flex flex-col items-center text-center"><ClashLogo size="md" /><h2 id="submission-signin-heading" className="mt-5 text-2xl font-semibold tracking-tight">Your launch starts here.</h2><p className="mt-3 text-sm leading-6 text-zinc-500">Sign in to choose your plan and submit your product.</p></div>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        <div className="mt-7 space-y-3">{(["google", "github"] as const).map(name => <AuthProviderButton key={name} provider={name} busy={provider === name} disabled={provider !== null} onClick={() => void signIn(name)} />)}</div>
      </div>
    </div>}
  </SubmissionAccessContext.Provider>;
}
