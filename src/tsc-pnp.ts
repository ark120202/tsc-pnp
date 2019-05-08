#!/usr/bin/env node
import fs from 'fs';
import Module from 'module';

const tscPath = require.resolve('typescript/lib/tsc');
const tsc = fs.readFileSync(tscPath, 'utf8');
const patchPath = require.resolve('./patch');
const patchImport = `require(${JSON.stringify(patchPath)})`;

const patchedCode = tsc
  .replace(/tsc /g, 'tsc-pnp ')
  .replace('ts.executeCommandLine(ts.sys.args)', `${patchImport}.default(ts);$&`);

const m = new Module(tscPath);
m.filename = tscPath;
(m as any)._compile(patchedCode, tscPath);
