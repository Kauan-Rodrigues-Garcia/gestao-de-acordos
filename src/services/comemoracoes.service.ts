/**
 * comemoracoes.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Comemoração de meta — migration 20260731e. Design em
 * `docs/superpowers/specs/2026-07-31-comemoracao-de-meta-design.md`.
 *
 * Regras que NÃO moram aqui, e sim no banco:
 *   • quem pode criar          → `fn_comemoracao_pode_criar` + policies
 *   • para quem a festa vai    → trigger que preenche `setores_alvo`
 *   • um parabéns por pessoa   → PK composta de `comemoracao_parabens`
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { EfeitoId, SomId } from '@/pages/Comemoracoes/catalogo';
import { validarAgendamento } from '@/pages/Comemoracoes/janela';
import {
  layoutDoJson, layoutParaJson, ehLayoutPadrao, type LayoutComemoracao,
} from '@/pages/Comemoracoes/layout';
import { listarMidias } from './comemoracaoMidias.service';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface PessoaComemoracao {
  id:        string;
  nome:      string;
  foto_url:  string | null;
}

/**
 * Para quem a comemoração é.
 *
 * `operadores` — lista de homenageados; explode no setor de cada um.
 * `equipe`     — sem homenageados; explode no setor daquela equipe.
 * `setor`      — sem homenageados; explode na EMPRESA INTEIRA, porque meta de
 *                setor é notícia para todo mundo, não só para o próprio setor.
 */
export type AlvoTipo = 'operadores' | 'equipe' | 'setor';

export interface Comemoracao {
  id:            string;
  empresa_id:    string;
  criado_por:    string | null;
  titulo:        string;
  mensagem:      string | null;
  efeito:        EfeitoId;
  som:           SomId;
  /** Mídia própria (migration 20260731f). NULL = usa o catálogo. */
  gif_midia_id:  string | null;
  som_midia_id:  string | null;
  /** URLs resolvidas pelo service a partir de `comemoracao_midias`. */
  gif_url:       string | null;
  som_url:       string | null;
  /**
   * Segundo em que a música começa. Quanto tempo toca é `duracao_s`, a duração
   * da própria comemoração — o som termina junto com o card.
   */
  som_inicio_s:  number;
  layout:        LayoutComemoracao;
  /** Arranjo escolhido (20260801a). Só rótulo — quem manda é `layout`. */
  modelo:        string;
  anim_texto:    string;
  /** Percentual do volume padrão de cada som. 100 = como sempre foi. */
  volume:        number;
  inicia_em:     string;
  duracao_s:     number;
  setores_alvo:  string[];
  /**
   * Recorte por equipe (20260810a). Vazio = vale o setor, como sempre valeu.
   * Quem preenche é o banco; ver `escopo.ts` para o efeito na exibição.
   */
  equipes_alvo:  string[];
  /** "Exibir apenas para a equipe" ligado na montagem. */
  somente_equipe: boolean;
  /** Alvo (20260801a): operadores | equipe | setor. */
  alvo_tipo:     AlvoTipo;
  equipe_id:     string | null;
  setor_id:      string | null;
  /** Meta de setor aparece para a empresa toda, não só para o setor dela. */
  empresa_inteira: boolean;
  cancelada_em:  string | null;
  /** Preenchida ao terminar. Finalizada nunca mais dispara (20260801a). */
  finalizada_em: string | null;
  criado_em:     string;
  /** Preenchido pelo service a partir de `comemoracao_homenageados`. */
  homenageados:  PessoaComemoracao[];
  autor?:        PessoaComemoracao | null;
}

export const DURACAO_MIN_S = 5;
export const DURACAO_MAX_S = 60;
/** Acima disso o card vira mosaico de fotos ilegível — melhor duas festas. */
export const MAX_HOMENAGEADOS = 12;

export interface NovaComemoracao {
  empresaId:   string;
  criadoPor:   string;
  titulo:      string;
  mensagem:    string | null;
  efeito:      EfeitoId;
  som:         SomId;
  duracaoS:    number;
  operadorIds: string[];
  /** Ausente = agora. */
  iniciaEm?:   string;
  /** Mídia própria. Ausente = catálogo. */
  gifMidiaId?: string | null;
  somMidiaId?: string | null;
  layout?:     LayoutComemoracao;
  /** Arranjo escolhido. Ausente = 'midia_topo'. */
  modelo?:     string;
  /** Entrada do texto. Ausente = 'subir'. */
  animTexto?:  string;
  /** Percentual do volume padrão. Ausente = 100. */
  volume?:     number;
  /** Ausente = 'operadores', o comportamento de sempre. */
  alvoTipo?:   AlvoTipo;
  equipeId?:   string | null;
  setorId?:    string | null;
  /**
   * "Exibir apenas para a equipe" (20260810a). Ausente = false, ou seja, o
   * setor inteiro vê — como era antes.
   */
  somenteEquipe?: boolean;
  /**
   * Em que setores cada homenageado deve ser comemorado — a resposta da
   * pergunta do clone. Ausente para um operador = o banco cai no setor do
   * perfil dele. Ver `pages/Comemoracoes/clones.ts`.
   */
  setoresPorOperador?: Record<string, string[]>;
}

interface Resultado<T = null> {
  ok:    boolean;
  erro:  string | null;
  dados: T | null;
}

/** A migration ainda não rodou? */
function tabelaAusente(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  return erro.code === '42P01' || /relation .* does not exist/i.test(erro.message ?? '');
}

/** A tabela existe, mas é da versão anterior — falta a 20260801a. */
function colunaAusente(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  return erro.code === '42703' || /column .* does not exist/i.test(erro.message ?? '');
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/** Pessoas da empresa, para montar nomes e fotos sem depender de join. */
async function buscarPessoas(empresaId: string): Promise<Map<string, PessoaComemoracao>> {
  const { data, error } = await supabase
    .from('perfis')
    .select('id, nome, foto_url')
    .eq('empresa_id', empresaId);

  if (error) {
    logger.warn('[comemoracoes] erro ao listar pessoas:', error.message);
    return new Map();
  }
  const mapa = new Map<string, PessoaComemoracao>();
  for (const p of (data ?? []) as PessoaComemoracao[]) mapa.set(p.id, p);
  return mapa;
}

export interface ListaComemoracoes {
  data:     Comemoracao[];
  dbAtiva:  boolean;
  erro:     string | null;
  /** Hora do banco no momento da leitura — corrige o relógio do navegador. */
  agoraServidor: string | null;
}

/**
 * Comemorações que a RLS deixa este usuário ver.
 *
 * `desdeMs` recorta o passado: a tela não precisa do histórico inteiro, e o
 * overlay só se importa com o que ainda pode estar no ar.
 */
export async function buscarComemoracoes(
  empresaId: string,
  desdeMs = 24 * 3_600_000,
): Promise<ListaComemoracoes> {
  const desde = new Date(Date.now() - desdeMs).toISOString();

  const [{ data, error }, pessoas, midias] = await Promise.all([
    supabase
      .from('comemoracoes')
      .select('*, comemoracao_homenageados(operador_id)')
      .eq('empresa_id', empresaId)
      .gte('inicia_em', desde)
      .order('inicia_em', { ascending: false }),
    buscarPessoas(empresaId),
    // null = migration da fase 2 ainda não aplicada; sem mídia própria, o
    // catálogo cobre tudo e a tela não muda.
    listarMidias(empresaId),
  ]);

  if (error) {
    if (tabelaAusente(error)) {
      return { data: [], dbAtiva: false, erro: null, agoraServidor: null };
    }
    logger.warn('[comemoracoes] erro ao listar:', error.message);
    return { data: [], dbAtiva: true, erro: 'Não foi possível carregar as comemorações.', agoraServidor: null };
  }

  // As colunas da 20260801a chegam ausentes num banco que ainda não migrou —
  // daí serem opcionais aqui e ganharem padrão no mapa abaixo. A aba continua
  // funcionando como a de ontem em vez de quebrar.
  type Linha = Omit<
    Comemoracao,
    | 'homenageados' | 'autor' | 'layout' | 'gif_url' | 'som_url' | 'som_inicio_s'
    | 'modelo' | 'anim_texto' | 'volume' | 'alvo_tipo' | 'equipe_id' | 'setor_id'
    | 'empresa_inteira' | 'finalizada_em' | 'equipes_alvo' | 'somente_equipe'
  > & {
    layout?: unknown;
    modelo?:          string | null;
    anim_texto?:      string | null;
    volume?:          number | null;
    alvo_tipo?:       AlvoTipo | null;
    equipe_id?:       string | null;
    setor_id?:        string | null;
    empresa_inteira?: boolean | null;
    finalizada_em?:   string | null;
    equipes_alvo?:    string[] | null;
    somente_equipe?:  boolean | null;
    comemoracao_homenageados?: { operador_id: string }[] | null;
  };

  const porId = new Map((midias ?? []).map((m) => [m.id, m]));
  const somDe = (id: string | null) => (id ? porId.get(id) ?? null : null);

  const lista = ((data ?? []) as unknown as Linha[]).map((linha) => {
    const som = somDe(linha.som_midia_id);
    return {
      ...linha,
      // O layout vem de uma coluna JSONB: pode ter qualquer coisa dentro, então
      // é saneado antes de chegar à tela.
      layout: layoutDoJson(linha.layout),
      gif_url: linha.gif_midia_id ? porId.get(linha.gif_midia_id)?.url ?? null : null,
      som_url: som?.url ?? null,
      som_inicio_s: Number(som?.inicio_s ?? 0),
      modelo:     linha.modelo     ?? 'midia_topo',
      anim_texto: linha.anim_texto ?? 'subir',
      // 100 = volume padrão de cada som. Banco sem a coluna soa como sempre.
      volume:     Number(linha.volume ?? 100),
      alvo_tipo:  linha.alvo_tipo ?? 'operadores',
      equipe_id:  linha.equipe_id ?? null,
      setor_id:   linha.setor_id  ?? null,
      empresa_inteira: linha.empresa_inteira ?? false,
      finalizada_em:   linha.finalizada_em   ?? null,
      // Banco sem a 20260810a não estreita nada: vale o setor, como antes.
      equipes_alvo:    linha.equipes_alvo   ?? [],
      somente_equipe:  linha.somente_equipe ?? false,
      homenageados: (linha.comemoracao_homenageados ?? [])
        .map((h) => pessoas.get(h.operador_id))
        .filter((p): p is PessoaComemoracao => !!p),
      autor: linha.criado_por ? pessoas.get(linha.criado_por) ?? null : null,
    };
  });

  return {
    data: lista,
    dbAtiva: true,
    erro: null,
    // O servidor não devolve a hora dele nesta query; usamos o carimbo mais
    // recente que ele mesmo gerou. Sem nenhuma linha não há como medir o
    // desvio, e o relógio local serve — é o caso de quem nunca comemorou.
    agoraServidor: lista[0]?.criado_em ?? null,
  };
}

/**
 * Minhas equipes — a do perfil mais aquelas em que sou clone.
 *
 * É o que `deveExplodir` cruza com `equipes_alvo` para decidir se a
 * comemoração estreitada aparece na minha tela. Espelha
 * `fn_equipes_do_operador` (20260810a) do lado do navegador.
 *
 * Falha em silêncio devolvendo só a equipe do perfil: o pior caso é um clone
 * não ver a festa do time em que é clone, e isso é bem melhor que a tela
 * inteira parar por causa de uma tabela auxiliar.
 */
export async function buscarMinhasEquipes(
  usuarioId: string | null,
  equipeDoPerfil: string | null,
): Promise<string[]> {
  const proprias = equipeDoPerfil ? [equipeDoPerfil] : [];
  if (!usuarioId) return proprias;

  const { data, error } = await supabase
    .from('equipe_operadores_clones')
    .select('equipe_id')
    .eq('operador_id', usuarioId);

  if (error) {
    logger.warn('[comemoracoes] erro ao listar minhas equipes:', error.message);
    return proprias;
  }
  const clonadas = ((data ?? []) as { equipe_id: string }[]).map((c) => c.equipe_id);
  return [...new Set([...proprias, ...clonadas])];
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export async function criarComemoracao(p: NovaComemoracao): Promise<Resultado<string>> {
  const titulo = p.titulo.trim();
  const alvo   = p.alvoTipo ?? 'operadores';

  if (!titulo) return { ok: false, erro: 'Escreva um título.', dados: null };

  // Equipe e setor dispensam homenageado: quem bateu a meta é o grupo, e
  // listar 40 pessoas no card não diria nada que o nome da equipe já não diga.
  if (alvo === 'equipe' && !p.equipeId) {
    return { ok: false, erro: 'Escolha a equipe.', dados: null };
  }
  if (alvo === 'setor' && !p.setorId) {
    return { ok: false, erro: 'Escolha o setor.', dados: null };
  }
  if (alvo === 'operadores') {
    if (!p.operadorIds.length) {
      return { ok: false, erro: 'Escolha quem vai ser homenageado.', dados: null };
    }
    if (p.operadorIds.length > MAX_HOMENAGEADOS) {
      return { ok: false, erro: `São no máximo ${MAX_HOMENAGEADOS} homenageados por comemoração.`, dados: null };
    }
  }
  if (p.duracaoS < DURACAO_MIN_S || p.duracaoS > DURACAO_MAX_S) {
    return { ok: false, erro: `A duração vai de ${DURACAO_MIN_S} a ${DURACAO_MAX_S} segundos.`, dados: null };
  }
  if (p.iniciaEm) {
    // Validado aqui também, e não só na tela: a data pode chegar de um
    // formulário que ficou aberto meia hora antes do clique.
    const erroData = validarAgendamento(p.iniciaEm, Date.now());
    if (erroData) return { ok: false, erro: erroData, dados: null };
  }

  const { data, error } = await supabase
    .from('comemoracoes')
    .insert({
      empresa_id: p.empresaId,
      criado_por: p.criadoPor,
      titulo,
      mensagem:   p.mensagem?.trim() || null,
      efeito:     p.efeito,
      som:        p.som,
      duracao_s:  p.duracaoS,
      ...(p.iniciaEm ? { inicia_em: p.iniciaEm } : {}),
      // Layout de fábrica não vira JSON no banco: a coluna fica `{}` e a tela
      // cai no padrão, que é o que uma comemoração antiga também faz.
      ...(p.layout && !ehLayoutPadrao(p.layout) ? { layout: layoutParaJson(p.layout) } : {}),
      ...(p.gifMidiaId ? { gif_midia_id: p.gifMidiaId } : {}),
      ...(p.somMidiaId ? { som_midia_id: p.somMidiaId } : {}),
      // Colunas da 20260801a só entram quando fogem do padrão: assim um banco
      // que ainda não migrou continua criando comemoração comum sem erro, e só
      // esbarra na coluna ausente quem usar as novidades.
      ...(p.modelo    && p.modelo    !== 'midia_topo' ? { modelo: p.modelo } : {}),
      ...(p.animTexto && p.animTexto !== 'subir'      ? { anim_texto: p.animTexto } : {}),
      ...(p.volume !== undefined && p.volume !== 100  ? { volume: p.volume } : {}),
      ...(alvo === 'equipe' ? { alvo_tipo: 'equipe', equipe_id: p.equipeId } : {}),
      ...(alvo === 'setor'  ? { alvo_tipo: 'setor',  setor_id:  p.setorId  } : {}),
      // Meta de setor é a empresa inteira por definição: estreitar para uma
      // equipe não faz sentido, e a tela nem oferece.
      ...(p.somenteEquipe && alvo !== 'setor' ? { somente_equipe: true } : {}),
    })
    .select('id')
    .single();

  if (error || !data) {
    if (tabelaAusente(error)) {
      return { ok: false, erro: 'A migration 20260731e ainda não foi aplicada no banco.', dados: null };
    }
    if (colunaAusente(error)) {
      // Qual migration falta depende de QUAL coluna o banco não conhece —
      // mandar sempre para a 20260801a fazia a pessoa aplicar a errada.
      const qual = /somente_equipe|equipes_alvo/.test(error?.message ?? '')
        ? '20260810a' : '20260801a';
      return { ok: false, erro: `A migration ${qual} ainda não foi aplicada no banco.`, dados: null };
    }
    logger.warn('[comemoracoes] erro ao criar:', error?.message);
    return { ok: false, erro: error?.message ?? 'Não foi possível criar a comemoração.', dados: null };
  }

  // Equipe e setor já saíram do INSERT com a plateia resolvida pelo trigger
  // `trg_comemoracao_alvo_direto`. Não há homenageado a gravar.
  if (alvo !== 'operadores') return { ok: true, erro: null, dados: data.id };

  // Os homenageados vão depois, e é o INSERT deles que dispara o trigger de
  // `setores_alvo`. Se esta parte falhar, a comemoração existiria sem plateia —
  // por isso a linha é apagada em vez de ficar órfã.
  const linhas = p.operadorIds.map((operador_id) => ({
    comemoracao_id: data.id,
    operador_id,
    setores_escolhidos: p.setoresPorOperador?.[operador_id] ?? [],
  }));

  let { error: erroHomenageados } = await supabase
    .from('comemoracao_homenageados').insert(linhas);

  // Banco sem a 20260810a não tem `setores_escolhidos`. Repete sem a coluna em
  // vez de apagar a comemoração: sem ela o trigger antigo resolve o clone
  // sozinho, que é exatamente como aquele banco já se comportava.
  if (erroHomenageados && colunaAusente(erroHomenageados)) {
    ({ error: erroHomenageados } = await supabase
      .from('comemoracao_homenageados')
      .insert(linhas.map((l) => ({
        comemoracao_id: l.comemoracao_id, operador_id: l.operador_id,
      }))));
  }

  if (erroHomenageados) {
    logger.warn('[comemoracoes] erro nos homenageados:', erroHomenageados.message);
    await supabase.from('comemoracoes').delete().eq('id', data.id);
    return { ok: false, erro: 'Não foi possível registrar os homenageados.', dados: null };
  }

  return { ok: true, erro: null, dados: data.id };
}

/**
 * Marca a comemoração como finalizada.
 *
 * Chamada pelo cliente que exibiu o card quando a duração acaba. Idempotente e
 * best-effort: falhar aqui não pode atrapalhar quem está trabalhando, e a
 * faxina do pg_cron fecha o que escapar.
 *
 * A trava contra encerrar a festa dos outros mora na RPC: fora da janela
 * qualquer um finaliza, dentro dela só quem criou.
 */
export async function finalizarComemoracao(id: string): Promise<void> {
  const { error } = await supabase.rpc('fn_comemoracao_finalizar', { p_id: id });
  if (error && !tabelaAusente(error) && !funcaoAusente(error)) {
    logger.warn('[comemoracoes] erro ao finalizar:', error.message);
  }
}

/** A RPC da 20260801a ainda não existe neste banco. */
function funcaoAusente(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  return erro.code === 'PGRST202' || /could not find the function/i.test(erro.message ?? '');
}

/** Tira da tela de todo mundo. Não apaga: o histórico continua na aba. */
export async function cancelarComemoracao(id: string): Promise<Resultado> {
  const { error } = await supabase
    .from('comemoracoes')
    .update({ cancelada_em: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    logger.warn('[comemoracoes] erro ao cancelar:', error.message);
    return { ok: false, erro: 'Não foi possível cancelar.', dados: null };
  }
  return { ok: true, erro: null, dados: null };
}

// ── Parabéns ─────────────────────────────────────────────────────────────────

export interface ParabensComemoracao {
  comemoracao_id: string;
  usuario_id:     string;
  frase:          string;
  criado_em:      string;
  /** Resolvido pelo service; o realtime não traz join. */
  pessoa?:        PessoaComemoracao | null;
}

/**
 * Registra o parabéns de quem clicou.
 *
 * Um por pessoa, garantido pela PK composta da tabela. Clicar de novo devolve
 * `ok` em vez de erro: para quem clicou não houve falha nenhuma, e o botão já
 * mostra que o parabéns foi dado.
 */
export async function parabenizar(params: {
  comemoracaoId: string;
  usuarioId:     string;
  frase:         string;
}): Promise<Resultado> {
  const { error } = await supabase
    .from('comemoracao_parabens')
    .insert({
      comemoracao_id: params.comemoracaoId,
      usuario_id:     params.usuarioId,
      frase:          params.frase,
    });

  if (error) {
    // 23505 = violação de unicidade, ou seja, já tinha parabenizado.
    if (error.code === '23505') return { ok: true, erro: null, dados: null };
    logger.warn('[comemoracoes] erro ao parabenizar:', error.message);
    return { ok: false, erro: 'Não foi possível registrar o parabéns.', dados: null };
  }
  return { ok: true, erro: null, dados: null };
}

/** Parabéns já dados numa comemoração, com nome e foto de quem deu. */
export async function buscarParabens(
  comemoracaoId: string,
  empresaId: string,
): Promise<ParabensComemoracao[]> {
  const [{ data, error }, pessoas] = await Promise.all([
    supabase
      .from('comemoracao_parabens')
      .select('*')
      .eq('comemoracao_id', comemoracaoId)
      .order('criado_em', { ascending: true }),
    buscarPessoas(empresaId),
  ]);

  if (error) {
    logger.warn('[comemoracoes] erro ao listar parabéns:', error.message);
    return [];
  }
  return ((data ?? []) as ParabensComemoracao[]).map((p) => ({
    ...p,
    pessoa: pessoas.get(p.usuario_id) ?? null,
  }));
}

export async function excluirComemoracao(id: string): Promise<Resultado> {
  const { error } = await supabase.from('comemoracoes').delete().eq('id', id);
  if (error) {
    logger.warn('[comemoracoes] erro ao excluir:', error.message);
    return { ok: false, erro: 'Não foi possível excluir.', dados: null };
  }
  return { ok: true, erro: null, dados: null };
}
