import type { Empresa } from '@/lib/supabase';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';

export interface TenantBranding {
  appName: string;
  shortName: string;
  tagline: string;
  loginTitle: string;
  loginSubtitle: string;
  registerSubtitle: string;
  supportText: string;
}

export interface TenantFeatures {
  allowSelfRegistration: boolean;
  allowSuperAdminTenantSwitch: boolean;
}

export interface TenantRuntimeConfig {
  slug: string;
  siteUrl: string | null;
  branding: TenantBranding;
  features: TenantFeatures;
}

const DEFAULT_BRANDING: TenantBranding = {
  appName: 'Gestão de Acordos',
  shortName: 'Gestão de Acordos',
  tagline: 'Sistema de Gestão de Acordos',
  loginTitle: 'Gestão de Acordos',
  loginSubtitle: 'Sistema de Gestão de Acordos',
  registerSubtitle: 'Cadastro vinculado automaticamente à empresa deste site',
  supportText: 'Problemas com acesso? Contate o administrador do sistema.',
};

const DEFAULT_FEATURES: TenantFeatures = {
  allowSelfRegistration: true,
  allowSuperAdminTenantSwitch: true,
};

const TENANT_OVERRIDES: Record<string, Partial<TenantBranding>> = {
  bookplay: {
    loginSubtitle: 'Operação Bookplay',
    registerSubtitle: 'Cadastro vinculado automaticamente à empresa principal',
  },
  pagueplay: {
    loginSubtitle: 'Operação Pagueplay',
    registerSubtitle: 'Cadastro vinculado automaticamente à Pagueplay',
  },
};

function normalizeSlug(value: string | undefined | null): string {
  return value?.trim().toLowerCase() ?? '';
}

/** Detecta o slug do tenant pelo hostname quando VITE_TENANT_SLUG não está configurado. */
function detectSlugFromHostname(): string {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname.toLowerCase();
  if (host.includes('pagueplay')) return 'pagueplay';
  if (host.includes('bookplay')) return 'bookplay';
  return '';
}

export function getConfiguredTenantSlug(): string {
  const envSlug = normalizeSlug(import.meta.env.VITE_TENANT_SLUG as string | undefined);
  return envSlug || detectSlugFromHostname();
}

export function getConfiguredSiteUrl(): string | null {
  const siteUrl = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();

  if (siteUrl) {
    return siteUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return null;
}

export function getConfiguredAuthRedirectUrl(): string | null {
  const redirectUrl = (import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined)?.trim();

  if (!redirectUrl) {
    return null;
  }

  return redirectUrl.replace(/\/+$/, '');
}

export function buildAuthRedirectUrl(): string | undefined {
  const authRedirectUrl = getConfiguredAuthRedirectUrl();
  return authRedirectUrl ? `${authRedirectUrl}/` : undefined;
}

export function getTenantBranding(slug: string, empresa?: Empresa | null): TenantBranding {
  const override = TENANT_OVERRIDES[normalizeSlug(slug)] ?? {};
  const companyName = empresa?.nome?.trim();

  return {
    ...DEFAULT_BRANDING,
    ...override,
    shortName: companyName || override.shortName || DEFAULT_BRANDING.shortName,
  };
}

export function getTenantRuntimeConfig(empresa?: Empresa | null): TenantRuntimeConfig {
  // Impersonação cruza tenant (bookplay/pagueplay são deploys separados,
  // cada um com VITE_TENANT_SLUG fixo no build) — durante impersonação, a
  // empresa REAL do usuário impersonado manda no branding/capabilities,
  // não o slug fixo do site onde o super_admin está logado.
  // Prioridade normal: env var → hostname → slug da empresa no banco
  const slug = getImpersonacaoAtiva()
    ? (normalizeSlug(empresa?.slug) || getConfiguredTenantSlug())
    : (getConfiguredTenantSlug() || normalizeSlug(empresa?.slug));

  return {
    slug,
    siteUrl: getConfiguredSiteUrl(),
    branding: getTenantBranding(slug, empresa),
    features: DEFAULT_FEATURES,
  };
}
