/**
 * gifs.service.ts — a busca de GIFs da Comemoração 2.0.
 *
 * Duas fontes, nesta ordem:
 *
 *   1. **Buscas salvas** (`comemoracao_gif_buscas`, migration
 *      20261015120000). Toda busca que dá resultado fica guardada pelo termo:
 *      quem procurar "parabéns" amanhã vê na hora, sem gastar chamada do
 *      GIPHY — e os chips de buscas salvas deixam a equipe passear pelo que
 *      os colegas já acharam. Desde a 20261015180000 a leitura vale para
 *      TODAS as empresas: GIF do GIPHY é público (Cleber, 15/10/2026).
 *   2. **GIPHY**, via `/api/gifs` — a chave fica no servidor.
 *
 * Banco sem a migration: as buscas salvas caem no `localStorage` deste
 * navegador. Funciona igual para quem busca; só não é compartilhado.
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { Json } from '@/lib/database.types';
import { urlDeGifConfiavel, type GifCard } from '@/components/comemoracao2/design';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface BuscaSalva {
  termo:         string;
  gifs:          GifCard[];
  atualizado_em: string;
}

export type ResultadoGifs =
  | { status: 'ok'; gifs: GifCard[]; proximo: number | null; origem: 'giphy' | 'salvo' }
  | { status: 'nao-configurado' }
  | { status: 'erro'; mensagem: string };

// ── Puros (com teste) ────────────────────────────────────────────────────────

export const MAX_TERMO = 60;
/** Busca salva com mais que isso é refeita no GIPHY na próxima vez. */
export const VALIDADE_BUSCA_MS = 7 * 24 * 3_600_000;
/** Quantas buscas o navegador guarda quando o banco não tem a tabela. */
export const MAX_BUSCAS_LOCAIS = 24;

/** "  Meta   BATIDA " → "meta batida". É a chave da busca salva. */
export function normalizarTermo(termo: string): string {
  return termo.normalize('NFC').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').slice(0, MAX_TERMO);
}

export function buscaFresca(atualizadoEm: string, agora = Date.now()): boolean {
  const t = Date.parse(atualizadoEm);
  return Number.isFinite(t) && agora - t < VALIDADE_BUSCA_MS;
}

/** Lista de GIFs vinda do banco ou do navegador → só o que é seguro desenhar. */
export function gifsDoJson(valor: unknown): GifCard[] {
  if (!Array.isArray(valor)) return [];
  const saida: GifCard[] = [];
  for (const item of valor) {
    if (!item || typeof item !== 'object') continue;
    const g = item as Record<string, unknown>;
    if (!urlDeGifConfiavel(g.url)) continue;
    saida.push({
      id:      String(g.id ?? '').slice(0, 64),
      titulo:  String(g.titulo ?? '').slice(0, 140),
      url:     g.url,
      previa:  urlDeGifConfiavel(g.previa) ? g.previa : g.url,
      largura: Number(g.largura) || 200,
      altura:  Number(g.altura) || 200,
    });
  }
  return saida;
}

/** Junta uma busca nova às guardadas: sem repetir termo, mais nova primeiro, com teto. */
export function mesclarBuscas(lista: BuscaSalva[], nova: BuscaSalva, maximo = MAX_BUSCAS_LOCAIS): BuscaSalva[] {
  return [nova, ...lista.filter((b) => b.termo !== nova.termo)].slice(0, maximo);
}

// ── Navegador (reserva sem a migration) ──────────────────────────────────────

const chaveLocal = (empresaId: string) => `comemoracoes:gif-buscas:${empresaId}`;

function lerLocais(empresaId: string): BuscaSalva[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(chaveLocal(empresaId)) ?? '[]') as unknown;
    if (!Array.isArray(bruto)) return [];
    return bruto
      .map((b) => b as Record<string, unknown>)
      .filter((b) => typeof b.termo === 'string' && typeof b.atualizado_em === 'string')
      .map((b) => ({ termo: b.termo as string, atualizado_em: b.atualizado_em as string, gifs: gifsDoJson(b.gifs) }));
  } catch {
    return [];
  }
}

function gravarLocal(empresaId: string, busca: BuscaSalva): void {
  try {
    localStorage.setItem(chaveLocal(empresaId), JSON.stringify(mesclarBuscas(lerLocais(empresaId), busca)));
  } catch {
    // Navegador sem storage: a busca só não fica guardada.
  }
}

// ── Banco ────────────────────────────────────────────────────────────────────

/**
 * A tabela existe neste banco? Descoberto na primeira tentativa e lembrado
 * pela sessão: sem isto, cada busca bateria no banco para ouvir o mesmo 404.
 */
let tabelaExiste: boolean | null = null;

function tabelaAusente(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  return erro.code === '42P01' || erro.code === 'PGRST205'
    || /relation .* does not exist|could not find the table/i.test(erro.message ?? '');
}

/**
 * Buscas salvas de todas as empresas, mais recentes primeiro.
 *
 * O mesmo termo pode estar salvo por mais de uma empresa (a chave do banco é
 * empresa + termo); fica a versão mais nova.
 */
export async function listarBuscasSalvas(empresaId: string, limite = 16): Promise<BuscaSalva[]> {
  if (tabelaExiste !== false) {
    const { data, error } = await supabase
      .from('comemoracao_gif_buscas')
      .select('termo, resultados, atualizado_em')
      .order('atualizado_em', { ascending: false })
      .limit(limite * 2);
    if (!error) {
      tabelaExiste = true;
      const vistos = new Set<string>();
      const lista: BuscaSalva[] = [];
      for (const l of data ?? []) {
        if (vistos.has(l.termo)) continue;
        vistos.add(l.termo);
        lista.push({ termo: l.termo, atualizado_em: l.atualizado_em, gifs: gifsDoJson(l.resultados) });
      }
      return lista.slice(0, limite);
    }
    if (tabelaAusente(error)) tabelaExiste = false;
    else logger.warn('[gifs] erro ao listar buscas salvas:', error.message);
  }
  return lerLocais(empresaId).slice(0, limite);
}

async function lerBuscaSalva(empresaId: string, termo: string): Promise<BuscaSalva | null> {
  if (tabelaExiste !== false) {
    // De qualquer empresa: a mais nova com este termo.
    const { data, error } = await supabase
      .from('comemoracao_gif_buscas')
      .select('termo, resultados, atualizado_em')
      .eq('termo', termo)
      .order('atualizado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) {
      tabelaExiste = true;
      return data ? { termo: data.termo, atualizado_em: data.atualizado_em, gifs: gifsDoJson(data.resultados) } : null;
    }
    if (tabelaAusente(error)) tabelaExiste = false;
    else logger.warn('[gifs] erro ao ler busca salva:', error.message);
  }
  return lerLocais(empresaId).find((b) => b.termo === termo) ?? null;
}

async function salvarBusca(empresaId: string, usuarioId: string, busca: BuscaSalva): Promise<void> {
  if (tabelaExiste !== false) {
    const { error } = await supabase
      .from('comemoracao_gif_buscas')
      .upsert({
        empresa_id: empresaId,
        termo: busca.termo,
        resultados: busca.gifs as unknown as Json,
        criado_por: usuarioId,
        atualizado_em: busca.atualizado_em,
      }, { onConflict: 'empresa_id,termo' });
    if (!error) { tabelaExiste = true; return; }
    if (tabelaAusente(error)) tabelaExiste = false;
    else { logger.warn('[gifs] erro ao salvar busca:', error.message); return; }
  }
  gravarLocal(empresaId, busca);
}

// ── GIFs usados ──────────────────────────────────────────────────────────────

/** A tabela de GIFs usados existe? Mesma lógica de `tabelaExiste`. */
let usadosExiste: boolean | null = null;

/**
 * Os GIFs que entraram em comemorações de verdade, de todas as empresas, do
 * mais recente para o mais antigo (`comemoracao_gifs_usados`, 20261015180000).
 *
 * null = o banco ainda não tem a tabela; o estúdio cai nos GIFs das
 * comemorações que ele já tem em mãos.
 */
export async function listarGifsUsados(limite = 24): Promise<GifCard[] | null> {
  if (usadosExiste === false) return null;
  const { data, error } = await supabase
    .from('comemoracao_gifs_usados')
    .select('gif')
    .order('usado_em', { ascending: false })
    .limit(limite);
  if (error) {
    if (tabelaAusente(error)) usadosExiste = false;
    else logger.warn('[gifs] erro ao listar GIFs usados:', error.message);
    return null;
  }
  usadosExiste = true;
  return gifsDoJson((data ?? []).map((l) => l.gif));
}

/**
 * Anota que o GIF entrou numa comemoração. Best-effort: falhar aqui não pode
 * atrapalhar a festa, que já foi criada.
 */
export async function registrarGifUsado(gif: GifCard): Promise<void> {
  if (usadosExiste === false) return;
  const { error } = await supabase.rpc('fn_comemoracao_gif_usado', { p_gif: gif as unknown as Json });
  if (error && error.code !== 'PGRST202') logger.warn('[gifs] erro ao registrar GIF usado:', error.message);
}

// ── GIPHY (via /api/gifs) ────────────────────────────────────────────────────

async function chamarApi(corpo: { tipo: 'buscar' | 'em-alta'; termo?: string; offset?: number }): Promise<ResultadoGifs> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { status: 'erro', mensagem: 'Sua sessão expirou. Entre de novo para buscar GIFs.' };

    const resp = await fetch('/api/gifs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const json = await resp.json().catch(() => ({})) as {
      configured?: boolean; gifs?: unknown; proximo?: number | null; error?: string;
    };
    if (resp.status === 503 && json.configured === false) return { status: 'nao-configurado' };
    if (!resp.ok) return { status: 'erro', mensagem: json.error ?? 'A busca de GIFs falhou. Tente de novo.' };
    return { status: 'ok', gifs: gifsDoJson(json.gifs), proximo: json.proximo ?? null, origem: 'giphy' };
  } catch {
    return { status: 'erro', mensagem: 'Sem conexão com a busca de GIFs.' };
  }
}

/**
 * Busca um termo. A primeira página vem da busca salva quando ela é recente;
 * senão vai ao GIPHY e o resultado é salvo para a próxima pessoa.
 */
export async function buscarGifs(params: {
  empresaId: string;
  usuarioId: string;
  termo:     string;
  offset?:   number;
  /** Ignora a busca salva e pergunta ao GIPHY de novo. */
  renovar?:  boolean;
}): Promise<ResultadoGifs> {
  const termo = normalizarTermo(params.termo);
  if (!termo) return { status: 'erro', mensagem: 'Escreva o que procurar.' };
  const offset = params.offset ?? 0;

  if (offset === 0 && !params.renovar) {
    const salva = await lerBuscaSalva(params.empresaId, termo);
    if (salva && salva.gifs.length > 0 && buscaFresca(salva.atualizado_em)) {
      // "Ver mais" de uma busca salva continua no GIPHY de onde ela parou.
      return { status: 'ok', gifs: salva.gifs, proximo: salva.gifs.length, origem: 'salvo' };
    }
  }

  const r = await chamarApi({ tipo: 'buscar', termo, offset });
  if (r.status === 'ok' && offset === 0 && r.gifs.length > 0) {
    void salvarBusca(params.empresaId, params.usuarioId, {
      termo, gifs: r.gifs, atualizado_em: new Date().toISOString(),
    });
  }
  return r;
}

// ── Em alta ──────────────────────────────────────────────────────────────────

const CHAVE_EM_ALTA = 'comemoracoes:gifs-em-alta';
const VALIDADE_EM_ALTA_MS = 6 * 3_600_000;

/** Os GIFs do momento — guardados por 6 h no navegador para não gastar chamada a cada abertura. */
export async function gifsEmAlta(): Promise<ResultadoGifs> {
  try {
    const guardado = JSON.parse(localStorage.getItem(CHAVE_EM_ALTA) ?? 'null') as { em?: number; gifs?: unknown } | null;
    if (guardado?.em && Date.now() - guardado.em < VALIDADE_EM_ALTA_MS) {
      const gifs = gifsDoJson(guardado.gifs);
      if (gifs.length) return { status: 'ok', gifs, proximo: null, origem: 'salvo' };
    }
  } catch { /* sem storage: busca de novo */ }

  const r = await chamarApi({ tipo: 'em-alta' });
  if (r.status === 'ok' && r.gifs.length) {
    try { localStorage.setItem(CHAVE_EM_ALTA, JSON.stringify({ em: Date.now(), gifs: r.gifs })); } catch { /* idem */ }
  }
  return r.status === 'ok' ? { ...r, proximo: null } : r;
}

/** Só para teste: esquece o que se descobriu sobre a tabela. */
export function __resetarGifs(): void {
  tabelaExiste = null;
  usadosExiste = null;
}
