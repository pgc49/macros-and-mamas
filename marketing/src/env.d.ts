/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_ENROLLMENT_MODE?: 'waitlist' | 'open';
  readonly PUBLIC_NOINDEX?: string;
  readonly PUBLIC_META_PIXEL_ID?: string;
  readonly PUBLIC_META_DOMAIN_VERIFY?: string;
  /** Cloudflare Web Analytics beacon token (aggregate pageviews). */
  readonly PUBLIC_CF_WEB_ANALYTICS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
