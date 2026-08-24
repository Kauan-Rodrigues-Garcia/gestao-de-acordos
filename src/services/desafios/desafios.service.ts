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
  DadosDesafio, Desafio, MetricaDesafio, ModoDisputa, ParticipantesDesafio,
  PessoaDesafio, RegraDesafio, StatusDesafio, TemaDesafio, TipoDesafio,
  VisualDesafio,
} from './types';

// ── Cliente sem tipo ─────────────────────────────────────────────────────────

interface Consulta extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  select(colunas?: string): Consulta;
  insert(valores: unknown): Consulta;
  update(valores: unknown): Consulta;
  upsert(valores: unknown, opcoes?: { onConflict?: string }): Consulta;
  eq(coluna: string, valor: unknown): Consulta;
  in(coluna: string, valores: unknown[]): Consulta;
  order(coluna: string, opcoes?: { ascending?: boolean }): Consulta;
  limit(n: number): Consulta;
}

function db(tabela: string): Consulta {
  return (supabase.from as unknown as (t: string) => Consulta)(tabela);
}

// ── Normalização ─────────────────────────────────────────────────────────────

const TEMAS: readonly TemaDesafio[] = ['padrao', 'cafe', 'corrida', 'equipes'];

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
  };
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
  };
}

function paraDesafio(linha: Record<string, unknown>): Desafio {
  const tipo = String(linha.tipo ?? 'bater_meta') as TipoDesafio;
  return {
    id:            String(linha.id),
    empresaId:     String(linha.empresa_id),
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
  const { data, error } = await db('desafios')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('data_inicio', { ascending: false });

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
  tipo: TipoDesafio;
  regra: RegraDesafio;
  visual: VisualDesafio;
  status: StatusDesafio;
}

function paraColunas(d: DadosGravacaoDesafio): Record<string, unknown> {
  return {
    nome:        d.nome.trim(),
    descricao:   d.descricao?.trim() || null,
    premio:      d.premio?.trim() || null,
    data_inicio: d.dataInicio,
    data_fim:    d.dataFim,
    setor_id:    d.setorId,
    tipo:        d.tipo,
    regra:       d.regra,
    visual:      d.visual,
    status:      d.status,
  };
}

export async function criarDesafio(params: {
  empresaId: string;
  autorId: string;
  autorNome: string;
  dados: DadosGravacaoDesafio;
}): Promise<{ error: string | null }> {
  const { error } = await db('desafios').insert({
    empresa_id:      params.empresaId,
    ...paraColunas(params.dados),
    criado_por:      params.autorId,
    criado_por_nome: params.autorNome,
  });

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
  const { error } = await db('desafios')
    .update(paraColunas(params.dados))
    .eq('id', params.desafioId);

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
