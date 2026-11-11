/**
 * numeros.ts — do pacote do banco ao que a parede mostra.
 *
 * O banco devolve o pacote cru (`fn_tv_numeros_calcular`): meta gravada em
 * bruto, recebido em bruto e em H.O., dias úteis. Aqui ele vira a visão de UMA
 * unidade, com falta, percentual, ritmo e projeção já contados.
 *
 * ## H.O. só na regra Cofen
 *
 * Setor de Nosso produto vê sempre bruto, seja qual for a unidade do painel.
 * No Cofen a meta é PENSADA em H.O. e GRAVADA em bruto: converte-se pelo
 * percentual da empresa, igual a `metaNaUnidade` (`lib/unidadeValor.ts`). O
 * recebido em H.O. não é convertido — vem da coluna do relatório.
 *
 * ## De onde vem o dinheiro no Cofen (Cleber, 30/10/2026)
 *
 * O painel de SETOR Cofen chega do banco pela conciliação (mês, hoje e curva,
 * `fonte_setor`), como o card do Painel do Líder; equipe e pessoas, pelo 58
 * (Analítico). Quem escolhe é `fn_tv_numeros_calcular` — aqui nada muda.
 *
 * Puro: sem React e sem banco. Testado em `numeros.test.ts`.
 */
import { hoPercentualDaConfig } from '@/lib/hoPercentual';
import {
  escolherDisputa, faltaParaPassar, normalizarRanking, temPremio,
  type CategoriaRanking, type Criterio,
} from '@/services/rankingQuitacao/ranking';
import type { NumerosTv, PessoaRanking, QuitacaoTv, TelaDoPainel, Unidade } from './tipos';
import { opcao } from './templates';

export interface VisaoTv {
  unidade: Unidade;
  alvoNome: string;
  meta: number;
  recebido: number;
  falta: number;
  /** 0–1+, sem corte em cima: 1,12 é 112%. */
  fracao: number;
  batida: boolean;
  hoje: { alvo: number; recebido: number; falta: number; fracao: number };
  diasUteis: number;
  diasDecorridos: number;
  diasRestantes: number;
  /** Quanto precisa entrar por dia útil que sobra. */
  ritmo: number;
  projecao: number;
  /**
   * Todas as pessoas com recebimento no mês (antes de 20261106120000, só o top
   * 10). `meta`: a individual, já na unidade; `null` = sem meta.
   */
  ranking: { id: string; nome: string; foto: string | null; valor: number; meta: number | null }[];
  /**
   * O pacote traz a meta de cada pessoa (20261106120000)? Sem ela a projeção
   * por pessoa não tem régua, e a tela avisa.
   */
  rankingComMeta: boolean;
  diasNoMes: number;
  hojeDia: number;
  /** Recebido acumulado por dia, do dia 0 (zero) até hoje. */
  serie: { dia: number; valor: number }[];
  /** A cena «Destaque»: o 1º de cada dia e do mês, já na unidade. */
  destaques: { escopo: string; dia: string; id: string; nome: string; foto: string | null; valor: number; pagamentos: number }[];
  equipes: { id: string; nome: string }[];
  equipeDoPainel: string | null;
  setorNome: string;
  /** Equipe contra equipe, já na unidade. `null`: o banco ainda não manda (antes de 20261030170000). */
  equipesRanking: { id: string; nome: string; valor: number; meta: number }[] | null;
  /** O top 10 de cada equipe do setor, já na unidade. `null`: idem. */
  rankingPorEquipe: { equipeId: string; pessoas: VisaoTv['ranking'] }[] | null;
  /** O Ranking de quitação do setor. `null`: idem. */
  quitacao: QuitacaoTv | null;
  /** «YYYY-MM-DD» e «YYYY-MM» do banco. */
  hojeIso: string;
  mesIso: string;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const centavos = (v: number) => Math.round(v * 100) / 100;

export function unidadeEfetiva(n: Pick<NumerosTv, 'regra'>, doPainel: Unidade): Unidade {
  return n.regra === 'cofen' ? doPainel : 'bruto';
}

export function montarVisao(
  n: NumerosTv,
  unidadeDoPainel: Unidade,
  alvoDiarioManual: number | null = null,
): VisaoTv {
  const unidade = unidadeEfetiva(n, unidadeDoPainel);
  const emHo = unidade === 'ho';
  const pct = hoPercentualDaConfig({ ho_percentual: n.ho_percentual });

  const meta = emHo ? centavos(num(n.meta) * pct) : num(n.meta);
  const recebido = num(emHo ? n.recebido_ho : n.recebido);
  const recebidoHoje = num(emHo ? n.recebido_hoje_ho : n.recebido_hoje);

  const diasUteis = Math.max(0, Math.trunc(num(n.dias_uteis)));
  const diasDecorridos = Math.min(diasUteis, Math.max(0, Math.trunc(num(n.dias_decorridos))));
  const diasRestantes = diasUteis - diasDecorridos;

  const falta = Math.max(0, centavos(meta - recebido));
  const alvoHoje = alvoDiarioManual && alvoDiarioManual > 0
    ? alvoDiarioManual
    : diasUteis > 0 ? centavos(meta / diasUteis) : 0;

  // A meta da pessoa é gravada em bruto, como a do setor: em H.O., converte.
  const pessoas = (lista: PessoaRanking[] | null | undefined) => (Array.isArray(lista) ? lista : []).map(p => {
    const metaBruta = num(p.meta);
    return {
      id: p.id,
      nome: p.nome ?? '',
      foto: p.foto ?? null,
      valor: num(emHo ? p.valor_ho : p.valor),
      meta: metaBruta > 0 ? (emHo ? centavos(metaBruta * pct) : metaBruta) : null,
    };
  }).sort((a, b) => b.valor - a.valor);
  const listaRanking = Array.isArray(n.ranking) ? n.ranking : [];

  return {
    unidade,
    alvoNome: n.alvo_nome ?? '',
    meta,
    recebido,
    falta,
    fracao: meta > 0 ? recebido / meta : 0,
    batida: meta > 0 && recebido >= meta,
    hoje: {
      alvo: alvoHoje,
      recebido: recebidoHoje,
      falta: Math.max(0, centavos(alvoHoje - recebidoHoje)),
      fracao: alvoHoje > 0 ? recebidoHoje / alvoHoje : 0,
    },
    diasUteis,
    diasDecorridos,
    diasRestantes,
    // No último dia útil, tudo o que falta é para hoje.
    ritmo: falta > 0 ? centavos(falta / Math.max(1, diasRestantes)) : 0,
    // Sem dia trabalhado, o próprio recebido (como `ritmoDoPeriodo`), e não zero.
    projecao: diasDecorridos > 0 ? centavos(recebido / diasDecorridos * diasUteis) : recebido,
    ranking: pessoas(n.ranking),
    // Ranking vazio não tem o que conferir: vale como «tem».
    rankingComMeta: !listaRanking.length || listaRanking.some(p => p && typeof p === 'object' && 'meta' in p),
    diasNoMes: diasDoMes(n.mes),
    hojeDia: diaDe(n.hoje) ?? diasDoMes(n.mes),
    serie: serieAcumulada(n, unidade),
    destaques: (Array.isArray(n.destaques) ? n.destaques : []).map(d => ({
      escopo: String(d.escopo), dia: String(d.dia), id: d.id, nome: d.nome ?? '', foto: d.foto ?? null,
      valor: num(emHo ? d.valor_ho : d.valor), pagamentos: Math.max(0, Math.trunc(num(d.pagamentos))),
    })),
    equipes: Array.isArray(n.equipes) ? n.equipes : [],
    equipeDoPainel: n.equipe_id ?? null,
    setorNome: n.setor_nome ?? (n.alvo_tipo === 'setor' ? n.alvo_nome ?? '' : ''),
    hojeIso: String(n.hoje ?? '').slice(0, 10),
    mesIso: String(n.mes ?? ''),
    // A meta da equipe é gravada em bruto, como a do setor: em H.O., converte.
    equipesRanking: Array.isArray(n.equipes_ranking)
      ? n.equipes_ranking.map(e => ({
          id: e.id, nome: e.nome ?? '',
          valor: num(emHo ? e.valor_ho : e.valor),
          meta: emHo ? centavos(num(e.meta) * pct) : num(e.meta),
        })).sort((a, b) => b.valor - a.valor)
      : null,
    rankingPorEquipe: Array.isArray(n.ranking_por_equipe)
      ? n.ranking_por_equipe.map(r => ({ equipeId: String(r.equipe_id), pessoas: pessoas(r.pessoas) }))
      : null,
    quitacao: n.quitacao && typeof n.quitacao === 'object' ? n.quitacao : null,
  };
}

// ── As cenas de ranking (30/10/2026) ────────────────────────────────────────

/** Pacote de antes de 20261030170000: a TV avisa em vez de mostrar errado. */
export const AGUARDANDO_ATUALIZACAO = 'Esta opção chega com a próxima atualização do sistema.';

export interface ItemDoRanking {
  id: string;
  nome: string;
  foto: string | null;
  valor: number;
  /** Só nas equipes, e só quando a equipe tem meta (na mesma régua do `valor`). */
  meta: number | null;
}

export interface RankingNaTela {
  itens: ItemDoRanking[];
  /** Vazio quando há o que mostrar; senão, a frase para a parede. */
  motivo: string;
  deEquipes: boolean;
  projecao: boolean;
}

/**
 * Ordem da projeção: o maior % da meta primeiro; quem não tem meta vai para o
 * fim, pelo valor (como `ordenarLinhas` da aba Quartis). Empate no %, valor.
 */
export function porPercentualDaMeta<T extends { valor: number; meta: number | null; nome: string }>(itens: T[]): T[] {
  const pct = (x: T) => (x.meta && x.meta > 0 ? x.valor / x.meta : null);
  return [...itens].sort((a, b) => {
    const pa = pct(a), pb = pct(b);
    if (pa == null && pb == null) return b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR');
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pb - pa || b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR');
  });
}

/**
 * O ranking de uma tela de Pódio ou Lista, pelas opções dela.
 *
 * ## Projeção (corrigida em 06/11/2026)
 *
 * É a conta da aba Quartis (`calcularProjecao`): a projeção de cada um é sobre
 * a META DELE — recebido ÷ esperado até hoje, que é o mesmo que o fechamento
 * projetado ÷ meta. A ordem é por esse %, e quem não tem meta vai para o fim.
 *
 * Antes, a TV só multiplicava o recebido de todos pelo mesmo fator (dias
 * úteis ÷ decorridos): a ordem ficava igual à do recebido e o valor saltava —
 * no começo do mês, ×5 — sem régua nenhuma na tela.
 *
 * O valor mostrado continua sendo o fechamento projetado (recebido no ritmo
 * atual até o fim do mês), agora com o «% da meta» ao lado.
 */
export function rankingDaTela(v: VisaoTv, tela: Pick<TelaDoPainel, 'template' | 'opcoes'>): RankingNaTela {
  const projecao = opcao<string>(tela, 'valor') === 'projecao';
  const fator = projecao && v.diasDecorridos > 0 ? v.diasUteis / v.diasDecorridos : 1;
  const projetar = (x: number) => centavos(x * fator);
  const fonte = opcao<string>(tela, 'fonte');
  const vazio = (motivo: string, deEquipes = false): RankingNaTela => ({ itens: [], motivo, deEquipes, projecao });

  if (fonte === 'equipes') {
    if (!v.equipesRanking) return vazio(AGUARDANDO_ATUALIZACAO, true);
    const base = v.equipesRanking
      .filter(e => e.valor > 0 || e.meta > 0)
      .map((e): ItemDoRanking => ({ id: e.id, nome: e.nome, foto: null, valor: projetar(e.valor), meta: e.meta > 0 ? e.meta : null }));
    const itens = projecao ? porPercentualDaMeta(base) : base;
    return itens.length
      ? { itens, motivo: '', deEquipes: true, projecao }
      : vazio('Nenhuma equipe do setor recebeu neste mês ainda.', true);
  }

  // Sem a meta de cada pessoa no pacote, a projeção não tem régua: avisa.
  if (projecao && !v.rankingComMeta) return vazio(AGUARDANDO_ATUALIZACAO);

  let pessoas = v.ranking;
  if (fonte === 'equipe') {
    const equipe = opcao<string>(tela, 'equipe_id') || v.equipeDoPainel || '';
    if (!equipe) return vazio('Escolha a equipe nas opções da tela.');
    const daEquipe = v.rankingPorEquipe?.find(r => r.equipeId === equipe);
    if (daEquipe) pessoas = daEquipe.pessoas;
    // Painel da própria equipe: o ranking do painel já é o dela.
    else if (equipe !== v.equipeDoPainel) {
      return vazio(v.rankingPorEquipe ? 'Ninguém desta equipe recebeu neste mês ainda.' : AGUARDANDO_ATUALIZACAO);
    }
  }
  if (!pessoas.length) return vazio('Ainda não há recebimento neste mês.');
  if (!projecao) {
    // Pelo recebido, como sempre: sem a meta ao lado.
    return { itens: pessoas.map((p): ItemDoRanking => ({ ...p, meta: null })), motivo: '', deEquipes: false, projecao };
  }
  return {
    itens: porPercentualDaMeta(pessoas.map((p): ItemDoRanking => ({ ...p, valor: projetar(p.valor) }))),
    motivo: '', deEquipes: false, projecao,
  };
}

/** O nome que a parede mostra: «Equipe Rosa», nunca «Equipe Equipe Rosa». */
export function nomeDoItem(item: Pick<ItemDoRanking, 'nome'>, deEquipes: boolean): string {
  return deEquipes ? rotuloDaEquipe(item.nome) : nomeCurto(item.nome);
}

// ── A cena «Ranking de equipes» (06/11/2026) ─────────────────────────────────

/** Quantas equipes cabem na parede sem a letra ficar pequena demais do fundo da sala. */
export const MAX_EQUIPES_NA_TELA = 8;

export interface EquipeNaTela {
  id: string;
  /** «Equipe Rosa». */
  nome: string;
  /** O recebido, ou a projeção quando a tela compara a projeção. */
  valor: number;
  /** `null`: a equipe não tem meta cadastrada no mês. */
  meta: number | null;
  /** valor ÷ meta, sem corte em cima; `null` sem meta. */
  fracao: number | null;
  /** Quem mais recebeu na equipe no mês. */
  primeiro: { nome: string; foto: string | null } | null;
}

export interface EquipesNaTela {
  itens: EquipeNaTela[];
  /** Vazio quando há o que mostrar; senão, a frase para a parede. */
  motivo: string;
  projecao: boolean;
  porMeta: boolean;
  /** Quantas equipes escolhidas ficaram fora da tela (acima de `MAX_EQUIPES_NA_TELA`). */
  fora: number;
}

/**
 * As equipes da cena, pelas opções dela.
 *
 * • «Equipes que participam» vazio = todas as do setor que receberam ou têm
 *   meta no mês (a mesma regra do «Ranking de: Equipes» do Pódio e da Lista).
 *   Escolhidas à mão, aparecem mesmo zeradas: o líder pediu aquelas.
 * • Ordem pelo % da meta: quem não tem meta vai para o fim, pelo valor.
 * • Projeção: o recebido × dias úteis ÷ decorridos, como em `rankingDaTela`.
 *   O % da meta passa a ser o da projeção, e a ordem é por ele.
 */
export function equipesDaTela(v: VisaoTv, tela: Pick<TelaDoPainel, 'template' | 'opcoes'>): EquipesNaTela {
  const ordem = opcao<string>(tela, 'ordem');
  const projecao = ordem === 'projecao';
  // A projeção ordena pelo % da meta projetado: multiplicar todas pelo mesmo
  // fator e ordenar pelo valor daria a ordem do recebido (ver `rankingDaTela`).
  const porMeta = ordem === 'meta' || projecao;
  const vazio = (motivo: string): EquipesNaTela => ({ itens: [], motivo, projecao, porMeta, fora: 0 });
  if (!v.equipesRanking) return vazio(AGUARDANDO_ATUALIZACAO);

  const escolhidas = opcao<string[]>(tela, 'equipes');
  let base = v.equipesRanking;
  if (escolhidas.length) {
    const pedidas = new Set(escolhidas);
    base = base.filter(e => pedidas.has(e.id));
    if (!base.length) return vazio('As equipes escolhidas não estão mais no setor. Escolha de novo nas opções da tela.');
  } else {
    base = base.filter(e => e.valor > 0 || e.meta > 0);
    if (!base.length) return vazio('Nenhuma equipe do setor recebeu neste mês ainda.');
  }

  const fator = projecao && v.diasDecorridos > 0 ? v.diasUteis / v.diasDecorridos : 1;
  const itens = base.map((e): EquipeNaTela => {
    const valor = centavos(e.valor * fator);
    const meta = e.meta > 0 ? e.meta : null;
    const top = v.rankingPorEquipe?.find(r => r.equipeId === e.id)?.pessoas.find(p => p.valor > 0);
    return {
      id: e.id, nome: rotuloDaEquipe(e.nome), valor, meta,
      fracao: meta ? valor / meta : null,
      primeiro: top ? { nome: top.nome, foto: top.foto } : null,
    };
  });
  itens.sort((a, b) => {
    if (porMeta && (a.fracao != null) !== (b.fracao != null)) return a.fracao != null ? -1 : 1;
    if (porMeta && a.fracao != null && b.fracao != null && a.fracao !== b.fracao) return b.fracao - a.fracao;
    return b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return {
    itens: itens.slice(0, MAX_EQUIPES_NA_TELA),
    motivo: '', projecao, porMeta,
    fora: Math.max(0, itens.length - MAX_EQUIPES_NA_TELA),
  };
}

export interface QuitacaoNaTela {
  /** Vazio quando há o que mostrar. */
  motivo: string;
  criterio: Criterio;
  /** Na disputa por equipe, a equipe mostrada («Equipe Rosa»). */
  disputaNome: string | null;
  podio: QuitacaoLinha[];
  /** Depois do pódio, ainda na zona de prêmio. */
  premiados: QuitacaoLinha[];
  /** Fora da zona de prêmio: quanto falta para passar quem está acima. */
  perseguindo: (QuitacaoLinha & { falta: number })[];
  /** Quantas posições têm prêmio. */
  premiadas: number;
  participantes: number;
  /** Os destaques do mês (20261111150500), já na ordem da configuração. */
  categorias: CategoriaRanking[];
}

export interface QuitacaoLinha {
  posicao: number; id: string; nome: string; foto: string | null;
  quitacoes: number; valor: number; premio: number | null;
  /** O brinde da posição («Troféu»), ao lado ou no lugar do valor. */
  premioTexto: string | null;
  /** Posição premiada, mas sem o mínimo de quitações. */
  abaixoMinimo: boolean;
}

/**
 * A cena de quitação: o MESMO leitor da aba do Analítico
 * (`normalizarRanking`), então a parede mostra a mesma ordem, os mesmos
 * prêmios e os mesmos destaques. O valor é o recebido no mês dos acordos
 * quitados (desde 04/11/2026; antes, o Valor Acordo) — não tem H.O.
 *
 * Por equipe (`disputa: 'equipe'`): a equipe escolhida na tela, senão a do
 * painel, senão a primeira.
 */
export function quitacaoDaTela(
  v: Pick<VisaoTv, 'quitacao' | 'setorNome' | 'mesIso'> & Partial<Pick<VisaoTv, 'equipeDoPainel'>>,
  equipeDaTela?: string | null,
): QuitacaoNaTela {
  const vazio = (motivo: string): QuitacaoNaTela => ({
    motivo, criterio: 'valor', disputaNome: null, podio: [], premiados: [], perseguindo: [],
    premiadas: 0, participantes: 0, categorias: [],
  });
  if (!v.quitacao) return vazio(AGUARDANDO_ATUALIZACAO);
  const r = normalizarRanking(v.quitacao);
  if (!r.habilitado) {
    return vazio(`${v.setorNome || 'Este setor'} não tem o Ranking de quitação. Ative em Configurações → Eventos e gincanas.`);
  }
  const d = escolherDisputa(r, equipeDaTela || v.equipeDoPainel || null);
  const linhas: QuitacaoLinha[] = (d?.posicoes ?? []).map(p => ({
    posicao: p.posicao, id: p.operador_id, nome: p.nome, foto: p.foto_url,
    quitacoes: p.quitacoes, valor: p.valor, premio: p.premio, premioTexto: p.premio_texto, abaixoMinimo: p.abaixo_minimo,
  }));
  if (!linhas.length) {
    const mes = MESES_TV[Number(v.mesIso.slice(5, 7)) - 1];
    if (r.importado_em && d?.nome) return { ...vazio(`Ninguém da ${d.nome} quitou acordo${mes ? ` em ${mes}` : ''} ainda.`), categorias: r.categorias };
    return vazio(`O Ranking de quitação${mes ? ` de ${mes}` : ''} ainda não foi importado.`);
  }
  const porPosicao = new Map(linhas.map(l => [l.posicao, l]));
  const comPremio = (l: QuitacaoLinha) => temPremio({ premio: l.premio, premio_texto: l.premioTexto }) || l.abaixoMinimo;
  const depois = linhas.filter(l => l.posicao > 3);
  return {
    motivo: '',
    criterio: r.criterio,
    disputaNome: r.disputa === 'equipe' ? d?.nome ?? null : null,
    podio: linhas.filter(l => l.posicao <= 3),
    premiados: depois.filter(comPremio),
    perseguindo: depois.filter(l => !comPremio(l)).map(l => {
      const acima = porPosicao.get(l.posicao - 1);
      return { ...l, falta: acima ? faltaParaPassar(r.criterio, acima, l) : 0 };
    }),
    premiadas: r.posicoes_premiadas,
    participantes: Math.max(linhas.length, d?.participantes ?? 0, r.disputa === 'setor' ? r.participantes : 0),
    categorias: r.categorias,
  };
}

export const MESES_TV = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// ── A cena «Destaque» ────────────────────────────────────────────────────────

export interface DestaqueNaTela {
  /** `null`: ninguém (ainda) — `motivo` diz por quê. */
  pessoa: { id: string; nome: string; foto: string | null; valor: number; pagamentos: number } | null;
  motivo: string;
  /** «YYYY-MM-DD», ou `null` no mês inteiro (ou sem dia escolhido). */
  dia: string | null;
  doMes: boolean;
  /** «Equipe Rosa», «Play 1». */
  onde: string;
}

const rotuloDaEquipe = (nome: string) => (/^equipe\b/i.test(nome.trim()) ? nome.trim() : `Equipe ${nome.trim()}`);

/**
 * Quem a cena mostra, pelas opções da tela: setor ou equipe; hoje, o dia
 * anterior com recebimento, um dia escolhido (do mês corrente — o pacote é do
 * mês) ou o mês até agora.
 */
export function destaqueDaTela(v: VisaoTv, tela: Pick<TelaDoPainel, 'template' | 'opcoes'>): DestaqueNaTela {
  const doMes = opcao<string>(tela, 'dia') === 'mes';
  const porEquipe = opcao<string>(tela, 'escopo') === 'equipe';
  const equipe = porEquipe ? (opcao<string>(tela, 'equipe_id') || v.equipeDoPainel || '') : '';
  const nomeEquipe = v.equipes.find(e => e.id === equipe)?.nome;
  const onde = porEquipe ? (nomeEquipe ? rotuloDaEquipe(nomeEquipe) : '') : v.setorNome;
  const vazio = (motivo: string, dia: string | null = null): DestaqueNaTela => ({ pessoa: null, motivo, dia, doMes, onde });

  if (porEquipe && !equipe) return vazio('Escolha a equipe nas opções da tela.');
  const escopo = porEquipe ? equipe : 'setor';
  const doEscopo = v.destaques.filter(d => d.escopo === escopo);

  let dia: string | null = null;
  switch (opcao<string>(tela, 'dia')) {
    case 'hoje': dia = v.hojeIso; break;
    case 'mes': dia = null; break;
    case 'data': {
      const escolhido = opcao<string>(tela, 'data');
      if (!escolhido) return vazio('Escolha o dia nas opções da tela.');
      if (!escolhido.startsWith(`${v.mesIso}-`)) return vazio('A TV mostra os dias do mês atual.', escolhido);
      dia = escolhido;
      break;
    }
    default: {
      const antes = doEscopo.map(d => d.dia).filter(d => d !== 'mes' && d < v.hojeIso).sort();
      if (!antes.length) return vazio('Ainda não teve outro dia com recebimento neste mês.');
      dia = antes[antes.length - 1];
    }
  }

  const achado = doEscopo.find(d => d.dia === (dia ?? 'mes'));
  if (!achado) {
    return vazio(dia === v.hojeIso ? 'Ninguém recebeu ainda hoje. Quem vai ser o primeiro?' : 'Ninguém recebeu neste dia.', dia);
  }
  return {
    pessoa: { id: achado.id, nome: achado.nome, foto: achado.foto, valor: achado.valor, pagamentos: achado.pagamentos },
    motivo: '', dia, doMes, onde,
  };
}

function diasDoMes(mes: string | undefined): number {
  const [a, m] = String(mes ?? '').split('-').map(Number);
  return a && m ? new Date(a, m, 0).getDate() : 30;
}

function diaDe(iso: string | undefined): number | null {
  const d = Number(String(iso ?? '').slice(8, 10));
  return Number.isInteger(d) && d >= 1 && d <= 31 ? d : null;
}

/**
 * O recebido ACUMULADO de cada dia do mês, até hoje, para o gráfico.
 *
 * A série do banco é o formato do mês (uma leitura só do analítico); o total
 * oficial é o do Painel do Líder. A curva é escalada para terminar exatamente
 * no total — o último ponto do gráfico é o mesmo número das outras telas.
 * Sem série (cache antigo), uma reta de 0 ao total.
 */
export function serieAcumulada(n: Pick<NumerosTv, 'serie' | 'mes' | 'hoje' | 'recebido' | 'recebido_ho'>, unidade: Unidade): { dia: number; valor: number }[] {
  const total = num(unidade === 'ho' ? n.recebido_ho : n.recebido);
  const ultimo = diaDe(n.hoje) ?? diasDoMes(n.mes);
  const porDia = new Map<number, number>();
  for (const p of Array.isArray(n.serie) ? n.serie : []) {
    const d = diaDe(p?.dia);
    if (d && d <= ultimo) porDia.set(d, (porDia.get(d) ?? 0) + num(unidade === 'ho' ? p.valor_ho : p.valor));
  }
  const soma = [...porDia.values()].reduce((a, b) => a + b, 0);

  const pontos: { dia: number; valor: number }[] = [{ dia: 0, valor: 0 }];
  if (soma <= 0) {
    pontos.push({ dia: ultimo, valor: total });
    return pontos;
  }
  const fator = total / soma;
  let acc = 0;
  for (let d = 1; d <= ultimo; d++) {
    acc += (porDia.get(d) ?? 0) * fator;
    pontos.push({ dia: d, valor: d === ultimo ? total : centavos(acc) });
  }
  return pontos;
}

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 2, minimumFractionDigits: 2,
});

/** Dinheiro de parede: o valor exato do relatório, com centavos (Cleber, 27/10). */
export function moedaTv(v: number): string {
  return MOEDA.format(Math.round(v * 100) / 100);
}

/** Largura de cada caractere, em «em», na fonte da TV (Inter, negrito, algarismos tabulares). */
const LARGURA_EM: Record<string, number> = { '.': 0.3, ',': 0.3, ' ': 0.28, ' ': 0.28, R: 0.7, $: 0.64, '%': 0.92 };

/**
 * O maior corpo, até `base`, em que `texto` cabe em `largura` px. Com centavos
 * o número cresceu: «R$ 1.234.567,89» não cabe no corpo de «R$ 1.234.567».
 */
export function tamanhoQueCabe(texto: string, largura: number, base: number): number {
  const em = [...texto].reduce((s, ch) => s + (LARGURA_EM[ch] ?? 0.64), 0);
  return em > 0 ? Math.min(base, Math.floor(largura / em)) : base;
}

/** Percentual cortado, nunca arredondado para cima: 99,6% não é 100%. */
export function percentualTv(fracao: number): string {
  const p = Math.floor(Math.max(0, fracao) * 1000) / 10;
  return `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/** «Maria Aparecida Souza» → «Maria Souza». A parede não tem espaço para três nomes. */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 2) return partes.join(' ');
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
