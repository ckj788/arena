// Local integration-test preload. Reuse the existing production-access/write
// guard and change only the in-memory public products returned to the test server.
import './product-safety-fixture.cjs';
const fixtureFetch = globalThis.fetch;
let reads = 0;
globalThis.fetch = async function(input, options) {
  const response = await fixtureFetch(input, options);
  const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const url = new URL(rawUrl);
  if (url.hostname !== 'fixture.supabase.co' || !url.pathname.endsWith('public_products')) return response;
  const rows = await response.json();
  const snapshot = ++reads;
  return Response.json([...rows, {
    ...rows[0],
    shipandbattle_id: `sitemap-snapshot-${snapshot}`,
    shipandbattle_title: `Sitemap Snapshot ${snapshot}`,
    shipandbattle_submitted_at: '2026-10-04T00:00:00Z',
  }]);
};
