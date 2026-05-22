const execPath = process.env.npm_execpath || '';
const userAgent = process.env.npm_config_user_agent || '';
const isPnpm = userAgent.includes('pnpm/') || execPath.toLowerCase().includes('pnpm');

if (!isPnpm) {
  console.error('[spigot] Use PNPM via Corepack: corepack enable && corepack pnpm install');
  process.exit(1);
}
