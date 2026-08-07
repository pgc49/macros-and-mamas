// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output + marketing/functions for Cloudflare Pages.
// Adapter omitted for now: @astrojs/cloudflare was emitting a reserved ASSETS
// binding that broke the build. Revisit at www cutover if needed.
const enrollmentMode = String(
  process.env.PUBLIC_ENROLLMENT_MODE || 'open',
)
  .trim()
  .toLowerCase();

console.log(
  `[marketing] PUBLIC_ENROLLMENT_MODE=${process.env.PUBLIC_ENROLLMENT_MODE ?? '(unset)'} → ${enrollmentMode}`,
);

export default defineConfig({
  site: 'https://www.macrosandmamas.com',
  output: 'static',
  integrations: [sitemap()],
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },
  vite: {
    // Explicitly bake CF Pages build env into the client bundle.
    // Vite's automatic PUBLIC_* injection is easy to miss on subdirectory builds.
    define: {
      'import.meta.env.PUBLIC_ENROLLMENT_MODE': JSON.stringify(enrollmentMode),
    },
  },
});
