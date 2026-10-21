import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { packageRpmFromDeb, readTauriBuildConfig } from './package-rpm.mjs';
const require = createRequire(import.meta.url);
const cli = require.resolve('@tauri-apps/cli/tauri.js');
const args = process.argv.slice(2);
const combined = args.findIndex((value)=>value.startsWith('--bundles='));
if (combined >= 0) args.splice(combined,1,'--bundles',args[combined].slice('--bundles='.length));
if (args.includes('ios') || (process.platform === 'darwin' && args.includes('build') && !args.includes('--no-bundle'))) throw new Error('Apple builds are upstream-only; this fork packages Windows and Linux.');
let at = args.indexOf('--bundles');
let requested = at >= 0 ? args[at + 1]?.split(',') ?? [] : [];
if (process.platform === 'linux' && args[0] === 'build' && at < 0 && !args.includes('--no-bundle') && !args.includes('--help') && !args.includes('-h')) {
  const targets = readTauriBuildConfig(args).bundle.targets;
  requested = (targets === 'all' ? ['deb','rpm','appimage'] : Array.isArray(targets) ? targets : [targets]).filter((value)=>['deb','rpm','appimage'].includes(value));
  if (requested.includes('rpm')) { at = args.length; args.push('--bundles',requested.join(',')); }
}
const rpm = process.platform === 'linux' && args[0] === 'build' && !args.includes('--no-bundle') && requested.includes('rpm');
const forwarded = [...args];
if (rpm) forwarded[at + 1] = [...new Set([...requested.filter((value) => value !== 'rpm'), 'deb'])].join(',');
const result = spawnSync(process.execPath, [cli, ...forwarded], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (rpm) await packageRpmFromDeb(args);
