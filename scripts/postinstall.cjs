const { execFileSync } = require('node:child_process');

const explicit = process.env.SPIGOT_ENABLE_POSTINSTALL === '1';

if (!explicit) {
  console.log('[spigot] postinstall is intentionally inert. Run `pnpm run rebuild:native` when native Electron modules need rebuilding.');
  process.exit(0);
}

execFileSync('electron-builder', ['install-app-deps'], { stdio: 'inherit', shell: process.platform === 'win32' });
