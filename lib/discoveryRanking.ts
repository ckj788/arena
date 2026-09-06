import type { Product } from "./mockData";

function validTime(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function hasActiveDiscoveryBoost(product: Product, now = Date.now()) {
  return validTime(product.discoveryBoostUntil) > now;
}

// A peer-review boost never changes Arena FIFO. It only lets the product
// receive roughly 20% more qualified discovery impressions during fair selection.
export function discoveryExposureScore(product: Product, now = Date.now()) {
  const impressions = product.qualifiedImpressions || 0;
  return hasActiveDiscoveryBoost(product, now) ? impressions / 1.2 : impressions;
}

export function compareFairDiscovery(a: Product, b: Product, now = Date.now()) {
  const scoreDifference = discoveryExposureScore(a, now) - discoveryExposureScore(b, now);
  if (scoreDifference !== 0) return scoreDifference;

  const boostDifference = Number(hasActiveDiscoveryBoost(b, now)) - Number(hasActiveDiscoveryBoost(a, now));
  if (boostDifference !== 0) return boostDifference;

  const exposureDifference = validTime(a.lastExposedAt) - validTime(b.lastExposedAt);
  if (exposureDifference !== 0) return exposureDifference;

  return validTime(a.publishedAt || a.submittedAt) - validTime(b.publishedAt || b.submittedAt);
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function productDomain(product: Product) {
  try {
    return new URL(product.url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return product.id;
  }
}

function makerKey(product: Product) {
  return (product.creator_uid || product.makerTwitter || product.makerName || product.id).trim().toLowerCase();
}

/**
 * Builds one complete, deterministic discovery pass for a visitor session.
 *
 * Fair-exposure debt remains the primary signal. The session seed only changes
 * the order inside the same exposure tier, so visitors do not all receive the
 * same six products while a popular product can never buy its way forward.
 * Each six-card deck also avoids repeating a maker/domain and caps a category
 * at two cards whenever the available inventory makes that possible.
 */
export function buildFairDiscoverySequence(
  products: Product[],
  sessionSeed: string,
  batchSize = 6,
  now = Date.now(),
) {
  if (products.length <= 1) return [...products];

  const ranked = [...products].sort((a, b) => {
    const scoreDifference = discoveryExposureScore(a, now) - discoveryExposureScore(b, now);
    if (scoreDifference !== 0) return scoreDifference;

    const exposureDifference = validTime(a.lastExposedAt) - validTime(b.lastExposedAt);
    if (exposureDifference !== 0) return exposureDifference;

    const seededDifference = stableHash(`${sessionSeed}:${a.id}`) - stableHash(`${sessionSeed}:${b.id}`);
    return seededDifference || a.id.localeCompare(b.id);
  });

  const remaining = [...ranked];
  const sequence: Product[] = [];

  while (remaining.length) {
    const deck: Product[] = [];
    const makers = new Set<string>();
    const domains = new Set<string>();
    const categoryCounts = new Map<string, number>();

    while (deck.length < batchSize && remaining.length) {
      const leadingScore = discoveryExposureScore(remaining[0], now);
      let candidateIndex = remaining.findIndex((product) => {
        const category = product.category || "uncategorized";
        return discoveryExposureScore(product, now) === leadingScore
          && !makers.has(makerKey(product))
          && !domains.has(productDomain(product))
          && (categoryCounts.get(category) || 0) < 2;
      });

      // Sparse catalogues can legitimately contain several launches by the
      // same maker/category. Relax presentation constraints, never fairness.
      if (candidateIndex < 0) candidateIndex = 0;
      const [candidate] = remaining.splice(candidateIndex, 1);
      if (!candidate) break;

      deck.push(candidate);
      makers.add(makerKey(candidate));
      domains.add(productDomain(candidate));
      const category = candidate.category || "uncategorized";
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }

    sequence.push(...deck);
  }

  return sequence;
}

export function compareArenaQueue(a: Product, b: Product) {
  const queueDifference = validTime(a.arenaEnqueuedAt || a.submittedAt) - validTime(b.arenaEnqueuedAt || b.submittedAt);
  return queueDifference || a.id.localeCompare(b.id);
}
