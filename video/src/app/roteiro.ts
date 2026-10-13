// O roteiro das cenas 3–11: quando cada clique acontece (amarrado às palavras
// da narração), qual tela está aberta, para onde o cursor anda e para onde a
// câmera olha.
//
// O cursor e a câmera miram em ALVOS — elementos com `data-alvo` nas telas.
// As posições vêm de `alvos.json`, que `npm run medir` grava a partir do
// próprio desenho. Mudou uma tela? Rode de novo e o cursor acha o lugar novo.

import { cena, palavra } from '../linhaDoTempo';
import { ms, s } from '../movimento';
import { temposCena2 } from '../cenas/Cena02Virada';
import type { PontoCursor } from '../componentes/Cursor';
import alvosJson from './alvos.json';
import { APP_A, APP_L, type IdMenu } from './layout';

// ── alvos medidos ───────────────────────────────────────────────────────
export type Retangulo = { x: number; y: number; l: number; a: number };
/** Por alvo: [frame a partir do qual vale, x, y, largura, altura]. */
const ALVOS = alvosJson as unknown as Record<string, [number, number, number, number, number][]>;
const avisados = new Set<string>();

/** O retângulo do alvo no frame `f` (a medida mais recente até ali). */
export function alvo(nome: string, f: number): Retangulo {
  const lista = ALVOS[nome];
  if (!lista || lista.length === 0) {
    if (!avisados.has(nome)) {
      avisados.add(nome);
      console.warn(`[roteiro] alvo "${nome}" sem medida — rode npm run medir`);
    }
    return { x: APP_L / 2 - 40, y: APP_A / 2 - 20, l: 80, a: 40 };
  }
  let escolhido = lista[0];
  for (const m of lista) {
    if (m[0] <= f) escolhido = m;
    else break;
  }
  const [, x, y, l, a] = escolhido;
  return { x, y, l, a };
}

/** Ponto dentro do alvo: (0,0) é o centro; `fx`/`fy` em fração da largura/altura. */
export function ponto(nome: string, f: number, fx = 0, fy = 0) {
  const r = alvo(nome, f);
  return { x: r.x + r.l / 2 + fx * r.l, y: r.y + r.a / 2 + fy * r.a };
}

// ── tempos ──────────────────────────────────────────────────────────────
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
    // cena 4 — novo acordo
    novo: palavra('cena-04', 'registre') - ms(80),
    nr: palavra('cena-04', 'acordo') - ms(60),
    valor: palavra('cena-04', 'valor') - ms(100),
    parcelas: palavra('cena-04', 'parcelas') - ms(40),
    vencimento: palavra('cena-04', 'vencimento') - ms(40),
    dia: palavra('cena-04', 'vencimento') + ms(620),
    salvar: palavra('cena-04', 'salvo') - ms(30),
    // cena 5 — acordos
    acordos: c5.voz - ms(200),
    pago: palavra('cena-05', 'pago'),
    reagendar: palavra('cena-05', 'reagenda') + ms(60),
    confirmar: palavra('cena-05', 'cliques') + ms(120),
    // cena 6 — desempenho do dia
    desempenho: c6.voz - ms(160),
    // cena 7 — dashboard, equipe e setor
    fecharDia: c7.inicio + ms(60),
    dashboard: c7.voz + ms(160),
    equipe: palavra('cena-07', 'equipe') - ms(40),
    setor: palavra('cena-07', 'setor') - ms(40),
    minhaVisao: palavra('cena-07', 'voce') - ms(60),
    // cena 8 — lembrete no WhatsApp
    acordos2: c8.voz - ms(200),
    whats: palavra('cena-08', 'lembrete') + ms(160),
    mensagem: palavra('cena-08', 'clique') + ms(40),
    enviarZap: palavra('cena-08', 'whatsapp') + ms(80),
    // cena 9 — chat com o líder
    chat: palavra('cena-09', 'lider') - ms(40),
    campoChat: palavra('cena-09', 'fala') - ms(60),
    enviarChat: palavra('cena-09', 'sistema') + ms(60),
  };

  return {
    expandir: t2.expandir,
    janelaPronta: t2.expandir + s(0.95),
    conteudo: t2.expandir + s(0.5),
    c3, c4, c5, c6, c7, c8, c9, c10, c11, c12,
    clique,
    // cena 3 — os detalhes que acendem
    organizado: palavra('cena-03', 'organizado'),
    detalhes: [
      palavra('cena-03', 'cada'),
      palavra('cena-03', 'detalhe'),
      palavra('cena-03', 'faz'),
      palavra('cena-03', 'diferenca'),
    ],
    rolaDash: palavra('cena-03', 'faz') - ms(60),
    // cena 4
    digitaNr: clique.nr + ms(120),
    toastNovo: palavra('cena-04', 'pronto'),
    // cena 5
    pendente: palavra('cena-05', 'pendente'),
    // cena 6
    contaRecebido: palavra('cena-06', 'acompanha'),
    falta: palavra('cena-06', 'falta'),
    atualizado: palavra('cena-06', 'atualizado'),
    // cena 7
    tudoAqui: palavra('cena-07', 'tudo'),
    ondeEsta: palavra('cena-07', 'exatamente'),
    // cena 8
    whatsApp: palavra('cena-08', 'mensagem'),
    abreZap: palavra('cena-08', 'clique') + ms(220),
    // cena 9
    respostaLider: c9.fim - ms(260),
    // cena 10
    metaVem: palavra('cena-10', 'meta'),
    explode: palavra('cena-10', 'todos'),
    baloes: [palavra('cena-10', 'comemoram'), palavra('cena-10', 'com') + ms(60), palavra('cena-10', 'voce') + ms(60), palavra('cena-10', 'voce') + ms(380)],
    // cena 11
    computador: palavra('cena-11', 'computador'),
    celular: palavra('cena-11', 'celular'),
  };
}

export type TempoApp = ReturnType<typeof tempoApp>;

// ── telas ───────────────────────────────────────────────────────────────
export type IdTela = 'dashboard' | 'novo' | 'acordos';

/** Qual página está no conteúdo, e desde quando. */
export function telas(t: TempoApp): { id: IdTela; menu: IdMenu; entra: number }[] {
  const c = t.clique;
  return [
    { id: 'dashboard', menu: 'dashboard', entra: t.conteudo },
    { id: 'novo', menu: 'novo', entra: c.novo + ms(60) },
    { id: 'acordos', menu: 'acordos', entra: c.acordos + ms(60) },
    { id: 'dashboard', menu: 'dashboard', entra: c.dashboard + ms(60) },
    { id: 'acordos', menu: 'acordos', entra: c.acordos2 + ms(60) },
  ];
}

export function telaEm(t: TempoApp, f: number) {
  const lista = telas(t);
  let i = 0;
  for (let k = 0; k < lista.length; k++) if (f >= lista[k].entra) i = k;
  return { atual: lista[i], anterior: lista[Math.max(0, i - 1)], indice: i };
}

export function cliquesDaCasca(t: TempoApp) {
  const c = t.clique;
  return [
    { id: 'menu-novo', f: c.novo },
    { id: 'menu-acordos', f: c.acordos },
    { id: 'menu-desempenho', f: c.desempenho },
    { id: 'menu-dashboard', f: c.dashboard },
    { id: 'menu-acordos', f: c.acordos2 },
  ];
}

// ── cursor ──────────────────────────────────────────────────────────────
/** O cursor chega um instante antes do clique, como a mão de verdade. */
const ANTES_DO_CLIQUE = ms(120);

export function rotaDoCursor(t: TempoApp): { pontos: PontoCursor[]; cliques: number[] } {
  const c = t.clique;
  /** Vai até o alvo e clica em `f`. */
  const clica = (nome: string, f: number, viagemMs = 650, fx = 0, fy = 0): PontoCursor => ({ f: f - ANTES_DO_CLIQUE, ...ponto(nome, f, fx, fy), viagemMs });
  /** Só passa por cima (aponta), chegando em `f`. */
  const aponta = (nome: string, f: number, viagemMs = 650, fx = 0, fy = 0): PontoCursor => ({ f, ...ponto(nome, f + 1, fx, fy), viagemMs });

  const pontos: PontoCursor[] = [
    { f: t.c3.inicio, x: 1120, y: 640 },
    // cena 3 — passeia pelos detalhes
    aponta('dash-total', t.detalhes[0] + ms(40), 760, 0.15, 0.1),
    aponta('dash-projecao', t.detalhes[1] + ms(60), 520, 0.1, 0),
    aponta('dash-donut', t.detalhes[2] + ms(60), 560, 0.12, 0.05),
    aponta('dash-evolucao', t.detalhes[3] + ms(260), 700, 0.18, 0.1),
    // cena 4 — novo acordo
    clica('menu-novo', c.novo, 820, -0.18, 0),
    clica('novo-nr', c.nr, 620, -0.2, 0),
    clica('novo-valor', c.valor, 520, -0.2, 0),
    clica('novo-parcelas', c.parcelas, 460, -0.2, 0),
    clica('novo-vencimento', c.vencimento, 460, -0.15, 0),
    clica('cal-dia-20', c.dia, 420),
    clica('novo-salvar', c.salvar, 640, -0.1, 0),
    // cena 5 — acordos
    clica('menu-acordos', c.acordos, 820, -0.25, 0),
    clica('acao-pago-a3', c.pago, 760),
    aponta('status-a1', t.pendente + ms(40), 520, 0.15, 0.2),
    clica('acao-reagendar-a2', c.reagendar, 620),
    clica('reagendar-confirmar', c.confirmar, 540, -0.1, 0),
    // cena 6 — desempenho do dia
    clica('menu-desempenho', c.desempenho, 820, -0.2, 0),
    aponta('dia-recebido', t.contaRecebido + ms(220), 700, 0.25, 0.1),
    aponta('dia-meta', t.falta + ms(60), 560, 0.2, 0.2),
    // cena 7
    clica('dia-fechar', c.fecharDia, 640),
    clica('menu-dashboard', c.dashboard, 640, -0.2, 0),
    clica('escopo-equipe', c.equipe, 620),
    clica('escopo-setor', c.setor, 420),
    clica('escopo-individual', c.minhaVisao, 560),
    aponta('dash-quartil', t.ondeEsta + ms(180), 640, 0.15, 0.05),
    // cena 8
    clica('menu-acordos', c.acordos2, 760, -0.25, 0),
    clica('acao-whats-a1', c.whats, 760),
    aponta('msg-opcao-0', t.whatsApp + ms(120), 560, -0.25, -0.1),
    clica('msg-opcao-0', c.mensagem, 300, -0.2, 0),
    clica('zap-enviar', c.enviarZap, 720),
    // cena 9
    clica('chat-bolha', c.chat, 900),
    clica('chat-campo', c.campoChat, 560, -0.25, 0),
    clica('chat-enviar', c.enviarChat, 560),
  ];
  const cliques = [
    c.novo, c.nr, c.valor, c.parcelas, c.vencimento, c.dia, c.salvar,
    c.acordos, c.pago, c.reagendar, c.confirmar,
    c.desempenho,
    c.fecharDia, c.dashboard, c.equipe, c.setor, c.minhaVisao,
    c.acordos2, c.whats, c.mensagem, c.enviarZap,
    c.chat, c.campoChat, c.enviarChat,
  ];
  return { pontos, cliques };
}

// ── câmera ──────────────────────────────────────────────────────────────
export type Camera = { f: number; z: number; x: number; y: number; durMs?: number };

const GERAL = { z: 1, x: APP_L / 2, y: APP_A / 2 };

/** O menor retângulo que contém todos. */
function uniao(...rs: Retangulo[]): Retangulo {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  const x2 = Math.max(...rs.map((r) => r.x + r.l));
  const y2 = Math.max(...rs.map((r) => r.y + r.a));
  return { x, y, l: x2 - x, a: y2 - y };
}

/** Aproxima até o retângulo caber na tela com `folga` em volta. */
function enquadra(r: Retangulo, folga = 48, zMax = 1.6) {
  const z = Math.max(1, Math.min(zMax, APP_L / (r.l + 2 * folga), APP_A / (r.a + 2 * folga)));
  return { z, x: r.x + r.l / 2, y: r.y + r.a / 2 };
}

/** Para onde a câmera olha (x, y no app) e quanto aproxima (z). */
export function cameraDoRoteiro(t: TempoApp): Camera[] {
  const c = t.clique;
  const em = (f: number, quadro: { z: number; x: number; y: number }, durMs = 900): Camera => ({ f, ...quadro, durMs });
  const A = (nome: string, f: number) => alvo(nome, f);
  const toast = { x: APP_L - 32 - 356, y: 32, l: 356, a: 70 };
  const cartaoMeta = { x: 512, y: 16, l: 576, a: 330 };
  return [
    em(t.janelaPronta, GERAL),
    // cena 3: o painel inteiro, depois os cards, depois o gráfico
    em(t.organizado + ms(500), enquadra(A('dash-cards', t.organizado), 56), 1900),
    em(t.detalhes[3] + ms(500), enquadra(A('dash-evolucao', t.detalhes[3] + ms(600)), 56), 1000),
    // cena 4: o formulário inteiro, de perto
    em(c.novo + ms(200), GERAL, 700),
    em(c.nr + ms(260), enquadra(A('novo-form', c.nr), 40), 900),
    em(t.toastNovo + ms(180), GERAL, 700),
    // cena 5
    em(c.pago + ms(160), enquadra(uniao(toast, A('linha-a1', c.pago), A('linha-a4', c.pago)), 40), 800),
    em(c.reagendar + ms(260), enquadra(A('reagendar-modal', c.reagendar + ms(300)), 110), 700),
    em(c.confirmar + ms(520), GERAL, 700),
    // cena 6: a gaveta, e depois o dinheiro do dia bem de perto
    em(c.desempenho + ms(520), enquadra(A('dia-gaveta', c.desempenho + ms(500)), 40), 900),
    em(t.atualizado + ms(120), enquadra(uniao(A('dia-recebido', t.atualizado), A('dia-meta', t.atualizado)), 70), 800),
    // cena 7
    em(c.dashboard + ms(260), GERAL, 700),
    em(c.equipe + ms(60), enquadra(uniao(A('escopo', c.equipe), A('dash-cards', c.equipe)), 40), 700),
    em(t.tudoAqui + ms(260), GERAL, 800),
    em(t.ondeEsta + ms(260), enquadra(A('dash-quartil', t.ondeEsta), 150, 1.45), 800),
    // cena 8
    em(c.acordos2 + ms(300), GERAL, 700),
    em(c.whats + ms(320), enquadra(A('msg-dialogo', c.whats + ms(400)), 70), 600),
    em(t.abreZap + ms(380), enquadra({ x: 330, y: 70, l: 1040, a: 720 }, 24), 700),
    // cena 9
    em(t.c9.inicio + ms(400), GERAL, 600),
    em(c.chat + ms(520), enquadra(A('chat-janela', c.chat + ms(600)), 36), 800),
    // cena 10: o card da comemoração de perto; depois abre para os balões
    em(t.c10.inicio + ms(260), GERAL, 500),
    em(t.metaVem + ms(420), enquadra(cartaoMeta, 70, 1.4), 650),
    em(t.baloes[0] + ms(380), GERAL, 700),
  ];
}
