/**
 * MODELO DE TESTE — as cores do Desafio Cobrança, para escolher (16/11/2026).
 *
 * Cada tema é o jogo inteiro de variáveis `--dc-*` que a gaveta, o ingresso,
 * o prêmio, o relógio, o cartão individual e a TV usam. O escolhido entra
 * como um `<style>` por cima do padrão do CSS (o «Pôr do sol»). O modelo abre
 * na «Noite de Natal» (o novo padrão, 16/11/2026).
 */

export interface CoresDoDesafio {
  /** O céu: topo, meio e pé do degradê. */
  noite: string; noite2: string; noite3: string;
  /** Os dois brilhos do céu (canto de baixo). */
  brilho1: string; brilho2: string;
  /** Véu: branco nos temas escuros, preto no claro (os tons transparentes). */
  veu: string;
  cartao: string; cartaoBorda: string;
  texto: string; suave: string;
  /** O destaque (rótulos, ponteiro) e o 2º tom do degradê. */
  ouro: string; coral: string;
  /** O texto em cima do destaque (a aba escolhida, o ícone do dia de hoje). */
  sobreOuro: string;
  verde: string; vermelho: string; foco: string;
  /** O ingresso e o prêmio: o degradê forte, o degradê claro e a tinta escura em cima deles. */
  quente1: string; quente2: string; quente3: string;
  claro1: string; claro2: string;
  tinta: string; tintaOk: string;
  /** O canhoto escuro do ingresso, com a hora. */
  canhoto: string; canhotoTexto: string;
  /** O verso das cartas dos dias. */
  verso: string;
  trilho: string; marca: string; estrela: string; sol: string;
  /** O cartão «Sua meta individual». */
  minha: string; minha2: string; minhaTexto: string;
}

export interface TemaDoDesafio {
  id: string;
  nome: string;
  sobre: string;
  grupo: 'natal' | 'outros';
  /** O céu do ingresso vira neve caindo (só na gaveta; a TV fica parada). */
  neve?: boolean;
  /** Os enfeites de Natal: pisca-pisca, sincelos, laço, estrela, montes de neve. */
  enfeites?: boolean;
  cores: CoresDoDesafio;
}

const POR_DO_SOL: CoresDoDesafio = {
  noite: '#0d1226', noite2: '#1a1838', noite3: '#2a1c3c',
  brilho1: 'rgba(255, 127, 92, 0.26)', brilho2: 'rgba(255, 192, 77, 0.14)',
  veu: '#ffffff', cartao: 'rgba(255, 255, 255, 0.06)', cartaoBorda: 'rgba(255, 255, 255, 0.14)',
  texto: '#f7f4ee', suave: '#c4c8da',
  ouro: '#ffc04d', coral: '#ff7f5c', sobreOuro: '#2b1400', verde: '#45e0a0', vermelho: '#ff8a8a', foco: '#8ec5ff',
  quente1: '#ffd36b', quente2: '#ff9a5c', quente3: '#ff6f61', claro1: '#ffe4a3', claro2: '#ffc27a',
  tinta: '#2b1400', tintaOk: '#052a1a',
  canhoto: 'rgba(43, 20, 0, 0.88)', canhotoTexto: '#ffe7a8',
  verso: '#232650', trilho: 'rgba(255, 255, 255, 0.12)', marca: 'rgba(255, 255, 255, 0.7)', estrela: '#ffffff', sol: '#fff3c4',
  minha: '#8ec5ff', minha2: '#b39dff', minhaTexto: '#cfe6ff',
};

export const TEMAS: TemaDoDesafio[] = [
  // ── Natal ──────────────────────────────────────────────────────────────
  // Os três de Natal têm a mesma família de enfeites (pisca-pisca, sincelos,
  // neve, laço) e tons bem separados: noite (escuro), gelo (claro), clássico
  // (verde e vermelho). Nenhum se confunde com o outro.
  {
    id: 'noite-de-natal', nome: 'Noite de Natal', grupo: 'natal', neve: true, enfeites: true,
    sobre: 'O azul do Gestão à noite, com branco e ciano de gelo e o vermelho do Natal.',
    cores: {
      ...POR_DO_SOL,
      // O céu é o azul-petróleo do Gestão (matiz 220), descendo para a noite.
      noite: '#06192a', noite2: '#0a2a42', noite3: '#103d5a',
      brilho1: 'rgba(126, 232, 250, 0.2)', brilho2: 'rgba(255, 255, 255, 0.07)',
      cartao: 'rgba(255, 255, 255, 0.06)', cartaoBorda: 'rgba(186, 230, 253, 0.18)',
      texto: '#f4fbff', suave: '#b4cddd',
      // Destaque gelo (ciano) indo para o branco; o vermelho fica para o pessoal.
      ouro: '#7ee8fa', coral: '#ffffff', sobreOuro: '#062433',
      verde: '#6ee7a8', vermelho: '#ff8a8a', foco: '#a5f3fc',
      // O ingresso e o prêmio: branco-gelo.
      quente1: '#ffffff', quente2: '#e6f9fe', quente3: '#a5ecf8', claro1: '#ffffff', claro2: '#e6f9fe',
      tinta: '#06303f', tintaOk: '#053b2a',
      canhoto: 'rgba(9, 38, 58, 0.95)', canhotoTexto: '#e6f9fe',
      verso: '#0f3552', trilho: 'rgba(186, 230, 253, 0.14)', marca: 'rgba(255, 255, 255, 0.7)',
      estrela: '#ffffff', sol: '#ffffff',
      minha: '#ff6b6b', minha2: '#ffa3a3', minhaTexto: '#ffd9d9',
    },
  },
  {
    id: 'natal-gelo', nome: 'Natal gelo', grupo: 'natal', neve: true, enfeites: true,
    sobre: 'Claro: branco de neve com o azul do Gestão e o vermelho do Natal.',
    cores: {
      ...POR_DO_SOL,
      noite: '#fbfeff', noite2: '#eef9fd', noite3: '#d4eef7',
      brilho1: 'rgba(34, 195, 230, 0.22)', brilho2: 'rgba(255, 255, 255, 0.9)',
      veu: '#06293a', cartao: 'rgba(255, 255, 255, 0.86)', cartaoBorda: 'rgba(11, 95, 135, 0.16)',
      texto: '#0a2536', suave: '#456577',
      // O destaque é o primary do Gestão (azul-petróleo, L 0.45 · matiz 220).
      ouro: '#0b6f99', coral: '#22c3e6', sobreOuro: '#ffffff',
      verde: '#04784f', vermelho: '#c81e1e', foco: '#0b6f99',
      quente1: '#ffffff', quente2: '#dff6fc', quente3: '#8fe3f4', claro1: '#ffffff', claro2: '#e8f9fd',
      tinta: '#06293a', tintaOk: '#053b2a',
      canhoto: 'rgba(8, 45, 66, 0.95)', canhotoTexto: '#e6f9fe',
      verso: '#f2fbfe', trilho: 'rgba(11, 95, 135, 0.12)', marca: 'rgba(11, 95, 135, 0.45)',
      estrela: 'rgba(11, 111, 153, 0.35)', sol: '#ffffff',
      minha: '#d62e2e', minha2: '#f26b6b', minhaTexto: '#a3171f',
    },
  },
  {
    id: 'natal-classico', nome: 'Natal clássico', grupo: 'natal', neve: true, enfeites: true,
    sobre: 'Verde de pinheiro, vermelho e dourado, de árvore de Natal.',
    cores: {
      ...POR_DO_SOL,
      noite: '#0b1d14', noite2: '#11281c', noite3: '#3a0c12',
      brilho1: 'rgba(220, 38, 38, 0.28)', brilho2: 'rgba(250, 204, 21, 0.14)',
      suave: '#c9d8cd', ouro: '#fbbf24', coral: '#ef4444', sobreOuro: '#2b1400',
      verde: '#4ade80', foco: '#fde68a',
      quente1: '#fde68a', quente2: '#f87171', quente3: '#dc2626', claro1: '#fef3c7', claro2: '#fecaca',
      tinta: '#3b0a0a', canhoto: 'rgba(12, 36, 24, 0.94)', canhotoTexto: '#fde68a',
      verso: '#163224', sol: '#fffbeb', minha: '#86efac', minha2: '#4ade80', minhaTexto: '#dcfce7',
    },
  },
  // ── Outras ─────────────────────────────────────────────────────────────
  {
    id: 'por-do-sol', nome: 'Pôr do sol', grupo: 'outros', sobre: 'O de antes: céu de fim de tarde, dourado e coral.',
    cores: POR_DO_SOL,
  },
  {
    id: 'grafite', nome: 'Grafite e ouro', grupo: 'outros', sobre: 'Preto e dourado: sóbrio, de premiação.',
    cores: {
      ...POR_DO_SOL,
      noite: '#0b0b0d', noite2: '#16161a', noite3: '#202026',
      brilho1: 'rgba(212, 175, 55, 0.2)', brilho2: 'rgba(255, 255, 255, 0.05)',
      suave: '#b9b9c2', ouro: '#e5c36b', coral: '#c9a227', foco: '#f8e7b0',
      quente1: '#f8e7b0', quente2: '#e5c36b', quente3: '#b8892b', claro1: '#faf0d2', claro2: '#ecd9a0',
      tinta: '#2a1f05', canhoto: 'rgba(16, 13, 5, 0.94)', canhotoTexto: '#f8e7b0',
      verso: '#24242a', sol: '#fffaeb', minha: '#93c5fd', minha2: '#c4d4ff', minhaTexto: '#dbeafe',
    },
  },
];

/** Sem escolha nenhuma vale o Pôr do sol (as variáveis do CSS). */
export const TEMA_PADRAO = TEMAS.find(t => t.id === 'por-do-sol')!;
/** O que o modelo abre quando ninguém escolheu ainda: o novo padrão (16/11). */
export const TEMA_INICIAL = TEMAS.find(t => t.id === 'noite-de-natal')!;

const PARA_CSS: Record<keyof CoresDoDesafio, string> = {
  noite: '--dc-noite', noite2: '--dc-noite-2', noite3: '--dc-noite-3',
  brilho1: '--dc-brilho-1', brilho2: '--dc-brilho-2', veu: '--dc-veu',
  cartao: '--dc-cartao', cartaoBorda: '--dc-cartao-borda', texto: '--dc-texto', suave: '--dc-suave',
  ouro: '--dc-ouro', coral: '--dc-coral', sobreOuro: '--dc-sobre-ouro', verde: '--dc-verde', vermelho: '--dc-vermelho', foco: '--dc-foco',
  quente1: '--dc-quente-1', quente2: '--dc-quente-2', quente3: '--dc-quente-3', claro1: '--dc-claro-1', claro2: '--dc-claro-2',
  tinta: '--dc-tinta', tintaOk: '--dc-tinta-ok', canhoto: '--dc-canhoto', canhotoTexto: '--dc-canhoto-texto',
  verso: '--dc-verso', trilho: '--dc-trilho', marca: '--dc-marca', estrela: '--dc-estrela', sol: '--dc-sol',
  minha: '--dc-minha', minha2: '--dc-minha-2', minhaTexto: '--dc-minha-texto',
};

/** O `<style>` do tema: vale para a gaveta (`.dc`) e para a TV (`.dc-tv`). */
export function cssDoTema(t: TemaDoDesafio): string {
  const linhas = (Object.keys(PARA_CSS) as (keyof CoresDoDesafio)[]).map(k => `  ${PARA_CSS[k]}: ${t.cores[k]};`);
  return `html .dc, html .dc-tv {\n${linhas.join('\n')}\n}`;
}
