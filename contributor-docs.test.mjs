import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = import.meta.dirname;
const read = file => readFileSync(path.join(root, file), 'utf8');

test('every environment variable the code reads is documented in .env.example', () => {
  const example = read('.env.example');
  const used = new Set();
  for (const file of readdirSync(root).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')))
    for (const match of read(file).matchAll(/\b(WICKLUME_[A-Z_]+|GOOGLE_[A-Z_]+|TWELVE_[A-Z_0-9]+|OPENAI_[A-Z_]+|CHROME_PATH)\b/g)) used.add(match[1]);
  assert(used.size >= 10);
  for (const name of used) assert(example.includes(name), `${name} missing from .env.example`);
});

test('.env.example sets nothing live and is not git-ignored', () => {
  for (const line of read('.env.example').split('\n'))
    assert(!line.trim() || line.startsWith('#'), `Uncommented setting would be live: ${line}`);
  assert(read('.gitignore').includes('!.env.example'));
});

test('repository has an explicit code licence that excludes third-party chart code', () => {
  const licence = read('LICENSE');
  assert(licence.startsWith('MIT License'));
  assert(licence.includes('lightweight-charts-LICENSE.txt'));
  assert(existsSync(path.join(root, 'public/lightweight-charts-LICENSE.txt')));
});

test('contributor docs cover architecture, migrations, flags, providers and content permission', () => {
  const architecture = read('docs/ARCHITECTURE.md');
  for (const word of ['Data flow', 'migrations', 'Feature flags', 'GOOGLE_CLIENT_ID', 'TWELVE_DATA_API_KEY', 'OPENAI_MODEL']) assert(architecture.includes(word), word);
  const development = read('docs/DEVELOPMENT.md');
  for (const word of ['No production secrets', 'npm test', 'npm run build:pages', 'npm run test:charts', 'Provider setup']) assert(development.includes(word), word);
  const contributing = read('CONTRIBUTING.md');
  for (const word of ['MIT', 'CC BY 4.0', 'docs/DEVELOPMENT.md', 'Feature ticket']) assert(contributing.includes(word), word);
});

test('feature ticket template records ID, owner, dependencies, scope, acceptance and validation', () => {
  const template = read('.github/ISSUE_TEMPLATE/feature_ticket.md');
  for (const field of ['**ID**', '**Owner**', '**Dependencies**', '**Scope**', '**Acceptance criteria**', '**Validation**']) assert(template.includes(field), field);
});

test('package test script runs this file', () => {
  assert(JSON.parse(read('package.json')).scripts.test.includes('contributor-docs.test.mjs'));
});
