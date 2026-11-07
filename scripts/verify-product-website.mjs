// Actual form input from ArenaClient, rendered with sample values in an isolated
// headless browser. No user session, app API, database writes or payment.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import puppeteer from 'puppeteer-core';
function load(file, mocks = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, URL, process: { env: {} }, require: name => mocks[name] });
  return mod.exports;
}
const site = load('lib/site.ts');
const { normalizeProductWebsite } = load('lib/productWebsite.ts', { './site': site });
for (const [input, expected] of [['example.com', 'https://example.com/'], ['www.example.com/path?q=1', 'https://www.example.com/path?q=1'], [' https://example.com/a ', 'https://example.com/a'], ['http://example.com', 'http://example.com/']]) assert.equal(normalizeProductWebsite(input), expected);
for (const input of ['', ' ', 'not a url', 'ftp://example.com', 'javascript:alert(1)', 'https://user:password@example.com', 'localhost', 'https://127.0.0.1']) assert.equal(normalizeProductWebsite(input), undefined);
const source = ts.createSourceFile('ArenaClient.tsx', fs.readFileSync('app/ArenaClient.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let inputNode;
function find(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'input' && node.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(source) === 'id' && p.initializer?.text === 'product-url')) inputNode = node;
  ts.forEachChild(node, find);
}
find(source); assert(inputNode);
const compiled = ts.transpileModule(`exports.field = ${inputNode.getText(source)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-background-networking'] });
try {
  const page = await browser.newPage(); await page.setOfflineMode(true);
  for (const url of ['example.com', 'www.example.com', 'https://example.com']) {
    const mod = { exports: {} };
    vm.runInNewContext(compiled, { exports: mod.exports, require: () => jsx, newUrl: url, setNewUrl() {}, setSubmitError() {}, normalizedProductUrl: normalizeProductWebsite(url), isPaidSubmission: true, duplicateProduct: null });
    const html = renderToStaticMarkup(mod.exports.field);
    await page.setContent(`<form>${html}<button type="submit">Submit</button></form>`);
    const result = await page.evaluate(() => {
      let submitted = 0;
      const form = document.querySelector('form');
      form.addEventListener('submit', event => { event.preventDefault(); submitted++; });
      form.requestSubmit();
      const input = document.querySelector('input');
      return { submitted, valid: input.validity.valid, typeMismatch: input.validity.typeMismatch };
    });
    assert.equal(result.valid, true, url); assert.equal(result.submitted, 1, url); assert.equal(result.typeMismatch, false);
  }
  await page.evaluate(() => { document.querySelector('input').value = ''; });
  assert.equal(await page.evaluate(() => document.querySelector('form').checkValidity()), false, 'The field stays required');
  console.log('PASS: real browser form accepts bare/www/https website inputs without native URL mismatch; normalization preserves paths and queries, rejects unsafe values and keeps the field required. Isolated fixture only.');
} finally { await browser.close(); }
