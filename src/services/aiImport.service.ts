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

function getErrorStatus(err: unknown): number | null {
  const e = err as Record<string, unknown> | null;
  const context = (e && (e as any).context) || null;
  const status = context && typeof (context as any).status === 'number' ? (context as any).status : null;
  return status;
}

async function getAccessTokenEnsuringFreshness(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (!s?.access_token) {
    throw new Error('Sua sessão expirou. Entre novamente para usar a organização com IA.');
  }

  const expiresAt = typeof s.expires_at === 'number' ? s.expires_at : null;
  const now = Math.floor(Date.now() / 1000);

  if (expiresAt && expiresAt - now <= 60) {
    const refreshed = await supabase.auth.refreshSession().catch(() => null);
    const s2 = refreshed?.data?.session ?? (await supabase.auth.getSession()).data.session;
    if (!s2?.access_token) {
      throw new Error('Sua sessão expirou. Entre novamente para usar a organização com IA.');
    }
    return s2.access_token;
  }

  return s.access_token;
}

export async function aiNormalizeImport(
  rows: unknown[][],
  todayISO: string,
  prompt?: string,
): Promise<AINormalizeResponse> {
  const invokeWithToken = async (accessToken: string) => {
    return await supabase.functions.invoke('ai-normalize-import', {
      body: { rows, todayISO, prompt },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  };

  let token = await getAccessTokenEnsuringFreshness();
  let res = await invokeWithToken(token);

  if (res.error) {
    const status = getErrorStatus(res.error);
    const msg = String((res.error as unknown as { message?: string })?.message || '').toLowerCase();
    const isAuthProblem =
      status === 401 ||
      msg.includes('invalid jwt') ||
      msg.includes('jwt') ||
      msg.includes('unauthorized') ||
      msg.includes('401');

    if (isAuthProblem) {
      await supabase.auth.refreshSession().catch(() => null);
      token = await getAccessTokenEnsuringFreshness();
      res = await invokeWithToken(token);
    }
  }

  if (res.error) {
    const status = getErrorStatus(res.error);
    const msg = String((res.error as unknown as { message?: string })?.message || '').toLowerCase();
    const isAuthProblem =
      status === 401 ||
      msg.includes('invalid jwt') ||
      msg.includes('jwt') ||
      msg.includes('unauthorized') ||
      msg.includes('401');

    if (isAuthProblem) {
      throw new Error('Sua sessão expirou. Entre novamente para usar a organização com IA.');
    }
    throw res.error;
  }

  return res.data as AINormalizeResponse;
}

