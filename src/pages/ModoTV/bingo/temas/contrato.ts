/**
 * contrato.ts — o que um tema do Bingo entrega.
 *
 * O motor (TV, cartela, central) desenha tudo com estas peças e não sabe qual
 * tema está rodando. Tema novo = um arquivo nesta pasta + uma linha em
 * `index.ts`. Cada tema é carregado só quando uma partida o usa.
 */
import type { ComponentType } from 'react';
import type { TemaBingoId, TipoVitoria } from '../tipos';

export interface CoresDaCartela {
  fundo: string;
  borda: string;
  /** Sombra/relevo embaixo da cartela. */
  sombra: string;
  cabecalhoFundo: string;
  cabecalhoTexto: string;
  celulaFundo: string;
  celulaTexto: string;
  /** Raio da cartela e da célula, em px na cartela de 56 px por célula. */
  raio: number;
  raioCelula: number;
  marcaFundo: string;
  marcaTexto: string;
  /** A marca que o sistema pôs (a pessoa demorou). */
  autoFundo: string;
  autoTexto: string;
  estrelaFundo: string;
  estrelaTexto: string;
  /** Contorno da pedra da sorte e da linha vencedora. */
  sorte: string;
  vence: string;
}

export interface TemaBingo {
  id: TemaBingoId;
  nome: string;
  /** Google Fonts (só o `family=`), baixado quando o tema entra. */
  fonteUrl: string | null;
  familia: string;
  /** Corpo relativo da fonte nos números pequenos (letra de pixel é larga). */
  escalaNumero: number;
  /** Fundo da tela da TV. */
  fundoTv: string;
  texto: string;
  suave: string;
  destaque: string;
  /** Caixas da TV (quadro das 75, últimas pedras). */
  caixa: string;
  quadro: { fundo: string; texto: string; acesaFundo: string; acesaTexto: string; letraFundo: string; letraTexto: string };
  cartela: CoresDaCartela;
  /** A aba da cartela dobrada e o botão «BINGO!». */
  aba: { fundo: string; texto: string };
  botao: { fundo: string; texto: string; sombra: string };
  frases: { abertura: string; quina: string; cheia: string };
  /** O que gira na TV. `girando` = está sorteando agora. */
  Maquina: ComponentType<{ girando: boolean; tamanho: number }>;
  /** O que sai com o número: bola, moeda… */
  Bola: ComponentType<{ numero: number; tamanho: number; brilho?: boolean }>;
  /** O enfeite de tela cheia da comemoração (atrás dos ganhadores). */
  Festa: ComponentType<{ tipo: TipoVitoria }>;
}
