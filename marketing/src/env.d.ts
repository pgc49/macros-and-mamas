/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_ENROLLMENT_MODE?: 'waitlist' | 'open';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
