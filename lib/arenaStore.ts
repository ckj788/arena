import { Product, Match, Bracket, SEED_PRODUCTS } from "./mockData";
import { supabase } from "./supabaseClient";

const PRODUCTS_KEY = "arena_products_v1";
const BRACKET_KEY = "arena_bracket_v1";

// ========================================================
// 1. 本地 LOCAL STORAGE 引擎 (保留原样，作为完美降级机制)
// ========================================================

export function loadProducts(): Product[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(PRODUCTS_KEY);
  if (!data) {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify([]));
    return [];
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export function saveProducts(products: Product[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}

export function loadBracket(): Bracket | null {
  if (typeof window === "undefined") return null;
  const data = localStorage.getItem(BRACKET_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

export function saveBracket(bracket: Bracket | null) {
  if (typeof window === "undefined") return;
  if (bracket === null) {
    localStorage.removeItem(BRACKET_KEY);
  } else {
    localStorage.setItem(BRACKET_KEY, JSON.stringify(bracket));
  }
}

// 自动生成 16 强配对
export function buildInitialBracket(products: Product[]): Bracket {
  const waitingProducts = products.filter(p => p.queueStatus === "waiting");
  const activeProducts = waitingProducts.slice(0, 16);
  const round1: Match[] = [];
  for (let i = 0; i < 8; i++) {
    round1.push({
      id: `r1_m${i + 1}`,
      roundNumber: 1,
      productA: activeProducts[i * 2],
      productB: activeProducts[i * 2 + 1],
      votesA: 0,
      votesB: 0,
      votedUserIds: []
    });
  }

  const bracket: Bracket = {
    id: `b_${Date.now()}`,
    round1,
    round2: [],
    round3: [],
    round4: [],
    status: "preparing",
    roundStartedAt: new Date().toISOString()
  };

  const activeIds = new Set(activeProducts.map(p => p.id));
  const updatedProducts = products.map(p => {
    if (activeIds.has(p.id)) {
      return { ...p, queueStatus: "active" as const };
    }
    return p;
  });
  saveProducts(updatedProducts);
  saveBracket(bracket);

  return bracket;
}

// 模拟自动为对局增加一些票数 (Sandbox 模式)
export function injectMockVotes(bracket: Bracket): Bracket {
  const currentRound = getActiveRound(bracket);
  let matches: Match[] = [];
  if (currentRound === 1) matches = bracket.round1;
  else if (currentRound === 2) matches = bracket.round2;
  else if (currentRound === 3) matches = bracket.round3;
  else if (currentRound === 4) matches = bracket.round4;

  const updatedMatches = matches.map(m => {
    if (m.winnerId) return m;
    const incA = Math.random() > 0.5 ? Math.floor(Math.random() * 3) + 1 : 0;
    const incB = Math.random() > 0.5 ? Math.floor(Math.random() * 3) + 1 : 0;
    return {
      ...m,
      votesA: m.votesA + incA,
      votesB: m.votesB + incB
    };
  });

  if (currentRound === 1) bracket.round1 = updatedMatches;
  else if (currentRound === 2) bracket.round2 = updatedMatches;
  else if (currentRound === 3) bracket.round3 = updatedMatches;
  else if (currentRound === 4) bracket.round4 = updatedMatches;

  saveBracket(bracket);
  return { ...bracket };
}

// 获取当前比赛进行到第几轮
export function getActiveRound(bracket: Bracket): number {
  if (bracket.status !== "active") return 0;
  if (bracket.round4.length > 0 && bracket.round4[0].winnerId) return 4;
  if (bracket.round4.length > 0) return 4;
  if (bracket.round3.length > 0 && bracket.round3[0].winnerId && bracket.round3[1].winnerId) return 4;
  if (bracket.round3.length > 0) return 3;
  if (bracket.round2.length > 0 && bracket.round2[0].winnerId && bracket.round2[1].winnerId && bracket.round2[2].winnerId && bracket.round2[3].winnerId) return 3;
  if (bracket.round2.length > 0) return 2;
  if (bracket.round1.every(m => m.winnerId)) return 2;
  return 1;
}

// 推进比赛轮次
export function advanceTournamentRound(bracket: Bracket): Bracket {
  const currentRound = getActiveRound(bracket);
  bracket.roundStartedAt = new Date().toISOString();

  const settleMatches = (matches: Match[]): Match[] => {
    return matches.map(m => {
      if (m.winnerId) return m;
      let winnerId = "";
      if (m.votesA > m.votesB) {
        winnerId = m.productA.id;
      } else if (m.votesB > m.votesA) {
        winnerId = m.productB.id;
      } else {
        winnerId = Math.random() > 0.5 ? m.productA.id : m.productB.id;
      }
      return { ...m, winnerId };
    });
  };

  if (currentRound === 1) {
    bracket.round1 = settleMatches(bracket.round1);
    const winners = bracket.round1.map(m => m.winnerId === m.productA.id ? m.productA : m.productB);
    const round2: Match[] = [];
    for (let i = 0; i < 4; i++) {
      round2.push({
        id: `r2_m${i + 1}`,
        roundNumber: 2,
        productA: winners[i * 2],
        productB: winners[i * 2 + 1],
        votesA: 0,
        votesB: 0,
        votedUserIds: []
      });
    }
    bracket.round2 = round2;
  } 
  else if (currentRound === 2) {
    bracket.round2 = settleMatches(bracket.round2);
    const winners = bracket.round2.map(m => m.winnerId === m.productA.id ? m.productA : m.productB);
    const round3: Match[] = [];
    for (let i = 0; i < 2; i++) {
      round3.push({
        id: `r3_m${i + 1}`,
        roundNumber: 3,
        productA: winners[i * 2],
        productB: winners[i * 2 + 1],
        votesA: 0,
        votesB: 0,
        votedUserIds: []
      });
    }
    bracket.round3 = round3;
  }
  else if (currentRound === 3) {
    bracket.round3 = settleMatches(bracket.round3);
    const winners = bracket.round3.map(m => m.winnerId === m.productA.id ? m.productA : m.productB);
    const round4: Match[] = [{
      id: `r4_m1`,
      roundNumber: 4,
      productA: winners[0],
      productB: winners[1],
      votesA: 0,
      votesB: 0,
      votedUserIds: []
    }];
    bracket.round4 = round4;
  }
  else if (currentRound === 4) {
    bracket.round4 = settleMatches(bracket.round4);
    const finalWinner = bracket.round4[0].winnerId === bracket.round4[0].productA.id 
      ? bracket.round4[0].productA 
      : bracket.round4[0].productB;
    
    bracket.status = "completed";
    bracket.winner = finalWinner;

    const products = loadProducts();
    const updated = products.map(p => {
      if (bracket.round1.some(m => m.productA.id === p.id || m.productB.id === p.id)) {
        return { ...p, queueStatus: "completed" as const };
      }
      return p;
    });
    saveProducts(updated);
  }

  saveBracket(bracket);
  return { ...bracket };
}

// 快速注入 mock Competitor
export function addDummyMaker(products: Product[]): Product[] {
  const names = ["Oliver", "Emma", "Sophia", "James", "Mia", "Leo", "John", "David", "Grace", "Jack", "Alex", "Zoe"];
  const projects = ["TaskPulse", "Designify", "MailSniper", "ScribeAI", "SchemaForge", "FormFlow", "IconSpark", "DocuGen", "SiteFlow", "SpeedPDF"];
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
  const randomProject = projects[Math.floor(Math.random() * projects.length)] + " " + emojis[Math.floor(Math.random() * emojis.length)];
  const randomTagline = taglines[Math.floor(Math.random() * taglines.length)];
  const randomId = `p_dummy_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

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
    submittedAt: new Date().toISOString(),
    queueStatus: "waiting",
    votesCount: 0
  };

  const updated = [...products, newProduct];
  saveProducts(updated);
  return updated;
}


// ========================================================
// 2. SUPABASE 异步联机云数据引擎 (对齐 'shipandbattle_' 前缀)
// ========================================================

// 映射器 1：本地 Product -> DB 产品行
function toDbProduct(p: Product) {
  return {
    shipandbattle_id: p.id,
    shipandbattle_title: p.title,
    shipandbattle_tagline: p.tagline,
    shipandbattle_url: p.url,
    shipandbattle_ship_timeframe: p.shipTimeframe,
    shipandbattle_maker_name: p.makerName,
    shipandbattle_maker_twitter: p.makerTwitter,
    shipandbattle_maker_avatar: p.makerAvatar,
    shipandbattle_logo: p.logo,
    shipandbattle_submitted_at: p.submittedAt,
    shipandbattle_queue_status: p.queueStatus,
    shipandbattle_votes_count: p.votesCount
  };
}

// 映射器 2：DB 产品行 -> 本地 Product
function fromDbProduct(row: any): Product {
  return {
    id: row.shipandbattle_id,
    title: row.shipandbattle_title,
    tagline: row.shipandbattle_tagline,
    url: row.shipandbattle_url,
    shipTimeframe: row.shipandbattle_ship_timeframe,
    makerName: row.shipandbattle_maker_name,
    makerTwitter: row.shipandbattle_maker_twitter,
    makerAvatar: row.shipandbattle_maker_avatar,
    logo: row.shipandbattle_logo,
    submittedAt: row.shipandbattle_submitted_at,
    queueStatus: row.shipandbattle_queue_status,
    votesCount: row.shipandbattle_votes_count
  };
}

// 映射器 3：本地 Match -> DB 对局行
function toDbMatch(m: Match, bracketId: string) {
  return {
    shipandbattle_id: m.id,
    shipandbattle_bracket_id: bracketId,
    shipandbattle_round_number: m.roundNumber,
    shipandbattle_product_a_id: m.productA.id,
    shipandbattle_product_b_id: m.productB.id,
    shipandbattle_votes_a: m.votesA,
    shipandbattle_votes_b: m.votesB,
    shipandbattle_winner_id: m.winnerId || null,
    shipandbattle_voted_user_ids: m.votedUserIds
  };
}

// 映射器 4：DB 对局行 -> 本地 Match
function fromDbMatch(row: any, productA: Product, productB: Product): Match {
  return {
    id: row.shipandbattle_id,
    roundNumber: row.shipandbattle_round_number,
    productA,
    productB,
    votesA: row.shipandbattle_votes_a,
    votesB: row.shipandbattle_votes_b,
    winnerId: row.shipandbattle_winner_id || undefined,
    votedUserIds: row.shipandbattle_voted_user_ids || []
  };
}

// 1. 获取云端所有参赛项目列表
export async function fetchCloudProducts(): Promise<Product[]> {
  if (!supabase) return loadProducts();
  const { data, error } = await supabase
    .from("shipandbattle_products")
    .select("*")
    .order("shipandbattle_submitted_at", { ascending: true });

  if (error) {
    console.error("Error fetching cloud products:", error);
    return loadProducts();
  }
  return data.map(fromDbProduct);
}

// 2. 上传/更新单个项目至云端
export async function upsertCloudProduct(p: Product): Promise<void> {
  if (!supabase) {
    const prods = loadProducts();
    const idx = prods.findIndex(x => x.id === p.id);
    if (idx >= 0) prods[idx] = p;
    else prods.push(p);
    saveProducts(prods);
    return;
  }
  const { error } = await supabase
    .from("shipandbattle_products")
    .upsert(toDbProduct(p));

  if (error) {
    console.error("Error upserting product:", error);
  }
}

// 3. 上载整个对局树与名下对局
export async function saveCloudBracket(b: Bracket): Promise<void> {
  if (!supabase) {
    saveBracket(b);
    return;
  }

  // A. 插入或更新 Bracket 根节点
  const { error: bErr } = await supabase
    .from("shipandbattle_brackets")
    .upsert({
      shipandbattle_id: b.id,
      shipandbattle_status: b.status,
      shipandbattle_winner_id: b.winner?.id || null,
      shipandbattle_round_started_at: b.roundStartedAt || new Date().toISOString()
    });

  if (bErr) {
    console.error("Error upserting bracket:", bErr);
    return;
  }

  // B. 拍平并上传所有对局
  const allMatches: Match[] = [
    ...b.round1,
    ...b.round2,
    ...b.round3,
    ...b.round4
  ];

  if (allMatches.length === 0) return;

  const dbMatches = allMatches.map(m => toDbMatch(m, b.id));
  const { error: mErr } = await supabase
    .from("shipandbattle_matches")
    .upsert(dbMatches);

  if (mErr) {
    console.error("Error upserting matches:", mErr);
  }

  // C. 自动在云端更新所有参赛选手的排队状态 (preparing/active -> active, completed -> completed)
  if (b.round1.length > 0) {
    const targetStatus = b.status === "completed" ? "completed" : "active";
    const productMap = new Map<string, Product>();
    
    b.round1.forEach(m => {
      productMap.set(m.productA.id, { ...m.productA, queueStatus: targetStatus });
      productMap.set(m.productB.id, { ...m.productB, queueStatus: targetStatus });
    });

    const dbProds = Array.from(productMap.values()).map(toDbProduct);
    const { error: pErr } = await supabase
      .from("shipandbattle_products")
      .upsert(dbProds);

    if (pErr) {
      console.error("Error updating participating product queue statuses in cloud:", pErr);
    }
  }
}

// 4. 获取当前云端活跃的 Bracket 晋级树
export async function fetchCloudBracket(): Promise<Bracket | null> {
  if (!supabase) return loadBracket();

  // A. 先抓取当前活跃（集结中/进行中）的最近一条对局树记录
  const { data: bData, error: bErr } = await supabase
    .from("shipandbattle_brackets")
    .select("*")
    .in("shipandbattle_status", ["preparing", "active"])
    .order("shipandbattle_created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (bErr) {
    console.error("Error fetching active bracket:", bErr);
    return loadBracket();
  }

  if (!bData) return null;

  // B. 抓取该对局树下的所有场次
  const { data: mData, error: mErr } = await supabase
    .from("shipandbattle_matches")
    .select("*")
    .eq("shipandbattle_bracket_id", bData.shipandbattle_id);

  if (mErr) {
    console.error("Error fetching bracket matches:", mErr);
    return null;
  }

  // C. 载入云端产品库以便装配成嵌套对象
  const allProducts = await fetchCloudProducts();
  const prodMap = new Map<string, Product>();
  allProducts.forEach(p => prodMap.set(p.id, p));

  const round1: Match[] = [];
  const round2: Match[] = [];
  const round3: Match[] = [];
  const round4: Match[] = [];

  mData.forEach(m => {
    const prodA = prodMap.get(m.shipandbattle_product_a_id);
    const prodB = prodMap.get(m.shipandbattle_product_b_id);
    if (!prodA || !prodB) return;

    const matchObj = fromDbMatch(m, prodA, prodB);
    if (m.shipandbattle_round_number === 1) round1.push(matchObj);
    else if (m.shipandbattle_round_number === 2) round2.push(matchObj);
    else if (m.shipandbattle_round_number === 3) round3.push(matchObj);
    else if (m.shipandbattle_round_number === 4) round4.push(matchObj);
  });

  // 排序以防乱序
  const sortByMatchId = (x: Match, y: Match) => x.id.localeCompare(y.id);
  round1.sort(sortByMatchId);
  round2.sort(sortByMatchId);
  round3.sort(sortByMatchId);
  round4.sort(sortByMatchId);

  const finalWinner = bData.shipandbattle_winner_id ? prodMap.get(bData.shipandbattle_winner_id) : undefined;

  return {
    id: bData.shipandbattle_id,
    status: bData.shipandbattle_status,
    winner: finalWinner,
    roundStartedAt: bData.shipandbattle_round_started_at,
    round1,
    round2,
    round3,
    round4
  };
}

// 5. 永久清除云端对局数据并重置
export async function clearCloudData(): Promise<void> {
  if (!supabase) return;
  // 直接清空各关联表
  await supabase.from("shipandbattle_votes").delete().neq("shipandbattle_feedback_winner", "NONSENSE_STRING_TRIGGER");
  await supabase.from("shipandbattle_matches").delete().neq("shipandbattle_round_number", -100);
  await supabase.from("shipandbattle_brackets").delete().neq("shipandbattle_status", "NONSENSE_STRING_TRIGGER");
  await supabase.from("shipandbattle_products").delete().neq("shipandbattle_title", "NONSENSE_STRING_TRIGGER");
}

const PAST_CHAMPS_KEY = "arena_past_champions_v1";

export function loadLocalPastChampions(): Product[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(PAST_CHAMPS_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export function saveLocalPastChampions(champs: Product[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PAST_CHAMPS_KEY, JSON.stringify(champs));
}

// 6. 获取云端所有历史完结赛季的冠军项目
export async function fetchCloudPastChampions(): Promise<Product[]> {
  if (!supabase) {
    return loadLocalPastChampions();
  }
  const { data: bData, error: bErr } = await supabase
    .from("shipandbattle_brackets")
    .select("shipandbattle_winner_id")
    .eq("shipandbattle_status", "completed");
  
  if (bErr || !bData) return [];
  const winnerIds = bData.map(x => x.shipandbattle_winner_id).filter(Boolean);
  if (winnerIds.length === 0) return [];
  
  const { data: pData, error: pErr } = await supabase
    .from("shipandbattle_products")
    .select("*")
    .in("shipandbattle_id", winnerIds);
    
  if (pErr || !pData) return [];
  return pData.map(fromDbProduct);
}
