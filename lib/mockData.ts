export interface Product {
  id: string;
  title: string;
  tagline: string;
  url: string;
  shipTimeframe: "24h" | "48h" | "7d";
  makerName: string;
  makerTwitter: string;
  makerAvatar: string;
  logo: string;
  submittedAt: string;
  queueStatus: "waiting" | "active" | "completed";
  votesCount: number;
  creatorUsername?: string;
  creator_uid?: string;
}

export interface Match {
  id: string;
  roundNumber: number; // 1: 16-teams, 2: Quarterfinals, 3: Semifinals, 4: Finals
  productA: Product;
  productB: Product;
  votesA: number;
  votesB: number;
  winnerId?: string;
  votedUserIds: string[]; // Prevents duplicate voting
}

export interface Bracket {
  id: string;
  round1: Match[];
  round2: Match[];
  round3: Match[];
  round4: Match[];
  status: "preparing" | "active" | "completed";
  winner?: Product;
  roundStartedAt?: string; // ISO datetime when the active round was generated/advanced
}

export const SEED_PRODUCTS: Product[] = [
  {
    id: "p1",
    title: "ZenJournal",
    tagline: "Minimalist 24h journaling tool focused on zero-friction thought capturing.",
    url: "https://zenjournal.co",
    shipTimeframe: "24h",
    makerName: "Lucas Kent",
    makerTwitter: "@lucas_codes",
    makerAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces",
    logo: "🌿",
    submittedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  },
  {
    id: "p2",
    title: "LogoCraft",
    tagline: "48h vector logo generator built specifically for solo founders.",
    url: "https://logocraft.ai",
    shipTimeframe: "48h",
    makerName: "Sarah Chen",
    makerTwitter: "@sarah_design",
    makerAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=faces",
    logo: "🎨",
    submittedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  },
  {
    id: "p3",
    title: "QuickCron",
    tagline: "Visual cron job monitoring dashboard shipped in a 24h sprint.",
    url: "https://quickcron.dev",
    shipTimeframe: "24h",
    makerName: "Kenji Sato",
    makerTwitter: "@kenji_dev",
    makerAvatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces",
    logo: "⏱️",
    submittedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  },
  {
    id: "p4",
    title: "CardioAI",
    tagline: "7-day heart rate variability analyzer using your webcam.",
    url: "https://cardioai.fit",
    shipTimeframe: "7d",
    makerName: "Chloe Vance",
    makerTwitter: "@chloe_fit",
    makerAvatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=faces",
    logo: "❤️",
    submittedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  },
  {
    id: "p5",
    title: "TypeFlow",
    tagline: "Keyboard-first Markdown slide deck builder built in 48h.",
    url: "https://typeflow.io",
    shipTimeframe: "48h",
    makerName: "Marc Dupont",
    makerTwitter: "@marc_keyboard",
    makerAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces",
    logo: "⌨️",
    submittedAt: new Date(Date.now() - 3600000 * 1.5).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  },
  {
    id: "p6",
    title: "SiteShot",
    tagline: "High-def screenshot API with full-page scrolling, shipped in 24h.",
    url: "https://siteshot.net",
    shipTimeframe: "24h",
    makerName: "Elena Rostova",
    makerTwitter: "@elena_builds",
    makerAvatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=faces",
    logo: "📸",
    submittedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  },
  {
    id: "p7",
    title: "PromptNest",
    tagline: "7-day prompt manager with categories and variable replacements.",
    url: "https://promptnest.org",
    shipTimeframe: "7d",
    makerName: "Devon Miller",
    makerTwitter: "@devon_prompt",
    makerAvatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&h=100&fit=crop&crop=faces",
    logo: "🪺",
    submittedAt: new Date(Date.now() - 3000000).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  },
  {
    id: "p8",
    title: "ReadSlow",
    tagline: "48h anti-distraction reader allowing only one deep read a day.",
    url: "https://readslow.app",
    shipTimeframe: "48h",
    makerName: "Amara Okoye",
    makerTwitter: "@amara_reads",
    makerAvatar: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=100&h=100&fit=crop&crop=faces",
    logo: "📖",
    submittedAt: new Date(Date.now() - 2000000).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  },
  {
    id: "p9",
    title: "MockSchema",
    tagline: "24h mock SQL data generator supporting realistic schemas.",
    url: "https://mockschema.xyz",
    shipTimeframe: "24h",
    makerName: "Sam Wilson",
    makerTwitter: "@sam_data",
    makerAvatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop&crop=faces",
    logo: "📁",
    submittedAt: new Date(Date.now() - 1000000).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  },
  {
    id: "p10",
    title: "PixelPure",
    tagline: "7-day lossless image compressor running fully in-browser.",
    url: "https://pixelpure.co",
    shipTimeframe: "7d",
    makerName: "Yuki Tanaka",
    makerTwitter: "@yuki_pixels",
    makerAvatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=faces",
    logo: "💎",
    submittedAt: new Date(Date.now() - 500000).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  },
  {
    id: "p11",
    title: "TailwindGlass",
    tagline: "48h interactive glassmorphism editor with one-click CSS export.",
    url: "https://tailwindglass.com",
    shipTimeframe: "48h",
    makerName: "Filippo Rossi",
    makerTwitter: "@filippo_ui",
    makerAvatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&h=100&fit=crop&crop=faces",
    logo: "🥛",
    submittedAt: new Date(Date.now() - 250000).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  },
  {
    id: "p12",
    title: "QuickVocal",
    tagline: "24h voice recorder that transcribes speech to clean Markdown notes.",
    url: "https://quickvocal.ai",
    shipTimeframe: "24h",
    makerName: "Aria Thorne",
    makerTwitter: "@aria_voice",
    makerAvatar: "https://images.unsplash.com/photo-1534751516642-a131ffd107fd?w=100&h=100&fit=crop&crop=faces",
    logo: "🎙️",
    submittedAt: new Date(Date.now() - 50000).toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  }
];
