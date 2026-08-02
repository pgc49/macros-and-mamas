/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_ENROLLMENT_MODE?: 'waitlist' | 'open';
  readonly PUBLIC_NOINDEX?: string;
  readonly PUBLIC_META_PIXEL_ID?: string;
  readonly PUBLIC_META_DOMAIN_VERIFY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
