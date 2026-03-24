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
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const anonLooksJwt = typeof supabaseAnonKey === 'string' && supabaseAnonKey.startsWith('eyJ');
  if (!supabaseAnonKey) throw new Error('Variáveis do Supabase ausentes no ambiente.');

  const invoke = async (authorization: string | undefined) => {
    return await supabase.functions.invoke('ai-normalize-import', {
      body: { rows, todayISO, prompt },
      headers: authorization ? { Authorization: authorization } : {},
    });
  };

  const session = (await supabase.auth.getSession()).data.session;
  const primaryAuth = session?.access_token ? `Bearer ${session.access_token}` : undefined;
  const fallbackAuth = anonLooksJwt ? `Bearer ${supabaseAnonKey}` : undefined;

  let res = await invoke(primaryAuth || fallbackAuth);

  if (res.error) {
    const msg = String((res.error as unknown as { message?: string })?.message || '').toLowerCase();
    const shouldRefresh =
      msg.includes('invalid jwt') || msg.includes('jwt') || msg.includes('unauthorized') || msg.includes('401');

    if (shouldRefresh) {
      await supabase.auth.refreshSession().catch(() => null);
      const refreshed = (await supabase.auth.getSession()).data.session;
      const refreshedAuth = refreshed?.access_token ? `Bearer ${refreshed.access_token}` : undefined;
      res = await invoke(refreshedAuth || fallbackAuth);
    }

    if (res.error && fallbackAuth && primaryAuth) {
      res = await invoke(fallbackAuth);
    }

    if (res.error && shouldRefresh) {
      await supabase.auth.signOut().catch(() => null);
      throw new Error('Sessão inválida. Faça login novamente para usar a IA.');
    }
  }

  if (res.error) throw res.error;
  return res.data as AINormalizeResponse;
}

