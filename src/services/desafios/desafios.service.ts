/**
 * desafios.service.ts — leitura e escrita da configuração de gincanas.
 *
 * ## Duas responsabilidades, e só duas
 *
 * 1. ler e gravar a linha de `desafios` (a CONFIGURAÇÃO);
 * 2. pedir ao banco o quadro do desafio (`fn_desafio_dados`).
 *
 * O cálculo não está aqui — está em `calcularDesafio.ts`, que é puro. Esta
 * separação é o que permite testar o ranking sem banco e trocar a fonte de
 * dados sem reescrever a conta.
 *
 * ## Por que `regra` e `visual` passam por um normalizador
 *
 * Os dois são JSONB. Uma campanha gravada antes de um campo existir chega sem
 * ele, e `desafio.regra.participantes.setores.length` estouraria a tela inteira
 * por causa de um campo ausente. `normalizarRegra` e `normalizarVisual`
 * preenchem o que faltar com o padrão do modelo — a campanha antiga abre, e o
 * campo novo simplesmente não tinha valor.
 *
 * ## Cliente sem tipo
 *
 * `database.types.ts` é gerado do banco e ainda não conhece `desafios`. Mesmo
 * padrão de `ajusteManual.service.ts` e `tickets.service.ts`: quando os tipos
 * forem regerados, trocar por `supabase.from('desafios')` é substituição
 * direta.
 */
import { supabase } from '@/lib/supabase';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { registrarLog } from '@/services/logs.service';
import { modeloDoTipo } from './tiposDesafio';
import type {
  AcentoDesafio, DadosDesafio, Desafio, MetricaDesafio, ModoDisputa,
  ParticipantesDesafio, PessoaDesafio, PremioPorPosicao, RegraDesafio,
  SetorDisponivel, StatusDesafio, TemaDesafio, TipoDesafio,
  VisibilidadeDesafio, VisualDesafio,
} from './types';

// ── Cliente sem tipo ─────────────────────────────────────────────────────────

interface Consulta extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  select(colunas?: string): Consulta;
  insert(valores: unknown): Consulta;
  update(valores: unknown): Consulta;
  upsert(valores: unknown, opcoes?: { onConflict?: string }): Consulta;
  delete(): Consulta;
  eq(coluna: string, valor: unknown): Consulta;
  or(filtro: string): Consulta;
  in(coluna: string, valores: unknown[]): Consulta;
  order(coluna: string, opcoes?: { ascending?: boolean }): Consulta;
  limit(n: number): Consulta;
}

function db(tabela: string): Consulta {
  return (supabase.from as unknown as (t: string) => Consulta)(tabela);
}

// ── Normalização ─────────────────────────────────────────────────────────────

const TEMAS: readonly TemaDesafio[] = ['padrao', 'cafe', 'corrida', 'equipes'];
const ACENTOS: readonly AcentoDesafio[] = [
  'ambar', 'violeta', 'esmeralda', 'rosa', 'azul', 'laranja',
];

function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function listaDeTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * O mapa de metas por operador.
 *
 * A chave fica como veio — id de perfil ou login — e quem resolve qual das
 * duas serve é `metaDoParticipante`. Valor que não é número positivo cai fora:
 * uma célula em branco na planilha não pode virar meta zero, que a tela leria
 * como "meta batida".
 */
function normalizarMetas(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const saida: Record<string, number> = {};
  for (const [chave, valor] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(valor);
    if (Number.isFinite(n) && n > 0) saida[chave] = n;
  }
  return saida;
}

function normalizarParticipantes(v: unknown): ParticipantesDesafio {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    setores:    listaDeTextos(o.setores),
    equipes:    listaDeTextos(o.equipes),
    operadores: listaDeTextos(o.operadores),
    // Campanha gravada antes de Desafios 2.0 não tem as duas: cargo vazio é
    // «todos os cargos», exclusão vazia é «ninguém tirado». Os dois padrões
    // reproduzem exatamente o comportamento que ela tinha.
    cargos:     listaDeTextos(o.cargos),
    excluidos:  listaDeTextos(o.excluidos),
  };
}

/**
 * A lista de prêmios por colocação.
 *
 * Posição que não é inteiro positivo cai fora, e prêmio em branco também: uma
 * linha vazia deixada no formulário viraria um "4º lugar: —" no pódio.
 * A ordenação é por posição, para que a tela não precise ordenar de novo.
 */
function normalizarPremios(v: unknown): PremioPorPosicao[] {
  if (!Array.isArray(v)) return [];
  const saida: PremioPorPosicao[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const posicao = Number(o.posicao);
    const premio  = typeof o.premio === 'string' ? o.premio.trim() : '';
    if (!Number.isInteger(posicao) || posicao < 1 || !premio) continue;
    const icone = typeof o.icone === 'string' ? o.icone.trim() : '';
    saida.push({ posicao, premio, ...(icone ? { icone } : {}) });
  }
  return saida.sort((a, b) => a.posicao - b.posicao);
}

/** A regra da campanha, com o padrão do modelo no lugar do que faltar. */
export function normalizarRegra(bruto: unknown, tipo: TipoDesafio): RegraDesafio {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const modelo = modeloDoTipo(tipo);

  const modo = listaDeTextos(o.modo).filter(
    (m): m is ModoDisputa => m === 'individual' || m === 'equipe',
  );

  const criterio = o.criterioRanking;
  const criterioValido =
    criterio === 'maior_recebido' || criterio === 'menor_falta' || criterio === 'maior_percentual';

  const metrica = o.metrica === 'quantidade' ? 'quantidade' : 'valor_recebido';

  return {
    versao: 1,
    metrica: metrica as MetricaDesafio,
    modo: modo.length ? modo : [...modelo.modoPadrao],
    criterioRanking: criterioValido ? criterio : modelo.criterioPadrao,
    // Campanha gravada antes destes dois campos existirem abre com o
    // comportamento que ela tinha: placar da empresa, prêmio do primeiro.
    escopoDisputa: o.escopoDisputa === 'setor' ? 'setor' : 'empresa',
    premiacao: o.premiacao === 'todos_que_batem' ? 'todos_que_batem' : 'melhor_colocado',
    metaIndividual: numeroOuNulo(o.metaIndividual),
    metasPorOperador: normalizarMetas(o.metasPorOperador),
    metaEquipe:     numeroOuNulo(o.metaEquipe),
    metaColetiva:   numeroOuNulo(o.metaColetiva),
    participantes:  normalizarParticipantes(o.participantes),
    premios:        normalizarPremios(o.premios),
    // `proprio` é o padrão e o que toda campanha anterior fazia. Só a disputa
    // entre líderes pede o outro.
    fonteResultado: o.fonteResultado === 'equipe_liderada' ? 'equipe_liderada' : 'proprio',
  };
}

/** O visual da campanha. Tema desconhecido cai no padrão, nunca em tela branca. */
export function normalizarVisual(bruto: unknown): VisualDesafio {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const tema = TEMAS.includes(o.tema as TemaDesafio) ? (o.tema as TemaDesafio) : 'padrao';
  return {
    tema,
    icone: typeof o.icone === 'string' && o.icone ? o.icone : 'trophy',
    // O padrão é LIGADO nas três: é o comportamento que a campanha pede, e
    // quem não quiser desliga na configuração.
    mostrarFotos:        o.mostrarFotos        !== false,
    animarUltrapassagem: o.animarUltrapassagem !== false,
    comemorarMeta:       o.comemorarMeta       !== false,
    // `null` = a cor vem do tema, que é como a campanha antiga é desenhada.
    acento:      ACENTOS.includes(o.acento as AcentoDesafio) ? (o.acento as AcentoDesafio) : null,
    midiaNoCard: o.midiaNoCard !== false,
    // Fixar no menu é LIGADO por padrão: quem sobe uma mídia de destaque quer
    // que ela apareça, e o campo do menu é o lugar onde ela aparece. Sem mídia
    // a chave não tem efeito nenhum.
    fixarNoMenu: o.fixarNoMenu !== false,
  };
}

function paraDesafio(linha: Record<string, unknown>): Desafio {
  const tipo = String(linha.tipo ?? 'bater_meta') as TipoDesafio;
  return {
    id:            String(linha.id),
    empresaId:     String(linha.empresa_id),
    // Coluna ausente (migration pendente) vira lista vazia, que é lida como
    // «alcança só a dona» — exatamente o que a campanha era antes dela.
    empresas:      listaDeTextos(linha.empresas),
    nome:          String(linha.nome ?? ''),
    descricao:     (linha.descricao as string | null) ?? null,
    premio:        (linha.premio as string | null) ?? null,
    dataInicio:    String(linha.data_inicio ?? '').slice(0, 10),
    dataFim:       String(linha.data_fim ?? '').slice(0, 10),
    setorId:       (linha.setor_id as string | null) ?? null,
    tipo,
    regra:         normalizarRegra(linha.regra, tipo),
    visual:        normalizarVisual(linha.visual),
    status:        String(linha.status ?? 'rascunho') as StatusDesafio,
    midiaUrl:      (linha.midia_url as string | null) ?? null,
    midiaCaminho:  (linha.midia_caminho as string | null) ?? null,
    visibilidade:  linha.visibilidade === 'todos' ? 'todos' : 'alcance',
    criadoPor:     (linha.criado_por as string | null) ?? null,
    criadoPorNome: (linha.criado_por_nome as string | null) ?? null,
    criadoEm:      String(linha.criado_em ?? ''),
    atualizadoEm:  String(linha.atualizado_em ?? ''),
  };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/**
 * As campanhas da empresa, da mais recente para a mais antiga.
 *
 * O rascunho só chega para quem tem `desafios_configurar` — a RLS decide, e
 * não este código. A tela nem precisa filtrar.
 *
 * Tabela ausente (migration pendente) devolve lista vazia em vez de erro:
 * mesmo padrão de `buscarExclusoesSetor`. A Vercel publica no push, antes de a
 * migration ser aplicada, e uma aba que não abre é pior que uma aba vazia.
 */
export async function listarDesafios(
  empresaId: string,
): Promise<{ data: Desafio[]; dbAtiva: boolean; error: string | null }> {
  // A campanha que cruza operações é DONA de uma empresa e ALCANÇA outra. Quem
  // está na empresa alcançada não a encontraria por `empresa_id`; encontra por
  // `empresas`. A RLS já decidiu o que pode vir — este filtro só evita trazer
  // a campanha de uma terceira empresa que a pessoa por acaso também alcança.
  const filtro = `empresa_id.eq.${empresaId},empresas.cs.{${empresaId}}`;

  let { data, error } = await db('desafios')
    .select('*')
    .or(filtro)
    .order('data_inicio', { ascending: false });

  // Coluna `empresas` ainda não aplicada: a consulta antiga continua correta,
  // porque sem a coluna nenhuma campanha cruza empresa nenhuma.
  if (error && /empresas/i.test(error.message)) {
    ({ data, error } = await db('desafios')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('data_inicio', { ascending: false }));
  }

  if (error) {
    const faltando = /relation|does not exist|schema cache/i.test(error.message);
    return { data: [], dbAtiva: !faltando, error: faltando ? null : error.message };
  }

  return {
    data: ((data ?? []) as Record<string, unknown>[]).map(paraDesafio),
    dbAtiva: true,
    error: null,
  };
}

/**
 * O quadro de um desafio: participantes e recebimento agregado no período.
 *
 * Uma ida ao banco por desafio. A conta acontece depois, em memória, sobre
 * este retorno — nada de uma consulta por operador.
 */
export async function buscarDadosDesafio(desafioId: string): Promise<DadosDesafio> {
  const { data, error } = await rpcSemTipo<{
    participantes: Record<string, unknown>[];
    linhas: Record<string, unknown>[];
  }>('fn_desafio_dados', { p_desafio_id: desafioId });

  if (error || !data) return { participantes: [], linhas: [] };

  return {
    participantes: (data.participantes ?? []).map(paraPessoa),
    linhas: (data.linhas ?? []).map(l => ({
      operador_id: String(l.operador_id),
      setor_id:    (l.setor_id as string | null) ?? null,
      total:       Number(l.total) || 0,
      total_ho:    Number(l.total_ho) || 0,
      qtd:         Number(l.qtd) || 0,
    })),
  };
}

/** As pessoas soltas do JSONB viram `PessoaDesafio`. Um lugar só. */
function paraPessoa(p: Record<string, unknown>) {
  return {
    id:         String(p.id),
    nome:       String(p.nome ?? ''),
    usuario:    (p.usuario as string | null) ?? null,
    fotoUrl:    (p.foto_url as string | null) ?? null,
    equipeId:   (p.equipe_id as string | null) ?? null,
    equipeNome: String(p.equipe_nome ?? 'Sem equipe'),
    setorId:    (p.setor_id as string | null) ?? null,
    situacao:   String(p.situacao ?? 'ativo'),
    setores:    listaDeTextos(p.setores),
    equipes:    listaDeTextos(p.equipes),
    // A RPC antiga não devolvia os dois. `operador` é o padrão certo: é o que
    // o recorte por cargo lê como "não é liderança", e o que a pessoa é
    // quando ninguém disse o contrário.
    perfil:     String(p.perfil ?? 'operador'),
    empresaId:  (p.empresa_id as string | null) ?? null,
  };
}

/**
 * O quadro de pessoal para MONTAR a campanha.
 *
 * Existe separado de `buscarDadosDesafio` porque quem cadastra precisa da lista
 * antes de a campanha existir — e porque a política de `perfis` só entrega o
 * cadastro dos colegas para quem tem a aba Usuários. Um líder com
 * `desafios_configurar` e sem `ver_usuarios` abriria a tela vazia.
 *
 * A RPC devolve `[]` para quem não tem a chave: a tela mostra "nenhum operador
 * disponível" em vez de estourar.
 */
export async function buscarPessoasParaCadastro(
  empresaId: string,
): Promise<PessoaDesafio[]> {
  const { data, error } = await rpcSemTipo<Record<string, unknown>[]>(
    'fn_desafio_pessoas', { p_empresa_id: empresaId },
  );
  if (error || !Array.isArray(data)) return [];
  return data.map(paraPessoa);
}

/**
 * O quadro de pessoal de VÁRIAS empresas, para a campanha que as cruza.
 *
 * Cai na RPC de uma empresa só quando `fn_desafio_pessoas_empresas` ainda não
 * existe: com a migration pendente, montar a campanha da própria operação
 * continua funcionando, e a que cruza é que fica sem gente da outra.
 */
export async function buscarPessoasDeEmpresas(
  empresas: string[],
): Promise<PessoaDesafio[]> {
  const lista = empresas.filter(Boolean);
  if (!lista.length) return [];

  const { data, error } = await rpcSemTipo<Record<string, unknown>[]>(
    'fn_desafio_pessoas_empresas', { p_empresas: lista },
  );

  if (error || !Array.isArray(data)) {
    if (lista.length === 1) return buscarPessoasParaCadastro(lista[0]);
    const porEmpresa = await Promise.all(lista.map(buscarPessoasParaCadastro));
    const vistos = new Set<string>();
    return porEmpresa.flat().filter(p => !vistos.has(p.id) && vistos.add(p.id));
  }
  return data.map(paraPessoa);
}

/**
 * Os setores que quem configura pode colocar numa campanha — de todas as
 * empresas que ele alcança, cada um com as equipes dele.
 *
 * É a lista do seletor da tela nova. Vem do servidor porque a política de
 * `setores` recorta por empresa e o cliente teria que fazer uma consulta por
 * operação e costurar o resultado.
 */
export async function buscarSetoresDisponiveis(): Promise<SetorDisponivel[]> {
  const { data, error } = await rpcSemTipo<Record<string, unknown>[]>(
    'fn_desafio_setores_disponiveis', {},
  );
  if (error || !Array.isArray(data)) return [];
  return data.map(s => ({
    id:          String(s.id),
    nome:        String(s.nome ?? ''),
    empresaId:   String(s.empresa_id),
    empresaNome: String(s.empresa_nome ?? ''),
    empresaSlug: (s.empresa_slug as string | null) ?? null,
    ordem:       s.ordem === null || s.ordem === undefined ? null : Number(s.ordem),
    equipes:     Array.isArray(s.equipes)
      ? (s.equipes as Record<string, unknown>[]).map(e => ({
          id: String(e.id), nome: String(e.nome ?? ''),
        }))
      : [],
  }));
}

/**
 * As campanhas em cartaz HOJE que a pessoa enxerga, para o menu lateral.
 *
 * Uma consulta, sem abrir o Analítico e sem saber em que empresa a pessoa
 * está: a RLS de `desafios` é a régua, e ela já sabe de tudo isso.
 */
export async function buscarDesafiosEmCartaz(): Promise<Desafio[]> {
  const { data, error } = await rpcSemTipo<Record<string, unknown>[]>(
    'fn_desafio_em_cartaz', {},
  );
  if (error || !Array.isArray(data)) return [];
  return data.map(paraDesafio);
}

// ── Setores que participam ───────────────────────────────────────────────────

export interface SetoresDoDesafio {
  /** setor_id → participa? Setor AUSENTE do mapa participa (o padrão). */
  porSetor: Record<string, boolean>;
  /** `false` = a migration 20260823190000 ainda não foi aplicada. */
  dbAtiva: boolean;
}

/**
 * Quais setores participam dos desafios.
 *
 * A tabela guarda só a EXCEÇÃO: linha ausente significa que o setor participa.
 * É o que faz um setor novo nascer participando sem ninguém precisar lembrar
 * de cadastrá-lo.
 *
 * Tabela ausente devolve mapa vazio e `dbAtiva: false` — todo mundo participa,
 * que é o comportamento de antes desta migration.
 */
export async function listarSetoresDoDesafio(
  empresaId: string,
): Promise<SetoresDoDesafio> {
  const { data, error } = await db('desafios_setores')
    .select('setor_id, ativo')
    .eq('empresa_id', empresaId);

  if (error) {
    const faltando = /relation|does not exist|schema cache/i.test(error.message);
    return { porSetor: {}, dbAtiva: !faltando };
  }

  const porSetor: Record<string, boolean> = {};
  for (const l of (data ?? []) as Record<string, unknown>[]) {
    porSetor[String(l.setor_id)] = l.ativo !== false;
  }
  return { porSetor, dbAtiva: true };
}

/** Este setor participa? Ausente do mapa = sim. */
export function setorParticipaDoDesafio(
  setorId: string | null | undefined, porSetor: Record<string, boolean>,
): boolean {
  if (!setorId) return true;
  return porSetor[setorId] !== false;
}

/**
 * Liga ou desliga um setor.
 *
 * Grava sempre a linha, inclusive para ligar: a diferença entre "nunca foi
 * configurado" e "foi ligado de volta" fica registrada com autor e data, e é
 * essa a pergunta que alguém faz três meses depois.
 */
export async function definirSetorDoDesafio(params: {
  empresaId: string;
  setorId: string;
  ativo: boolean;
  autorId: string;
}): Promise<{ error: string | null }> {
  const { error } = await db('desafios_setores').upsert(
    {
      empresa_id:     params.empresaId,
      setor_id:       params.setorId,
      ativo:          params.ativo,
      atualizado_por: params.autorId,
      atualizado_em:  new Date().toISOString(),
    },
    { onConflict: 'empresa_id,setor_id' },
  );

  if (error) return { error: traduzir(error.message) };

  void registrarLog({
    acao: 'desafio_setor_alterado',
    categoria: 'configuracao',
    severidade: 'info',
    descricao: `${params.ativo ? 'Ativou' : 'Desativou'} os Desafios para um setor`,
    empresaId: params.empresaId,
    tabela: 'desafios_setores',
    registroId: params.setorId,
    alvoTipo: 'setor',
    detalhes: { setor_id: params.setorId, ativo: params.ativo },
    usuarioId: params.autorId,
  });

  return { error: null };
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export interface DadosGravacaoDesafio {
  nome: string;
  descricao: string | null;
  premio: string | null;
  dataInicio: string;
  dataFim: string;
  /** `null` = campanha da empresa. Ver `Desafio.setorId`. */
  setorId: string | null;
  /** Empresas alcançadas. Vazio = só a dona. Ver `Desafio.empresas`. */
  empresas: string[];
  tipo: TipoDesafio;
  regra: RegraDesafio;
  visual: VisualDesafio;
  status: StatusDesafio;
  midiaUrl: string | null;
  midiaCaminho: string | null;
  visibilidade: VisibilidadeDesafio;
}

/**
 * As colunas que só existem a partir de 20260903500000.
 *
 * A Vercel publica no PUSH, e a migration é aplicada depois — à mão, e com
 * autorização. Entre um e outro há uma janela em que este código roda contra
 * um banco que ainda não tem estas quatro colunas, e um INSERT com elas seria
 * recusado inteiro: gravar campanha pararia de funcionar para todo mundo.
 *
 * Por isso a gravação tenta com elas e, se o banco disser que a coluna não
 * existe, repete sem. A campanha nasce sem alcance multiempresa, sem mídia e
 * com a visibilidade padrão — que é exatamente o que ela seria antes desta
 * versão.
 */
const COLUNAS_NOVAS = ['empresas', 'midia_url', 'midia_caminho', 'visibilidade'] as const;

/** A mensagem do Postgres para «esta coluna não existe». */
function colunaAusente(mensagem: string): boolean {
  return COLUNAS_NOVAS.some(
    c => new RegExp(`column .*${c}.* does not exist|'${c}' column`, 'i').test(mensagem),
  ) || /schema cache/i.test(mensagem);
}

function semColunasNovas(colunas: Record<string, unknown>): Record<string, unknown> {
  const copia = { ...colunas };
  for (const c of COLUNAS_NOVAS) delete copia[c];
  return copia;
}

function paraColunas(d: DadosGravacaoDesafio): Record<string, unknown> {
  return {
    nome:        d.nome.trim(),
    descricao:   d.descricao?.trim() || null,
    premio:      d.premio?.trim() || null,
    data_inicio: d.dataInicio,
    data_fim:    d.dataFim,
    setor_id:    d.setorId,
    empresas:    d.empresas,
    tipo:        d.tipo,
    regra:       d.regra,
    visual:      d.visual,
    status:      d.status,
    midia_url:     d.midiaUrl,
    midia_caminho: d.midiaCaminho,
    visibilidade:  d.visibilidade,
  };
}

export async function criarDesafio(params: {
  empresaId: string;
  autorId: string;
  autorNome: string;
  dados: DadosGravacaoDesafio;
}): Promise<{ error: string | null }> {
  const base = {
    empresa_id:      params.empresaId,
    ...paraColunas(params.dados),
    criado_por:      params.autorId,
    criado_por_nome: params.autorNome,
  };

  let { error } = await db('desafios').insert(base);
  if (error && colunaAusente(error.message)) {
    ({ error } = await db('desafios').insert(semColunasNovas(base)));
  }

  if (error) return { error: traduzir(error.message) };

  void registrarLog({
    acao: 'desafio_criado',
    categoria: 'configuracao',
    severidade: 'info',
    descricao: `Criou o desafio "${params.dados.nome}"`,
    empresaId: params.empresaId,
    tabela: 'desafios',
    alvoTipo: 'desafio',
    alvoRotulo: params.dados.nome,
    detalhes: {
      periodo: `${params.dados.dataInicio} a ${params.dados.dataFim}`,
      tipo:    params.dados.tipo,
      status:  params.dados.status,
    },
    usuarioId: params.autorId,
  });

  return { error: null };
}

export async function atualizarDesafio(params: {
  desafioId: string;
  empresaId: string;
  autorId: string;
  dados: DadosGravacaoDesafio;
}): Promise<{ error: string | null }> {
  const base = paraColunas(params.dados);

  let { error } = await db('desafios').update(base).eq('id', params.desafioId);
  if (error && colunaAusente(error.message)) {
    ({ error } = await db('desafios')
      .update(semColunasNovas(base))
      .eq('id', params.desafioId));
  }

  if (error) return { error: traduzir(error.message) };

  void registrarLog({
    acao: 'desafio_editado',
    categoria: 'configuracao',
    severidade: 'info',
    descricao: `Editou o desafio "${params.dados.nome}"`,
    empresaId: params.empresaId,
    tabela: 'desafios',
    registroId: params.desafioId,
    alvoTipo: 'desafio',
    alvoRotulo: params.dados.nome,
    detalhes: {
      periodo: `${params.dados.dataInicio} a ${params.dados.dataFim}`,
      status:  params.dados.status,
    },
    usuarioId: params.autorId,
  });

  return { error: null };
}

/**
 * Muda só o status.
 *
 * Encerrar é isto, e não apagar: a campanha vira histórico com o ranking final
 * que ela teve. `desafios_delete` existe, mas é de quem administra o sistema —
 * sumir com o resultado de uma disputa que já aconteceu é outra decisão.
 */
export async function mudarStatusDesafio(params: {
  desafioId: string;
  empresaId: string;
  autorId: string;
  nome: string;
  status: StatusDesafio;
}): Promise<{ error: string | null }> {
  const { error } = await db('desafios')
    .update({ status: params.status })
    .eq('id', params.desafioId);

  if (error) return { error: traduzir(error.message) };

  void registrarLog({
    acao: 'desafio_status_alterado',
    categoria: 'configuracao',
    severidade: 'info',
    descricao: `Mudou o desafio "${params.nome}" para ${params.status}`,
    empresaId: params.empresaId,
    tabela: 'desafios',
    registroId: params.desafioId,
    alvoTipo: 'desafio',
    alvoRotulo: params.nome,
    detalhes: { status: params.status },
    usuarioId: params.autorId,
  });

  return { error: null };
}

/**
 * Apaga a campanha, e o arquivo de destaque junto.
 *
 * Apagar não é encerrar: encerrar guarda o ranking final como histórico, e
 * isto some com ele. Por isso a chave é outra (`desafios_excluir`), e por isso
 * o log guarda o nome e o período — depois do DELETE não sobra de onde tirá-los.
 *
 * O arquivo sai primeiro. Se a linha não puder ser apagada (RLS), o balde
 * perdeu uma imagem que ninguém mais veria de qualquer forma; a ordem inversa
 * deixaria lixo permanente no balde toda vez que o DELETE passasse.
 */
export async function excluirDesafio(params: {
  desafio: Desafio;
  autorId: string;
}): Promise<{ error: string | null }> {
  const { desafio } = params;

  if (desafio.midiaCaminho) {
    await supabase.storage.from(BUCKET_DESAFIOS).remove([desafio.midiaCaminho]);
  }

  const { error } = await db('desafios').delete().eq('id', desafio.id);
  if (error) return { error: traduzir(error.message) };

  void registrarLog({
    acao: 'desafio_excluido',
    categoria: 'configuracao',
    severidade: 'aviso',
    descricao: `Excluiu o desafio "${desafio.nome}"`,
    empresaId: desafio.empresaId,
    tabela: 'desafios',
    registroId: desafio.id,
    alvoTipo: 'desafio',
    alvoRotulo: desafio.nome,
    detalhes: {
      periodo: `${desafio.dataInicio} a ${desafio.dataFim}`,
      status:  desafio.status,
      premio:  desafio.premio,
    },
    usuarioId: params.autorId,
  });

  return { error: null };
}

// ── A mídia de destaque ──────────────────────────────────────────────────────

export const BUCKET_DESAFIOS = 'desafios';

/** 8 MB. O teto real é do balde (10 MB); este deixa margem para o GIF grande. */
const TETO_MIDIA_BYTES = 8 * 1024 * 1024;

const TIPOS_MIDIA = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export interface MidiaEnviada {
  url: string;
  caminho: string;
}

/**
 * Sobe a foto ou o GIF de destaque.
 *
 * O caminho leva a empresa e um sufixo aleatório: duas campanhas com o mesmo
 * nome de arquivo não se sobrescrevem, e trocar a imagem de uma campanha não
 * invalida o cache do navegador de quem estava com a antiga na tela.
 */
export async function enviarMidiaDesafio(params: {
  empresaId: string;
  arquivo: File;
}): Promise<{ dados: MidiaEnviada | null; error: string | null }> {
  const { arquivo } = params;

  if (!TIPOS_MIDIA.includes(arquivo.type)) {
    return { dados: null, error: 'Use PNG, JPG, WEBP ou GIF.' };
  }
  if (arquivo.size > TETO_MIDIA_BYTES) {
    return { dados: null, error: 'O arquivo passa de 8 MB.' };
  }

  const extensao = (arquivo.name.split('.').pop() ?? 'png').toLowerCase().slice(0, 5);
  const caminho =
    `${params.empresaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_DESAFIOS)
    .upload(caminho, arquivo, { upsert: false, contentType: arquivo.type });

  if (erroUpload) {
    return {
      dados: null,
      error: /bucket/i.test(erroUpload.message)
        ? 'O balde "desafios" não existe. Aplique a migration 20260903500000.'
        : 'Não foi possível enviar o arquivo.',
    };
  }

  const { data } = supabase.storage.from(BUCKET_DESAFIOS).getPublicUrl(caminho);
  return { dados: { url: data.publicUrl, caminho }, error: null };
}

/** Tira o arquivo do balde. A linha do desafio é atualizada por quem chamou. */
export async function removerMidiaDesafio(caminho: string): Promise<void> {
  if (!caminho) return;
  await supabase.storage.from(BUCKET_DESAFIOS).remove([caminho]);
}

/**
 * A mensagem do Postgres vira frase.
 *
 * A recusa mais provável é a da RLS, e "new row violates row-level security
 * policy" não diz a ninguém que faltou a permissão de configurar.
 */
export function traduzir(mensagem: string): string {
  if (/row-level security/i.test(mensagem)) {
    return 'Você não tem permissão para configurar desafios nesta empresa.';
  }
  if (/desafio_periodo_coerente/i.test(mensagem)) {
    return 'A data final precisa ser igual ou posterior à data inicial.';
  }
  if (/desafio_nome_preenchido/i.test(mensagem)) {
    return 'O desafio precisa de um nome.';
  }
  if (/relation|does not exist|schema cache/i.test(mensagem)) {
    return 'O módulo de Desafios ainda não foi aplicado no banco desta empresa.';
  }
  return mensagem;
}
