import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AIConfig = {
  enabled: boolean;
  model: string;
  temperature: number;
  max_rows: number;
  max_cols: number;
  prompt_system: string;
};

type NormalizeRequest = {
  rows: unknown[][];
  todayISO?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function clampNum(n: unknown, min: number, max: number, fallback: number) {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function safeCell(v: unknown) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > 80 ? s.slice(0, 80) : s;
}

function truncateRows(rows: unknown[][], maxRows: number, maxCols: number) {
  const out: string[][] = [];
  const rCount = Math.min(rows.length, maxRows);
  for (let i = 0; i < rCount; i++) {
    const row = Array.isArray(rows[i]) ? rows[i] : [];
    const cCount = Math.min(row.length, maxCols);
    const line: string[] = [];
    for (let j = 0; j < cCount; j++) line.push(safeCell(row[j]));
    out.push(line);
  }
  return out;
}

function rowsToTSV(rows: string[][]) {
  return rows
    .map((r, idx) => `${idx + 1}\t${r.map(c => c.replace(/\t/g, ' ')).join('\t')}`)
    .join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return json({ error: 'Configuração do Supabase ausente no ambiente.' }, 500);
  }
  if (!openaiKey) {
    return json({ error: 'OPENAI_API_KEY não configurada no Supabase (Secrets).' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (authHeader) {
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    await supabaseUser.auth.getUser().catch(() => null);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: cfgRow, error: cfgErr } = await supabaseAdmin
    .from('ai_config')
    .select('enabled, model, temperature, max_rows, max_cols, prompt_system')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cfgErr || !cfgRow) return json({ error: 'Configuração de IA não encontrada.' }, 400);

  const cfg: AIConfig = {
    enabled: Boolean(cfgRow.enabled),
    model: String(cfgRow.model || 'gpt-4o-mini'),
    temperature: clampNum(cfgRow.temperature, 0, 2, 0.2),
    max_rows: clampInt(cfgRow.max_rows, 10, 200, 120),
    max_cols: clampInt(cfgRow.max_cols, 5, 30, 20),
    prompt_system: String(cfgRow.prompt_system || ''),
  };

  if (!cfg.enabled) return json({ error: 'IA desabilitada nas configurações.' }, 400);

  let body: NormalizeRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body inválido (JSON).' }, 400);
  }

  if (!body?.rows || !Array.isArray(body.rows)) return json({ error: 'rows é obrigatório.' }, 400);

  const todayISO = String(body.todayISO || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const safe = truncateRows(body.rows, cfg.max_rows, cfg.max_cols);
  const tsv = rowsToTSV(safe);

  const userPrompt = [
    `Você receberá uma planilha (TSV) com linhas numeradas (primeira coluna = número da linha).`,
    `Extraia registros de acordos financeiros e normalize os campos.`,
    ``,
    `Regras:`,
    `- Responda APENAS com um objeto JSON válido no formato {"records":[...], "notes":[...]}.`,
    `- Cada record deve conter: linhaOriginal (number), nome_cliente (string|null), nr_cliente (string|null), vencimento (YYYY-MM-DD|null), valor (number|null), whatsapp (string|null), status (string|null), tipo (string|null), parcelas (number|null), observacoes (string|null), instituicao (string|null).`,
    `- Se um campo não estiver claro, use null (não invente).`,
    `- status deve preferir: pendente, pago, verificar, vencido, cancelado, em_acompanhamento.`,
    `- tipo deve preferir: boleto, pix, cartao.`,
    `- valor deve ser número (ex: 1234.56).`,
    `- Se houver uma data do bloco aplicável, use como vencimento quando não existir data por linha.`,
    `- Use ${todayISO} como referência de “hoje”.`,
    ``,
    `TSV:`,
    tsv,
  ].join('\n');

  const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: cfg.temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: cfg.prompt_system },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  const payload = await openaiResp.json().catch(() => null);
  if (!openaiResp.ok) {
    return json(
      {
        error: 'Falha ao consultar OpenAI.',
        details: payload?.error?.message ?? payload ?? null,
      },
      502,
    );
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') return json({ error: 'Resposta inválida da OpenAI.' }, 502);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return json({ error: 'OpenAI não retornou JSON válido.' }, 502);
  }

  return json(parsed, 200);
});

