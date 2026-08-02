// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output + marketing/functions for Cloudflare Pages.
// Adapter omitted for now: @astrojs/cloudflare was emitting a reserved ASSETS
// binding that broke the build. Revisit at www cutover if needed.
export default defineConfig({
  site: 'https://www.macrosandmamas.com',
  output: 'static',
  integrations: [sitemap()],
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },
});
