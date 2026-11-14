#!/usr/bin/env node
/** 编译并运行 AI 引擎测试，输出 PASS/FAIL 后以退出码反馈。 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(root, '.test-build/ai');

mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'package.json'), '{"type":"commonjs"}\n');

const tsc = path.join(root, 'node_modules/.bin/tsc');
execFileSync(tsc, ['-p', path.join(here, 'tsconfig.json')], { cwd: root, stdio: 'inherit' });

const scripts = [
  path.join(out, 'tests/ai/crosscheck.js'),
  path.join(out, 'tests/ai/suite.js'),
];
for (const script of scripts) {
  console.log(`\n=== ${path.basename(script)} ===`);
  execFileSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });
}
console.log('\nAI 测试全部通过。');
