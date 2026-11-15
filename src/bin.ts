#!/usr/bin/env node
/**
 * DockSmith CLI Executable Entry Point
 * Author: Jatin Sharma <raghavjatin245@gmail.com>
 * https://jatinsh.netlify.app/
 */

import { runCli } from './cli.js';

try {
  runCli(process.argv.slice(2));
} catch (err: unknown) {
  console.error('[fatal docksmith error]', err);
  process.exit(1);
}
