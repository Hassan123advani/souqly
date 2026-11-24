import { defineConfig } from 'tsup';

/**
 * Shared by `npm run build` (dist/) and `npm run build:vercel` (dist-vercel/); entries and output
 * folders come from the CLI. `@souqly/shared` is TypeScript source, so it must be bundled
 * (the tsup CLI has no flag for noExternal). Every other dependency stays external.
 */
export default defineConfig({
  noExternal: ['@souqly/shared'],
});
