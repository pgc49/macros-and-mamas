/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_ENROLLMENT_MODE?: 'waitlist' | 'open';
  readonly PUBLIC_NOINDEX?: string;
  readonly PUBLIC_META_PIXEL_ID?: string;
  readonly PUBLIC_META_DOMAIN_VERIFY?: string;
  /** Cloudflare Web Analytics beacon token (aggregate pageviews). */
  readonly PUBLIC_CF_WEB_ANALYTICS_TOKEN?: string;
  /** Google Tag Manager container (GTM-XXXX). */
  readonly PUBLIC_GTM_ID?: string;
  /** GA4 measurement ID (G-XXXX). */
  readonly PUBLIC_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
