import { supabase } from '@/lib/supabase';

export type AINormalizedRecord = {
  linhaOriginal: number;
  nome_cliente: string | null;
  nr_cliente: string | null;
  vencimento: string | null;
  valor: number | null;
  whatsapp: string | null;
  status: string | null;
  tipo: string | null;
  parcelas: number | null;
  observacoes: string | null;
  instituicao: string | null;
};

export type AINormalizeResponse = {
  records: AINormalizedRecord[];
  notes?: string[];
};

export async function aiNormalizeImport(rows: unknown[][], todayISO: string): Promise<AINormalizeResponse> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Sessão inválida. Faça login novamente para usar a IA.');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Variáveis do Supabase ausentes no ambiente.');
  }

  const resp = await fetch(`${supabaseUrl}/functions/v1/ai-normalize-import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ rows, todayISO }),
  });

  const payload = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg =
      payload?.error ||
      payload?.message ||
      (typeof payload === 'string' ? payload : null) ||
      `Edge Function retornou ${resp.status}`;
    throw new Error(msg);
  }

  return payload as AINormalizeResponse;
}

