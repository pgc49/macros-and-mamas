// @ts-check
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * Enrollment mode source of truth: marketing/wrangler.toml `[vars]`.
 * CF Pages manages plaintext vars from wrangler.toml (dashboard = secrets only).
 * Flip PUBLIC_ENROLLMENT_MODE there between "open" and "waitlist", then deploy.
 */
function readEnrollmentMode() {
  const fromEnv = process.env.PUBLIC_ENROLLMENT_MODE;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    return String(fromEnv).trim().toLowerCase() === 'open' ? 'open' : 'waitlist';
  }
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const toml = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
    const match = toml.match(
      /^\s*PUBLIC_ENROLLMENT_MODE\s*=\s*"([^"]+)"/m,
    );
    const fromToml = match?.[1]?.trim().toLowerCase();
    if (fromToml === 'open' || fromToml === 'waitlist') return fromToml;
  } catch {
    /* fall through */
  }
  return 'open';
}

const enrollmentMode = readEnrollmentMode();

console.log(`[marketing] PUBLIC_ENROLLMENT_MODE → ${enrollmentMode}`);

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
  vite: {
    define: {
      'import.meta.env.PUBLIC_ENROLLMENT_MODE': JSON.stringify(enrollmentMode),
    },
  },
});
