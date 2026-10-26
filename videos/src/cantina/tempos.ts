// O vídeo «A cantina no Gestão de Acordos» (26/10/2026): para o pessoal da
// cantina, sem voz. Quem explica são as manchetes e os balões escritos. Tudo
// acontece nestes instantes: as telas, o cursor, a câmera, os balões e a trilha
// leem daqui. Mexer num número reencaixa o resto.

import { ms, s } from '../movimento';

export const T = {
  janela: 0,

  // ── 1. a aba nova ─────────────────────────────────────────────────────
  cursorAparece: s(1.0),
  cliqueMenu: s(2.4),
  /** A aba Cantina abre: o cardápio ainda sem fotos. */
  tela: s(2.6),

  // ── 2. as fotos ───────────────────────────────────────────────────────
  /** A página desce até os cards… */
  fotos: s(7.6),
  /** …e as fotos entram, uma por card. */
  fotosEntram: s(8.6),
  /** Volta ao topo; a vitrine abre espaço no cabeçalho. */
  sobe: s(11.6),
  vitrine: s(12.4),

  // ── 3. o pedido ───────────────────────────────────────────────────────
  pedido: s(18.4),
  cliqueSalada: s(20.0),
  cliqueEgg: s(21.2),
  cliqueHora: s(22.8),
  cliqueRevisar: s(23.9),
  cliqueConfirmar: s(27.4),
  /** Enviado: o aviso e o pedido aberto, em «Recebido». */
  enviado: s(27.6),

  // ── 4. o painel da cantina ────────────────────────────────────────────
  painel: s(32.4),
  /** O pedido novo cai na coluna Novos. */
  chega: s(33.6),
  cliquePreparar: s(36.8),
  cliquePronto: s(39.8),
  cliqueEntregue: s(42.8),
  exportar: s(44.0),

  /** A janela recolhe. */
  fim: s(47.0),
  /** O fechamento: o que a cantina ganhou. */
  fechamento: s(47.4),
  total: s(55.4),
};

/** Os trocos de estado, um pouco depois do clique (o dedo solta). */
export const MUDA = {
  salada: T.cliqueSalada + 6,
  egg: T.cliqueEgg + 6,
  hora: T.cliqueHora + 6,
  revisar: T.cliqueRevisar + 6,
  preparando: T.cliquePreparar + 6,
  pronto: T.cliquePronto + 6,
  entregue: T.cliqueEntregue + 6,
};

/** A vitrine troca de foto a cada tanto (no app são 4,5 s; aqui, mais rápido). */
export const VITRINE_PASSO = ms(1700);
