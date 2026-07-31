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
  /** Trecho do som escolhido pelo líder. null = arquivo inteiro. */
  som_trecho:    { inicio: number; duracao: number } | null;
  layout:        LayoutComemoracao;
  inicia_em:     string;
  duracao_s:     number;
  setores_alvo:  string[];
  cancelada_em:  string | null;
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

  type Linha = Omit<
    Comemoracao,
    'homenageados' | 'autor' | 'layout' | 'gif_url' | 'som_url' | 'som_trecho'
  > & {
    layout?: unknown;
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
      // Sem `trecho_s` a música toca inteira — é o caso de tudo que foi
      // enviado antes da migration 20260731g.
      som_trecho: som?.trecho_s
        ? { inicio: Number(som.inicio_s ?? 0), duracao: Number(som.trecho_s) }
        : null,
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

// ── Escrita ──────────────────────────────────────────────────────────────────

export async function criarComemoracao(p: NovaComemoracao): Promise<Resultado<string>> {
  const titulo = p.titulo.trim();
  if (!titulo) return { ok: false, erro: 'Escreva um título.', dados: null };
  if (!p.operadorIds.length) return { ok: false, erro: 'Escolha quem vai ser homenageado.', dados: null };
  if (p.operadorIds.length > MAX_HOMENAGEADOS) {
    return { ok: false, erro: `São no máximo ${MAX_HOMENAGEADOS} homenageados por comemoração.`, dados: null };
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
    })
    .select('id')
    .single();

  if (error || !data) {
    if (tabelaAusente(error)) {
      return { ok: false, erro: 'A migration 20260731e ainda não foi aplicada no banco.', dados: null };
    }
    logger.warn('[comemoracoes] erro ao criar:', error?.message);
    return { ok: false, erro: error?.message ?? 'Não foi possível criar a comemoração.', dados: null };
  }

  // Os homenageados vão depois, e é o INSERT deles que dispara o trigger de
  // `setores_alvo`. Se esta parte falhar, a comemoração existiria sem plateia —
  // por isso a linha é apagada em vez de ficar órfã.
  const { error: erroHomenageados } = await supabase
    .from('comemoracao_homenageados')
    .insert(p.operadorIds.map((operador_id) => ({ comemoracao_id: data.id, operador_id })));

  if (erroHomenageados) {
    logger.warn('[comemoracoes] erro nos homenageados:', erroHomenageados.message);
    await supabase.from('comemoracoes').delete().eq('id', data.id);
    return { ok: false, erro: 'Não foi possível registrar os homenageados.', dados: null };
  }

  return { ok: true, erro: null, dados: data.id };
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

export async function excluirComemoracao(id: string): Promise<Resultado> {
  const { error } = await supabase.from('comemoracoes').delete().eq('id', id);
  if (error) {
    logger.warn('[comemoracoes] erro ao excluir:', error.message);
    return { ok: false, erro: 'Não foi possível excluir.', dados: null };
  }
  return { ok: true, erro: null, dados: null };
}
