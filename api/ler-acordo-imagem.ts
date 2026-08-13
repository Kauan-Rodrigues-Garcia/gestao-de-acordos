/**
 * Função serverless (Vercel) — leitura de acordo BookPlay por imagem via IA.
 *
 * PROVIDER-AGNOSTIC e PRONTA PARA RECEBER A API: escolha o provedor por
 * variáveis de ambiente, sem tocar no código nem no front-end.
 *
 *   VISION_PROVIDER  = "openai" | "anthropic"
 *   VISION_API_KEY   = <sua-chave>
 *   VISION_MODEL     = (opcional) id do modelo; há um default por provedor
 *
 * Enquanto NÃO houver `VISION_PROVIDER` + `VISION_API_KEY`, responde 503 com
 * `{ configured: false }` — e o front cai automaticamente no OCR local
 * (Tesseract). Assim dá pra rodar e testar tudo hoje, sem chave.
 *
 * A chave NUNCA é exposta ao navegador: fica só neste ambiente de servidor.
 */

// Tipagem mínima do handler Node da Vercel (evita depender de @vercel/node).
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

interface Corpo {
  origem?: string;
  imagens?: string[]; // Data URLs "data:image/...;base64,..."
}

interface AutenticacaoOk {
  ok: true;
  userId: string;
}

interface AutenticacaoErro {
  ok: false;
  status: number;
  error: string;
}

interface CotaApi {
  permitido?: boolean;
  restantes?: number;
  tentar_novamente_em_s?: number;
}

const MAX_IMAGENS = 5;
// Base64 adds ~33%; 3 MiB stays below Vercel Functions' 4.5 MB request limit.
const MAX_BYTES_IMAGENS = 3 * 1024 * 1024;
const DATA_URL_IMAGEM = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const DEFAULT_MODEL: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

const CAMPOS = [
  'nr_cliente',
  'nome_cliente',
  'whatsapp',
  'vencimento',
  'valor',
  'parcelas',
  'tipo',
  'status',
  'instituicao',
] as const;

const SYSTEM_PROMPT = [
  'Você extrai dados de acordos de cobrança BookPlay a partir de prints de tela.',
  'Responda SOMENTE com um objeto JSON válido, sem markdown, sem comentários.',
  'Chaves possíveis (omita as que não aparecerem na imagem):',
  '- nr_cliente: string (NR / código do acordo)',
  '- nome_cliente: string',
  '- whatsapp: string',
  '- vencimento: string no formato YYYY-MM-DD (primeiro vencimento)',
  '- valor: string em formato brasileiro "1.234,56" — VALOR DE CADA PARCELA, não o total',
  '- parcelas: número total de parcelas',
  '- tipo: um de ["boleto","pix_automatico","cartao_recorrente","cartao","pix"]',
  '- status: um de ["verificar_pendente","pago","nao_pago"]',
  '- instituicao: string',
  'Se houver MÚLTIPLAS imagens do MESMO acordo (reparcelamento dividido em telas),',
  'considere todas juntas: some as parcelas e conte o total. O valor é por parcela.',
].join('\n');

const USER_PROMPT =
  'Extraia os dados deste acordo BookPlay. Retorne apenas o JSON com os campos identificados.';

function extrairJson(texto: string): Record<string, unknown> {
  // Remove cercas ```json ... ``` e pega o primeiro objeto {...}.
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  const ini = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (ini === -1 || fim === -1) throw new Error('Resposta da IA sem JSON.');
  return JSON.parse(limpo.slice(ini, fim + 1)) as Record<string, unknown>;
}

/** Mantém só as chaves conhecidas — a normalização final é feita no cliente. */
function filtrarCampos(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS) if (k in obj && obj[k] != null) out[k] = obj[k];
  return out;
}

async function chamarOpenAI(
  apiKey: string,
  model: string,
  imagens: string[],
): Promise<Record<string, unknown>> {
  const content: unknown[] = [{ type: 'text', text: USER_PROMPT }];
  for (const url of imagens) content.push({ type: 'image_url', image_url: { url } });

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    }),
  });

  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const texto = data.choices?.[0]?.message?.content ?? '';
  return extrairJson(texto);
}

async function chamarAnthropic(
  apiKey: string,
  model: string,
  imagens: string[],
): Promise<Record<string, unknown>> {
  const content: unknown[] = [{ type: 'text', text: USER_PROMPT }];
  for (const url of imagens) {
    const m = url.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) continue;
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: m[1], data: m[2] },
    });
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as { content?: { type: string; text?: string }[] };
  const texto = data.content?.map((b) => b.text ?? '').join('') ?? '';
  return extrairJson(texto);
}

function header(req: ReqLike, nome: string): string | undefined {
  const valor = req.headers?.[nome] ?? req.headers?.[nome.toLowerCase()];
  return Array.isArray(valor) ? valor[0] : valor;
}

function inteiroAmbiente(nome: string, fallback: number, maximo: number): number {
  const valor = Number.parseInt(process.env[nome] ?? '', 10);
  return Number.isFinite(valor) && valor > 0 ? Math.min(valor, maximo) : fallback;
}

function tamanhoBase64Aproximado(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

async function autenticarUsuario(
  req: ReqLike,
  supabaseUrl: string,
  publishableKey: string,
  serviceKey: string,
): Promise<AutenticacaoOk | AutenticacaoErro> {
  const authorization = header(req, 'authorization') ?? '';
  const callerJwt = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!callerJwt) return { ok: false, status: 401, error: 'Não autenticado.' };

  const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${callerJwt}` },
  });
  if (!userResp.ok) return { ok: false, status: 401, error: 'Sessão inválida.' };

  const user = (await userResp.json()) as { id?: string };
  if (!user.id) return { ok: false, status: 401, error: 'Sessão inválida.' };

  const perfilResp = await fetch(
    `${supabaseUrl}/rest/v1/perfis?id=eq.${encodeURIComponent(user.id)}`
      + '&select=id,ativo,situacao,arquivado',
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  if (!perfilResp.ok) {
    return { ok: false, status: 503, error: 'Não foi possível validar o perfil.' };
  }

  const perfis = (await perfilResp.json()) as Array<{
    id?: string;
    ativo?: boolean;
    situacao?: string;
    arquivado?: boolean;
  }>;
  const perfil = Array.isArray(perfis) ? perfis[0] : null;
  if (!perfil || !perfil.ativo || perfil.arquivado || perfil.situacao === 'desligado') {
    return { ok: false, status: 403, error: 'Perfil sem permissão para usar a leitura por IA.' };
  }

  return { ok: true, userId: user.id };
}

async function consumirCota(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<CotaApi | null> {
  const limite = inteiroAmbiente('VISION_RATE_LIMIT_MAX', 10, 1000);
  const janela = inteiroAmbiente('VISION_RATE_LIMIT_WINDOW_SECONDS', 600, 86400);
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/fn_api_rate_limit_consumir`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_usuario_id: userId,
      p_rota: 'ler-acordo-imagem',
      p_limite: limite,
      p_janela_segundos: janela,
    }),
  });
  if (!resp.ok) return null;
  const resultado = (await resp.json()) as CotaApi[] | CotaApi;
  return Array.isArray(resultado) ? (resultado[0] ?? null) : resultado;
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store');

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    .replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const publishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || serviceKey
  ).trim();
  if (!supabaseUrl || !serviceKey || !publishableKey) {
    res.status(503).json({
      configured: false,
      motivo: 'Autenticação da leitura por IA não configurada no servidor.',
    });
    return;
  }

  let autenticacao: AutenticacaoOk | AutenticacaoErro;
  try {
    autenticacao = await autenticarUsuario(req, supabaseUrl, publishableKey, serviceKey);
  } catch (error) {
    console.error('[ler-acordo-imagem] falha ao validar sessão:', error);
    res.status(503).json({ error: 'Não foi possível validar a sessão.' });
    return;
  }
  if (!autenticacao.ok) {
    res.status(autenticacao.status).json({ error: autenticacao.error });
    return;
  }

  const provider = (process.env.VISION_PROVIDER ?? '').toLowerCase().trim();
  const apiKey = process.env.VISION_API_KEY?.trim();
  const model = process.env.VISION_MODEL?.trim() || DEFAULT_MODEL[provider];

  // Ainda não configurada → o front cai no OCR local.
  if (!provider || !apiKey) {
    res.status(503).json({ configured: false, motivo: 'IA de visão não configurada.' });
    return;
  }
  if (provider !== 'openai' && provider !== 'anthropic') {
    res.status(500).json({ error: `VISION_PROVIDER inválido: "${provider}".` });
    return;
  }

  let corpo: Corpo;
  try {
    corpo = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Corpo;
  } catch {
    res.status(400).json({ error: 'JSON inválido.' });
    return;
  }

  const imagens = Array.isArray(corpo?.imagens) ? corpo.imagens : [];
  if (!imagens.length) {
    res.status(400).json({ error: 'Nenhuma imagem recebida.' });
    return;
  }
  if (imagens.length > MAX_IMAGENS) {
    res.status(400).json({ error: `Máximo de ${MAX_IMAGENS} imagens por leitura.` });
    return;
  }
  if (imagens.some((imagem) => typeof imagem !== 'string' || !DATA_URL_IMAGEM.test(imagem))) {
    res.status(400).json({ error: 'Formato de imagem inválido. Use PNG, JPEG ou WebP.' });
    return;
  }
  const bytesTotal = imagens.reduce((total, imagem) => total + tamanhoBase64Aproximado(imagem), 0);
  if (bytesTotal > MAX_BYTES_IMAGENS) {
    res.status(413).json({ error: 'As imagens excedem o limite total de 3 MB.' });
    return;
  }

  try {
    const cota = await consumirCota(supabaseUrl, serviceKey, autenticacao.userId);
    if (!cota) {
      res.status(503).json({
        configured: false,
        motivo: 'Controle de cota da leitura por IA indisponível.',
      });
      return;
    }
    res.setHeader('X-RateLimit-Remaining', String(cota.restantes ?? 0));
    if (!cota.permitido) {
      const retry = Math.max(1, cota.tentar_novamente_em_s ?? 60);
      res.setHeader('Retry-After', String(retry));
      res.status(429).json({ error: 'Limite de leituras por IA atingido.' });
      return;
    }

    const bruto =
      provider === 'openai'
        ? await chamarOpenAI(apiKey, model, imagens)
        : await chamarAnthropic(apiKey, model, imagens);

    res.status(200).json({ configured: true, dados: filtrarCampos(bruto) });
  } catch (err) {
    console.error('[ler-acordo-imagem] provedor de visão falhou:', err);
    res.status(502).json({ error: 'Não foi possível processar as imagens pela IA.' });
  }
}

// Vercel: permite processar imagens maiores e dar tempo à IA responder.
export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};
