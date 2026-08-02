// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://www.macrosandmamas.com',
  output: 'static',
  integrations: [sitemap()],
  // Build-time sharp optimization — no Cloudflare Images binding needed for preview.
  adapter: cloudflare({
    imageService: 'compile',
  }),
});
