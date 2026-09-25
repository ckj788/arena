import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

// Browser/API contract test. All Supabase traffic and writes are mocked.
// This does not verify the deployed SQL function or mutate a live competition.
const base = process.env.UI_TEST_URL || 'http://localhost:3110';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const uid = '00000000-0000-4000-8000-000000000009';
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: { provider: 'github' }, user_metadata: { user_name: 'vote-fixture' } };
const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const exp = Math.floor(Date.now()/1000) + 3600;
await page.evaluateOnNewDocument(session => {
  const get = Storage.prototype.getItem;
  Storage.prototype.getItem = function(key) { return /^sb-.*-auth-token$/.test(key) ? JSON.stringify(session) : get.call(this,key); };
}, { access_token: `${enc({alg:'HS256'})}.${enc({sub:uid,exp})}.fixture`, refresh_token: 'fixture', expires_at: exp, token_type: 'bearer', user });
const row = obj => Object.fromEntries(Object.entries(obj).map(([k,v]) => [`shipandbattle_${k}`,v]));
const products = ['alpha','beta'].map(id => row({id:`vote-${id}`,title:`Vote ${id}`,tagline:'Isolated vote counter fixture.',logo:'🚀',url:`https://${id}.example.invalid`,maker_name:'Fixture',submitted_at:'2026-09-20T00:00:00Z',queue_status:'active',arena_enqueued:true,votes_count:0}));
const bracket = row({id:'vote-bracket',status:'active',bracket_size:2,round_started_at:new Date().toISOString(),round_ends_at:new Date(Date.now()+86400000).toISOString()});
const match = row({id:'vote-match',bracket_id:'vote-bracket',product_a_id:'vote-alpha',product_b_id:'vote-beta',round_number:4,votes_a:7,votes_b:3,voted_user_ids:[]});
const raceTest = process.env.VOTE_RACE_TEST === '1';
let fail = !raceTest, calls = 0, staleReads = 0;
await page.setRequestInterception(true);
page.on('request', req => {
  const url = new URL(req.url());
  const reply = (data,status=200) => req.respond({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  if(req.method()==='OPTIONS') return req.respond({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}});
  if(url.pathname==='/api/arena/vote') {
    calls++;
    const input=JSON.parse(req.postData());
    assert.equal(input.matchId,'vote-match'); assert.equal(input.votedProductId,'vote-alpha');
    assert(input.winnerFeedback.length>=10 && input.loserFeedback.length>=10);
    if (raceTest) void page.evaluate(() => window.dispatchEvent(new Event('focus')));
    return setTimeout(() => {
      if(fail) return reply({error:'Injected vote outage'},503);
      // Return a concurrent total, not just the browser's stale 7 + 1.
      match.shipandbattle_votes_a=11;
      match.shipandbattle_voted_user_ids=[uid];
      reply({votesA:11,votesB:3,voterId:uid});
    },raceTest ? 500 : 150);
  }
  if(url.pathname==='/api/arena/products/mine') return reply({products:[],productIds:['vote-alpha']});
  if(url.hostname.endsWith('.supabase.co')) {
    if(url.pathname.endsWith('/user')) return reply(user);
    if(url.pathname.endsWith('public_products')) return reply(products);
    if(url.pathname.endsWith('public_brackets')) return reply(url.searchParams.get('shipandbattle_status')==='eq.completed'?[]:[bracket]);
    if(url.pathname.endsWith('public_matches')) {
      if (raceTest && calls > 0 && match.shipandbattle_votes_a === 7) {
        staleReads++;
        const snapshot = JSON.parse(JSON.stringify(match));
        return setTimeout(() => reply([snapshot]), 1800);
      }
      return reply([match]);
    }
    return reply([]);
  }
  if(!['GET','HEAD'].includes(req.method())) return reply({});
  req.continue();
});
async function refreshFixture() {
  await page.waitForFunction(start => Date.now()-start>1200,{},Date.now());
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
}
try {
  await page.goto(`${base}/arena`,{waitUntil:'networkidle2'});
  await refreshFixture();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='VOTE FOR A'&&!el.disabled));
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='VOTE FOR A'&&!el.disabled).click());
  const dialog='[aria-label="Vote and give feedback"]';
  await page.waitForSelector(dialog);
  const fields=await page.$$(`${dialog} textarea`);
  await fields[0].type('The main workflow is clear and useful.');
  await fields[1].type('Please clarify the initial setup instructions.');
  if (raceTest) {
    await page.waitForFunction(start => Date.now()-start>1200,{},Date.now());
    await page.$eval(`${dialog} form`,form=>form.requestSubmit());
    await page.waitForFunction(()=>!document.querySelector('[aria-label="Vote and give feedback"]'));
    assert((await page.$eval('#arena-section',el=>el.innerText)).includes('(11v)'));
    await page.waitForFunction(start => Date.now()-start>2200,{},Date.now());
    assert((await page.$eval('#arena-section',el=>el.innerText)).includes('(11v)'));
    assert.equal(staleReads,0,'No background match read may start during a pending vote');
    console.log('PASS: focus during vote cannot overwrite successful API total 11 with stale total 7.');
  } else {
  await page.$eval(`${dialog} form`,form=>{for(let i=0;i<5;i++)form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>document.body.textContent.includes('Injected vote outage'));
  assert.equal(calls,1,'Rapid clicks must send one request');
  assert.equal(match.shipandbattle_votes_a,7);
  assert.equal(await page.$eval(`${dialog} textarea`,el=>el.value),'The main workflow is clear and useful.');
  fail=false;
  await page.$eval(`${dialog} form`,form=>form.requestSubmit());
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Vote and give feedback"]'));
  assert.equal(calls,2);
  const scores=await page.$eval('#arena-section',el=>el.innerText);
  assert(/11/.test(scores),'Backend total 11 must be visible');
  console.log('PASS: failed vote retains feedback, repeated submit sends once, retry renders API total 11 (not stale local 8).');
  await page.evaluate(()=>[...document.querySelectorAll('button,a')].find(el=>el.textContent.trim().toLowerCase()==='my console').click());
  await page.waitForSelector('.maker-console .console-stat');
  assert.equal(await page.$$eval('.console-stat',els=>els.find(el=>el.textContent.includes('Votes')).querySelector('strong').textContent),'1','Console must immediately include the confirmed vote');
  console.log('PASS: console cumulative Votes updates immediately after successful vote.');
  await page.goBack({waitUntil:'networkidle2'});
  await page.reload({waitUntil:'networkidle2'});
  await refreshFixture();
  await page.waitForFunction(()=>document.querySelector('#arena-section')?.textContent.includes('Vote alpha')&&document.querySelector('#arena-section')?.textContent.includes('11'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: refreshed public match data restores persisted fixture score; no browser exceptions. Live database persistence NOT tested.');
  }
} finally { await browser.close(); }
