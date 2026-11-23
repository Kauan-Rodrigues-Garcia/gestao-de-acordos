/**
 * As cores do Desafio Cobrança (16/11/2026). Seguem o Gestão de quem olha
 * (decisão do usuário, 16/11/2026):
 *
 *   sem o Natal ligado .............. «Grafite e ouro»
 *   Natal ligado, tema claro ........ «Natal gelo»
 *   Natal ligado, tema escuro ....... «Noite de Natal»
 *
 * «Natal ligado» é o mesmo do resto do app (`useTemaNatal`, que já desconta
 * quem desligou o Natal no menu de temas); escuro é `ehTemaEscuro` (Escuro,
 * Cinza Escuro, Azul Profundo). A TV não tem pessoa: é sempre escura, e o
 * Natal vem do banco (`fn_desafio_cobranca_tv` → `natal`).
 *
 * Cada tema é o jogo inteiro de variáveis `--dc-*` que a gaveta, o ingresso,
 * o prêmio, o relógio, o cartão individual e a TV usam (`desafio-cobranca.css`),
 * postas como `style` no próprio elemento. Os de Natal ligam os enfeites
 * (`data-natal`).
 */
import type { CSSProperties } from 'react';
import { useTheme } from 'next-themes';
import { useTemaNatal } from '@/components/Natal/tema';
import { ehTemaEscuro } from '@/lib/temas';

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

export type IdDoTema = 'noite-de-natal' | 'natal-gelo' | 'grafite' | 'vale-natal-claro' | 'vale-campanha';

export interface TemaDoDesafio {
  id: IdDoTema;
  nome: string;
  sobre: string;
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
  // Os dois de Natal têm os mesmos enfeites (pisca-pisca, sincelos, neve,
  // laço): noite para o Gestão escuro, gelo para o claro.
  {
    id: 'noite-de-natal', nome: 'Noite de Natal', neve: true, enfeites: true,
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
    id: 'natal-gelo', nome: 'Natal gelo', neve: true, enfeites: true,
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
  // ── Outras ─────────────────────────────────────────────────────────────
  {
    id: 'grafite', nome: 'Grafite e ouro', sobre: 'Preto e dourado: sóbrio, de premiação.',
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

const porId = (id: IdDoTema) => TEMAS.find(t => t.id === id)!;

/** A regra (16/11/2026): sem Natal, Grafite e ouro; com Natal, gelo no claro e noite no escuro. */
export function temaDoDesafio(natal: boolean, escuro: boolean): TemaDoDesafio {
  if (!natal) return porId('grafite');
  return porId(escuro ? 'noite-de-natal' : 'natal-gelo');
}

/** O tema de quem está olhando o Gestão agora (troca junto com o tema do app). */
export function useTemaDoDesafio(): TemaDoDesafio {
  const natal = useTemaNatal() !== null;
  // O forçado vem antes: o app do celular força o claro, e o `resolvedTheme`
  // continuaria dizendo o tema escolhido no site.
  const { resolvedTheme, forcedTheme } = useTheme();
  return temaDoDesafio(natal, ehTemaEscuro(forcedTheme ?? resolvedTheme));
}

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

/** As variáveis do tema, para o `style` do elemento `.dc` (gaveta) ou `.dc-tv` (TV). */
export function varsDoTema(t: TemaDoDesafio): CSSProperties {
  const v: Record<string, string> = {};
  for (const k of Object.keys(PARA_CSS) as (keyof CoresDoDesafio)[]) v[PARA_CSS[k]] = t.cores[k];
  return v as CSSProperties;
}

/** As propriedades do elemento: as cores e, se for de Natal, o `data-natal`. */
export function atributosDoTema(t: TemaDoDesafio): { style: CSSProperties; 'data-natal'?: '' } {
  return t.enfeites ? { style: varsDoTema(t), 'data-natal': '' } : { style: varsDoTema(t) };
}

/** A estrela de 5 pontas centrada em (cx, cy). */
export function caminhoDaEstrela(cx: number, cy: number, raio: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? raio * 0.45 : raio;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

