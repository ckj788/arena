"use client";

import React, { useEffect, useRef, useState } from 'react';
import { withDeadline } from '@/lib/requestSafety';

interface CopyLinkProps {
  value: string;
}

const CopyIcon = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const CheckIcon = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

export default function CopyLink({ value }: CopyLinkProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handleCopy = async () => {
    try {
      await withDeadline(navigator.clipboard.writeText(value), 3_000);
      setCopied(true);
      setFailed(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
      input.current?.focus();
      input.current?.select();
    }
  };

  return (
    <div className="relative flex items-center">
      <input
        ref={input}
        aria-label="Share link"
        type="text"
        readOnly
        value={value}
        onClick={(e) => (e.target as HTMLInputElement).select()}
        className="w-full h-10 bg-zinc-950 border border-white/[0.08] rounded-md pl-3 pr-24 text-[10px] font-mono text-zinc-400 focus:outline-none focus:border-zinc-400 select-all leading-normal"
      />
      <button
        type="button"
        onClick={handleCopy}
        className={`absolute right-1 top-1 bottom-1 px-3.5 rounded-[4px] flex items-center justify-center gap-1 transition-all duration-150 cursor-pointer font-mono text-[9px] uppercase tracking-wider font-bold ${
          copied 
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
            : 'bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-zinc-300 hover:text-white'
        }`}
      >
        {copied ? (
          <>
            <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>COPIED</span>
          </>
        ) : (
          <>
            <CopyIcon className="w-3.5 h-3.5" />
            <span>COPY</span>
          </>
        )}
      </button>
      <span role="status" className={failed ? "absolute top-full mt-1 text-xs text-zinc-300" : "sr-only"}>{failed ? "Select and copy the link manually." : copied ? "Link copied." : ""}</span>
    </div>
  );
}
