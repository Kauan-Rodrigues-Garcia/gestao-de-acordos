/**
 * cedula.ts — a Votação da Liderança (04/11/2026), por enquanto só DEMONSTRAÇÃO.
 *
 * Os líderes votam uns nos outros em perguntas de personalidade («o mais
 * carismático», «o mais bravo»…). Em cada pergunta aparecem TODOS os líderes
 * do gestão, e todos votam na mesma cédula — não vota em si mesmo.
 *
 * Nada aqui fala com o banco. Quando for valer de verdade, a cédula e os votos
 * vão para tabelas próprias (migration ainda não escrita) e este arquivo segue
 * sendo a regra da apuração.
 */

export interface Pergunta {
  id: string;
  emoji: string;
  texto: string;
}

export interface Candidato {
  id: string;
  nome: string;
  foto: string | null;
  setor: string;
  perfil: string;
}

/** Uma linha da cédula: a pergunta e os ids dos líderes, na ordem da tela. */
export interface ItemDaCedula {
  pergunta: Pergunta;
  candidatos: string[];
}

/** perguntaId → candidatoId → votos. */
export type Votos = Record<string, Record<string, number>>;
/** perguntaId → candidatoId escolhido por quem está votando. */
export type MeusVotos = Record<string, string>;

export const MIN_PERGUNTAS = 15;
/** Com menos de 3 líderes não há votação. */
export const MIN_LIDERES = 3;

/**
 * As perguntas-base (lista enviada em 04/11/2026), escritas como pergunta.
 * Quem organiza pode mudar o texto, o emoji, tirar e acrescentar.
 * Mudou a lista-base? Suba `VERSAO_PERGUNTAS`: o rascunho salvo troca para ela.
 */
export const VERSAO_PERGUNTAS = 2;
export const PERGUNTAS_PADRAO: readonly Pergunta[] = [
  { id: 'comunicativo', emoji: '🗣️', texto: 'Quem é o líder mais comunicativo?' },
  { id: 'paciente', emoji: '🧘', texto: 'Quem é o líder mais paciente?' },
  { id: 'organizado', emoji: '🗂️', texto: 'Quem é o líder mais organizado?' },
  { id: 'criativo', emoji: '💡', texto: 'Quem é o líder mais criativo?' },
  { id: 'justo', emoji: '⚖️', texto: 'Quem é o líder mais justo?' },
  { id: 'acolhedor', emoji: '🤗', texto: 'Quem é o líder mais acolhedor?' },
  { id: 'confiante', emoji: '💪', texto: 'Quem é o líder mais confiante?' },
  { id: 'visionario', emoji: '🔭', texto: 'Quem é o líder mais visionário?' },
  { id: 'comprometido', emoji: '📌', texto: 'Quem é o líder mais comprometido?' },
  { id: 'estrategico', emoji: '♟️', texto: 'Quem é o líder mais estratégico?' },
  { id: 'proativo', emoji: '⚡', texto: 'Quem é o líder mais proativo?' },
  { id: 'determinado', emoji: '🎯', texto: 'Quem é o líder mais determinado?' },
  { id: 'inspirador', emoji: '✨', texto: 'Quem é o líder mais inspirador?' },
  { id: 'colaborativo', emoji: '🤝', texto: 'Quem é o líder mais colaborativo?' },
  { id: 'etico', emoji: '🧭', texto: 'Quem é o líder mais ético?' },
  { id: 'disciplinado', emoji: '⏱️', texto: 'Quem é o líder mais disciplinado?' },
  { id: 'carismatico', emoji: '😄', texto: 'Quem é o líder mais carismático?' },
  { id: 'solucionador', emoji: '🧩', texto: 'Quem é o líder que mais resolve problemas?' },
  { id: 'perseverante', emoji: '🧗', texto: 'Quem é o líder mais perseverante?' },
  { id: 'superacao', emoji: '🏅', texto: 'Quem é o líder exemplo de superação?' },
  { id: 'faz_acontecer', emoji: '🚀', texto: 'Quem é o líder que faz acontecer?' },
  { id: 'atitude', emoji: '🔥', texto: 'Quem é o líder de atitude?' },
  { id: 'foco', emoji: '🔍', texto: 'Quem é o líder que não perde o foco?' },
  { id: 'referencia', emoji: '🌟', texto: 'Quem é o líder que é referência para todos?' },
];

/** Gerador com semente (mulberry32): a mesma semente dá os mesmos votos sorteados. */
export function aleatorio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A cédula: TODOS os líderes em TODAS as perguntas (pedido de 04/11/2026),
 * na mesma ordem — alfabética, para achar a pessoa sem procurar.
 */
export function cedulaComTodos(perguntas: readonly Pergunta[], lideres: readonly Candidato[]): ItemDaCedula[] {
  const ordem = [...lideres]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
    .map(l => l.id);
  return perguntas.map(pergunta => ({ pergunta, candidatos: [...ordem] }));
}

/** Altura do cartão ÷ largura: a foto quadrada mais a faixa do nome. */
export const PROPORCAO_CARTAO = 1.3;

export interface Grade {
  colunas: number;
  /** Largura de cada cartão, em px. */
  largura: number;
  /** Não coube nem no tamanho mínimo: a grade rola. */
  rola: boolean;
}

/**
 * Encaixa N cartões na área (largura × altura): testa todas as quantidades de
 * colunas e fica com a que deixa o cartão maior sem rolar. O cartão tem teto
 * (poucos líderes não viram fotos gigantes) e piso (muitos líderes num
 * celular): abaixo do piso, a grade usa o piso e rola.
 */
export function melhorGrade(
  n: number, largura: number, altura: number,
  { espaco = 12, minimo = 76, maximo = 210, proporcao = PROPORCAO_CARTAO } = {},
): Grade {
  if (n <= 0 || largura <= 0 || altura <= 0) return { colunas: 1, largura: minimo, rola: false };
  let melhor = { colunas: 1, largura: 0 };
  for (let c = 1; c <= n; c++) {
    const linhas = Math.ceil(n / c);
    const pelaLargura = (largura - espaco * (c - 1)) / c;
    const pelaAltura = (altura - espaco * (linhas - 1)) / linhas / proporcao;
    const w = Math.min(pelaLargura, pelaAltura, maximo);
    if (w > melhor.largura + 0.5) melhor = { colunas: c, largura: w };
  }
  if (melhor.largura >= minimo) return { colunas: melhor.colunas, largura: Math.floor(melhor.largura), rola: false };
  const colunas = Math.max(1, Math.min(n, Math.floor((largura + espaco) / (minimo + espaco))));
  return { colunas, largura: Math.floor(Math.min(maximo, (largura - espaco * (colunas - 1)) / colunas)), rola: true };
}

/**
 * Uma pessoa só pode ser escolhida UMA VEZ por quem vota (pedido de
 * 04/11/2026): deu a Bianca em «comunicativo», ela fica travada nas outras
 * perguntas até a resposta ser trocada. Devolve candidato → pergunta em que
 * já foi escolhido, sem contar a pergunta `atual` (ali dá para trocar).
 */
export function jaEscolhidos(meus: MeusVotos, atual?: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const [pid, cid] of Object.entries(meus)) if (pid !== atual) m.set(cid, pid);
  return m;
}

/** O máximo de perguntas que alguém consegue responder: um colega por pergunta, sem si mesmo. */
export function maximoDeRespostas(participantes: number, perguntas: number): number {
  return Math.max(0, Math.min(perguntas, participantes - 1));
}

/**
 * As cédulas dos outros líderes, sorteadas — só para a demonstração. Seguem as
 * mesmas regras da votação de verdade: um voto por pergunta, nunca em si mesmo
 * e cada colega escolhido uma vez só. Os pesos variam por pergunta e são
 * concentrados (poucos nomes puxam a maioria, como numa votação de verdade).
 */
export function simularCedulas(
  cedula: readonly ItemDaCedula[], eleitores: readonly string[], semente: number,
): Record<string, MeusVotos> {
  const rng = aleatorio(semente ^ 0x5bd1e995);
  const cedulas: Record<string, MeusVotos> = Object.fromEntries(eleitores.map(e => [e, {}]));
  const usados = new Map<string, Set<string>>(eleitores.map(e => [e, new Set([e])]));
  for (const { pergunta, candidatos } of cedula) {
    const pesos = candidatos.map(() => 0.02 + rng() ** 5);
    for (const eleitor of eleitores) {
      const fora = usados.get(eleitor)!;
      const opcoes = candidatos.map((c, i) => (fora.has(c) ? 0 : pesos[i]));
      const total = opcoes.reduce((x, y) => x + y, 0);
      if (total <= 0) continue; // já escolheu todo mundo: esta fica sem resposta
      let sorteio = rng() * total;
      let i = opcoes.findIndex(peso => (sorteio -= peso) < 0);
      if (i < 0) for (let j = opcoes.length - 1; j >= 0; j--) if (opcoes[j] > 0) { i = j; break; }
      cedulas[eleitor][pergunta.id] = candidatos[i];
      fora.add(candidatos[i]);
    }
  }
  return cedulas;
}

/** Soma as cédulas: pergunta → candidato → votos (todos os da pergunta, com zero). */
export function contarCedulas(cedula: readonly ItemDaCedula[], cedulas: Readonly<Record<string, MeusVotos>>): Votos {
  const votos: Votos = Object.fromEntries(cedula.map(({ pergunta, candidatos }) => [pergunta.id, Object.fromEntries(candidatos.map(c => [c, 0]))]));
  for (const meus of Object.values(cedulas)) {
    for (const [pid, cid] of Object.entries(meus)) if (votos[pid] && cid in votos[pid]) votos[pid][cid] += 1;
  }
  return votos;
}

/** Os votos dos outros, já somados (`simularCedulas` + `contarCedulas`). */
export function simularVotos(cedula: readonly ItemDaCedula[], eleitores: readonly string[], semente: number): Votos {
  return contarCedulas(cedula, simularCedulas(cedula, eleitores, semente));
}

/** Junta o voto de quem está votando aos dos outros. */
export function somarMeusVotos(votos: Votos, meus: MeusVotos): Votos {
  const r: Votos = {};
  for (const [pid, conta] of Object.entries(votos)) r[pid] = { ...conta };
  for (const [pid, cid] of Object.entries(meus)) {
    r[pid] = r[pid] ?? {};
    r[pid][cid] = (r[pid][cid] ?? 0) + 1;
  }
  return r;
}

export interface LinhaDoResultado {
  id: string;
  votos: number;
  /** 0–100, cortado em uma casa (não arredonda para cima). */
  pct: number;
}

export interface ResultadoDaPergunta {
  pergunta: Pergunta;
  total: number;
  linhas: LinhaDoResultado[];
  /** Ids empatados no 1º lugar; um só quando há vencedor claro. Vazio sem votos. */
  vencedores: string[];
  /** O vencedor saiu de uma decisão da diretoria (`aplicarDesempates`): empate ou líder em mais de uma. */
  desempatado?: boolean;
}

export function apurar(cedula: readonly ItemDaCedula[], votos: Votos): ResultadoDaPergunta[] {
  return cedula.map(({ pergunta, candidatos }) => {
    const conta = votos[pergunta.id] ?? {};
    const total = candidatos.reduce((s, c) => s + (conta[c] ?? 0), 0);
    const linhas = candidatos
      .map(id => ({ id, votos: conta[id] ?? 0, pct: total ? Math.floor(((conta[id] ?? 0) / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.votos - a.votos);
    const topo = linhas[0]?.votos ?? 0;
    const vencedores = topo > 0 ? linhas.filter(l => l.votos === topo).map(l => l.id) : [];
    return { pergunta, total, linhas, vencedores };
  });
}

/**
 * perguntaId → o líder que a diretoria escolheu para levar a categoria. Desde
 * 10/11/2026 vale para empate E para líder em 1º em mais de uma categoria; desde
 * 11/11/2026 o escolhido pode ser qualquer participante, com ou sem voto.
 */
export type Desempates = Record<string, string>;

/** Perguntas empatadas no 1º lugar. */
export function empatadas(resultados: readonly ResultadoDaPergunta[]): ResultadoDaPergunta[] {
  return resultados.filter(r => r.vencedores.length > 1);
}

/**
 * A decisão vale: o escolhido participa da pergunta. Desde 11/11/2026 com ou
 * sem voto nela — «não importa os votos, eu estou decidindo» (migration
 * 20261111190000); antes exigia pelo menos 1 voto.
 */
const decisaoValida = (r: ResultadoDaPergunta, escolhido: string | undefined): escolhido is string =>
  !!escolhido && r.linhas.some(l => l.id === escolhido);

export interface SituacaoDaPergunta {
  /** A diretoria já decidiu (com uma escolha válida). */
  decidida: boolean;
  /** Ainda precisa de decisão para liberar. */
  pendente: boolean;
  /** Empate no 1º lugar (pela contagem). */
  empate: boolean;
  /**
   * Dos 1ºs colocados desta pergunta, quem também leva outra — com as outras
   * que leva. Só nas que não estão decididas.
   */
  repetidos: Array<{ id: string; outras: Pergunta[] }>;
}

export interface Decisoes {
  porPergunta: Map<string, SituacaoDaPergunta>;
  /** Quantas faltam decidir. */
  pendentes: number;
  /** Quem leva o quê agora (as decididas pelo escolhido; as outras, pelos 1ºs colocados). */
  titulos: Map<string, Pergunta[]>;
}

/**
 * O que a diretoria precisa decidir antes de liberar (10/11/2026) — a mesma
 * regra de `fn_vl_pendentes` no banco. Uma pergunta não decidida fica pendente
 * quando deu empate no 1º lugar, ou quando um dos 1ºs colocados também leva
 * outra (contando as decisões já tomadas). Manter o mesmo líder é escolha da
 * diretoria, mas cada categoria dele é decidida.
 */
export function situacaoDasDecisoes(resultados: readonly ResultadoDaPergunta[], decisoes: Desempates): Decisoes {
  const leva = new Map<string, string[]>();
  const titulos = new Map<string, Pergunta[]>();
  for (const r of resultados) {
    const d = decisoes[r.pergunta.id];
    const quem = decisaoValida(r, d) ? [d] : r.vencedores;
    leva.set(r.pergunta.id, quem);
    for (const id of quem) titulos.set(id, [...(titulos.get(id) ?? []), r.pergunta]);
  }
  const porPergunta = new Map<string, SituacaoDaPergunta>();
  let pendentes = 0;
  for (const r of resultados) {
    const decidida = decisaoValida(r, decisoes[r.pergunta.id]);
    const empate = r.vencedores.length > 1;
    const repetidos = decidida ? [] : r.vencedores
      .map(id => ({ id, outras: (titulos.get(id) ?? []).filter(p => p.id !== r.pergunta.id) }))
      .filter(x => x.outras.length > 0);
    const pendente = !decidida && (empate || repetidos.length > 0);
    if (pendente) pendentes++;
    porPergunta.set(r.pergunta.id, { decidida, pendente, empate, repetidos });
  }
  return { porPergunta, pendentes, titulos };
}

/** Quantas categorias ainda não têm decisão. */
export function empatesPendentes(resultados: readonly ResultadoDaPergunta[], desempates: Desempates): number {
  return situacaoDasDecisoes(resultados, desempates).pendentes;
}

/**
 * O resultado depois da diretoria: o escolhido vira o único vencedor e vai
 * para o 1º lugar das barras (os votos não mudam). Escolha de quem não está na
 * pergunta não vale; manter quem já era o único 1º não muda nada.
 */
export function aplicarDesempates(resultados: readonly ResultadoDaPergunta[], desempates: Desempates): ResultadoDaPergunta[] {
  return resultados.map(r => {
    const escolhido = desempates[r.pergunta.id];
    if (!decisaoValida(r, escolhido)) return r;
    if (r.vencedores.length === 1 && r.vencedores[0] === escolhido) return r;
    const linhas = [...r.linhas].sort((a, b) => Number(b.id === escolhido) - Number(a.id === escolhido) || b.votos - a.votos);
    return { ...r, linhas, vencedores: [escolhido], desempatado: true };
  });
}

/**
 * Só a demonstração: empata o 1º com o 2º em algumas perguntas, para a visão
 * da diretoria ter o que decidir (o sorteio quase nunca empata sozinho).
 */
export function forcarEmpates(votos: Votos, cedula: readonly ItemDaCedula[], quantos: number, semente: number): Votos {
  const rng = aleatorio(semente ^ 0x2f6b);
  const r: Votos = {};
  for (const [pid, conta] of Object.entries(votos)) r[pid] = { ...conta };
  const ids = cedula.map(c => c.pergunta.id).filter(pid => Object.keys(r[pid] ?? {}).length >= 2);
  for (let n = 0; n < quantos && ids.length; n++) {
    const pid = ids.splice(Math.floor(rng() * ids.length), 1)[0];
    const conta = r[pid];
    const ordem = Object.keys(conta).sort((a, b) => conta[b] - conta[a]);
    const [primeiro, segundo] = ordem;
    // Move votos de lugar (o total não muda): dos últimos colocados para o 2º...
    let falta = conta[primeiro] - conta[segundo];
    for (const id of ordem.slice(2).reverse()) {
      while (falta > 0 && conta[id] > 0) { conta[id] -= 1; conta[segundo] += 1; falta -= 1; }
    }
    // ...e, se não bastar, do 1º para o 2º (cada voto fecha 2 de diferença).
    while (falta >= 2) { conta[primeiro] -= 1; conta[segundo] += 1; falta -= 2; }
    // Sobrou 1: o 1º passa um voto para o 3º.
    if (falta === 1 && ordem[2]) { conta[primeiro] -= 1; conta[ordem[2]] += 1; }
  }
  return r;
}

/** Quem levou mais títulos (empate ainda não decidido conta para todos os empatados). */
export function quadroDeTitulos(resultados: readonly ResultadoDaPergunta[]): Array<{ id: string; titulos: Pergunta[] }> {
  const m = new Map<string, Pergunta[]>();
  for (const r of resultados) for (const id of r.vencedores) m.set(id, [...(m.get(id) ?? []), r.pergunta]);
  return [...m.entries()].map(([id, titulos]) => ({ id, titulos })).sort((a, b) => b.titulos.length - a.titulos.length);
}

/** «Ana Paula Souza» → «Ana Paula»: cabe no cartão sem cortar. */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.slice(0, 2).join(' ');
}

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
