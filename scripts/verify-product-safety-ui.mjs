import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.UI_TEST_URL || 'http://localhost:3110';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const browser = await puppeteer.launch({executablePath:process.env.UI_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const output = fs.mkdtempSync(path.join(os.tmpdir(),'indieclash-safety-'));
const page = await browser.newPage();
const png = Buffer.from(await page.evaluate(() => {const canvas=document.createElement('canvas');canvas.width=800;canvas.height=450;const ctx=canvas.getContext('2d');ctx.fillStyle='#17171d';ctx.fillRect(0,0,800,450);ctx.fillStyle='#ffbe18';ctx.fillRect(50,50,700,80);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
const imagePath = path.join(output,'screenshot.png');fs.writeFileSync(imagePath,png);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
let adminMode=false, decisions=0, reports=0;
await page.setRequestInterception(true);
page.on('request',request=>{
  const url=new URL(request.url());
  if(url.hostname.endsWith('.supabase.co')) {
    if(url.pathname.startsWith('/storage/'))return request.respond({status:200,contentType:'image/png',body:png});
    return request.abort();
  }
  if(url.pathname==='/api/arena/reports'){reports++;return request.respond({status:200,contentType:'application/json',body:'{"ok":true}'});}
  if(url.pathname==='/api/arena/moderation'){
    if(!adminMode)return request.respond({status:403,contentType:'application/json',body:'{"error":"Admin access required."}'});
    if(request.method()==='POST'){decisions++;return request.respond({status:200,contentType:'application/json',body:'{"ok":true}'});}
    return request.respond({status:200,contentType:'application/json',body:JSON.stringify({products:[{id:'safety-fixture-0',title:'Safety Fixture 0',url:'https://product-0.example.com',moderationStatus:'unreviewed',linkTrust:'ugc'}],reports:[],hasMore:false})});
  }
  if(!['GET','HEAD','OPTIONS'].includes(request.method()))return request.respond({status:200,contentType:'application/json',body:'{}'});
  return request.continue();
});
const click=async text=>{
  for(const element of await page.$$('button'))if(await element.isVisible() && (await element.evaluate(el=>el.textContent.trim()))===text){await element.click();return;}
  throw new Error(`Missing button: ${text}`);
};
try {
  await page.setViewport({width:1280,height:1000});
  await page.goto(`${base}/products/safety-fixture-0`,{waitUntil:'networkidle2'});
  await page.waitForSelector('img[alt="Safety Fixture 0 product screenshot 1"]');
  await page.click('button[aria-label="View image 2"]');
  assert((await page.$eval('button[aria-label="Enlarge product image"] img',el=>el.src)).endsWith('image-2.png'));
  await page.click('button[aria-label="Enlarge product image"]');
  await page.waitForSelector('[role="dialog"][aria-label="Safety Fixture 0 image viewer"]');
  await page.click('button[aria-label="Next image"]');
  assert((await page.$eval('[aria-label="Safety Fixture 0 image viewer"] img',el=>el.src)).endsWith('image-3.png'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('[aria-label="Safety Fixture 0 image viewer"]',{hidden:true});
  assert(await page.$eval('a[href="https://product-0.example.com/"]',el=>el.rel.includes('ugc')&&el.rel.includes('nofollow')));
  await click('Report this product');await page.waitForSelector('form select');
  await page.screenshot({path:path.join(output,'product-report.png')});
  await click('Send report');await page.waitForFunction(()=>document.body.innerText.includes('Please sign in again'));
  assert.equal(reports,0,'Unsigned users cannot report');
  await page.goto(`${base}/products/safety-fixture-1`,{waitUntil:'networkidle2'});
  assert(await page.$eval('a[href="https://product-1.example.com/"]',el=>!el.rel.includes('nofollow')));
  const restricted=await page.goto(`${base}/products/safety-fixture-7`,{waitUntil:'networkidle2'});
  assert.equal(restricted.status(),404);
  await page.goto(`${base}/?submit=1`,{waitUntil:'networkidle2'});
  assert.equal(await page.$('button[aria-label="Enlarge product image"]'),null,'No gallery on homepage');
  await page.waitForSelector('input[type="file"][multiple]');
  const paths=Array.from({length:5},(_,i)=>{const p=path.join(output,`image-${i}.png`);fs.writeFileSync(p,png);return p;});
  await (await page.$('input[type="file"][multiple]')).uploadFile(...paths,imagePath);
  await page.waitForFunction(()=>document.body.innerText.includes('no more than 5 images'));
  await (await page.$('input[type="file"][multiple]')).uploadFile(...paths);
  await page.waitForSelector('img[alt="Product image 5 preview"]');
  assert(await page.$eval('input[type="file"][multiple]',el=>el.disabled));
  await page.click('button[aria-label="Move image 5 earlier"]');
  assert(await page.$eval('img[alt="Product image 1 preview"]',el=>el.src.startsWith('data:image/jpeg;base64,')));
  await page.setViewport({width:390,height:844});
  await page.$eval('img[alt="Product image 1 preview"]',el=>el.scrollIntoView({block:'center'}));
  await page.screenshot({path:path.join(output,'mobile-screenshot-form.png')});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(let i=5;i>0;i--) {
    await page.$eval(`button[aria-label="Remove image ${i}"]`,el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await page.click(`button[aria-label="Remove image ${i}"]`);
    await page.waitForSelector(`img[alt="Product image ${i} preview"]`,{hidden:true});
  }
  assert.equal(await page.$('img[alt="Product image 1 preview"]'),null);
  const oversized=path.join(output,'oversized.png');fs.writeFileSync(oversized,Buffer.alloc(5_000_001));
  await (await page.$('input[type="file"][multiple]')).uploadFile(oversized);
  await page.waitForFunction(()=>document.body.innerText.includes('under 5 MB'));
  // Local, synthetic Supabase session; every protected API call is intercepted.
  await page.evaluate(()=>localStorage.setItem('sb-fixture-auth-token',JSON.stringify({
    access_token:'fixture-token',refresh_token:'fixture-refresh',token_type:'bearer',expires_at:4102444800,expires_in:3600,
    user:{id:'00000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{provider:'github'},user_metadata:{user_name:'fixture'}}
  })));
  await page.goto(`${base}/moderation`,{waitUntil:'networkidle2'});
  await page.waitForFunction(()=>document.body.innerText.includes('Admin access required.'));
  adminMode=true;await click('Refresh');await page.waitForSelector('article input');
  await click('Approve link');await page.waitForFunction(()=>document.body.innerText.includes('Add a short reason'));
  assert.equal(decisions,0);await page.type('article input','Checked example website');await click('Approve link');
  await page.waitForFunction(()=>!document.querySelector('article button')?.disabled);assert.equal(decisions,1);
  await page.goto(`${base}/products/safety-fixture-0`,{waitUntil:'networkidle2'});
  await click('Report this product');await click('Send report');
  await page.waitForFunction(()=>document.body.innerText.includes('Report received.'));assert.equal(reports,1);
  assert.deepEqual(errors,[]);
  console.log('PASS: product screenshot, trusted/unreviewed links, restricted 404, mobile screenshot upload/remove, unsigned report gate, admin-only queue, required decision reason, one report and decision per click. All mutations intercepted.');
  console.log(`Screenshots: ${output}`);
} catch(error) { console.error('UI snapshot:',(await page.evaluate(()=>document.body.innerText)).slice(-4000)); throw error; }
finally {await browser.close();}
