import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync, rmSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export function readTauriBuildConfig(args, projectRoot = process.cwd()) {
  const read = (path) => JSON.parse(readFileSync(resolve(projectRoot,path),'utf8'));
  const merge = (base, extra) => { const result = { ...base }; for (const [key,value] of Object.entries(extra)) result[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(result[key] ?? {},value) : value; return result; };
  let config = merge(read('src-tauri/tauri.conf.json'),read('src-tauri/tauri.linux.conf.json'));
  for (let index = 0; index < args.length; index++) if (args[index] === '--config' && args[index+1]) {
    const value = args[++index]; config = merge(config, value.trim().startsWith('{') ? JSON.parse(value) : read(value));
  }
  return config;
}

// RPM cannot represent SemVer's '-' prerelease separator. Only the RPM header
// uses '~'; the packaged executable and all three application versions stay unchanged.
export async function packageRpmFromDeb(args, projectRoot = process.cwd()) {
  const config = readTauriBuildConfig(args, projectRoot);
  const targetAt = args.indexOf('--target');
  const target = targetAt >= 0 ? args[targetAt + 1] : null;
  if (target && !['x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu'].includes(target)) throw new Error('Unsupported RPM target');
  const bundle = resolve(projectRoot,'src-tauri/target', ...(target ? [target] : []), args.includes('--debug') ? 'debug' : 'release', 'bundle');
  const debs = readdirSync(join(bundle, 'deb')).filter((name) => name.endsWith('.deb') && name.startsWith(config.productName + '_') && name.includes(config.version));
  if (debs.length !== 1) throw new Error('Expected exactly one matching Debian package for RPM conversion');
  const deb = join(bundle, 'deb', debs[0]);
  const field = (name) => execFileSync('dpkg-deb', ['-f', deb, name], { encoding: 'utf8' }).trim();
  const name = field('Package');
  if (!/^[A-Za-z0-9][A-Za-z0-9.+_-]*$/.test(name)) throw new Error('Unsafe RPM package name');
  const architecture = { amd64: 'x86_64', arm64: 'aarch64' }[field('Architecture')];
  if (!architecture) throw new Error('Unsupported Debian architecture');
  const version = config.version.replace('-', '~');
  if (!/^[A-Za-z0-9.~+_]+$/.test(version)) throw new Error('Unsupported RPM version');
  const directory = mkdtempSync(join(tmpdir(), 'flow-rpm-'));
  const staged = join(directory, 'payload'); mkdirSync(staged);
  try {
    execFileSync('dpkg-deb', ['-x', deb, staged]);
    const spec = join(directory, 'flow.spec');
    const files = [];
    const walk = (path) => { for (const file of readdirSync(path)) { const item = join(path,file); if (lstatSync(item).isDirectory()) walk(item); else files.push(item.slice(staged.length)); } };
    walk(staged);
    const manifest = files.map((file) => '"' + file.replaceAll('%','%%').replaceAll('\\','\\\\').replaceAll('"','\\"') + '"').join('\n');
    const dependencies = Object.entries({ Requires:config.bundle.linux?.rpm?.depends, Recommends:config.bundle.linux?.rpm?.recommends }).filter(([,value])=>Array.isArray(value) && value.length).map(([key,value])=> {
      if (!value.every((item)=>typeof item === 'string' && !/[\r\n%]/.test(item))) throw new Error('Unsupported RPM dependency');
      return `${key}: ${value.join(', ')}`;
    }).join('\n');
    const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    writeFileSync(spec, `%global __os_install_post %{nil}\n%global _build_id_links none\nName: ${name}\nVersion: ${version}\nRelease: 1\nSummary: ${config.productName}\nLicense: GPL-3.0-only\nURL: https://github.com/Flow-Tube/Flow-Desktop\nBuildArch: ${architecture}\nAutoReqProv: yes\n${dependencies}\n\n%description\n${config.bundle.longDescription}\n\n%prep\n%build\n%install\nmkdir -p "%{buildroot}"\ncp -a ${quote(staged + '/.')} "%{buildroot}/"\n\n%files\n${manifest}\n`);
    execFileSync('rpmbuild', ['-bb', spec, '--define', `_topdir ${directory}`, '--buildroot', join(directory, 'buildroot'), '--target', architecture], { stdio: 'inherit' });
    const produced = readdirSync(join(directory, 'RPMS', architecture)).filter((file) => file.endsWith('.rpm'));
    if (produced.length !== 1) throw new Error('Expected one RPM output');
    const output = join(bundle, 'rpm'); mkdirSync(output, { recursive: true });
    const destination = join(output, produced[0]); copyFileSync(join(directory,'RPMS',architecture,produced[0]), destination);
    const headerVersion = execFileSync('rpm', ['-qp', '--qf', '%{VERSION}', destination], { encoding: 'utf8' });
    if (headerVersion !== version) throw new Error('RPM version verification failed');
    console.log(`RPM package: ${destination}; RPM header ${version}; application version ${config.version} unchanged`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
