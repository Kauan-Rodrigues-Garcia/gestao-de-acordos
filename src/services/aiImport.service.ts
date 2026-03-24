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
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!supabaseAnonKey) {
    throw new Error('Variáveis do Supabase ausentes no ambiente.');
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  const invoke = async (authorization: string | undefined) => {
    return await supabase.functions.invoke('ai-normalize-import', {
      body: { rows, todayISO },
      headers: {
        apikey: supabaseAnonKey,
        ...(authorization ? { Authorization: authorization } : {}),
      },
    });
  };

  const primaryAuth = accessToken ? `Bearer ${accessToken}` : undefined;
  const fallbackAuth = `Bearer ${supabaseAnonKey}`;

  let res = await invoke(primaryAuth);
  if (res.error) {
    const msg = String((res.error as unknown as { message?: string })?.message || '');
    const shouldRetry =
      msg.toLowerCase().includes('invalid jwt') ||
      msg.toLowerCase().includes('unauthorized') ||
      msg.toLowerCase().includes('jwt');

    if (shouldRetry) res = await invoke(fallbackAuth);
  }

  if (res.error) throw res.error;
  return res.data as AINormalizeResponse;
}

