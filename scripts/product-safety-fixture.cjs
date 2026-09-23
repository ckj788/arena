// Explicitly opted-in, local-only test preload. Never imported by application code.
if (process.env.INDIECLASH_SAFETY_FIXTURE !== '1') throw new Error('Fixture preload requires explicit opt-in.');
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fixture-anon-key';
process.env.NEXT_PUBLIC_DB_PREFIX = 'shipandbattle_';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
const rows = Array.from({ length: 8 }, (_, i) => ({
  shipandbattle_id: `safety-fixture-${i}`, shipandbattle_title: `Safety Fixture ${i}`,
  shipandbattle_tagline: 'A fixture for testing product safety and screenshots.',
  shipandbattle_url: `https://product-${i}.example.com`,
  shipandbattle_maker_name: 'Test Maker', shipandbattle_maker_twitter: '@fixture', shipandbattle_logo: 'I',
  shipandbattle_description: 'A local test product with a clear description. This is isolated fixture data, never a real submission.',
  shipandbattle_submitted_at: '2026-09-19T00:00:00Z', shipandbattle_queue_status: 'waiting',
  shipandbattle_votes_count: 0, shipandbattle_arena_enqueued: false,
  shipandbattle_moderation_status: i === 7 ? 'restricted' : i === 1 ? 'approved' : 'unreviewed',
  shipandbattle_link_trust: i === 1 ? 'trusted' : 'ugc',
  shipandbattle_screenshot: i === 0 ? 'https://fixture.supabase.co/storage/v1/object/public/product-logos/fixture/screenshot.png' : null,
  shipandbattle_screenshots: i === 0 ? [1,2,3].map(n => `https://fixture.supabase.co/storage/v1/object/public/product-logos/fixture/image-${n}.png`) : [],
}));
const nativeFetch = globalThis.fetch;
globalThis.fetch = async function(input, options) {
  const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const url = new URL(rawUrl);
  if (url.hostname.endsWith('.supabase.co')) {
    if (url.hostname !== 'fixture.supabase.co') throw new Error('Production access blocked by safety fixture.');
    if ((options?.method || input?.method || 'GET').toUpperCase() !== 'GET') throw new Error('Fixture server forbids database mutations.');
    let data = url.pathname.endsWith('public_products') ? rows : [];
    const ids = url.searchParams.get('shipandbattle_id');
    if (ids?.startsWith('in.')) data = data.filter(row => ids.includes(row.shipandbattle_id));
    const accept = new Headers(options?.headers || input?.headers).get('accept') || '';
    if (accept.includes('vnd.pgrst.object')) data = data[0] || null;
    return Response.json(data, {headers:{'content-range':`0-${Math.max(0,(data?.length || 0)-1)}/${data?.length || 0}`}});
  }
  return nativeFetch(input, options);
};
