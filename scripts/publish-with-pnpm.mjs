// Why a package here is published with `pnpm publish` alone is
// CONTRIBUTING.md, **What `@annetaan/leko` ships**.
if (!process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  console.error('Publish with pnpm publish. CONTRIBUTING.md, What @annetaan/leko ships, says why.')
  process.exit(1)
}
