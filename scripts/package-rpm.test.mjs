import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageRpmFromDeb, readTauriBuildConfig } from './package-rpm.mjs';

test('RPM preserves the branded desktop entry without generating invalid spaced dependencies', { timeout: 60000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'flow-rpm-test-'));
  const config = readTauriBuildConfig([]);
  try {
    mkdirSync(join(root, 'src-tauri'), { recursive: true });
    for (const file of ['tauri.conf.json', 'tauri.linux.conf.json']) {
      writeFileSync(join(root, 'src-tauri', file), readFileSync(new URL('../src-tauri/' + file, import.meta.url)));
    }
    const staged = join(root, 'staged');
    for (const directory of ['DEBIAN', 'usr/bin', 'usr/share/applications']) mkdirSync(join(staged, directory), { recursive: true });
    chmodSync(join(staged, 'DEBIAN'), 0o755);
    writeFileSync(join(staged, 'DEBIAN/control'), `Package: flow-desktop-packaging-fixture\nVersion: ${config.version}\nArchitecture: amd64\nMaintainer: Packaging fixture <fixture@example.invalid>\nDescription: Generated packaging regression fixture\n`);
    const executable = join(staged, 'usr/bin/flow-packaging-fixture');
    writeFileSync(executable, '#!/bin/sh\nexit 0\n'); chmodSync(executable, 0o755);
    const desktop = `[Desktop Entry]\nType=Application\nName=${config.productName}\nExec=flow-packaging-fixture\nMimeType=x-scheme-handler/flow;\n`;
    writeFileSync(join(staged, 'usr/share/applications', config.productName + '.desktop'), desktop);
    const bundle = join(root, 'src-tauri/target/x86_64-unknown-linux-gnu/release/bundle');
    mkdirSync(join(bundle, 'deb'), { recursive: true });
    execFileSync('dpkg-deb', ['--build', staged, join(bundle, 'deb', `${config.productName}_${config.version}_amd64.deb`)]);
    await packageRpmFromDeb(['build', '--target', 'x86_64-unknown-linux-gnu', '--bundles', 'deb,rpm'], root);
    const rpm = join(bundle, 'rpm', readdirSync(join(bundle, 'rpm'))[0]);
    const query = (...args) => execFileSync('rpm', ['--dbpath', join(root, 'rpmdb'), '-qp', ...args, rpm], { encoding: 'utf8' });
    assert.equal(query('--qf', '%{SUMMARY}'), config.productName);
    assert.equal(query('--qf', '%{VERSION}'), config.version.replace('-', '~'));
    assert.match(query('--provides'), /application\(io\.github\.aedev\.flow\.desktop\.desktop\)/);
    const name = `/usr/share/applications/${config.identifier}.desktop`;
    const digest = query('--qf', '[%{FILENAMES} %{FILEDIGESTS}\n]').split('\n').find((line) => line.startsWith(name + ' '));
    assert.equal(digest, name + ' ' + createHash('sha256').update(desktop).digest('hex'));
    assert.doesNotMatch(query('--list'), /applications\/Flow-Tube /);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
