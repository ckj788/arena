import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, mocks={}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    module:mod,exports:mod.exports,URL,Request,Response,AbortSignal,console,
    process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co'}},
    require(name) { if (name in mocks) return mocks[name]; throw new Error(`Unexpected dependency: ${name}`); },
  });
  return mod.exports;
}
class HttpError extends Error { constructor(status,message) { super(message); this.status=status; } }
const site = load('lib/site.ts');
const safety = load('lib/productSafety.ts');
const taxonomy = load('lib/productTaxonomy.ts');
const input = load('lib/server/productInput.ts', {'server-only':{},'@/lib/server/auth':{HttpError},'@/lib/site':site,'@/lib/productTaxonomy':taxonomy});
const base = {title:'Valid Product',tagline:'A useful example product.',url:'https://example.com',shipTimeframe:'7d',makerName:'Maker',makerTwitter:'maker',logo:'🚀',description:'A'.repeat(100)};
assert.equal(input.parseProductInput(base).screenshot,'');
const screenshot = 'https://fixture.supabase.co/storage/v1/object/public/product-logos/test/image.jpg';
assert.equal(input.parseProductInput({...base,screenshot}).screenshot,screenshot);
assert.equal(input.parseProductInput({...base,screenshots:Array(5).fill(screenshot)}).screenshots.length,5);
assert.equal(input.parseProductInput({...base,screenshot,screenshots:[]}).screenshot,'');
for (const screenshots of [Array(6).fill(screenshot),[null],[''],['https://evil.example/image.jpg'],'not-an-array']) {
  assert.throws(()=>input.parseProductInput({...base,screenshots}),e=>e.status===400);
}
for(const bad of ['//evil.example/x','/local.png','data:image/svg+xml;base64,AAAA','https://elsewhere.example/image.png','https://fixture.supabase.co/storage/v1/object/public/private/x','https://user:pass@fixture.supabase.co/storage/v1/object/public/product-logos/x','https://fixture.supabase.co:444/storage/v1/object/public/product-logos/x']) {
  assert.throws(()=>input.parseProductInput({...base,screenshot:bad}),e=>e.status===400);
}
for(const url of ['javascript:alert(1)','https://user:pass@example.com','http://127.0.0.1','http://[::ffff:127.0.0.1]','https://foo.local','https://example.com/a b']) {
  assert.throws(()=>input.parseProductInput({...base,url}),e=>e.status===400);
}
assert.equal(site.trustedProductImageUrl('//evil.example/x'),undefined);
assert.equal(site.publicHttpUrl('https://HTTPS://mistol.ai'),'https://mistol.ai/');
assert.equal(safety.productDomainKey('https://WWW.Example.com.:443/path'),'example.com');
assert.notEqual(safety.productDomainKey('https://a.vercel.app'),safety.productDomainKey('https://b.vercel.app'));
assert.notEqual(safety.productDomainKey('https://github.com/owner/a'),safety.productDomainKey('https://github.com/owner/b'));
assert.equal(safety.productLinkRel({moderationStatus:'unreviewed',linkTrust:'ugc'}),'noopener noreferrer');
assert.match(safety.productLinkRel({moderationStatus:'restricted',linkTrust:'trusted'}),/ugc nofollow/);
assert(!safety.productLinkRel({moderationStatus:'approved',linkTrust:'trusted'}).includes('nofollow'));
assert(!safety.isVisibleProduct({moderationStatus:'restricted'}));
const robots = load('app/robots.ts',{'@/lib/site':site}).default();
assert(robots.rules.allow.includes('/api/og/'));
assert(robots.rules.disallow.includes('/api/'));

let authorized=false, admin=false, calls=[], rpcError=null;
const auth = {'server-only':{}, HttpError,
  authenticateRequest:async()=>{if(!authorized)throw new HttpError(401,'Unauthorized');return {user:{id:'verified-user'}};},
  requireAdmin:async()=>{if(!admin)throw new HttpError(403,'Admin required');return {id:'verified-admin'};},
  readJsonRequest:async request=>request.json(),
  getAdminClient:()=>({rpc:async(name,params)=>{calls.push({name,params});return {error:rpcError};}}),
  jsonError:error=>Response.json({error:error.message},{status:error.status||500}),
};
const common={'@/lib/server/auth':auth,'@/lib/supabaseClient':{DB_PREFIX:'shipandbattle_'},'@/lib/arenaStore':{fromDbProduct:x=>x},'next/cache':{revalidatePath(){},revalidateTag(){}}};
const reports=load('app/api/arena/reports/route.ts',common);
const moderation=load('app/api/arena/moderation/route.ts',common);
const request=body=>new Request('https://local.test/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const report={productId:'fixture',reason:'spam',note:'Example'};
assert.equal((await reports.POST(request(report))).status,401);assert.equal(calls.length,0);
authorized=true;
assert.equal((await moderation.POST(request({productId:'fixture',action:'approved',note:'Test'}))).status,403);assert.equal(calls.length,0);
for(const body of [null,{}, {...report,productId:'../unsafe'},{...report,reason:'delete'},{...report,note:'x'.repeat(1001)}])assert.equal((await reports.POST(request(body))).status,400);
assert.equal(calls.length,0);
assert.equal((await reports.POST(request({...report,reporter_uid:'spoof'}))).status,200);
assert.equal(calls.at(-1).params.p_reporter,'verified-user');
rpcError={code:'P0001'};assert.equal((await reports.POST(request(report))).status,429);rpcError=null;
admin=true;
assert.equal((await moderation.POST(request({productId:'fixture',action:'approved',note:''}))).status,400);
assert.equal((await moderation.POST(request({productId:'fixture',action:'approved',note:'Verified'}))).status,200);
assert.equal(calls.at(-1).params.p_actor,'verified-admin');
console.log('PASS: input/image URL validation, domain identity, link trust, robots OG exception, report authentication, admin-only moderation, bounded input, verified actor ids and rate-limit responses. All DB calls mocked.');
