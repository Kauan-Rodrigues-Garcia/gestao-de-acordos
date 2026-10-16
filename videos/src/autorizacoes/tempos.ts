// O vídeo «Autorizações no chat» (15/10/2026): curto, sem voz, só efeitos.
// Tudo acontece nestes instantes — as cenas, o cursor, a câmera e a trilha
// leem daqui. Mexer num número reencaixa o resto.

import { s } from '../movimento';

export const T = {
  /** A janela do sistema entra. */
  janela: 0,
  /** O botão antigo aparece no canto, pulsando. */
  dock: s(0.9),
  /** O botão sai voando para o chat… */
  voa: s(2.5),
  /** …e cai dentro da bolha. */
  chega: s(3.25),
  /** Pedido novo: o aviso do chat. */
  aviso: s(4.4),
  avisoSai: s(7.0),
  cursorAparece: s(5.2),
  cliqueBolha: s(6.6),
  cliqueLinha: s(8.3),
  cliqueAprovar: s(10.0),
  cliqueConfirmar: s(11.2),
  /** O primeiro pedido desce para o histórico e o segundo sobe. */
  reordena: s(11.9),
  cliqueRecusar: s(13.2),
  cliqueRecusarConfirma: s(14.4),
  /** A janela recolhe. */
  fim: s(16.2),
  /** O fechamento: o passo a passo do líder. */
  fechamento: s(16.6),
  total: s(21.5),
};

/** Frame em que o pedido 1 vira «Autorizado» e o 2 vira «Recusado». */
export const DECIDE = {
  aprovado: T.cliqueConfirmar + 6,
  recusado: T.cliqueRecusarConfirma + 6,
};
