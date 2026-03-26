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

export async function aiNormalizeImport(
  rows: unknown[][],
  todayISO: string,
  prompt?: string,
): Promise<AINormalizeResponse> {
  // Garante que o token de acesso está válido antes de invocar a Edge Function.
  // O gateway do Supabase valida o JWT antes de encaminhar a requisição, por isso
  // um token expirado resulta em 401 antes mesmo de o código da função executar.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !sessionData.session) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshData.session) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }
  }

  const { data, error } = await supabase.functions.invoke('ai-normalize-import', {
    body: { rows, todayISO, prompt },
  });

  if (error) {
    throw error;
  }

  return data as AINormalizeResponse;
}

