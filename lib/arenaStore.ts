import { Product, Match, Bracket, SEED_PRODUCTS } from "./mockData";
import { supabase, DB_PREFIX } from "./supabaseClient";

const PRODUCTS_KEY = "arena_products_v1";
const BRACKET_KEY = "arena_bracket_v1";

// ========================================================
// 1. 本地 LOCAL STORAGE 引擎 (保留原样，作为完美降级机制)
// ========================================================

export function loadProducts(): Product[] {
  if (typeof window === "undefined") return SEED_PRODUCTS;
  const data = localStorage.getItem(PRODUCTS_KEY);
  if (!data) {
    try {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(SEED_PRODUCTS));
    } catch (e) {}
    return SEED_PRODUCTS;
  }
  try {
    const parsed = JSON.parse(data);
    return parsed && parsed.length > 0 ? parsed : SEED_PRODUCTS;
  } catch (e) {
    return SEED_PRODUCTS;
  }
}

export function saveProducts(products: Product[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  } catch (e) {
    console.warn("localStorage quota exceeded for products list. Clearing large logo cache to optimize storage.");
    // Fallback: Strip large Base64 logos to fit within quota
    const optimized = products.map(p => {
      if (p.logo && p.logo.startsWith("data:image") && p.logo.length > 30000) {
        return { ...p, logo: "🚀" };
      }
      return p;
    });
    try {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(optimized));
    } catch (err) {
      console.error("Failed to save products to localStorage even after optimization:", err);
    }
  }
}

export function loadBracket(): Bracket | null {
  if (typeof window === "undefined") {
    return buildInitialBracket(SEED_PRODUCTS).bracket;
  }
  const data = localStorage.getItem(BRACKET_KEY);
  if (!data) return buildInitialBracket(SEED_PRODUCTS).bracket;
  try {
    const parsed = JSON.parse(data);
    return parsed || buildInitialBracket(SEED_PRODUCTS).bracket;
  } catch (e) {
    return buildInitialBracket(SEED_PRODUCTS).bracket;
  }
}

export function saveBracket(bracket: Bracket | null) {
  if (typeof window === "undefined") return;
  if (bracket === null) {
    try {
      localStorage.removeItem(BRACKET_KEY);
    } catch (e) {}
  } else {
    try {
      localStorage.setItem(BRACKET_KEY, JSON.stringify(bracket));
    } catch (e) {
      console.warn("localStorage quota exceeded for bracket. Clearing large logo cache to optimize storage.");
      
      const optimizeProduct = (p: Product): Product => {
        if (p.logo && p.logo.startsWith("data:image") && p.logo.length > 30000) {
          return { ...p, logo: "🚀" };
        }
        return p;
      };

      const optimizeMatch = (m: Match): Match => {
        return {
          ...m,
          productA: optimizeProduct(m.productA),
          productB: optimizeProduct(m.productB)
        };
      };

      const optimizedBracket: Bracket = {
        ...bracket,
        round1: bracket.round1.map(optimizeMatch),
        round2: bracket.round2 ? bracket.round2.map(optimizeMatch) : [],
        round3: bracket.round3 ? bracket.round3.map(optimizeMatch) : [],
        round4: bracket.round4 ? bracket.round4.map(optimizeMatch) : [],
        winner: bracket.winner ? optimizeProduct(bracket.winner) : undefined
      };

      try {
        localStorage.setItem(BRACKET_KEY, JSON.stringify(optimizedBracket));
      } catch (err) {
        console.error("Failed to save bracket to localStorage even after optimization:", err);
      }
    }
  }
}

export function buildInitialBracket(products: Product[]): { bracket: Bracket; updatedProducts: Product[] } {
  const waitingProducts = products
    .filter(p => p.queueStatus === "waiting" && (!p.makerAvatar || !p.makerAvatar.includes("pushed=false")))
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
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

  return { bracket, updatedProducts };
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

// 映射器 1：本地 Product -> DB 产品行
function toDbProduct(p: Product) {
  return {
    [`${DB_PREFIX}id`]: p.id,
    [`${DB_PREFIX}title`]: p.title,
    [`${DB_PREFIX}tagline`]: p.tagline,
    [`${DB_PREFIX}url`]: p.url,
    [`${DB_PREFIX}ship_timeframe`]: p.shipTimeframe,
    [`${DB_PREFIX}maker_name`]: p.makerName,
    [`${DB_PREFIX}maker_twitter`]: p.makerTwitter,
    [`${DB_PREFIX}maker_avatar`]: p.makerAvatar,
    [`${DB_PREFIX}logo`]: p.logo,
    [`${DB_PREFIX}submitted_at`]: p.submittedAt,
    [`${DB_PREFIX}queue_status`]: p.queueStatus,
    [`${DB_PREFIX}votes_count`]: p.votesCount
  };
}

// 映射器 2：DB 产品行 -> 本地 Product
export function fromDbProduct(row: any): Product {
  return {
    id: row[`${DB_PREFIX}id`],
    title: row[`${DB_PREFIX}title`],
    tagline: row[`${DB_PREFIX}tagline`],
    url: row[`${DB_PREFIX}url`],
    shipTimeframe: row[`${DB_PREFIX}ship_timeframe`],
    makerName: row[`${DB_PREFIX}maker_name`],
    makerTwitter: row[`${DB_PREFIX}maker_twitter`],
    makerAvatar: row[`${DB_PREFIX}maker_avatar`],
    logo: row[`${DB_PREFIX}logo`],
    submittedAt: row[`${DB_PREFIX}submitted_at`],
    queueStatus: row[`${DB_PREFIX}queue_status`],
    votesCount: row[`${DB_PREFIX}votes_count`]
  };
}

// 映射器 3：本地 Match -> DB 对局行
function toDbMatch(m: Match, bracketId: string) {
  return {
    [`${DB_PREFIX}id`]: m.id,
    [`${DB_PREFIX}bracket_id`]: bracketId,
    [`${DB_PREFIX}round_number`]: m.roundNumber,
    [`${DB_PREFIX}product_a_id`]: m.productA?.id || "",
    [`${DB_PREFIX}product_b_id`]: m.productB?.id || "",
    [`${DB_PREFIX}votes_a`]: m.votesA,
    [`${DB_PREFIX}votes_b`]: m.votesB,
    [`${DB_PREFIX}winner_id`]: m.winnerId || null,
    [`${DB_PREFIX}voted_user_ids`]: m.votedUserIds
  };
}

// 映射器 4：DB 对局行 -> 本地 Match
function fromDbMatch(row: any, productA: Product, productB: Product): Match {
  return {
    id: row[`${DB_PREFIX}id`],
    roundNumber: row[`${DB_PREFIX}round_number`],
    productA,
    productB,
    votesA: row[`${DB_PREFIX}votes_a`],
    votesB: row[`${DB_PREFIX}votes_b`],
    winnerId: row[`${DB_PREFIX}winner_id`] || undefined,
    votedUserIds: row[`${DB_PREFIX}voted_user_ids`] || []
  };
}

// 1. 获取云端所有参赛项目列表
export async function fetchCloudProducts(): Promise<Product[]> {
  if (!supabase) return loadProducts();
  try {
    const { data, error } = await supabase
      .from(`${DB_PREFIX}products`)
      .select("*")
      .order(`${DB_PREFIX}submitted_at`, { ascending: true });

    if (error || !data) {
      console.warn("⚠️ [INDIE CLASH] Cloud products fetch warning, using fallback store:", error?.message || error);
      return loadProducts();
    }
    return data.map(fromDbProduct);
  } catch (err: any) {
    console.warn("⚠️ [INDIE CLASH] Cloud products network exception, using fallback store:", err?.message || err);
    return loadProducts();
  }
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
    .from(`${DB_PREFIX}products`)
    .upsert(toDbProduct(p) as any);

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
    .from(`${DB_PREFIX}brackets`)
    .upsert({
      [`${DB_PREFIX}id`]: b.id,
      [`${DB_PREFIX}status`]: b.status,
      [`${DB_PREFIX}winner_id`]: b.winner?.id || null,
      [`${DB_PREFIX}round_started_at`]: b.roundStartedAt || new Date().toISOString()
    } as any);

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
    .from(`${DB_PREFIX}matches`)
    .upsert(dbMatches as any);

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
      .from(`${DB_PREFIX}products`)
      .upsert(dbProds as any);

    if (pErr) {
      console.error("Error updating participating product queue statuses in cloud:", pErr);
    }
  }
}

// 4. 获取当前云端活跃的 Bracket 晋级树
export async function fetchCloudBracket(preFetchedProducts?: Product[]): Promise<Bracket | null> {
  if (!supabase) return loadBracket();

  try {
    // A. 先抓取当前活跃（集结中/进行中）的最近一条对局树记录
    const { data: bData, error: bErr } = await supabase
      .from(`${DB_PREFIX}brackets`)
      .select("*")
      .in(`${DB_PREFIX}status`, ["preparing", "active"])
      .order(`${DB_PREFIX}created_at`, { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bErr || !bData) {
      if (bErr) console.warn("⚠️ [INDIE CLASH] Active bracket fetch issue, using fallback:", bErr?.message || bErr);
      return loadBracket();
    }

    // B. 抓取该对局树下的所有场次
    const { data: mData, error: mErr } = await supabase
      .from(`${DB_PREFIX}matches`)
      .select("*")
      .eq(`${DB_PREFIX}bracket_id`, bData[`${DB_PREFIX}id`]);

    if (mErr || !mData) {
      if (mErr) console.warn("⚠️ [INDIE CLASH] Bracket matches fetch issue, using fallback:", mErr?.message || mErr);
      return loadBracket();
    }

    // C. 载入云端产品库以便装配成嵌套对象
    const allProducts = preFetchedProducts || await fetchCloudProducts();
    const prodMap = new Map<string, Product>();
    allProducts.forEach(p => prodMap.set(p.id, p));

    const round1: Match[] = [];
    const round2: Match[] = [];
    const round3: Match[] = [];
    const round4: Match[] = [];

    mData.forEach(m => {
      const prodA = prodMap.get(m[`${DB_PREFIX}product_a_id`]);
      const prodB = prodMap.get(m[`${DB_PREFIX}product_b_id`]);
      if (!prodA || !prodB) return;

      const matchObj = fromDbMatch(m, prodA, prodB);
      if (m[`${DB_PREFIX}round_number`] === 1) round1.push(matchObj);
      else if (m[`${DB_PREFIX}round_number`] === 2) round2.push(matchObj);
      else if (m[`${DB_PREFIX}round_number`] === 3) round3.push(matchObj);
      else if (m[`${DB_PREFIX}round_number`] === 4) round4.push(matchObj);
    });

    // 排序以防乱序
    const sortByMatchId = (x: Match, y: Match) => x.id.localeCompare(y.id);
    round1.sort(sortByMatchId);
    round2.sort(sortByMatchId);
    round3.sort(sortByMatchId);
    round4.sort(sortByMatchId);

    const finalWinner = bData[`${DB_PREFIX}winner_id`] ? prodMap.get(bData[`${DB_PREFIX}winner_id`]) : undefined;

    return {
      id: bData[`${DB_PREFIX}id`],
      status: bData[`${DB_PREFIX}status`],
      winner: finalWinner,
      roundStartedAt: bData[`${DB_PREFIX}round_started_at`],
      round1,
      round2,
      round3,
      round4
    };
  } catch (err: any) {
    console.warn("⚠️ [INDIE CLASH] Cloud bracket network exception, using fallback:", err?.message || err);
    return loadBracket();
  }
}

// 5. 永久清除云端对局数据并重置（彻底清空所有数据库表以支持沙箱重置）
export async function clearCloudData(): Promise<void> {
  if (!supabase) return;

  // A. 清除所有投票与反馈
  const { error: vErr } = await supabase
    .from(`${DB_PREFIX}votes`)
    .delete()
    .neq(`${DB_PREFIX}id`, "00000000-0000-0000-0000-000000000000");
  if (vErr) {
    console.error("Error deleting votes:", vErr);
    throw new Error(`Failed to delete votes: ${vErr.message}`);
  }

  // B. 清除所有对局场次
  const { error: mErr } = await supabase
    .from(`${DB_PREFIX}matches`)
    .delete()
    .neq(`${DB_PREFIX}id`, "_nonexistent_");
  if (mErr) {
    console.error("Error deleting matches:", mErr);
    throw new Error(`Failed to delete matches: ${mErr.message}`);
  }

  // C. 清除所有晋级赛树
  const { error: bErr } = await supabase
    .from(`${DB_PREFIX}brackets`)
    .delete()
    .neq(`${DB_PREFIX}id`, "_nonexistent_");
  if (bErr) {
    console.error("Error deleting brackets:", bErr);
    throw new Error(`Failed to delete brackets: ${bErr.message}`);
  }

  // D. 清除所有产品记录
  const { error: pErr } = await supabase
    .from(`${DB_PREFIX}products`)
    .delete()
    .neq(`${DB_PREFIX}id`, "_nonexistent_");
  if (pErr) {
    console.error("Error deleting products:", pErr);
    throw new Error(`Failed to delete products: ${pErr.message}`);
  }
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
  try {
    localStorage.setItem(PAST_CHAMPS_KEY, JSON.stringify(champs));
  } catch (e) {
    console.warn("localStorage quota exceeded for past champions. Clearing large logo cache to optimize storage.");
    const optimized = champs.map(c => {
      if (c.logo && c.logo.startsWith("data:image") && c.logo.length > 30000) {
        return { ...c, logo: "🚀" };
      }
      return c;
    });
    try {
      localStorage.setItem(PAST_CHAMPS_KEY, JSON.stringify(optimized));
    } catch (err) {
      console.error("Failed to save past champions to localStorage even after optimization:", err);
    }
  }
}

// 6. 获取云端所有历史完结赛季的冠军项目
export async function fetchCloudPastChampions(preFetchedProducts?: Product[]): Promise<Product[]> {
  if (!supabase) {
    return loadLocalPastChampions();
  }
  try {
    const { data: bData, error: bErr } = await supabase
      .from(`${DB_PREFIX}brackets`)
      .select(`${DB_PREFIX}winner_id`)
      .eq(`${DB_PREFIX}status`, "completed");
    
    if (bErr || !bData) return [];
    const winnerIds = bData.map((x: any) => x[`${DB_PREFIX}winner_id`]).filter(Boolean);
    if (winnerIds.length === 0) return [];
    
    if (preFetchedProducts) {
      const prodMap = new Map<string, Product>();
      preFetchedProducts.forEach(p => prodMap.set(p.id, p));
      return winnerIds.map(id => prodMap.get(id)).filter(Boolean) as Product[];
    }

    const { data: pData, error: pErr } = await supabase
      .from(`${DB_PREFIX}products`)
      .select("*")
      .in(`${DB_PREFIX}id`, winnerIds);
      
    if (pErr || !pData) return [];
    return pData.map(fromDbProduct);
  } catch (err: any) {
    console.warn("⚠️ [INDIE CLASH] Cloud past champions network exception:", err?.message || err);
    return loadLocalPastChampions();
  }
}
