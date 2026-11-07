// Render the actual template using sample data only. No environment or mail API.
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, mocks = {}) {
  const result = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: result, exports: result.exports, URL, require: name => mocks[name] });
  return result.exports;
}
const plans = load('lib/submissionPlans.ts');
const { submissionConfirmationEmail } = load('lib/emails/submissionConfirmation.ts', { '@/lib/submissionPlans': plans });
const preview = submissionConfirmationEmail({ order_id: '3c4ee6bc-6d17-4e85-9a3c-ae42e77dc8e1', product_name: 'CursorFlow', plan: 'growth' }, 'https://www.indieclash.com');
fs.mkdirSync('scratch/email-preview', { recursive: true });
fs.writeFileSync('scratch/email-preview/confirmation.html', preview.html);
fs.writeFileSync('scratch/email-preview/confirmation.txt', preview.text);
console.log('Preview saved to scratch/email-preview/confirmation.html (sample data only).');
