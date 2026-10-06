import type { Empresa } from '@/lib/supabase';
import { produtoDaEmpresa, type Produto } from '@/lib/produto';
import { getImpersonacaoAtiva } from '@/services/impersonacao.service';
import { getEmpresaEscolhida } from '@/services/empresaAtiva.service';

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

/**
 * O nome do sistema por PRODUTO, e não por slug.
 *
 * «Gestão de Acordos» é o nome da cobrança. No Comercial ninguém faz acordo:
 * o menu lateral abria com o aperto de mãos e «Gestão de Acordos» em cima da
 * aba Vendas (pedido de 21/09/2026). Vai por produto porque o vendedor entra
 * também pelo domínio da BookPlay — o slug do build diria «bookplay», e a
 * empresa dele diz `comercial`.
 */
const BRANDING_POR_PRODUTO: Partial<Record<Produto, Partial<TenantBranding>>> = {
  comercial: {
    appName: 'Gestão Comercial',
    tagline: 'Sistema de Gestão Comercial',
    loginTitle: 'Gestão Comercial',
    loginSubtitle: 'Operação Comercial',
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

/**
 * Quem é desta empresa pode entrar por este site?
 *
 * BookPlay e PaguePlay deixaram de ser divisão de empresa: são um produto só
 * (a cobrança), e o que muda a visão de cada pessoa é a regra do setor dela —
 * Nosso produto ou Cofen (Cleber, 06/10/2026). Então quem é de uma entra pelo
 * site da outra, e pelo `app.`, e continua na própria empresa. A trava só
 * separa produtos diferentes: Comercial e RH não entram pela cobrança.
 */
export function siteAceitaEmpresa(
  siteSlug: string | null | undefined,
  empresa: (Pick<Empresa, 'slug'> & { produto?: string | null }) | null | undefined,
): boolean {
  const site = normalizeSlug(siteSlug);
  const daEmpresa = normalizeSlug(empresa?.slug);
  if (!site || !daEmpresa || site === daEmpresa) return true;
  return produtoDaEmpresa(empresa) === 'cobranca' && produtoDaEmpresa(null, site) === 'cobranca';
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
  const produto = produtoDaEmpresa(empresa, slug);
  const doProduto = (produto && BRANDING_POR_PRODUTO[produto]) || {};
  const companyName = empresa?.nome?.trim();

  return {
    ...DEFAULT_BRANDING,
    ...override,
    ...doProduto,
    shortName: companyName || override.shortName || DEFAULT_BRANDING.shortName,
  };
}

export function getTenantRuntimeConfig(empresa?: Empresa | null): TenantRuntimeConfig {
  // Dois casos cruzam tenant (bookplay/pagueplay são deploys separados, cada um
  // com VITE_TENANT_SLUG fixo no build):
  //
  //   • IMPERSONAÇÃO — a empresa real do usuário impersonado manda, não o slug
  //     do site onde o super_admin está logado;
  //   • TROCA DE EMPRESA pelo super_admin — a empresa escolhida manda.
  //
  // Nos dois, o slug do build descreve o DOMÍNIO e não onde a pessoa está. Sem
  // isto, trocar de empresa mudaria os dados e deixaria para trás o nome, as
  // cores e `isPaguePlay` — que decide desde o rótulo "Pendente"/"Agendado" até
  // o H.O. aparecer ou não.
  //
  // `getEmpresaEscolhida` lê a chave sem conferir cargo, o que basta aqui: quem
  // valida é `useEmpresa`, e enquanto não validou o `empresa` continua sendo o do
  // domínio — então `empresa?.slug` devolve o mesmo slug do build de qualquer
  // forma. Conferir cargo nesta função exigiria torná-la assíncrona.
  //
  // Prioridade normal: env var → hostname → slug da empresa no banco
  //
  // E um terceiro, desde 06/10/2026: quem é da BookPlay entrando pelo site da
  // PaguePlay (ou o contrário, ou pelo `app.`) — `useEmpresa` entrega a empresa
  // DELE, e o slug tem de ser o dela para `isPaguePlay` ler a regra do setor.
  const doSite = getConfiguredTenantSlug();
  const daEmpresa = normalizeSlug(empresa?.slug);
  const outraDaCobranca = !!daEmpresa && !!doSite && daEmpresa !== doSite && siteAceitaEmpresa(doSite, empresa);
  const cruzaTenant = !!getImpersonacaoAtiva() || !!getEmpresaEscolhida() || outraDaCobranca;
  const slug = cruzaTenant ? (daEmpresa || doSite) : (doSite || daEmpresa);

  return {
    slug,
    siteUrl: getConfiguredSiteUrl(),
    branding: getTenantBranding(slug, empresa),
    features: DEFAULT_FEATURES,
  };
}
