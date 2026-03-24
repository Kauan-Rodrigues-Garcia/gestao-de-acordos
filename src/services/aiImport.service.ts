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
  const getStatus = (err: unknown): number | null => {
    const e = err as Record<string, unknown> | null;
    const context = (e && (e as any).context) || null;
    const status = context && typeof (context as any).status === 'number' ? (context as any).status : null;
    return status;
  };

  const invokeDefault = async () => {
    return await supabase.functions.invoke('ai-normalize-import', {
      body: { rows, todayISO, prompt },
    });
  };

  const session = (await supabase.auth.getSession()).data.session;
  if (!session) {
    throw new Error('Você precisa estar logado para usar a IA. Faça login novamente.');
  }

  let res = await invokeDefault();

  if (res.error) {
    const status = getStatus(res.error);
    const msg = String((res.error as unknown as { message?: string })?.message || '').toLowerCase();
    const isAuthProblem =
      status === 401 ||
      msg.includes('invalid jwt') ||
      msg.includes('jwt') ||
      msg.includes('unauthorized') ||
      msg.includes('401');

    if (isAuthProblem) {
      await supabase.auth.refreshSession().catch(() => null);
      const refreshed = (await supabase.auth.getSession()).data.session;
      if (!refreshed) {
        await supabase.auth.signOut().catch(() => null);
        throw new Error('Sessão inválida. Faça login novamente para usar a IA.');
      }

      res = await invokeDefault();
    }

    if (res.error && isAuthProblem) {
      await supabase.auth.signOut().catch(() => null);
      throw new Error('Sessão inválida. Faça login novamente para usar a IA.');
    }
  }

  if (res.error) throw res.error;
  return res.data as AINormalizeResponse;
}

