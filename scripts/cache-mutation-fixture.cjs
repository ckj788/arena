// Production-mode cache tests only. Every mutation below changes in-memory
// fixture rows; the base preload blocks all access to real Supabase projects.
if (process.env.INDIECLASH_CACHE_MUTATION_FIXTURE !== '1') throw new Error('Cache mutation fixture requires explicit opt-in.');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Node's --require preload uses CommonJS.
require('./product-safety-fixture.cjs');
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-role';
process.env.ADMIN_API_SECRET = 'fixture-admin-secret';
const fixtureFetch = globalThis.fetch;
const prefix = 'shipandbattle_';
const field = name => prefix + name;
const rawImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const productsReady = fixtureFetch('https://fixture.supabase.co/rest/v1/shipandbattle_public_products').then(response => response.json()).then(products => {
  products[2][field('logo')] = rawImage;
  return products;
});
const match = {
  [field('id')]: 'cache-match', [field('bracket_id')]: 'cache-bracket', [field('round_number')]: 4,
  [field('product_a_id')]: 'safety-fixture-0', [field('product_b_id')]: 'safety-fixture-1',
  [field('votes_a')]: 0, [field('votes_b')]: 0,
};
const bracket = {
  [field('id')]: 'cache-bracket', [field('status')]: 'active', [field('bracket_size')]: 2,
  [field('round_started_at')]: '2026-10-14T00:00:00Z', [field('round_ends_at')]: '2030-10-14T00:00:00Z',
};
const votes = [];
globalThis.fetch = async function(input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
  if (url.hostname !== 'fixture.supabase.co') return fixtureFetch(input, options);
  const products = await productsReady;
  const headers = new Headers(options?.headers || input?.headers);
  const method = (options?.method || input?.method || 'GET').toUpperCase();
  if (url.pathname === '/auth/v1/user') {
    if (headers.get('authorization') !== 'Bearer cache-fixture-token') return Response.json({ message: 'Invalid fixture token' }, { status: 401 });
    return Response.json({ id: 'fixture-user', email: 'fixture@example.invalid', app_metadata: { provider: 'github' }, user_metadata: { user_name: 'Fixture maker' } });
  }
  const table = url.pathname.split('/').at(-1);
  let data;
  if (table === 'shipandbattle_cast_vote') {
    const body = JSON.parse(options.body);
    if (votes.length) return Response.json({ code: '23505', message: 'already voted' }, { status: 409 });
    match[field('votes_a')]++;
    products[0][field('votes_count')]++;
    votes.push({ [field('id')]: 'cache-vote', [field('match_id')]: match[field('id')], [field('voted_product_id')]: body.p_voted_product_id,
      [field('feedback_winner')]: body.p_feedback_winner, [field('feedback_loser')]: body.p_feedback_loser });
    return Response.json([{ votes_a: match[field('votes_a')], votes_b: match[field('votes_b')] }]);
  }
  if (table === 'shipandbattle_consume_rate_limit') return Response.json(null);
  if (table === 'shipandbattle_moderate_product') {
    const body = JSON.parse(options.body);
    products.find(product => product[field('id')] === body.p_product)[field('moderation_status')] = body.p_action;
    return Response.json(null);
  }
  if (table === 'shipandbattle_products' && method === 'POST') {
    const product = JSON.parse(options.body);
    products.push(product);
    return Response.json(product, { status: 201 });
  }
  if (method !== 'GET') throw new Error(`Unexpected fixture mutation: ${method} ${table}`);
  if (table?.endsWith('products')) data = [...products];
  else if (table?.endsWith('matches')) data = [match];
  else if (table?.endsWith('brackets')) data = [bracket];
  else if (table?.endsWith('votes')) data = [...votes];
  else throw new Error(`Unexpected fixture read: ${table}`);
  for (const [key, filter] of url.searchParams) {
    if (filter.startsWith('eq.')) data = data.filter(row => String(row[key]) === filter.slice(3));
    if (filter.startsWith('in.')) data = data.filter(row => filter.includes(String(row[key])));
  }
  const alternatives = url.searchParams.get('or');
  if (alternatives && table.endsWith('matches')) data = data.filter(row => alternatives.includes(row[field('product_a_id')]) || alternatives.includes(row[field('product_b_id')]));
  if (url.searchParams.has('offset')) data = data.slice(Number(url.searchParams.get('offset')));
  if (url.searchParams.has('limit')) data = data.slice(0, Number(url.searchParams.get('limit')));
  return Response.json(headers.get('accept')?.includes('vnd.pgrst.object') ? data[0] || null : data);
};
