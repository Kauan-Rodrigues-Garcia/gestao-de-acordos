/**
 * planilhaCampeoes.ts — a Votação da Liderança em Excel (11/11/2026).
 *
 * Pedido: separar quem é campeão de cada categoria e, do lado, o que essa mesma
 * pessoa já leva — «a Ellen já é a campeã de Líder Estratégica». Três abas:
 *
 *   1. Campeões   — uma linha por categoria: quem leva, votos, como ganhou
 *                   (vencedor claro, decisão da diretoria, a decidir) e
 *                   «Também é campeão(ã) de», em laranja quando repete.
 *   2. Por líder  — uma linha por participante: quantas e quais categorias leva.
 *                   Quem leva mais de uma vem primeiro; quem não leva nenhuma, no fim.
 *   3. Ranking    — todas as categorias, todos os que tiveram voto, em ordem.
 *
 * A regra de quem leva é a da tela da diretoria (`situacaoDasDecisoes`, igual a
 * `fn_vl_pendentes`): decidida pela diretoria → o escolhido; senão, os 1ºs
 * colocados (empate a decidir lista todos). Só contagem — nunca em quem cada
 * um votou.
 *
 * Função pura: nada de `document`.
 */
import { Estilos, escXml, montarPacoteXlsx, refCelula, type Borda, type Estilo } from '@/lib/xlsxEstilizado';
import { COR_GESTAO as G, FONTE_PLANILHA, rotuloGeradoEm } from '@/lib/relatorioGestao';
import {
  aplicarDesempates, apurar, situacaoDasDecisoes,
  type Candidato, type Desempates, type Pergunta, type ResultadoDaPergunta, type Votos,
} from './cedula';
import { montarDoRetrato, type ApuracaoDaVotacao } from './banco';

// ── Os números ──────────────────────────────────────────────────────────────

export type ComoGanhou =
  | 'claro' | 'sem_votos'
  | 'diretoria_empate' | 'diretoria_repetido'
  | 'pendente_empate' | 'pendente_repetido';

export const ROTULO_COMO: Record<ComoGanhou, string> = {
  claro: 'Vencedor claro',
  sem_votos: 'Sem votos',
  diretoria_empate: 'Diretoria desempatou',
  diretoria_repetido: 'Diretoria decidiu (líder em mais de uma)',
  pendente_empate: 'A decidir: empate',
  pendente_repetido: 'A decidir: em 1º em mais de uma',
};

export interface CategoriaNaPlanilha {
  numero: number;
  pergunta: Pergunta;
  /** Quem leva agora. Mais de um só em empate ainda não decidido. */
  campeoes: string[];
  votos: number;
  /** 0–100, uma casa, cortado. */
  pct: number;
  total: number;
  como: ComoGanhou;
  /** Para cada campeão, as OUTRAS categorias que ele leva. */
  outras: Map<string, Pergunta[]>;
  segundo: { id: string; votos: number } | null;
}

export interface LiderNaPlanilha {
  id: string;
  categorias: Pergunta[];
  /** Das categorias, as que ainda estão a decidir (empate ou repetido). */
  aDecidir: Set<string>;
}

export interface Campeoes {
  categorias: CategoriaNaPlanilha[];
  lideres: LiderNaPlanilha[];
  /** O resultado com as decisões aplicadas (ordem das barras). */
  finais: ResultadoDaPergunta[];
}

export function montarCampeoes(
  resultados: readonly ResultadoDaPergunta[],
  desempates: Desempates,
  pessoas: ReadonlyMap<string, Candidato>,
): Campeoes {
  const d = situacaoDasDecisoes(resultados, desempates);
  const finais = aplicarDesempates(resultados, desempates);
  const nome = (id: string) => pessoas.get(id)?.nome ?? '';

  const categorias = resultados.map((r, i): CategoriaNaPlanilha => {
    const s = d.porPergunta.get(r.pergunta.id)!;
    const f = finais[i];
    const campeoes = s.decidida ? [desempates[r.pergunta.id]] : [...r.vencedores];
    const como: ComoGanhou = !campeoes.length ? 'sem_votos'
      : s.decidida ? (s.empate ? 'diretoria_empate' : 'diretoria_repetido')
      : s.pendente ? (s.empate ? 'pendente_empate' : 'pendente_repetido')
      : 'claro';
    const linhaDo = (id: string) => r.linhas.find(l => l.id === id);
    const outras = new Map(campeoes.map(id => [id, (d.titulos.get(id) ?? []).filter(p => p.id !== r.pergunta.id)]));
    const seg = f.linhas.find(l => !campeoes.includes(l.id) && l.votos > 0);
    return {
      numero: i + 1,
      pergunta: r.pergunta,
      campeoes: campeoes.sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR')),
      votos: campeoes.length ? (linhaDo(campeoes[0])?.votos ?? 0) : 0,
      pct: campeoes.length ? (linhaDo(campeoes[0])?.pct ?? 0) : 0,
      total: r.total,
      como,
      outras,
      segundo: seg ? { id: seg.id, votos: seg.votos } : null,
    };
  });

  const pendentes = new Set(categorias.filter(c => c.como.startsWith('pendente')).map(c => c.pergunta.id));
  const lideres = [...pessoas.keys()].map((id): LiderNaPlanilha => {
    const cats = d.titulos.get(id) ?? [];
    return { id, categorias: cats, aDecidir: new Set(cats.filter(p => pendentes.has(p.id)).map(p => p.id)) };
  }).sort((a, b) => b.categorias.length - a.categorias.length || nome(a.id).localeCompare(nome(b.id), 'pt-BR'));

  return { categorias, lideres, finais };
}

// ── Os dados que a planilha recebe ──────────────────────────────────────────

export interface DadosPlanilhaCampeoes {
  titulo: string;
  estado: string;
  geradoEm: Date;
  resultados: ResultadoDaPergunta[];
  desempates: Desempates;
  pessoas: ReadonlyMap<string, Candidato>;
  votaram: number;
}

/** Do retrato da apuração (o mesmo que a tela da diretoria lê). */
export function dadosDaApuracao(r: ApuracaoDaVotacao, geradoEm = new Date()): DadosPlanilhaCampeoes {
  const { cedula, pessoas } = montarDoRetrato(r);
  const votos: Votos = {};
  for (const c of r.contagem ?? []) (votos[c.pergunta_id] ??= {})[c.candidato_id] = c.votos;
  return {
    titulo: r.votacao.titulo,
    estado: r.votacao.estado,
    geradoEm,
    resultados: apurar(cedula, votos),
    desempates: Object.fromEntries((r.desempates ?? []).map(x => [x.pergunta_id, x.escolhido_id])),
    pessoas,
    votaram: r.envios?.length ?? 0,
  };
}

const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function nomeArquivoCampeoes(d: Pick<DadosPlanilhaCampeoes, 'titulo' | 'geradoEm'>): string {
  const dia = d.geradoEm.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return `votacao-lideranca-campeoes-${slug(d.titulo) || 'votacao'}-${dia}.xlsx`;
}

// ── A folha ─────────────────────────────────────────────────────────────────

const ROTULO_ESTADO: Record<string, string> = {
  aberta: 'Aberta (parcial)',
  encerrada: 'Encerrada · resultado ainda não liberado',
  liberada: 'Resultado liberado',
};

type Celula = { estilo: number; texto?: string; numero?: number };
interface Linha { altura: number; celulas: Array<Celula | undefined> }
interface Coluna { titulo: string; largura: number; h: 'left' | 'center' | 'right' }

function folhaXml(p: {
  linhas: Linha[];
  colunas: readonly Coluna[];
  mesclas: string[];
  linhaCabecalho: number;
  ultimaDados: number;
  cor: string;
  rodape: string;
}): string {
  const ultimaCol = p.colunas.length;
  const xmlLinhas = p.linhas.map((l, i) => {
    const r = i + 1;
    const cels = l.celulas.map((c, j) => {
      if (!c) return '';
      const end = refCelula(j + 1, r);
      if (c.texto !== undefined) return `<c r="${end}" s="${c.estilo}" t="inlineStr"><is><t xml:space="preserve">${escXml(c.texto)}</t></is></c>`;
      if (c.numero !== undefined) return `<c r="${end}" s="${c.estilo}"><v>${c.numero}</v></c>`;
      return `<c r="${end}" s="${c.estilo}"/>`;
    }).join('');
    return `<row r="${r}" spans="1:${ultimaCol}" ht="${l.altura}" customHeight="1">${cels}</row>`;
  }).join('');
  const primeira = refCelula(1, p.linhaCabecalho + 1);
  const filtro = p.ultimaDados > p.linhaCabecalho
    ? `<autoFilter ref="${refCelula(1, p.linhaCabecalho)}:${refCelula(ultimaCol, p.ultimaDados)}"/>` : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheetPr><tabColor rgb="FF${p.cor}"/><pageSetUpPr fitToPage="1"/></sheetPr>`
    + `<dimension ref="A1:${refCelula(ultimaCol, p.linhas.length)}"/>`
    + '<sheetViews><sheetView showGridLines="0" workbookViewId="0">'
    + `<pane ySplit="${p.linhaCabecalho}" topLeftCell="${primeira}" activePane="bottomLeft" state="frozen"/>`
    + `<selection pane="bottomLeft" activeCell="${primeira}" sqref="${primeira}"/></sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + `<cols>${p.colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura}" customWidth="1"/>`).join('')}</cols>`
    + `<sheetData>${xmlLinhas}</sheetData>`
    + filtro
    + (p.mesclas.length ? `<mergeCells count="${p.mesclas.length}">${p.mesclas.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
    + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
    + `<headerFooter><oddFooter>&amp;L&amp;8${escXml(p.rodape)}&amp;R&amp;8Página &amp;P de &amp;N</oddFooter></headerFooter>`
    + '</worksheet>';
}

/** As peças de estilo de todas as abas (um registro só para o pacote). */
function paleta(estilos: Estilos) {
  const fina = (cor: string): Borda => ({ estilo: 'thin', cor });
  const id = (e: Estilo) => estilos.id({ fonte: FONTE_PLANILHA, ...e });
  const corpo = (zebra: boolean, e: Estilo = {}) =>
    id({ tamanho: 10, cor: G.texto, fundo: zebra ? G.cartao : undefined, ...e, bordas: { bottom: fina(G.bordaSuave), ...e.bordas } });
  return {
    id, corpo,
    titulo: id({ tamanho: 15, negrito: true, cor: 'FFFFFF', fundo: G.primarioEscuro, recuo: 1 }),
    subtitulo: id({ tamanho: 10, cor: G.primarioClaro, fundo: G.primarioEscuro, recuo: 1 }),
    nota: id({ tamanho: 9, italico: true, cor: G.fraco, recuo: 1, quebrar: true }),
    cabecalho: (h: Coluna['h']) => id({ tamanho: 10, negrito: true, cor: 'FFFFFF', fundo: G.primario, horizontal: h, recuo: h === 'left' ? 1 : 0, quebrar: true }),
    secao: id({ tamanho: 11, negrito: true, cor: G.primarioEscuro, fundo: G.realce, recuo: 1 }),
  };
}
type Paleta = ReturnType<typeof paleta>;

/** Monta as três linhas do topo (título, subtítulo, nota) e o cabeçalho. */
function topo(s: Paleta, colunas: readonly Coluna[], titulo: string, subtitulo: string, nota: string) {
  const linhas: Linha[] = [];
  const mesclas: string[] = [];
  const faixa = (altura: number, estilo: number, texto: string) => {
    const celulas: Celula[] = colunas.map(() => ({ estilo }));
    celulas[0] = { estilo, texto };
    linhas.push({ altura, celulas });
    mesclas.push(`${refCelula(1, linhas.length)}:${refCelula(colunas.length, linhas.length)}`);
  };
  faixa(30, s.titulo, titulo);
  faixa(20, s.subtitulo, subtitulo);
  faixa(30, s.nota, nota);
  linhas.push({ altura: 8, celulas: [] });
  linhas.push({ altura: 30, celulas: colunas.map(c => ({ estilo: s.cabecalho(c.h), texto: c.titulo })) });
  return { linhas, mesclas, linhaCabecalho: linhas.length, faixa };
}

const categoriaTexto = (p: Pergunta) => `${p.emoji} ${p.texto}`.trim();
const listaDePerguntas = (ps: readonly Pergunta[]) => ps.map(categoriaTexto).join('  ·  ');

export function montarPlanilhaCampeoes(d: DadosPlanilhaCampeoes): Uint8Array<ArrayBuffer> {
  const estilos = new Estilos();
  const s = paleta(estilos);
  const c = montarCampeoes(d.resultados, d.desempates, d.pessoas);
  const nome = (id: string) => d.pessoas.get(id)?.nome ?? 'Líder';
  const setor = (id: string) => d.pessoas.get(id)?.setor ?? '';
  const estado = ROTULO_ESTADO[d.estado] ?? d.estado;
  const pendentes = c.categorias.filter(x => x.como.startsWith('pendente')).length;
  const subtitulo = [
    d.titulo, estado, `${c.categorias.length} categorias`, `${d.pessoas.size} participantes`,
    `${d.votaram} votaram`, `Gerado em: ${rotuloGeradoEm(d.geradoEm)}`,
  ].join('  ·  ');
  const rodape = `Votação da Liderança · ${d.titulo}`;
  const aviso = pendentes ? `  Atenção: ${pendentes} ${pendentes === 1 ? 'categoria ainda está' : 'categorias ainda estão'} a decidir pela diretoria.` : '';
  const pct = (v: number) => Math.floor(v * 10) / 1000;

  // ── 1. Campeões por categoria ──
  const col1: Coluna[] = [
    { titulo: 'Nº', largura: 5, h: 'center' },
    { titulo: 'Categoria', largura: 46, h: 'left' },
    { titulo: 'Campeão(ã)', largura: 30, h: 'left' },
    { titulo: 'Setor', largura: 20, h: 'left' },
    { titulo: 'Votos', largura: 8, h: 'center' },
    { titulo: '% da categoria', largura: 11, h: 'center' },
    { titulo: 'Como ganhou', largura: 30, h: 'left' },
    { titulo: 'Também é campeão(ã) de', largura: 50, h: 'left' },
    { titulo: '2º lugar', largura: 26, h: 'left' },
    { titulo: 'Votos do 2º', largura: 9, h: 'center' },
  ];
  const f1 = topo(s, col1, 'Votação da Liderança · Campeões por categoria', subtitulo,
    'Campeão = quem leva a categoria, já com as decisões da diretoria. «Também é campeão(ã) de» mostra as outras categorias que a mesma pessoa leva (em laranja).' + aviso);
  c.categorias.forEach((x, i) => {
    const z = i % 2 === 1;
    const repete = [...x.outras.values()].some(o => o.length > 0);
    const pend = x.como.startsWith('pendente');
    const dir = x.como.startsWith('diretoria');
    const corComo = pend ? G.alerta : dir ? G.sucesso : x.como === 'sem_votos' ? G.tenue : G.fraco;
    const tambem = x.campeoes.length > 1
      ? x.campeoes.filter(id => x.outras.get(id)?.length).map(id => `${nome(id)}: ${listaDePerguntas(x.outras.get(id)!)}`).join('\n')
      : listaDePerguntas(x.outras.get(x.campeoes[0]) ?? []);
    f1.linhas.push({
      altura: Math.max(22, 15 * Math.max(x.campeoes.length, 1) + 6),
      celulas: [
        { estilo: s.corpo(z, { horizontal: 'center', cor: G.fraco }), numero: x.numero },
        { estilo: s.corpo(z, { negrito: true, recuo: 1, quebrar: true }), texto: categoriaTexto(x.pergunta) },
        { estilo: s.corpo(z, { negrito: true, cor: x.campeoes.length ? G.primarioEscuro : G.tenue, recuo: 1, quebrar: true }),
          texto: x.campeoes.length ? x.campeoes.map(nome).join('\n') : '—' },
        { estilo: s.corpo(z, { cor: G.fraco, recuo: 1, quebrar: true }), texto: x.campeoes.map(setor).join('\n') },
        { estilo: s.corpo(z, { horizontal: 'center', negrito: true }), numero: x.votos },
        { estilo: s.corpo(z, { horizontal: 'center', formato: '0.0%', cor: G.fraco }), numero: pct(x.pct) },
        { estilo: s.corpo(z, { cor: corComo, negrito: pend, recuo: 1, quebrar: true }), texto: ROTULO_COMO[x.como] },
        repete
          ? { estilo: s.corpo(z, { cor: G.alerta, fundo: G.alertaFundo, negrito: true, recuo: 1, quebrar: true }), texto: tambem }
          : { estilo: s.corpo(z, { cor: G.tenue, recuo: 1 }), texto: x.campeoes.length ? 'Só esta' : '' },
        { estilo: s.corpo(z, { cor: G.fraco, recuo: 1 }), texto: x.segundo ? nome(x.segundo.id) : '—' },
        x.segundo ? { estilo: s.corpo(z, { horizontal: 'center', cor: G.fraco }), numero: x.segundo.votos } : { estilo: s.corpo(z) },
      ],
    });
  });
  const folha1 = folhaXml({ ...f1, colunas: col1, ultimaDados: f1.linhas.length, cor: G.primario, rodape });

  // ── 2. Por líder ──
  const col2: Coluna[] = [
    { titulo: 'Líder', largura: 32, h: 'left' },
    { titulo: 'Setor', largura: 22, h: 'left' },
    { titulo: 'Categorias que leva', largura: 12, h: 'center' },
    { titulo: 'Situação', largura: 28, h: 'left' },
    { titulo: 'Categorias', largura: 70, h: 'left' },
  ];
  const f2 = topo(s, col2, 'Votação da Liderança · Campeões por líder', subtitulo,
    'Cada participante uma vez: quem leva mais de uma categoria vem primeiro (em laranja), depois quem leva uma, e no fim quem não leva nenhuma.' + aviso);
  c.lideres.forEach((l, i) => {
    const z = i % 2 === 1;
    const n = l.categorias.length;
    const situacao = n === 0 ? 'Não leva nenhuma' : n === 1 ? 'Campeão(ã) de 1 categoria' : `Campeão(ã) de ${n} categorias`;
    const corSit = n > 1 ? G.alerta : n === 1 ? G.sucesso : G.tenue;
    const marca: Estilo['bordas'] = n > 1 ? { left: { estilo: 'medium', cor: G.alerta } } : n === 1 ? { left: { estilo: 'medium', cor: G.sucesso } } : undefined;
    f2.linhas.push({
      altura: Math.max(22, 15 * n + 6),
      celulas: [
        { estilo: s.corpo(z, { negrito: n > 0, cor: n ? G.texto : G.fraco, recuo: 1, bordas: marca }), texto: nome(l.id) },
        { estilo: s.corpo(z, { cor: G.fraco, recuo: 1 }), texto: setor(l.id) },
        { estilo: s.corpo(z, { horizontal: 'center', negrito: n > 0, cor: n ? G.primarioEscuro : G.tenue }), numero: n },
        { estilo: s.corpo(z, { cor: corSit, negrito: n > 1, recuo: 1, fundo: n > 1 ? G.alertaFundo : z ? G.cartao : undefined }), texto: situacao },
        { estilo: s.corpo(z, { recuo: 1, quebrar: true }),
          texto: l.categorias.map(p => `${categoriaTexto(p)}${l.aDecidir.has(p.id) ? '  (a decidir)' : ''}`).join('\n') },
      ],
    });
  });
  const folha2 = folhaXml({ ...f2, colunas: col2, ultimaDados: f2.linhas.length, cor: G.sucesso, rodape });

  // ── 3. Ranking completo ──
  const col3: Coluna[] = [
    { titulo: 'Nº', largura: 5, h: 'center' },
    { titulo: 'Categoria', largura: 46, h: 'left' },
    { titulo: 'Posição', largura: 8, h: 'center' },
    { titulo: 'Líder', largura: 30, h: 'left' },
    { titulo: 'Setor', largura: 20, h: 'left' },
    { titulo: 'Votos', largura: 8, h: 'center' },
    { titulo: '%', largura: 9, h: 'center' },
    { titulo: 'Leva esta?', largura: 11, h: 'center' },
    { titulo: 'Campeão(ã) de outras', largura: 50, h: 'left' },
  ];
  const f3 = topo(s, col3, 'Votação da Liderança · Ranking completo', subtitulo,
    'Todos que receberam voto em cada categoria, do mais votado ao menos. Com decisão da diretoria, o escolhido aparece em 1º (os votos não mudam).');
  const titulos = new Map(c.lideres.map(l => [l.id, l.categorias]));
  c.finais.forEach((r, i) => {
    const cat = c.categorias[i];
    const comVoto = r.linhas.filter(l => l.votos > 0);
    if (!comVoto.length) return;
    f3.faixa(22, s.secao, `${cat.numero}. ${categoriaTexto(r.pergunta)}  ·  ${r.total} ${r.total === 1 ? 'voto' : 'votos'}`);
    const fora = comVoto.filter(l => !cat.campeoes.includes(l.id));
    comVoto.forEach(l => {
      const leva = cat.campeoes.includes(l.id);
      // Quem leva é 1º (empatados juntos); os outros, depois deles, com empate dividindo a posição.
      const posicao = leva ? 1 : cat.campeoes.length + 1 + fora.filter(o => o.votos > l.votos).length;
      const outras = (titulos.get(l.id) ?? []).filter(p => p.id !== r.pergunta.id);
      f3.linhas.push({
        altura: 20,
        celulas: [
          { estilo: s.corpo(false, { horizontal: 'center', cor: G.tenue }), numero: cat.numero },
          { estilo: s.corpo(false, { cor: G.fraco, recuo: 1 }), texto: categoriaTexto(r.pergunta) },
          { estilo: s.corpo(false, { horizontal: 'center', negrito: leva }), texto: `${posicao}º` },
          { estilo: s.corpo(false, { negrito: leva, cor: leva ? G.primarioEscuro : G.texto, recuo: 1, fundo: leva ? G.sucessoFundo : undefined }), texto: nome(l.id) },
          { estilo: s.corpo(false, { cor: G.fraco, recuo: 1 }), texto: setor(l.id) },
          { estilo: s.corpo(false, { horizontal: 'center', negrito: leva }), numero: l.votos },
          { estilo: s.corpo(false, { horizontal: 'center', formato: '0.0%', cor: G.fraco }), numero: pct(l.pct) },
          { estilo: s.corpo(false, { horizontal: 'center', negrito: true, cor: leva ? G.sucesso : G.tenue }), texto: leva ? (cat.campeoes.length > 1 ? 'Empate' : 'Sim') : '' },
          outras.length
            ? { estilo: s.corpo(false, { cor: G.alerta, recuo: 1 }), texto: listaDePerguntas(outras) }
            : { estilo: s.corpo(false) },
        ],
      });
    });
  });
  // Filtro não combina com as faixas de seção mescladas: esta aba vai sem.
  const folha3 = folhaXml({ ...f3, colunas: col3, ultimaDados: 0, cor: G.alerta, rodape });

  return montarPacoteXlsx({
    folhas: [
      { nome: 'Campeões', xml: folha1 },
      { nome: 'Por líder', xml: folha2 },
      { nome: 'Ranking completo', xml: folha3 },
    ],
    estilos,
    titulo: `Votação da Liderança · ${d.titulo}`,
    geradoEm: d.geradoEm,
  });
}
