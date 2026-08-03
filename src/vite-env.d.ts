/// <reference types="vite/client" />

// Global constants defined at build time
declare const __ROUTE_MESSAGING_ENABLED__: boolean;
declare const __APP_VERSION__: string;
/** Build identificável no Sentry: commit curto, ou o timestamp como reserva. */
declare const __APP_RELEASE__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_TENANT_SLUG?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_AUTH_REDIRECT_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
