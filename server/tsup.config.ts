import { defineConfig } from 'tsup';

/**
 * Shared by `npm run build` (dist/) and `npm run build:vercel` (dist-vercel/); entries and output
 * folders come from the CLI. `@souqly/shared` is TypeScript source, so it must be bundled
 * (the tsup CLI has no flag for noExternal). Every other dependency stays external, except in the
 * Vercel build: `sanitize-html` is CommonJS and `require()`s the ESM-only `htmlparser2`, which the
 * Vercel Node runtime rejects (ERR_REQUIRE_ESM), so that chain is bundled into the function.
 */
const vercel = process.argv.some((a) => a.includes('dist-vercel'));

export default defineConfig({
  noExternal: ['@souqly/shared', ...(vercel ? ['sanitize-html', 'htmlparser2', 'domhandler', 'domutils', 'domelementtype', 'entities', 'deepmerge', 'is-plain-object', 'parse-srcset', 'postcss', 'nanoid', 'picocolors', 'source-map-js', 'escape-string-regexp'] : [])],
  // Bundled CommonJS code calls require() for Node built-ins; ESM output needs a real require.
  ...(vercel ? { banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } } : {}),
});
