"use client";

import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";

export default function AuthDebugPage() {
  const [status, setStatus] = useState<string>("Loading...");
  const [session, setSession] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    setLogs((prev) => [...prev, `[${ts}] ${msg}`]);
  };

  useEffect(() => {
    if (!supabase) {
      setStatus("❌ Supabase not configured");
      return;
    }
    setStatus("✅ Supabase connected");
    addLog(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
    addLog(`Current URL: ${window.location.href}`);
    addLog(`Hash: ${window.location.hash || "(empty)"}`);
    addLog(`Search: ${window.location.search || "(empty)"}`);

    // Check for error params in URL
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    const errorDesc = urlParams.get("error_description");
    const code = urlParams.get("code");

    if (error) {
      addLog(`⚠️ ERROR in URL: ${error}`);
      addLog(`⚠️ Description: ${errorDesc}`);
    }

    if (code) {
      addLog(`🔑 Auth code found in URL: ${code.substring(0, 20)}...`);
      addLog("Attempting exchangeCodeForSession...");
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: err }) => {
        if (err) {
          addLog(`❌ exchangeCodeForSession failed: ${err.message}`);
        } else {
          addLog(`✅ exchangeCodeForSession succeeded!`);
          addLog(`User: ${data.session?.user?.email}`);
          setSession(data.session);
        }
      });
    }

    // Check for hash tokens
    const hash = window.location.hash.substring(1);
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken) {
        addLog(`🔑 Access token found in hash: ${accessToken.substring(0, 20)}...`);
        if (refreshToken) {
          addLog("Attempting setSession with hash tokens...");
          supabase.auth
            .setSession({ access_token: accessToken, refresh_token: refreshToken })
            .then(({ data, error: err }) => {
              if (err) {
                addLog(`❌ setSession failed: ${err.message}`);
              } else {
                addLog(`✅ setSession succeeded!`);
                addLog(`User: ${data.session?.user?.email}`);
                setSession(data.session);
              }
            });
        }
      }
      if (hashParams.get("error")) {
        addLog(`⚠️ ERROR in hash: ${hashParams.get("error")}`);
        addLog(`⚠️ Description: ${hashParams.get("error_description")}`);
      }
    }

    // Get current session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        addLog(`📋 Existing session: ${data.session.user?.email} (${data.session.user?.app_metadata?.provider})`);
        setSession(data.session);
      } else {
        addLog("📋 No existing session");
      }
    });
  }, []);

  const testGoogleOAuth = async () => {
    if (!supabase) return;
    addLog("--- Testing Google OAuth URL generation ---");

    // Test 1: implicit flow URL
    addLog("Generating Google OAuth URL via signInWithOAuth...");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth-debug`,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      addLog(`❌ signInWithOAuth error: ${error.message}`);
    } else if (data?.url) {
      addLog(`✅ Generated URL: ${data.url.substring(0, 120)}...`);
      addLog(`Full URL length: ${data.url.length}`);

      // Parse URL to check params
      const url = new URL(data.url);
      addLog(`  provider: ${url.searchParams.get("provider")}`);
      addLog(`  redirect_to: ${url.searchParams.get("redirect_to")}`);
      addLog(`  code_challenge: ${url.searchParams.get("code_challenge") ? "YES" : "NO"}`);
      addLog(`  code_challenge_method: ${url.searchParams.get("code_challenge_method") || "N/A"}`);
      addLog(`  response_type: ${url.searchParams.get("response_type") || "N/A"}`);
      addLog("");
      addLog("🚀 Opening Google OAuth in new tab...");
      addLog("Check the new tab — does it redirect back here with tokens or error?");
      window.open(data.url, "_blank");
    }
  };

  const testGithubOAuth = async () => {
    if (!supabase) return;
    addLog("--- Testing GitHub OAuth URL generation ---");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth-debug`,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      addLog(`❌ signInWithOAuth error: ${error.message}`);
    } else if (data?.url) {
      addLog(`✅ Generated URL: ${data.url.substring(0, 120)}...`);
      const url = new URL(data.url);
      addLog(`  provider: ${url.searchParams.get("provider")}`);
      addLog(`  redirect_to: ${url.searchParams.get("redirect_to")}`);
      addLog(`  code_challenge: ${url.searchParams.get("code_challenge") ? "YES" : "NO"}`);
      addLog("");
      addLog("🚀 Opening GitHub OAuth in new tab...");
      window.open(data.url, "_blank");
    }
  };

  const checkSupabaseCallback = () => {
    const callbackUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`;
    addLog("--- Supabase Callback Info ---");
    addLog(`Supabase callback URL (must be in Google Cloud Console):`);
    addLog(`  ${callbackUrl}`);
    addLog("");
    addLog("Go to Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID");
    addLog("Make sure this EXACT URL is in 'Authorized redirect URIs':");
    addLog(`  ${callbackUrl}`);
    addLog("");
    addLog("Also check Supabase Dashboard → Authentication → URL Configuration:");
    addLog(`  Site URL should be: ${window.location.origin}`);
    addLog(`  Redirect URLs should include: ${window.location.origin}`);
  };

  return (
    <div style={{ fontFamily: "monospace", padding: 32, background: "#0a0a0a", color: "#0f0", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>🔧 Auth Debug Console</h1>

      <div style={{ marginBottom: 16, padding: 12, background: "#111", border: "1px solid #333" }}>
        <strong>Status:</strong> {status}
        {session && (
          <div style={{ color: "#0ff", marginTop: 8 }}>
            <strong>Session:</strong> {session.user?.email} ({session.user?.app_metadata?.provider})
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button
          onClick={testGoogleOAuth}
          style={{
            padding: "8px 16px",
            background: "#333",
            color: "#fff",
            border: "1px solid #555",
            cursor: "pointer",
          }}
        >
          🔑 Test Google OAuth
        </button>
        <button
          onClick={testGithubOAuth}
          style={{
            padding: "8px 16px",
            background: "#333",
            color: "#fff",
            border: "1px solid #555",
            cursor: "pointer",
          }}
        >
          🐙 Test GitHub OAuth
        </button>
        <button
          onClick={checkSupabaseCallback}
          style={{
            padding: "8px 16px",
            background: "#333",
            color: "#fff",
            border: "1px solid #555",
            cursor: "pointer",
          }}
        >
          📋 Show Callback URLs
        </button>
        <button
          onClick={() => setLogs([])}
          style={{
            padding: "8px 16px",
            background: "#300",
            color: "#f88",
            border: "1px solid #555",
            cursor: "pointer",
          }}
        >
          🗑 Clear Logs
        </button>
      </div>

      <div
        style={{
          background: "#111",
          border: "1px solid #333",
          padding: 16,
          maxHeight: 600,
          overflow: "auto",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {logs.length === 0 ? (
          <span style={{ color: "#666" }}>Click a test button above...</span>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              style={{
                color: log.includes("❌")
                  ? "#f44"
                  : log.includes("⚠️")
                  ? "#fa0"
                  : log.includes("✅")
                  ? "#0f0"
                  : log.includes("---")
                  ? "#0ff"
                  : "#aaa",
              }}
            >
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
