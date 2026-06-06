import React from 'react';

interface ClashLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | number;
}

export default function ClashLogo({ className = "", size = "md" }: ClashLogoProps) {
  // Map preset sizes: sm (28px), md (36px), lg (48px)
  const sizeClasses = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-12 h-12"
  };

  const isPreset = typeof size === 'string';
  const customStyle = isPreset ? {} : { width: size, height: size };
  const containerClass = isPreset ? sizeClasses[size as 'sm' | 'md' | 'lg'] : "";

  return (
    <div 
      style={customStyle} 
      className={`relative group select-none flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-105 ${containerClass} ${className}`}
    >
      {/* Soft glowing background aura */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#06B6D4] via-[#6366F1] to-[#8B5CF6] rounded-lg blur-md opacity-40 group-hover:opacity-100 transition-opacity duration-300 animate-pulse" />
      
      {/* Obsidian background logo container */}
      <div className="relative w-full h-full rounded-lg bg-[#121215] border border-white/[0.12] flex items-center justify-center overflow-hidden">
        <svg 
          viewBox="0 0 100 100" 
          className="w-2/3 h-2/3" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Cyan-blue gradient wing on the left */}
            <linearGradient id="logo-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22D3EE" />
              <stop offset="100%" stopColor="#0891B2" />
            </linearGradient>
            
            {/* Flowing purple gradient wing on the right */}
            <linearGradient id="logo-purple" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#A78BFA" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
            
            {/* Core energy gold gradient */}
            <linearGradient id="logo-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
          </defs>

          {/* Left collision wing (Cyan Wing) */}
          <path d="M45 15 L20 40 L45 65 Z" fill="url(#logo-cyan)" opacity="0.85" />
          
          {/* Right collision wing (Purple Wing) */}
          <path d="M55 35 L80 60 L55 85 Z" fill="url(#logo-purple)" opacity="0.95" />
          
          {/* Central Energy Flash */}
          <polygon 
            points="45,40 55,30 55,48 45,58" 
            fill="url(#logo-gold)" 
            className="animate-pulse" 
          />
          
          {/* Aesthetic Focus Flare */}
          <circle 
            cx="50" 
            cy="45" 
            r="4" 
            fill="#FFFFFF" 
            className="animate-ping" 
            style={{ animationDuration: '2.5s' }} 
          />
        </svg>
      </div>
    </div>
  );
}

