// O roteiro das cenas 3–11: quando cada clique acontece (amarrado às palavras
// da narração), para onde o cursor anda e para onde a câmera olha.

import { cena, palavra } from '../linhaDoTempo';
import { ms, s } from '../movimento';
import { temposCena2 } from '../cenas/Cena02Virada';
import type { PontoCursor } from '../componentes/Cursor';
import { CHAT, CONTEUDO, pontoMenu, type IdMenu } from './layout';

// ── alvos clicáveis (coordenadas do app 1600×900) ─────────────────────
export const ALVO = {
  // Novo acordo
  campoValor: { x: 745, y: 414 },
  chip3x: { x: 851, y: 516 },
  campoVencimento: { x: 1105, y: 414 },
  salvar: { x: 1183, y: 786 },
  // Acordos
  linha: (i: number) => 270 + i * 64 + 32,
  statusX: CONTEUDO.x + 960,
  reagendar: { x: 1404, y: 270 + 3 * 64 + 32 },
  diaNovo: { x: 1336, y: 719 },
  // Dashboard
  abaEquipe: { x: 501, y: 162 },
  abaSetor: { x: 647, y: 162 },
  linhaVoce: { x: 640, y: 300 + 2 * 74 + 37 },
  // Campanhas
  cartaoLembrete: { x: 560, y: 330 },
  estrelaLembrete: { x: 318, y: 460 },
  enviarLembrete: { x: 829, y: 460 },
  // Chat
  chat: CHAT,
  enviarChat: { x: 1538, y: 842 },
};

export function tempoApp() {
  const t2 = temposCena2();
  const c3 = cena('cena-03');
  const c4 = cena('cena-04');
  const c5 = cena('cena-05');
  const c6 = cena('cena-06');
  const c7 = cena('cena-07');
  const c8 = cena('cena-08');
  const c9 = cena('cena-09');
  const c10 = cena('cena-10');
  const c11 = cena('cena-11');
  const c12 = cena('cena-12');

  const clique = {
    novo: palavra('cena-04', 'registre') - ms(80),
    valor: palavra('cena-04', 'valor') - ms(120),
    parcelas: palavra('cena-04', 'parcelas'),
    vencimento: palavra('cena-04', 'vencimento'),
    salvar: palavra('cena-04', 'salvo'),
    acordos: c5.voz - ms(220),
    pago: palavra('cena-05', 'pago'),
    reagendar: palavra('cena-05', 'reagenda'),
    dia: palavra('cena-05', 'cliques'),
    desempenho: c6.voz - ms(220),
    dashboard: c7.voz - ms(200),
    abaEquipe: palavra('cena-07', 'equipe') - ms(60),
    abaSetor: palavra('cena-07', 'setor') - ms(60),
    campanhas: c8.voz - ms(220),
    estrela: palavra('cena-08', 'mensagem'),
    enviar: palavra('cena-08', 'clique'),
    chat: palavra('cena-09', 'lider'),
    enviarChat: palavra('cena-09', 'sistema'),
  };

  const t = {
    expandir: t2.expandir,
    janelaPronta: t2.expandir + s(0.95),
    conteudo: t2.expandir + s(0.55),
    c3, c4, c5, c6, c7, c8, c9, c10, c11, c12,
    clique,
    // cena 3 — detalhes que acendem
    detalhes: [
      palavra('cena-03', 'cada'),
      palavra('cena-03', 'detalhe'),
      palavra('cena-03', 'faz'),
      palavra('cena-03', 'diferenca'),
    ],
    // cena 4
    digitaCliente: clique.novo + ms(420),
    toast: palavra('cena-04', 'pronto'),
    // cena 5
    pendente: palavra('cena-05', 'pendente'),
    // cena 6
    contaRecebido: palavra('cena-06', 'acompanha'),
    anelMeta: palavra('cena-06', 'quanto', 1),
    falta: palavra('cena-06', 'falta'),
    atualizado: palavra('cena-06', 'atualizado'),
    // cena 7
    tudoAqui: palavra('cena-07', 'tudo'),
    voce: palavra('cena-07', 'voce'),
    // cena 8
    lembrete: palavra('cena-08', 'lembrete'),
    whatsapp: palavra('cena-08', 'ja'),
    // cena 9
    avisoChat: c9.inicio + ms(80),
    digitaChat: palavra('cena-09', 'fala'),
    // cena 10
    metaEnche: palavra('cena-10', 'meta'),
    explode: palavra('cena-10', 'todos'),
    reacoes: [palavra('cena-10', 'comemoram'), palavra('cena-10', 'com'), palavra('cena-10', 'voce')],
    // cena 11
    computador: palavra('cena-11', 'computador'),
    celular: palavra('cena-11', 'celular'),
    // cena 12
    fecha: c12.inicio,
  };
  return t;
}

export type TempoApp = ReturnType<typeof tempoApp>;

/** Qual tela está aberta, e desde quando. */
export function telas(t: TempoApp): { id: IdMenu; entra: number; sai: number }[] {
  return [
    { id: 'inicio', entra: t.conteudo, sai: t.clique.novo + ms(60) },
    { id: 'novo', entra: t.clique.novo + ms(60), sai: t.clique.acordos + ms(60) },
    { id: 'acordos', entra: t.clique.acordos + ms(60), sai: t.clique.desempenho + ms(60) },
    { id: 'desempenho', entra: t.clique.desempenho + ms(60), sai: t.clique.dashboard + ms(60) },
    { id: 'dashboard', entra: t.clique.dashboard + ms(60), sai: t.clique.campanhas + ms(60) },
    { id: 'campanhas', entra: t.clique.campanhas + ms(60), sai: Infinity },
  ];
}

export function menuAtivo(t: TempoApp, frame: number): IdMenu {
  const atual = [...telas(t)].reverse().find((x) => frame >= x.entra);
  return atual?.id ?? 'inicio';
}

export function cliquesMenu(t: TempoApp): { id: IdMenu; f: number }[] {
  return [
    { id: 'novo', f: t.clique.novo },
    { id: 'acordos', f: t.clique.acordos },
    { id: 'desempenho', f: t.clique.desempenho },
    { id: 'dashboard', f: t.clique.dashboard },
    { id: 'campanhas', f: t.clique.campanhas },
  ];
}

export function rotaDoCursor(t: TempoApp): { pontos: PontoCursor[]; cliques: number[] } {
  const c = t.clique;
  const m = (id: IdMenu, f: number) => ({ f, ...pontoMenu(id) });
  const pontos: PontoCursor[] = [
    { f: t.c3.inicio, x: 900, y: 640 },
    // cena 3: passeia pelos detalhes que acendem
    { f: t.detalhes[0] + ms(60), x: 440, y: 330, viagemMs: 700 },
    { f: t.detalhes[1] + ms(60), x: 980, y: 520, viagemMs: 520 },
    { f: t.detalhes[2] + ms(60), x: 1300, y: 600, viagemMs: 520 },
    { f: t.detalhes[3] + ms(60), x: 1250, y: 790, viagemMs: 520 },
    // cena 4
    m('novo', c.novo),
    { f: c.valor, ...ALVO.campoValor, viagemMs: 600 },
    { f: c.parcelas, ...ALVO.chip3x, viagemMs: 420 },
    { f: c.vencimento, ...ALVO.campoVencimento, viagemMs: 480 },
    { f: c.salvar, ...ALVO.salvar, viagemMs: 700 },
    // cena 5
    m('acordos', c.acordos),
    { f: c.pago - ms(40), x: ALVO.statusX, y: ALVO.linha(1), viagemMs: 700 },
    { f: t.pendente - ms(40), x: ALVO.statusX, y: ALVO.linha(0), viagemMs: 420 },
    { f: c.reagendar, ...ALVO.reagendar, viagemMs: 650 },
    { f: c.dia, ...ALVO.diaNovo, viagemMs: 420 },
    // cena 6
    m('desempenho', c.desempenho),
    { f: t.contaRecebido + ms(200), x: 640, y: 330, viagemMs: 800 },
    { f: t.falta + ms(80), x: 1380, y: 345, viagemMs: 700 },
    // cena 7
    m('dashboard', c.dashboard),
    { f: c.abaEquipe, ...ALVO.abaEquipe, viagemMs: 650 },
    { f: c.abaSetor, ...ALVO.abaSetor, viagemMs: 420 },
    { f: t.voce, ...ALVO.linhaVoce, viagemMs: 650 },
    // cena 8
    m('campanhas', c.campanhas),
    { f: t.lembrete + ms(100), ...ALVO.cartaoLembrete, viagemMs: 650 },
    { f: c.estrela, ...ALVO.estrelaLembrete, viagemMs: 520 },
    { f: c.enviar, ...ALVO.enviarLembrete, viagemMs: 600 },
    // cena 9
    { f: c.chat, x: ALVO.chat.x, y: ALVO.chat.y, viagemMs: 700 },
    { f: t.digitaChat, x: 1340, y: 842, viagemMs: 500 },
    { f: c.enviarChat, ...ALVO.enviarChat, viagemMs: 520 },
  ];
  const cliques = [
    c.novo, c.valor, c.parcelas, c.vencimento, c.salvar,
    c.acordos, c.reagendar, c.dia,
    c.desempenho,
    c.dashboard, c.abaEquipe, c.abaSetor,
    c.campanhas, c.estrela, c.enviar,
    c.chat, c.enviarChat,
  ];
  return { pontos, cliques };
}

export type Camera = { f: number; z: number; x: number; y: number; durMs?: number };

/** Para onde a câmera olha (x, y no app) e quanto aproxima (z). */
export function cameraDoRoteiro(t: TempoApp): Camera[] {
  const c = t.clique;
  return [
    { f: t.janelaPronta, z: 1, x: 800, y: 450 },
    { f: t.detalhes[0], z: 1.06, x: 840, y: 520, durMs: 2200 },
    { f: c.novo + ms(500), z: 1.16, x: 925, y: 500, durMs: 900 },
    { f: c.salvar + ms(600), z: 1.08, x: 900, y: 470, durMs: 700 },
    { f: c.acordos + ms(450), z: 1.1, x: 960, y: 420, durMs: 800 },
    { f: c.reagendar + ms(150), z: 1.22, x: 1180, y: 540, durMs: 800 },
    { f: c.desempenho + ms(450), z: 1.08, x: 900, y: 420, durMs: 800 },
    { f: t.anelMeta, z: 1.14, x: 1060, y: 360, durMs: 900 },
    { f: c.dashboard + ms(450), z: 1.04, x: 900, y: 500, durMs: 800 },
    { f: t.voce + ms(150), z: 1.3, x: 680, y: 470, durMs: 900 },
    { f: c.campanhas + ms(450), z: 1.06, x: 880, y: 480, durMs: 800 },
    { f: t.whatsapp + ms(200), z: 1.12, x: 1080, y: 470, durMs: 800 },
    { f: c.chat + ms(300), z: 1.16, x: 1180, y: 560, durMs: 800 },
    { f: t.c10.inicio + ms(400), z: 1, x: 800, y: 450, durMs: 700 },
  ];
}
