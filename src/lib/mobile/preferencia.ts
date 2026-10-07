/**
 * Quem abre a tela mínima (`/m`) e como a escolha «Versão completa» é lembrada.
 *
 * Decisão 5 da spec (docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md):
 * no celular, quem recebe no próprio nome cai SEMPRE na tela mínima — no app
 * instalado e no navegador. «Versão completa» vale até fechar o app (06/10), e o
 * menu do site ganha «Versão para celular» para desfazer.
 *
 * Quem recebe (`PERFIS_QUE_CONTAM_NO_RECEBIMENTO`) abre a tela pessoal `/m`; o
 * `lider`, que só lidera, abre a da equipe `/m/equipe` (spec da liderança,
 * docs/superpowers/specs/2026-09-30-mobile-lideranca-design.md §1). O elite
 * abre a pessoal e troca para a da equipe lá dentro. Gerência e diretoria
 * seguem no site de sempre.
 */
import {
  PERFIS_QUE_CONTAM_NO_RECEBIMENTO, PERFIS_QUE_SO_LIDERAM, PERFIS_QUE_SUPERVISIONAM_SETOR, ROUTE_PATHS,
} from '@/lib/index';

export const CHAVE_VERSAO = 'mobile:versao';

export type VersaoEscolhida = 'mobile' | 'completa';

/** O que a tela sabe do aparelho. Injetável para teste. */
export interface AmbienteTela {
  /** `(pointer: coarse)` — o dedo é o ponteiro principal. */
  toqueGrosso: boolean;
  /** Largura da janela em px CSS. Só decide quando a tela não é conhecida. */
  largura: number;
  /**
   * O app instalado (`display-mode: standalone`). Instalado é SEMPRE celular:
   * ninguém instala o app no computador para ver o site.
   */
  instalado?: boolean;
  /** Menor e maior lado da TELA (não da janela): girar o celular não muda. */
  menorLado?: number;
  maiorLado?: number;
  /** Aberto pelo endereço do app (`app.`): lá é sempre o app, em qualquer aparelho. */
  enderecoDoApp?: boolean;
}

/**
 * O endereço próprio do app, `app.gestaodeacordos.com.br` (Cleber, 06/10/2026).
 * Por ele, quem tem a tela do celular abre SEMPRE o app — no celular e no
 * computador — e «Versão completa» some: o site completo é o endereço de
 * sempre.
 */
export function ehEnderecoDoApp(
  host: string = typeof window === 'undefined' ? '' : window.location.hostname,
): boolean {
  return host.toLowerCase().startsWith('app.');
}

/**
 * A tela do celular (`/m…`) só abre no endereço do app (Cleber, 07/10/2026).
 * No endereço do site (`www.`, `pagueplay.`) ela manda para o `app.` — ver
 * `SoNoEnderecoDoApp`. `localhost` fica liberado para o desenvolvimento, e o
 * preview da Vercel (`*.vercel.app`) para testar a tela antes de publicar —
 * sem isso o preview mandava para o `app.` de produção (auditoria, 07/10/2026).
 */
export function mobileNesteEndereco(
  host: string = typeof window === 'undefined' ? '' : window.location.hostname,
): boolean {
  const h = host.toLowerCase();
  return ehEnderecoDoApp(h) || h === 'localhost' || h === '127.0.0.1' || h.endsWith('.vercel.app');
}

const URL_DO_APP = ((import.meta.env.VITE_APP_URL as string | undefined)?.trim()
  || 'https://app.gestaodeacordos.com.br').replace(/\/+$/, '');

/** O endereço completo de uma tela do app: `urlNoApp('/m/equipe')`. */
export function urlNoApp(caminho: string): string {
  return `${URL_DO_APP}/#${caminho.startsWith('/') ? caminho : `/${caminho}`}`;
}

/**
 * Até aqui é celular (e tablet em pé). A decisão olha a TELA, e não a janela,
 * desde 06/10/2026: com o celular deitado, ou o navegador em «site para
 * computador», a janela passa de 768 e o app caía no site (relato do Cleber).
 * O maior lado separa notebook com toque (1366×768) de tablet (1024, 1180).
 */
const MENOR_LADO_CELULAR = 768;
const MAIOR_LADO_CELULAR = 1180;

export function ambienteAtual(): AmbienteTela {
  if (typeof window === 'undefined') return { toqueGrosso: false, largura: 0 };
  const tela = window.screen;
  const larguraTela = tela?.width ?? 0;
  const alturaTela = tela?.height ?? 0;
  return {
    toqueGrosso: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    largura: window.innerWidth,
    instalado: (window.matchMedia?.('(display-mode: standalone)').matches ?? false)
      || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    menorLado: larguraTela && alturaTela ? Math.min(larguraTela, alturaTela) : undefined,
    maiorLado: larguraTela && alturaTela ? Math.max(larguraTela, alturaTela) : undefined,
    enderecoDoApp: ehEnderecoDoApp(),
  };
}

export function ehCelular(amb: AmbienteTela = ambienteAtual()): boolean {
  if (amb.instalado || amb.enderecoDoApp) return true;
  if (!amb.toqueGrosso) return false;
  if (amb.menorLado !== undefined && amb.maiorLado !== undefined) {
    return amb.menorLado <= MENOR_LADO_CELULAR && amb.maiorLado <= MAIOR_LADO_CELULAR;
  }
  return amb.largura <= MENOR_LADO_CELULAR;
}

/**
 * «Versão completa» vale só até fechar o app (Cleber, 06/10/2026): fica em
 * `sessionStorage`. Antes ficava em `localStorage` para sempre, e quem tocava
 * uma vez — mesmo sem querer — nunca mais via o app naquele aparelho. A chave
 * antiga é apagada na primeira leitura.
 */
function apagarEscolhaAntiga(): void {
  try { localStorage.removeItem(CHAVE_VERSAO); } catch { /* sem armazenamento */ }
}

/** Sem escolha nesta sessão (ou sem armazenamento) vale a tela mínima. */
export function lerVersao(): VersaoEscolhida {
  apagarEscolhaAntiga();
  if (ehEnderecoDoApp()) return 'mobile';
  try {
    return sessionStorage.getItem(CHAVE_VERSAO) === 'completa' ? 'completa' : 'mobile';
  } catch {
    return 'mobile';
  }
}

/** `mobile` apaga a chave: o padrão já é a tela mínima. */
export function gravarVersao(v: VersaoEscolhida): void {
  try {
    if (v === 'completa') sessionStorage.setItem(CHAVE_VERSAO, 'completa');
    else sessionStorage.removeItem(CHAVE_VERSAO);
  } catch {
    // Modo privado / armazenamento cheio: a escolha vale só nesta tela.
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

/** Quem cuida de um setor (a gerência): abre na tela do setor (06/10/2026). */
function ehGerente(perfil: string | null | undefined): boolean {
  return (PERFIS_QUE_SUPERVISIONAM_SETOR as readonly string[]).includes(perfil ?? '');
}

export function ehPerfilDaTelaMinima(perfil: string | null | undefined): boolean {
  return recebeNoProprioNome(perfil) || ehLider(perfil) || ehGerente(perfil);
}

/**
 * Para onde o celular leva: o líder à tela da equipe, a gerência à do setor,
 * quem recebe no próprio nome à pessoal.
 */
export function destinoMobile(perfil: string | null | undefined): string {
  if (ehGerente(perfil)) return ROUTE_PATHS.MOBILE_SETOR;
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

/**
 * A chave que a tela de destino exige (a mesma do `ProtectedRoute` dela). O
 * desvio confere ANTES de mandar: sem a chave, a tela devolveria para `/`, a `/`
 * mandaria de volta, e a pessoa ficaria num vai e volta sem fim.
 */
export function permissaoDoDestino(destino: string): string {
  return destino === ROUTE_PATHS.MOBILE ? 'ver_dashboard' : 'ver_painel_lider';
}

/** O que o desvio do celular faz numa rota do site. */
export type DecisaoDoDesvio =
  | { tipo: 'nada' }
  | { tipo: 'esperar' }
  | { tipo: 'sem_conexao' }
  | { tipo: 'ir'; destino: string };

/**
 * A decisão do desvio, sem React — ver `useDesvioDoCelular` em `App.tsx`.
 *
 * A ordem importa: sessão e aparelho primeiro (desktop nunca espera nada); o
 * perfil antes de qualquer conclusão (com perfil carregando NUNCA se mostra o
 * site); a chave da tela de destino por último.
 */
export function decidirDesvio(e: {
  temSessao: boolean;
  celular: boolean;
  versaoCompleta: boolean;
  carregando: boolean;
  perfil: string | null | undefined;
  produtoCobranca: boolean;
  permissoesCarregando: boolean;
  temPermissao: (chave: string) => boolean;
}): DecisaoDoDesvio {
  if (!e.temSessao || !e.celular || e.versaoCompleta) return { tipo: 'nada' };
  if (e.carregando) return { tipo: 'esperar' };
  if (!e.perfil) return { tipo: 'sem_conexao' };
  if (!e.produtoCobranca || !ehPerfilDaTelaMinima(e.perfil)) return { tipo: 'nada' };
  const destino = destinoMobile(e.perfil);
  if (e.permissoesCarregando) return { tipo: 'esperar' };
  if (!e.temPermissao(permissaoDoDestino(destino))) return { tipo: 'nada' };
  return { tipo: 'ir', destino };
}
