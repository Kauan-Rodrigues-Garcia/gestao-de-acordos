import { supabase } from '@/lib/supabase';
import type { DadosExtraidosAcordo } from './types';

const ENDPOINT_IA = '/api/ler-acordo-imagem';

/** Returns the current browser session token without ever exposing server keys. */
export async function obterTokenSessaoVisao(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

/** Calls the paid endpoint with the user's JWT. `fetchImpl` enables unit tests. */
export async function solicitarLeituraIa(
  imagens: string[],
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DadosExtraidosAcordo | null> {
  if (!accessToken) return null;

  const resp = await fetchImpl(ENDPOINT_IA, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ origem: 'bookplay', imagens }),
  });

  if (resp.status === 404 || resp.status === 501 || resp.status === 503) return null;
  // Auth/rate/provider errors all fall back to the local OCR. This endpoint is
  // an accelerator, never a hard dependency of agreement registration.
  if (resp.status === 401 || resp.status === 403 || resp.status === 429) return null;
  if (!resp.ok) throw new Error(`Falha na IA de visão (${resp.status}).`);

  const json = (await resp.json()) as {
    configured?: boolean;
    dados?: DadosExtraidosAcordo;
  };
  if (!json?.configured || !json.dados) return null;
  return json.dados;
}
