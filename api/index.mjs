// Vercel serverless function: the whole Express API (/api/v1, /uploads, /robots.txt, /sitemap.xml are
// rewritten here by vercel.json). The bundle is produced by `npm run build:vercel -w server` during the
// Vercel build; see docs/deploy-vercel.md. Local development never uses this file.
export { default } from '../server/dist-vercel/vercel.js';
