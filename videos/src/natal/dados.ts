// Os dados de verdade que o vídeo de Natal mostra. Só gincana e pesquisa —
// nenhum número de pagamento (pedido do Cleber, 28/10/2026).
//
// Consultados no banco em 28/10/2026 (leitura, autorizada pelo Cleber):
// `abobora_rodadas` (abóbora, zumbis e bruxas, só as soltas pelo sorteio),
// `chefao_*` (o Rei do Pop), `chefona_*` (a Bruxa do Pântano), `corridas` e
// `corrida_guerra_golpes` (o Cavalo da Guerra). Para mudar, consultar de novo.
//
// 08/11/2026: quem saiu da empresa sai do vídeo. No
// lugar dele entra o próximo de cada lista (consultado no banco em 08/11):
// nos zumbis a Alexia Silva (1.988 ms, no corpo, 09/10) e no Rei do Pop o
// Lucas Nascimento (423 de dano).

/** A primeira abóbora achada no sistema (05/10, a mais rápida do dia). */
export const ACHOU_ABOBORA = { quem: 'Maria Bernabe', tempo: '2,751 s', rapida: true };
export const PLACAR_ABOBORA = [
  { nome: 'Pedro Alves', pegos: 2, ms: 1612 },
  { nome: 'Julia Caetano', pegos: 2, ms: 1728 },
  { nome: 'Maria Bernabe', pegos: 1, ms: 2751 },
  { nome: 'Maria E Pereira', pegos: 1, ms: 2791 },
  { nome: 'Emily Aquino', pegos: 1, ms: 3917 },
];

/** O placar da Caça aos Zumbis (os cinco primeiros). */
export const PLACAR_ZUMBIS = [
  { nome: 'Alexia Silva', setor: '', pegos: '1', headshots: '0' },
  { nome: 'Layra Carini', setor: '', pegos: '1', headshots: '1' },
  { nome: 'Gabriely Alves', setor: '', pegos: '1', headshots: '0' },
  { nome: 'Leticia Andrade', setor: '', pegos: '1', headshots: '1' },
];
export const RECORDE_ZUMBIS = { nome: 'Alexia Silva', tempo: '1,988 s' };

/**
 * Quem aparece na faixa matando os três zumbis da cena, na ordem dos tiros
 * (headshot, corpo, headshot) — gente que matou desse jeito, com o tempo dela.
 */
export const MATADORES = [
  { quem: 'Layra Carini', setor: '', msTiro: 2454 },
  { quem: 'Alexia Silva', setor: '', msTiro: 1988 },
  { quem: 'Leticia Andrade', setor: '', msTiro: 2656 },
];

/** O Rei do Pop zumbi: a luta grande (rodada 1), derrotado com 62 pessoas. */
export const REI_DO_POP = {
  vidaMax: 10840,
  pessoas: 62,
  golpeFinal: 'Igor Rocha',
  top: [
    { nome: 'Igor Rocha', dano: 516 },
    { nome: 'Heloisa Lima', dano: 434 },
    { nome: 'Lucas Nascimento', dano: 423 },
  ],
};

/** Caça às Bruxas (as cinco primeiras). */
export const PLACAR_BRUXAS = [
  { nome: 'Kauane Azevedo', setor: '', pegos: 2, ms: 3692 },
  { nome: 'Helton Paulino Roldon', setor: 'Playmix', pegos: 1, ms: 1185 },
  { nome: 'Nicole Pacheco', setor: '', pegos: 1, ms: 1194 },
  { nome: 'Caio Shimite', setor: 'Conecta Play', pegos: 1, ms: 1416 },
  { nome: 'Mirian Barbosa', setor: '', pegos: 1, ms: 1455 },
];

/** A Bruxa do Pântano, derrotada em 16/10. */
export const BRUXA_DO_PANTANO = {
  golpeFinal: 'Eduardo Naia',
  top: [
    { nome: 'Pedro Pugina Verdinasse', dano: 1728 },
    { nome: 'Erika Eduarda', dano: 1643 },
    { nome: 'Eduardo Naia', dano: 1523 },
  ],
};

/** As corridas de outubro: quem venceu cada uma. */
export const CORRIDAS = [
  { tipo: 'bichinhos', vencedor: 'Eduardo Naia' },
  { tipo: 'bichinhos', vencedor: 'Gabriel Martin' },
  { tipo: 'bichinhos', vencedor: 'Ingrid Nascimento' },
  { tipo: 'bichinhos', vencedor: 'Eduardo Melo' },
  { tipo: 'bichinhos', vencedor: 'Camila Ribeiro' },
  { tipo: 'bichinhos', vencedor: 'Tainara Fernanda' },
  { tipo: 'bichinhos', vencedor: 'Gustavo Melo' },
  { tipo: 'cavalos', vencedor: 'Gabriel Oliveira' },
  { tipo: 'bichinhos', vencedor: 'Layra Carini' },
  { tipo: 'cavalos', vencedor: 'Isabele Barros' },
  { tipo: 'bichinhos', vencedor: 'Geovanna Raissa' },
  { tipo: 'bichinhos', vencedor: 'Vitoria Grosso' },
  { tipo: 'cavalos', vencedor: 'Camila Ribeiro' },
  { tipo: 'bichinhos', vencedor: 'Nayara Macedo' },
  { tipo: 'cavalos', vencedor: 'Bianca Santera' },
  { tipo: 'bichinhos', vencedor: 'Rayane Estevan' },
  { tipo: 'bichinhos', vencedor: 'Gabriela Gonçalves' },
] as const;

/** O Cavalo da Guerra (corrida 15): quem mais causou dano. */
export const CAVALO_DA_GUERRA = [
  { nome: 'Laura', setor: 'Playmix' },
  { nome: 'Maria E Pereira', setor: 'Playmix' },
  { nome: 'Debora Portela da Silva', setor: 'Receptivo' },
  { nome: 'Gustavo Nunes', setor: 'Playmix' },
  { nome: 'Eduardo Melo', setor: 'Receptivo' },
];

/** Pesquisa «Cafezinho», 8 a 13/10/2026 — da apresentação «Gestão de Acordos — Resultados». */
export const PESQUISA = {
  votos: 250,
  aprovacao: 97.6,
  curtindo: { n: 196, pct: 78.4 },
  ok: { n: 48, pct: 19.2 },
  ruim: { n: 6, pct: 2.4 },
  comentarios: 24,
};

/** Frases da pesquisa, sem o nome de quem escreveu — só o setor. */
export const COMENTARIOS = [
  { texto: 'Maravilhosoooo, melhor criação até hoje!', setor: 'Play 1' },
  { texto: 'Muito prático na rotina de trabalho, adorei.', setor: 'Play 3' },
  { texto: 'Gestão de Acordos é uma mãe! Parabéns aos desenvolvedores.', setor: 'Play Mix Marília' },
  { texto: 'Arrasaram com o tema de Halloween: a lanterna até acende e apaga, dá até para matar a aranha.', setor: 'Play 5' },
  { texto: 'Amandoooo', setor: 'Conecta Play' },
  { texto: 'Eficaz.', setor: 'Play Mix Marília' },
];
