// Refuses `npm publish` run in a package directory, where npm packs again and
// leaves `publishConfig.exports` out. How a package here is published is
// CONTRIBUTING.md, **The release**.
if (!process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  console.error(
    'Publish the tarball pnpm check:pack writes, as release.yml does. CONTRIBUTING.md, The release, says how.',
  )
  process.exit(1)
}
