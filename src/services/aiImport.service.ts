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

/**
 * Obtém um access_token fresco, priorizando refreshSession para evitar tokens
 * expirados que ainda estejam no cache do Supabase client.
 */
async function getFreshAccessToken(): Promise<string> {
  // Tenta refresh primeiro — garante token novo do servidor
  const { data: refreshData, error: refreshError } =
    await supabase.auth.refreshSession();

  if (!refreshError && refreshData.session?.access_token) {
    return refreshData.session.access_token;
  }

  // Fallback: tenta pegar a sessão do cache (pode estar válida)
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.access_token) {
    return sessionData.session.access_token;
  }

  throw new Error('Sessão expirada. Faça login novamente.');
}

/**
 * Invoca a Edge Function ai-normalize-import com token explícito no header.
 * Se receber 401, tenta uma vez mais após forçar refresh da sessão.
 */
export async function aiNormalizeImport(
  rows: unknown[][],
  todayISO: string,
  prompt?: string,
): Promise<AINormalizeResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const token = await getFreshAccessToken();

      const { data, error } = await supabase.functions.invoke(
        'ai-normalize-import',
        {
          body: { rows, todayISO, prompt },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (error) {
        // Se for erro HTTP 401, tenta novamente (o loop fará refresh)
        const is401 =
          (error as any)?.status === 401 ||
          (error as any)?.context?.status === 401 ||
          (error.message && /401|unauthorized/i.test(error.message));

        if (is401 && attempt === 0) {
          console.warn('[aiImport] 401 na tentativa 1, forçando refresh e retentando...');
          lastError = error;
          continue;
        }

        throw error;
      }

      return data as AINormalizeResponse;
    } catch (err) {
      lastError = err;

      // Se for 401 na primeira tentativa, continua o loop para retry
      const msg = err instanceof Error ? err.message : String(err);
      if (/401|unauthorized/i.test(msg) && attempt === 0) {
        console.warn('[aiImport] Erro 401, retentando com token novo...');
        continue;
      }

      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Erro ao organizar com IA. Tente novamente.');
}

