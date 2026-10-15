/**
 * calculoPremiacoes.ts — as linhas do «Relatório de Premiações e Comissões».
 *
 * Pedido de 18/09/2026: a planilha que circulava (Crachá · Nome · Setor ·
 * Comissão · Premiação · Obs.) vira aba do Fechamento, com a premiação de quem
 * já bateu importada sozinha.
 *
 * ## Uma coluna por cidade, e a cidade vem do RH
 *
 * Birigui recebe PREMIAÇÃO e Marília COMISSÃO. Quem diz isso é o vínculo setor →
 * cidade + tipo do RH Gestão (`rh_config_setores`), e não o nome do setor aqui
 * no código: a linha só preenche a coluna do tipo do setor dela, e a outra fica
 * vazia («não se aplica»). Setor sem vínculo não preenche nenhuma.
 *
 * ## O valor é a comissão por meta do mês
 *
 * O mesmo `calcularComissao` do RH e da tela de Metas: faixa atingida × % do
 * mês, com o benefício do setor quando confirmado. Bônus não entra — a regra do
 * RH (16/09/2026).
 *
 *   bateu uma faixa ........ o valor
 *   tem meta e não bateu ... R$ 0,00 — é um pagamento de zero, e a Obs. diz quanto faltou
 *   sem meta / sem config .. vazio, com o motivo na Obs.
 *
 * Sem React, sem fetch.
 */
import { formatBRL } from '@/lib/money';
import type { ResultadoComissao } from '@/services/comissao/comissao';
import { rotuloSituacao, type SituacaoFechamento } from '@/services/fechamentoOperadores/situacoes';

export type TipoRemuneracao = 'premiacao' | 'comissao';

export const ROTULO_TIPO: Record<TipoRemuneracao, string> = {
  premiacao: 'Premiação',
  comissao: 'Comissão',
};

export interface VinculoSetor {
  celula: string;
  tipo: TipoRemuneracao;
}

export type EstadoPremiacao =
  /** Bateu ao menos a 1ª faixa. */
  | 'bateu'
  /** Tem meta e configuração, e ainda não bateu. */
  | 'nao_bateu'
  | 'sem_meta'
  | 'sem_config'
  /** O setor não está ligado a nenhuma cidade no RH. */
  | 'sem_cidade';

export interface LinhaPremiacao {
  operadorId: string;
  nome: string;
  equipeNome: string | null;
  setorId: string | null;
  setorNome: string;
  celula: string | null;
  tipo: TipoRemuneracao | null;
  cracha: string | null;
  /** Só na linha do tipo comissão. `null` = vazio. */
  comissao: number | null;
  /** Só na linha do tipo premiação. `null` = vazio. */
  premiacao: number | null;
  estado: EstadoPremiacao;
  /** Faixa atingida (1 = 1ª meta). `null` sem faixa. */
  faixa: number | null;
  obs: string;
}

export interface EntradaLinhaPremiacao {
  operadorId: string;
  nome: string;
  equipeNome: string | null;
  setorId: string | null;
  setorNome: string;
  vinculo: VinculoSetor | null;
  cracha: string | null;
  /** `null` = o cálculo não rodou (peças indisponíveis). */
  resultado: ResultadoComissao | null;
  /** A situação da pessoa neste fechamento, se a gerência informou. */
  situacao: SituacaoFechamento | null;
  /** Mês ainda aberto: «falta» em vez de «faltou». */
  parcial: boolean;
}

/** A situação entra na Obs. quando diz algo — assíduo é o normal. */
function situacaoNaObs(codigo: SituacaoFechamento | null): string | null {
  return !codigo || codigo === 'assiduo' ? null : rotuloSituacao(codigo);
}

/** Os textos fixos da Obs. — `resultadoDaLinha` os reconhece para não repeti-los no selo. */
const TEXTO_NAO_BATEU = 'Não bateu a 1ª meta';
const TEXTO_SEM_META = 'Sem meta no mês';
const TEXTO_SEM_CIDADE = 'Setor sem cidade no RH';
const textoSemConfig = (tipo: TipoRemuneracao) => `${ROTULO_TIPO[tipo]} não configurada no mês`;

function motivo(r: ResultadoComissao | null, tipo: TipoRemuneracao, parcial: boolean): {
  estado: EstadoPremiacao; valor: number | null; faixa: number | null; texto: string;
} {
  const nomeTipo = ROTULO_TIPO[tipo].toLowerCase();
  if (!r) return { estado: 'sem_config', valor: null, faixa: null, texto: 'Cálculo indisponível' };
  if (r.motivo === 'sem_meta') return { estado: 'sem_meta', valor: null, faixa: null, texto: TEXTO_SEM_META };
  if (r.motivo === 'sem_config') {
    return { estado: 'sem_config', valor: null, faixa: null, texto: textoSemConfig(tipo) };
  }
  if (!r.atual) {
    const falta = r.faixas.find(f => !f.atingida)?.falta ?? null;
    return {
      estado: 'nao_bateu',
      valor: 0,
      faixa: null,
      texto: falta !== null && falta > 0
        ? `${TEXTO_NAO_BATEU} · ${parcial ? 'falta' : 'faltou'} ${formatBRL(falta)}`
        : TEXTO_NAO_BATEU,
    };
  }
  const partes = [`${r.atual.ordem}ª meta`];
  if (r.beneficioAtivo) partes.push('benefício do setor');
  if (r.indireta?.atingida) partes.push('com indireta');
  return {
    estado: 'bateu',
    valor: r.total,
    faixa: r.atual.ordem,
    texto: partes.join(' · ') + (r.total <= 0 ? ` · ${nomeTipo} sem % no mês` : ''),
  };
}

export function montarLinhaPremiacao(e: EntradaLinhaPremiacao): LinhaPremiacao {
  const base = {
    operadorId: e.operadorId,
    nome: e.nome,
    equipeNome: e.equipeNome,
    setorId: e.setorId,
    setorNome: e.setorNome,
    cracha: e.cracha,
  };
  const situacao = situacaoNaObs(e.situacao);

  if (!e.vinculo) {
    return {
      ...base,
      celula: null,
      tipo: null,
      comissao: null,
      premiacao: null,
      estado: 'sem_cidade',
      faixa: null,
      obs: [situacao, TEXTO_SEM_CIDADE].filter(Boolean).join(' · '),
    };
  }

  const m = motivo(e.resultado, e.vinculo.tipo, e.parcial);
  return {
    ...base,
    celula: e.vinculo.celula,
    tipo: e.vinculo.tipo,
    comissao: e.vinculo.tipo === 'comissao' ? m.valor : null,
    premiacao: e.vinculo.tipo === 'premiacao' ? m.valor : null,
    estado: m.estado,
    faixa: m.faixa,
    obs: [situacao, m.texto].filter(Boolean).join(' · '),
  };
}

/** A ordem do modelo: Comissão antes de Premiação. */
const ORDEM_TIPOS: readonly TipoRemuneracao[] = ['comissao', 'premiacao'];

/**
 * As colunas de valor que o recorte mostra.
 *
 * Correção de 18/09/2026: cidade de premiação mostra só Premiação, e cidade de
 * comissão só Comissão — a outra coluna, sempre vazia, só atrapalhava a
 * leitura. As duas aparecem juntas quando o recorte mistura cidades (todos os
 * setores). Sem cidade nenhuma, as duas: a tabela não fica sem coluna de valor.
 */
export function tiposNoRecorte(linhas: readonly Pick<LinhaPremiacao, 'tipo'>[]): TipoRemuneracao[] {
  const presentes = new Set(linhas.map(l => l.tipo));
  const tipos = ORDEM_TIPOS.filter(t => presentes.has(t));
  return tipos.length ? tipos : [...ORDEM_TIPOS];
}

/** O valor da linha na coluna de um tipo. */
export function valorDoTipo(l: Pick<LinhaPremiacao, 'comissao' | 'premiacao'>, tipo: TipoRemuneracao): number | null {
  return tipo === 'comissao' ? l.comissao : l.premiacao;
}

/** Setor e nome, como a planilha: um setor só fica em ordem alfabética. */
export function ordenarLinhasPremiacao(linhas: readonly LinhaPremiacao[]): LinhaPremiacao[] {
  return [...linhas].sort((a, b) =>
    a.setorNome.localeCompare(b.setorNome, 'pt-BR')
    || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export interface TotalTipo {
  total: number;
  /** Linhas do tipo (com cidade ligada a ele). */
  pessoas: number;
  bateram: number;
}

export interface ResumoPremiacoes {
  premiacao: TotalTipo;
  comissao: TotalTipo;
  comCracha: number;
  semCidade: number;
  total: number;
}

export function resumirPremiacoes(linhas: readonly LinhaPremiacao[]): ResumoPremiacoes {
  const vazio = (): TotalTipo => ({ total: 0, pessoas: 0, bateram: 0 });
  const r: ResumoPremiacoes = {
    premiacao: vazio(), comissao: vazio(), comCracha: 0, semCidade: 0, total: linhas.length,
  };
  for (const l of linhas) {
    if (l.cracha) r.comCracha++;
    if (!l.tipo) { r.semCidade++; continue; }
    const t = r[l.tipo];
    t.pessoas++;
    if (l.estado === 'bateu') t.bateram++;
    t.total += (l.tipo === 'premiacao' ? l.premiacao : l.comissao) ?? 0;
  }
  // Soma em centavos para não arrastar resto de ponto flutuante até o card.
  r.premiacao.total = Math.round(r.premiacao.total * 100) / 100;
  r.comissao.total = Math.round(r.comissao.total * 100) / 100;
  return r;
}

// ── A leitura para a diretoria (15/10/2026) ────────────────────────────────
//
// Pedido de 15/10/2026: a aba precisava ser apresentável — o resultado de cada
// pessoa num selo só, e o mês resumido por setor (ou equipe) e por meta
// atingida antes da lista de nomes. Tudo sai das mesmas `linhas`: a tela e o
// HTML mostram os mesmos números.

export type TomResultado = 'sucesso' | 'neutro' | 'tenue';

export interface ResultadoLinha {
  /** «2ª meta», «Não bateu», «Sem meta»... */
  rotulo: string;
  tom: TomResultado;
  /** A Obs. sem o que o rótulo já diz. Vazio quando não sobra nada. */
  detalhe: string;
}

/** O resultado da pessoa num selo, e o resto da Obs. como detalhe. */
export function resultadoDaLinha(
  l: Pick<LinhaPremiacao, 'estado' | 'faixa' | 'tipo' | 'obs'>,
): ResultadoLinha {
  let rotulo: string;
  let tom: TomResultado;
  let repetido: string[];
  switch (l.estado) {
    case 'bateu':
      rotulo = l.faixa !== null ? `${l.faixa}ª meta` : 'Bateu';
      tom = 'sucesso';
      repetido = [rotulo];
      break;
    case 'nao_bateu':
      rotulo = 'Não bateu'; tom = 'neutro'; repetido = [TEXTO_NAO_BATEU];
      break;
    case 'sem_meta':
      rotulo = 'Sem meta'; tom = 'tenue'; repetido = [TEXTO_SEM_META];
      break;
    case 'sem_config':
      rotulo = 'Sem configuração'; tom = 'tenue';
      repetido = l.tipo ? [textoSemConfig(l.tipo)] : [];
      break;
    default:
      rotulo = 'Sem cidade'; tom = 'tenue'; repetido = [TEXTO_SEM_CIDADE];
  }
  const detalhe = (l.obs ? l.obs.split(' · ') : [])
    .filter(p => !repetido.includes(p))
    .join(' · ');
  return { rotulo, tom, detalhe };
}

export type ChaveGrupo = 'setor' | 'equipe';

export interface GrupoPremiacao {
  chave: string;
  nome: string;
  /** Cidade e tipo do setor (no grupo por equipe, os do setor da equipe). */
  celula: string | null;
  tipo: TipoRemuneracao | null;
  pessoas: number;
  bateram: number;
  total: number;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/** O valor que a linha recebe, na coluna do tipo dela. */
const valorDaLinha = (l: LinhaPremiacao) => (l.tipo ? valorDoTipo(l, l.tipo) : null) ?? 0;

/** O recorte agrupado por setor ou por equipe, do maior valor ao menor. */
export function agruparPremiacoes(linhas: readonly LinhaPremiacao[], chave: ChaveGrupo): GrupoPremiacao[] {
  const grupos = new Map<string, GrupoPremiacao>();
  for (const l of linhas) {
    const id = chave === 'setor' ? (l.setorId ?? `nome:${l.setorNome}`) : (l.equipeNome ?? '');
    const nome = chave === 'setor' ? l.setorNome : (l.equipeNome ?? 'Sem equipe');
    let g = grupos.get(id);
    if (!g) {
      g = { chave: id, nome, celula: l.celula, tipo: l.tipo, pessoas: 0, bateram: 0, total: 0 };
      grupos.set(id, g);
    }
    g.pessoas++;
    if (l.estado === 'bateu') g.bateram++;
    g.total += valorDaLinha(l);
  }
  return [...grupos.values()]
    .map(g => ({ ...g, total: centavos(g.total) }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Vários setores → por setor; um setor só → por equipe, se houver mais de uma. */
export function chaveDoAgrupamento(linhas: readonly LinhaPremiacao[]): ChaveGrupo | null {
  if (new Set(linhas.map(l => l.setorId ?? l.setorNome)).size > 1) return 'setor';
  if (new Set(linhas.map(l => l.equipeNome ?? '')).size > 1) return 'equipe';
  return null;
}

export interface FaixaPremiacao {
  faixa: number;
  pessoas: number;
  total: number;
}

export interface DistribuicaoFaixas {
  /** Da 1ª meta em diante, só as que alguém bateu. */
  faixas: FaixaPremiacao[];
  naoBateram: number;
  /** Sem meta, sem configuração ou sem cidade: fora da conta. */
  semValor: number;
}

export function distribuirPorFaixa(linhas: readonly LinhaPremiacao[]): DistribuicaoFaixas {
  const por = new Map<number, FaixaPremiacao>();
  let naoBateram = 0;
  let semValor = 0;
  for (const l of linhas) {
    if (l.estado === 'nao_bateu') { naoBateram++; continue; }
    if (l.estado !== 'bateu') { semValor++; continue; }
    if (l.faixa === null) continue;
    const f = por.get(l.faixa) ?? { faixa: l.faixa, pessoas: 0, total: 0 };
    f.pessoas++;
    f.total += valorDaLinha(l);
    por.set(l.faixa, f);
  }
  return {
    faixas: [...por.values()].map(f => ({ ...f, total: centavos(f.total) })).sort((a, b) => a.faixa - b.faixa),
    naoBateram,
    semValor,
  };
}

/** Fração de 0 a 1 → «37,5%». */
export function formatarPercentual(fracao: number): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/**
 * Crachá como a pessoa digitou, conferido antes de ir ao banco (que confere de
 * novo). Vazio apaga; `undefined` = inválido.
 */
export function lerCracha(texto: string): string | null | undefined {
  const t = texto.trim();
  if (t === '') return null;
  return /^[0-9A-Za-z./-]{1,20}$/.test(t) ? t : undefined;
}
