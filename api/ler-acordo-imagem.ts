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

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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

  const corpo = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Corpo;
  const imagens = Array.isArray(corpo?.imagens) ? corpo.imagens.filter((s) => typeof s === 'string') : [];
  if (!imagens.length) {
    res.status(400).json({ error: 'Nenhuma imagem recebida.' });
    return;
  }
  if (imagens.length > 5) {
    res.status(400).json({ error: 'Máximo de 5 imagens por leitura.' });
    return;
  }

  try {
    const bruto =
      provider === 'openai'
        ? await chamarOpenAI(apiKey, model, imagens)
        : await chamarAnthropic(apiKey, model, imagens);

    res.status(200).json({ configured: true, dados: filtrarCampos(bruto) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao consultar a IA.';
    res.status(502).json({ error: msg });
  }
}

// Vercel: permite processar imagens maiores e dar tempo à IA responder.
export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
  maxDuration: 30,
};
