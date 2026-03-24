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
  const { data, error } = await supabase.functions.invoke('ai-normalize-import', {
    body: { rows, todayISO },
  });

  if (error) throw error;
  return data as AINormalizeResponse;
}

