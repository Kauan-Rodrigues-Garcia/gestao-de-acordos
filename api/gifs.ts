/**
 * Função serverless (Vercel) — busca de GIFs da Comemoração 2.0 (GIPHY).
 *
 * A chave do GIPHY mora SÓ aqui, no servidor (`GIPHY_API_KEY`), e nunca chega
 * ao navegador. Só quem está logado no sistema consegue buscar: a sessão do
 * Supabase é conferida antes de qualquer chamada ao GIPHY.
 *
 * Sem `GIPHY_API_KEY` responde 503 `{ configured: false }` — o estúdio mostra
 * o aviso e o card segue com o troféu.
 *
 * Contrato:
 *   POST /api/gifs  { tipo: 'buscar', termo: string, offset?: number }
 *                   { tipo: 'em-alta', offset?: number }
 *   200 { configured: true, gifs: GifResposta[], proximo: number | null }
 *
 * Em `npm run dev` roda pelo plugin `vite-plugins/dev-api.ts`, lendo a chave
 * do `.env.local`.
 */

interface ReqLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

export interface GifResposta {
  id:      string;
  titulo:  string;
  /** Versão do card. */
  url:     string;
  /** Versão leve, para a grade. */
  previa:  string;
  largura: number;
  altura:  number;
}

/** Quantos GIFs por página. A grade mostra 3 colunas: 24 = 8 linhas. */
export const POR_PAGINA = 24;
const MAX_OFFSET = 499;
const MAX_TERMO = 60;

function header(req: ReqLike, nome: string): string | undefined {
  const valor = req.headers?.[nome] ?? req.headers?.[nome.toLowerCase()];
  return Array.isArray(valor) ? valor[0] : valor;
}

function corpo(req: ReqLike): Record<string, unknown> {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) as Record<string, unknown>; } catch { return {}; }
  }
  return (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
}

function urlGiphy(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'giphy.com' && !url.hostname.endsWith('.giphy.com')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

interface Rendicao { url?: string; webp?: string; width?: string | number; height?: string | number }
interface ItemGiphy {
  id?: string;
  title?: string;
  images?: Record<string, Rendicao | undefined>;
}

/**
 * Um item do GIPHY → o que o estúdio usa.
 *
 * Card: `downsized_medium` (até ~5 MB, nítido no tamanho do card); grade:
 * `fixed_width` em WEBP, bem mais leve. Item sem URL confiável fica de fora.
 */
export function mapearGif(item: ItemGiphy): GifResposta | null {
  const img = item.images ?? {};
  const url = urlGiphy(img.downsized_medium?.url) ?? urlGiphy(img.downsized?.url) ?? urlGiphy(img.original?.url);
  const previa = urlGiphy(img.fixed_width?.webp) ?? urlGiphy(img.fixed_width?.url) ?? url;
  if (!url || !previa || !item.id) return null;
  const base = img.fixed_width ?? img.original ?? {};
  const largura = Number(base.width) || 200;
  const altura = Number(base.height) || 200;
  return {
    id: String(item.id).slice(0, 64),
    titulo: String(item.title ?? '').slice(0, 140),
    url, previa, largura, altura,
  };
}

async function sessaoValida(req: ReqLike): Promise<boolean> {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const chavePublica = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const authorization = header(req, 'authorization') ?? '';
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!supabaseUrl || !chavePublica || !jwt) return false;

  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: chavePublica, Authorization: `Bearer ${jwt}` },
  });
  if (!resp.ok) return false;
  const user = (await resp.json()) as { id?: string };
  return !!user.id;
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const chave = process.env.GIPHY_API_KEY?.trim();
  if (!chave) {
    res.status(503).json({ configured: false, motivo: 'Busca de GIFs não configurada (falta GIPHY_API_KEY).' });
    return;
  }

  let autenticado = false;
  try {
    autenticado = await sessaoValida(req);
  } catch (error) {
    console.error('[gifs] falha ao validar sessão:', error);
  }
  if (!autenticado) {
    res.status(401).json({ error: 'Faça login para buscar GIFs.' });
    return;
  }

  const c = corpo(req);
  const tipo = c.tipo === 'em-alta' ? 'em-alta' : 'buscar';
  const termo = typeof c.termo === 'string' ? c.termo.trim().slice(0, MAX_TERMO) : '';
  const offset = Math.min(MAX_OFFSET, Math.max(0, Math.floor(Number(c.offset) || 0)));

  if (tipo === 'buscar' && !termo) {
    res.status(400).json({ error: 'Escreva o que procurar.' });
    return;
  }

  const params = new URLSearchParams({
    api_key: chave,
    limit: String(POR_PAGINA),
    offset: String(offset),
    // Classificação livre: o card aparece no meio do expediente, para todos.
    rating: 'g',
    bundle: 'messaging_non_clips',
  });
  if (tipo === 'buscar') {
    params.set('q', termo);
    params.set('lang', 'pt');
  }
  const endpoint = tipo === 'buscar' ? 'search' : 'trending';

  let resp: Response;
  try {
    resp = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params.toString()}`);
  } catch (error) {
    console.error('[gifs] GIPHY fora do ar:', error);
    res.status(502).json({ error: 'O GIPHY não respondeu. Tente de novo em instantes.' });
    return;
  }

  if (resp.status === 429) {
    res.status(429).json({ error: 'Limite de buscas do GIPHY atingido nesta hora. Use as buscas salvas.' });
    return;
  }
  if (!resp.ok) {
    console.error('[gifs] GIPHY respondeu', resp.status);
    res.status(502).json({ error: 'O GIPHY recusou a busca. Confira a chave GIPHY_API_KEY.' });
    return;
  }

  const dados = (await resp.json()) as {
    data?: ItemGiphy[];
    pagination?: { total_count?: number; count?: number; offset?: number };
  };
  const gifs = (dados.data ?? []).map(mapearGif).filter((g): g is GifResposta => g !== null);
  const pag = dados.pagination ?? {};
  const fim = (pag.offset ?? offset) + (pag.count ?? gifs.length);
  const total = pag.total_count ?? fim;
  const proximo = gifs.length > 0 && fim < total && fim <= MAX_OFFSET ? fim : null;

  res.status(200).json({ configured: true, gifs, proximo });
}
