#!/usr/bin/env node
import { run } from '../src/cli.js';

run().catch((err) => {
  process.stderr.write(`未預期的錯誤：${err?.stack || err}\n`);
  process.exit(1);
});
