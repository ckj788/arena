"use client";

import React, { useState } from 'react';

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        readOnly
        value={value}
        onClick={(e) => (e.target as HTMLInputElement).select()}
        className="w-full h-10 bg-zinc-950 border border-white/[0.08] rounded-md pl-3 pr-24 text-[10px] font-mono text-zinc-400 focus:outline-none focus:border-zinc-400 select-all leading-normal"
      />
      <button
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
    </div>
  );
}
