/**
 * Quem abre a tela mínima (`/m`) e como a escolha «Versão completa» é lembrada.
 *
 * Decisão 5 da spec (docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md):
 * no celular, quem recebe no próprio nome cai SEMPRE na tela mínima — no app
 * instalado e no navegador. «Versão completa» fica lembrado NO APARELHO, e o
 * menu do site ganha «Versão para celular» para desfazer.
 *
 * Quem recebe (`PERFIS_QUE_CONTAM_NO_RECEBIMENTO`) abre a tela pessoal `/m`; o
 * `lider`, que só lidera, abre a da equipe `/m/equipe` (spec da liderança,
 * docs/superpowers/specs/2026-09-30-mobile-lideranca-design.md §1). O elite
 * abre a pessoal e troca para a da equipe lá dentro. Gerência e diretoria
 * seguem no site de sempre.
 */
import { PERFIS_QUE_CONTAM_NO_RECEBIMENTO, PERFIS_QUE_SO_LIDERAM, ROUTE_PATHS } from '@/lib/index';

export const CHAVE_VERSAO = 'mobile:versao';

export type VersaoEscolhida = 'mobile' | 'completa';

/** O que a tela sabe do aparelho. Injetável para teste. */
export interface AmbienteTela {
  /** `(pointer: coarse)` — o dedo é o ponteiro principal. */
  toqueGrosso: boolean;
  /** Largura da janela em px CSS. */
  largura: number;
}

/** Até aqui é celular (e tablet em pé). Acima, notebook com toque não conta. */
const LARGURA_MAXIMA_CELULAR = 768;

export function ambienteAtual(): AmbienteTela {
  if (typeof window === 'undefined') return { toqueGrosso: false, largura: 0 };
  return {
    toqueGrosso: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    largura: window.innerWidth,
  };
}

export function ehCelular(amb: AmbienteTela = ambienteAtual()): boolean {
  return amb.toqueGrosso && amb.largura <= LARGURA_MAXIMA_CELULAR;
}

/** Sem escolha gravada (ou sem `localStorage`) vale a tela mínima. */
export function lerVersao(): VersaoEscolhida {
  try {
    return localStorage.getItem(CHAVE_VERSAO) === 'completa' ? 'completa' : 'mobile';
  } catch {
    return 'mobile';
  }
}

/** `mobile` apaga a chave: o padrão já é a tela mínima. */
export function gravarVersao(v: VersaoEscolhida): void {
  try {
    if (v === 'completa') localStorage.setItem(CHAVE_VERSAO, 'completa');
    else localStorage.removeItem(CHAVE_VERSAO);
  } catch {
    // Modo privado / armazenamento cheio: a escolha vale só nesta visita.
  }
}

/** Cargo que conta no recebimento: a tela pessoal. */
function recebeNoProprioNome(perfil: string | null | undefined): boolean {
  return (PERFIS_QUE_CONTAM_NO_RECEBIMENTO as readonly string[]).includes(perfil ?? '');
}

/** Só lidera — não recebe em nome próprio, então não tem a tela pessoal. */
export function ehLider(perfil: string | null | undefined): boolean {
  return (PERFIS_QUE_SO_LIDERAM as readonly string[]).includes(perfil ?? '');
}

export function ehPerfilDaTelaMinima(perfil: string | null | undefined): boolean {
  return recebeNoProprioNome(perfil) || ehLider(perfil);
}

/** Para onde o celular leva: a tela da equipe para o líder, a pessoal para os demais. */
export function destinoMobile(perfil: string | null | undefined): string {
  return ehLider(perfil) ? ROUTE_PATHS.MOBILE_EQUIPE : ROUTE_PATHS.MOBILE;
}

/**
 * Super admin abre a tela mínima para TESTE (pedido de 30/09/2026): ela pede
 * antes um operador e entra como ele pela impersonação. Não é redirecionado —
 * usa o site completo no celular como sempre; chega pelo ícone do cabeçalho.
 */
export function ehSuperAdmin(perfil: string | null | undefined): boolean {
  return perfil === 'super_admin';
}

/** Quem vê o ícone «Versão para celular» no cabeçalho do site. */
export function ofereceVersaoCelular(
  perfil: string | null | undefined,
  amb: AmbienteTela = ambienteAtual(),
): boolean {
  if (ehSuperAdmin(perfil)) return true;
  return ehPerfilDaTelaMinima(perfil) && ehCelular(amb);
}

export function deveAbrirMobile(
  perfil: string | null | undefined,
  amb: AmbienteTela = ambienteAtual(),
): boolean {
  return ehPerfilDaTelaMinima(perfil) && ehCelular(amb) && lerVersao() === 'mobile';
}
