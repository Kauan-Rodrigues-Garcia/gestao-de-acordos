/**
 * desempenhoDia.service.ts — as leituras do painel Desempenho do Dia.
 *
 * Quatro origens, cada uma respondendo ao que só ela sabe:
 *
 *   analitico_recebimentos   quanto o ERP recebeu     (faixa "o dia em dinheiro")
 *   acordos                  o que foi tabulado aqui  (faixa "a minha operação")
 *   metas + metas_config_mes o alvo e os dias úteis
 *   pix_automatico_acordos   o Pix do dia             (BookPlay)
 *
 * As três primeiras existem nas duas operações. A quarta é só BookPlay, e a
 * função devolve lista vazia na PaguePlay em vez de consultar uma tabela que
 * naquele tenant nunca tem linha.
 *
 * ## O recorte
 *
 * O painel soma "as pessoas que eu enxergo", e não "o setor pelo carimbo do
 * relatório". A diferença aparece só na BookPlay, onde o ERP carimba o setor na
 * importação: a aba Analítico pode somar pelo carimbo, e aqui a soma é pelos
 * operadores.
 *
 * É deliberado. O painel é uma espiada rápida em «como vai o meu dia / o dia da
 * minha gente», e a resposta útil é a das pessoas. Reproduzir a escada de
 * carimbo, setor alternativo e origens excluídas exigiria as mesmas seis
 * consultas do Painel de Metas para um painel que abre e fecha em segundos — e
 * duplicaria uma regra que já vive em `escopoAnalitico`.
 */

import { supabase } from '@/lib/supabase';
import type { NivelEscopo } from '@/lib/permissoes-escopo';
import {
  linhaNoEscopo, ESCOPO_EMPRESA, type EscopoAnalitico,
} from '@/services/analitico/escopoAnalitico';

/** Uma linha do analítico, com o mínimo que o painel usa. */
export interface LinhaAnaliticoDia {
  data_pagamento: string;
  valor_recebido: number;
  total_ho: number | null;
  operador_id: string | null;
  setor_id?: string | null;
}

export interface AcordoDoDia {
  status: string | null;
  valor: number | null;
  tipo_vinculo: string | null;
  tag_ids: string[] | null;
}

export interface LinhaPixDia {
  status: string | null;
  valor: number | null;
  pct_comissao: number | null;
}

const PAGINA = 1000;
/**
 * Teto de páginas. A janela do painel são ~15 dias; a BookPlay faz ~7.700 linhas
 * em 30 dias, então 8 páginas cobrem com folga. O teto existe para um filtro
 * quebrado não virar download infinito no navegador de quem abriu o painel.
 */
const MAX_PAGINAS = 12;

/**
 * Lê o analítico de um intervalo, paginando.
 *
 * A paginação é obrigatória: o PostgREST devolve 1.000 linhas por vez, e uma
 * janela de 15 dias da BookPlay inteira passa disso. Sem ela o painel mostraria
 * um número truncado — plausível, e errado.
 */
export async function buscarAnaliticoPeriodo(params: {
  empresaId: string;
  de: string;
  ate: string;
  /** Quando o escopo é uma pessoa só, o filtro vai ao banco e a página encolhe. */
  operadorId?: string | null;
}): Promise<{ linhas: LinhaAnaliticoDia[]; erro: string | null }> {
  const { empresaId, de, ate, operadorId } = params;
  const linhas: LinhaAnaliticoDia[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    let q = supabase
      .from('analitico_recebimentos')
      .select('data_pagamento, valor_recebido, total_ho, operador_id, setor_id')
      .eq('empresa_id', empresaId)
      .gte('data_pagamento', de)
      .lte('data_pagamento', ate)
      // Ordem total pela PK: sem ela as páginas se sobrepõem e o total muda a
      // cada abertura do painel. Mesmo contrato de `paginarParalelo`.
      .order('id', { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);

    if (operadorId) q = q.eq('operador_id', operadorId);

    const { data, error } = await q;
    if (error) return { linhas: [], erro: error.message };

    const lote = (data as LinhaAnaliticoDia[] | null) ?? [];
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }

  return { linhas, erro: null };
}

/** Soma por dia, aplicando o escopo em memória. */
export function somarPorDia(
  linhas: readonly LinhaAnaliticoDia[],
  escopo: EscopoAnalitico,
): { bruto: Record<string, number>; ho: Record<string, number> } {
  const bruto: Record<string, number> = {};
  const ho: Record<string, number> = {};

  for (const l of linhas) {
    if (!linhaNoEscopo(l, escopo)) continue;
    const dia = l.data_pagamento;
    bruto[dia] = (bruto[dia] ?? 0) + (Number(l.valor_recebido) || 0);
    ho[dia] = (ho[dia] ?? 0) + (Number(l.total_ho) || 0);
  }

  return { bruto, ho };
}

/**
 * O recorte que as consultas de `acordos` e de Pix recebem.
 *
 * Exatamente uma das três formas vale, na ordem: uma pessoa, um conjunto de
 * pessoas (equipe), ou um setor. Os três campos existem porque o escopo do
 * painel produz um deles conforme o cargo — ver `resolverEscopoDoDia`.
 */
interface RecorteConsulta {
  empresaId: string;
  operadorId?: string | null;
  operadores?: readonly string[];
  setorId?: string | null;
}

/**
 * Aplica o recorte a uma consulta já montada.
 *
 * Numa função só para as quatro consultas não divergirem — foi assim que as
 * quatro listas de autorização de tabulação passaram a discordar entre si (ver
 * `PERFIS_AUTORIZADORES` em `lib/index.ts`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o builder do PostgREST muda de tipo a cada filtro encadeado.
function aplicarRecorte<T extends { eq: any; in: any }>(q: T, r: RecorteConsulta): T {
  if (r.operadorId) return q.eq('operador_id', r.operadorId);
  if (r.operadores?.length) return q.in('operador_id', [...r.operadores]);
  if (r.setorId) return q.eq('setor_id', r.setorId);
  return q;
}

/**
 * Os acordos com vencimento no dia.
 *
 * O recorte é por VENCIMENTO, e não pela data em que alguém marcou como pago:
 * tabular hoje um acordo que venceu ontem tem de contar ontem, senão o dia de
 * ontem muda de número toda vez que alguém abre o sistema.
 */
export async function buscarAcordosDoDia(params: RecorteConsulta & {
  dia: string;
}): Promise<{ acordos: AcordoDoDia[]; erro: string | null }> {
  const { empresaId, dia } = params;

  const q = aplicarRecorte(
    supabase
      .from('acordos')
      .select('status, valor, tipo_vinculo, tag_ids')
      .eq('empresa_id', empresaId)
      .eq('vencimento', dia),
    params,
  );

  const { data, error } = await q;
  if (error) return { acordos: [], erro: error.message };
  return { acordos: (data as AcordoDoDia[] | null) ?? [], erro: null };
}

/** Quantos acordos foram CRIADOS no dia — o outro lado do trabalho. */
export async function contarFormalizadosDoDia(params: RecorteConsulta & {
  dia: string;
}): Promise<number> {
  const { empresaId, dia } = params;
  const amanha = diaSeguinte(dia);

  const q = aplicarRecorte(
    supabase
      .from('acordos')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .gte('criado_em', `${dia}T00:00:00`)
      .lt('criado_em', `${amanha}T00:00:00`),
    params,
  );

  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

/**
 * O Pix Automático do dia. BookPlay apenas.
 *
 * `criado_em` e não `avaliado_em`: o Pix pertence ao dia em que ENTROU. Um Pix
 * de ontem aprovado hoje continua sendo produção de ontem, e mudá-lo de dia
 * reescreveria um número que a equipe já leu.
 */
export async function buscarPixDoDia(params: RecorteConsulta & {
  dia: string;
  isPaguePlay: boolean;
}): Promise<LinhaPixDia[]> {
  const { empresaId, dia, isPaguePlay } = params;
  if (isPaguePlay) return [];

  const amanha = diaSeguinte(dia);
  const q = aplicarRecorte(
    supabase
      .from('pix_automatico_acordos')
      .select('status, valor, pct_comissao')
      .eq('empresa_id', empresaId)
      .gte('criado_em', `${dia}T00:00:00`)
      .lt('criado_em', `${amanha}T00:00:00`),
    params,
  );

  const { data, error } = await q;
  if (error) return [];
  return (data as LinhaPixDia[] | null) ?? [];
}

/**
 * A meta mensal do escopo, sempre em BRUTO (é como está no banco).
 *
 * Mesma precedência do Painel de Metas, para os dois não discordarem:
 *
 *   pessoa escolhida ....... a meta dela
 *   setor com meta própria . a meta do setor
 *   nem uma nem outra ...... a soma das metas individuais de quem está no escopo
 *
 * `null` quando não há meta nenhuma — e `null` é diferente de zero: sem alvo
 * definido o painel não desenha barra, em vez de cobrar por um número que
 * ninguém estabeleceu.
 */
export async function buscarMetaDoEscopo(params: {
  empresaId: string;
  mes: number;
  ano: number;
  operadorId?: string | null;
  setorId?: string | null;
  operadoresDoEscopo?: readonly string[];
}): Promise<number | null> {
  const { empresaId, mes, ano, operadorId, setorId, operadoresDoEscopo } = params;

  const umaMeta = async (tipo: string, referenciaId: string): Promise<number | null> => {
    const { data } = await supabase
      .from('metas')
      .select('meta_valor')
      .eq('empresa_id', empresaId).eq('tipo', tipo)
      .eq('referencia_id', referenciaId)
      .eq('mes', mes).eq('ano', ano)
      .maybeSingle();
    const v = Number((data as { meta_valor: number } | null)?.meta_valor) || 0;
    return v > 0 ? v : null;
  };

  if (operadorId) return umaMeta('operador', operadorId);

  if (setorId) {
    const doSetor = await umaMeta('setor', setorId);
    if (doSetor !== null) return doSetor;
  }

  const ids = operadoresDoEscopo ?? [];
  if (!ids.length) return null;

  const { data } = await supabase
    .from('metas')
    .select('meta_valor')
    .eq('empresa_id', empresaId).eq('tipo', 'operador')
    .in('referencia_id', [...ids])
    .eq('mes', mes).eq('ano', ano);

  const soma = ((data as { meta_valor: number }[] | null) ?? [])
    .reduce((s, m) => s + (Number(m.meta_valor) || 0), 0);
  return soma > 0 ? soma : null;
}

/**
 * O que o painel mostra, por cargo.
 *
 * ## A regra
 *
 * ```
 * diretoria, administrador, super_admin ..... a empresa
 * gerencia ................................. o setor dele
 * lider .................................... as equipes que ele lidera
 *          sem equipe nenhuma .............. o setor dele
 * todos os demais .......................... só ele
 * ```
 *
 * ## O filtro é de EQUIPE, nunca de pessoa
 *
 * Quem enxerga mais de uma equipe pode recortar por uma delas, ou ver todas. O
 * seletor de pessoa que existia antes saiu e não volta: ele obrigava a responder
 * «o dia de quem?» toda vez que o painel abria, e quem precisa desse recorte tem
 * a aba Analítico — que faz melhor, com o escopo completo (carimbo de setor,
 * setor alternativo, origens excluídas).
 *
 * Equipe é outra coisa. É a unidade que o líder acompanha e sobre a qual a
 * gerência cobra, e são poucas por setor: o seletor tem três ou quatro opções,
 * não cinquenta.
 *
 * ## Líder com mais de uma equipe
 *
 * Acontece: 13 vínculos para 9 líderes na BookPlay. «Todas» soma as que ele
 * lidera; o seletor deixa isolar uma.
 *
 * ## Líder sem equipe cai no setor
 *
 * Não é caso raro: 22 dos 31 líderes da BookPlay não estão em `equipe_lideres`.
 * Devolver «só você» para eles esvaziaria o painel de quem mais o usa. E, caindo
 * no setor, ele ganha o mesmo seletor da gerência.
 */

/** Uma opção do seletor de equipe, com os membros já resolvidos. */
export interface EquipeDoEscopo {
  id: string;
  nome: string;
  membros: string[];
}

export interface EscopoDoDia {
  escopo: EscopoAnalitico;
  /** O que o cabeçalho mostra: «Equipe Matheus», «Setor Receptivo»… */
  rotulo: string;
  /** Filtro que desce ao banco quando o escopo é uma pessoa só. */
  operadorId: string | null;
  /** Filtro de setor para as consultas de `acordos`. */
  setorId: string | null;
  /**
   * As equipes que esta pessoa pode isolar.
   *
   * Vazio ou com um item só = nenhum seletor na tela. Oferecer um controle com
   * uma opção é oferecer uma escolha que não existe.
   */
  equipes: EquipeDoEscopo[];
}

/**
 * O recorte que esta pessoa vê no Desempenho do Dia.
 *
 * ## Sai dos NÍVEIS do Dashboard, não do cargo
 *
 * O painel vive dentro do Dashboard, então usa a régua do Dashboard. Até
 * 24/08/2026 eram quatro listas de cargo escritas aqui — `CARGOS_EMPRESA`,
 * `'gerencia'`, `'lider'` e o resto —, e elas discordavam do próprio Dashboard
 * sobre as mesmas pessoas.
 *
 * ## Duas pessoas passam a ver mais, e as duas já viam isso ao lado
 *
 *   `gerencia` .. setor inteiro → empresa inteira. Ela tem
 *                 `dashboard_escopo_todos_setores` e já via a empresa nos
 *                 cartões logo acima; só este painel a mantinha no setor.
 *   `elite` ..... só os próprios → equipes que lidera (ou o setor). Ela tem
 *                 `dashboard_escopo_setor` e `_equipe`, e caía no ramo final
 *                 por não estar escrita em nenhuma das listas.
 *
 * Ninguém perde alcance: os níveis são um superconjunto das listas antigas em
 * todo cargo. E quem quiser desfazer qualquer um dos dois ganhos agora mexe no
 * painel, não aqui.
 */
export async function resolverEscopoDoDia(params: {
  empresaId: string;
  perfilId: string;
  /** Os níveis de `dashboard` liberados para esta pessoa. */
  niveis: readonly NivelEscopo[];
  setorId: string | null;
}): Promise<EscopoDoDia> {
  const { empresaId, perfilId, niveis, setorId } = params;

  if (niveis.includes('todos_setores')) {
    return {
      escopo: ESCOPO_EMPRESA, rotulo: 'Empresa inteira',
      operadorId: null, setorId: null, equipes: [],
    };
  }

  if (niveis.includes('equipe')) {
    const equipes = await equipesQueLidera(empresaId, perfilId);
    // Sem equipe sob liderança, o recorte de equipe não existe: cai para o
    // setor quando o nível permitir, e para os próprios números quando não.
    if (equipes.length === 0) {
      return niveis.includes('setor')
        ? escopoDeSetorInteiro(empresaId, setorId, perfilId)
        : {
            escopo: { tipo: 'operador', operadorId: perfilId },
            rotulo: 'Os seus números',
            operadorId: perfilId, setorId: null, equipes: [],
          };
    }

    const porEquipe = await membrosPorEquipe(empresaId, equipes.map(e => e.id));
    // O próprio líder entra no total, e desde 02/09/2026 também em CADA equipe
    // que ele lidera (`juntarLideres`). Antes ele só aparecia no total: quem
    // lidera uma equipe só via um número em «todas» e outro, menor, ao escolher
    // a própria equipe no seletor — a mesma produção, dois valores.
    const todos = new Set([...porEquipe.values()].flat().concat(perfilId));

    return {
      escopo: { tipo: 'equipe', operadores: todos },
      rotulo: equipes.length === 1 ? `Equipe ${equipes[0].nome}` : 'Todas as equipes',
      operadorId: null,
      setorId: null,
      equipes: equipes.map(e => ({ ...e, membros: porEquipe.get(e.id) ?? [] })),
    };
  }

  if (niveis.includes('setor')) return escopoDeSetorInteiro(empresaId, setorId, perfilId);

  return {
    escopo: { tipo: 'operador', operadorId: perfilId },
    rotulo: 'Os seus números',
    operadorId: perfilId, setorId: null, equipes: [],
  };
}

/**
 * O escopo efetivo depois da escolha no seletor.
 *
 * `null` (todas) devolve a base intacta. Uma equipe escolhida troca o conjunto e
 * o rótulo, e zera o filtro de setor: recortar por equipe E por setor ao mesmo
 * tempo daria a interseção dos dois, que não é o que o seletor promete.
 *
 * Equipe desconhecida devolve a base — é o que acontece quando alguém escolhe
 * uma equipe e ela é apagada, ou quando o escopo é recarregado com outra lista.
 */
export function aplicarEquipeEscolhida(
  base: EscopoDoDia, equipeId: string | null,
): EscopoDoDia {
  if (!equipeId) return base;

  const equipe = base.equipes.find(e => e.id === equipeId);
  if (!equipe) return base;

  return {
    ...base,
    escopo: { tipo: 'equipe', operadores: new Set(equipe.membros) },
    rotulo: `Equipe ${equipe.nome}`,
    operadorId: null,
    setorId: null,
  };
}

/** Setor inteiro — ou só a própria pessoa, quando ela não tem setor. */
async function escopoDeSetorInteiro(
  empresaId: string, setorId: string | null, perfilId: string,
): Promise<EscopoDoDia> {
  if (!setorId) {
    // Sem setor não há o que somar além de si. Devolver «o setor» aqui daria um
    // conjunto vazio e um painel zerado com cara de dado real.
    return {
      escopo: { tipo: 'operador', operadorId: perfilId },
      rotulo: 'Os seus números',
      operadorId: perfilId, setorId: null, equipes: [],
    };
  }

  const [nome, pessoas, equipes] = await Promise.all([
    nomeDoSetor(setorId),
    pessoasDoSetor(empresaId, setorId),
    equipesDoSetor(empresaId, setorId),
  ]);

  // Agrupa em memória: as pessoas do setor já vieram com a equipe de cada uma,
  // então montar o seletor não custa consulta nova. Os líderes são a exceção —
  // eles não têm `perfis.equipe_id` apontando para a equipe que comandam, e
  // sem esta consulta escolher a equipe deles no seletor os deixaria de fora.
  const porEquipe = juntarLideres(
    agruparPorEquipe(pessoas),
    await lideresPorEquipe(empresaId, equipes.map(e => e.id)),
  );

  // O conjunto do SETOR inclui quem lidera uma equipe daqui sem ser do setor
  // (líder clonado de outro setor): ele já aparece no seletor de equipe, e
  // deixá-lo fora do total faria «setor» somar menos que a soma das equipes.
  const doSetor = new Set(pessoas.map(p => p.id));
  for (const ids of porEquipe.values()) for (const id of ids) doSetor.add(id);

  return {
    escopo: { tipo: 'equipe', operadores: doSetor },
    rotulo: nome ? `Setor ${nome}` : 'Seu setor',
    operadorId: null,
    setorId,
    // Equipe sem ninguém não vira opção: escolhê-la zeraria o painel, e o zero
    // pareceria resultado do dia.
    equipes: equipes
      .map(e => ({ ...e, membros: porEquipe.get(e.id) ?? [] }))
      .filter(e => e.membros.length > 0),
  };
}

function agruparPorEquipe(
  pessoas: readonly { id: string; equipe_id: string | null }[],
): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const p of pessoas) {
    if (!p.equipe_id) continue;
    const atual = mapa.get(p.equipe_id);
    if (atual) atual.push(p.id);
    else mapa.set(p.equipe_id, [p.id]);
  }
  return mapa;
}

async function equipesQueLidera(
  empresaId: string, liderId: string,
): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase
    .from('equipe_lideres')
    .select('equipe_id, equipes(id, nome)')
    .eq('empresa_id', empresaId)
    .eq('lider_id', liderId);

  // Tabela ausente (migration pendente): o líder cai no setor, que é o
  // comportamento antigo. Ver `equipesLideres.service.ts`.
  if (error) return [];

  type Linha = { equipes: { id: string; nome: string } | null };
  return ((data as Linha[] | null) ?? [])
    .map(l => l.equipes)
    .filter((e): e is { id: string; nome: string } => e !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function membrosPorEquipe(
  empresaId: string, equipeIds: string[],
): Promise<Map<string, string[]>> {
  if (!equipeIds.length) return new Map();

  const { data } = await supabase
    .from('perfis')
    .select('id, equipe_id')
    .eq('empresa_id', empresaId)
    .in('equipe_id', equipeIds);

  const mapa = agruparPorEquipe(
    (data as { id: string; equipe_id: string | null }[] | null) ?? [],
  );
  return juntarLideres(mapa, await lideresPorEquipe(empresaId, equipeIds));
}

/**
 * `equipe_id` → líderes explícitos dela.
 *
 * Tabela ausente (migration pendente) devolve mapa vazio, como o resto do
 * arquivo faz — o painel volta ao comportamento antigo em vez de quebrar.
 */
async function lideresPorEquipe(
  empresaId: string, equipeIds: string[],
): Promise<Map<string, string[]>> {
  if (!equipeIds.length) return new Map();

  const { data, error } = await supabase
    .from('equipe_lideres')
    .select('equipe_id, lider_id')
    .eq('empresa_id', empresaId)
    .in('equipe_id', equipeIds);
  if (error) return new Map();

  const mapa = new Map<string, string[]>();
  for (const v of ((data as { equipe_id: string; lider_id: string }[] | null) ?? [])) {
    // Linha sem os dois lados não é vínculo. Sem esta guarda, um `undefined`
    // entraria no conjunto de operadores e o painel somaria um a mais.
    if (!v?.equipe_id || !v?.lider_id) continue;
    const atual = mapa.get(v.equipe_id);
    if (atual) atual.push(v.lider_id);
    else mapa.set(v.equipe_id, [v.lider_id]);
  }
  return mapa;
}

/**
 * O líder entra no conjunto da equipe que ele lidera.
 *
 * O total de «todas as equipes» já somava o líder, mas escolher UMA equipe no
 * seletor o deixava de fora: os membros saíam só de `perfis.equipe_id`, e o
 * líder não tem esse campo apontando para a equipe que comanda. O painel então
 * mostrava um número para «todas» e outro, menor, para a única equipe da
 * pessoa — a mesma produção, dois valores.
 *
 * O acordo que o líder tabula é produção da equipe dele; é a mesma regra que o
 * Desempenho Equipes usa no analítico (`equipeQueCredita`).
 */
function juntarLideres(
  membros: Map<string, string[]>, lideres: Map<string, string[]>,
): Map<string, string[]> {
  for (const [equipeId, ids] of lideres) {
    const atual = membros.get(equipeId);
    if (!atual) { membros.set(equipeId, [...ids]); continue; }
    for (const id of ids) if (!atual.includes(id)) atual.push(id);
  }
  return membros;
}

async function pessoasDoSetor(
  empresaId: string, setorId: string,
): Promise<{ id: string; equipe_id: string | null }[]> {
  const { data } = await supabase
    .from('perfis')
    .select('id, equipe_id')
    .eq('empresa_id', empresaId)
    .eq('setor_id', setorId);
  return (data as { id: string; equipe_id: string | null }[] | null) ?? [];
}

async function equipesDoSetor(
  empresaId: string, setorId: string,
): Promise<{ id: string; nome: string }[]> {
  const { data } = await supabase
    .from('equipes')
    .select('id, nome')
    .eq('empresa_id', empresaId)
    .eq('setor_id', setorId)
    .order('nome');
  return (data as { id: string; nome: string }[] | null) ?? [];
}

async function nomeDoSetor(setorId: string): Promise<string | null> {
  const { data } = await supabase
    .from('setores')
    .select('nome')
    .eq('id', setorId)
    .maybeSingle();
  return (data as { nome: string } | null)?.nome ?? null;
}

// ─── Datas ───────────────────────────────────────────────────────────────────
//
// Aritmética local, e não UTC: o `Date` do navegador vira o dia às 21h em
// São Paulo quando calculado em UTC, e o painel mostraria o dia seguinte a
// partir do fim da tarde.

/** 'yyyy-MM-dd' do dia seguinte. */
export function diaSeguinte(dia: string): string {
  return deslocar(dia, 1);
}

/** 'yyyy-MM-dd' de N dias antes. */
export function diasAntes(dia: string, n: number): string {
  return deslocar(dia, -n);
}

function deslocar(dia: string, delta: number): string {
  const [y, m, d] = dia.split('-').map(Number);
  const alvo = new Date(y, m - 1, d + delta);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}`
    + `-${String(alvo.getDate()).padStart(2, '0')}`;
}

