import { supabase } from '@/lib/supabase';

export interface LocalizacaoIp {
  ip: string;
  cidade: string | null;
  estado: string | null;
  estadoCodigo: string | null;
  pais: string | null;
  paisCodigo: string | null;
  consultadoEm: string | null;
  aproximada: true;
}

export type LocalizacoesPorIp = Record<string, LocalizacaoIp>;

export async function buscarLocalizacoesIps(ips: readonly string[]): Promise<LocalizacoesPorIp> {
  const unicos = [...new Set(ips.map(ip => ip.trim()).filter(Boolean))];
  if (unicos.length === 0) return {};

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};

    const resultado: LocalizacoesPorIp = {};
    for (let inicio = 0; inicio < unicos.length; inicio += 25) {
      const resposta = await fetch('/api/localizar-ips', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ips: unicos.slice(inicio, inicio + 25) }),
      });
      if (!resposta.ok) continue;
      const corpo = await resposta.json() as { localizacoes?: LocalizacaoIp[] };
      for (const localizacao of corpo.localizacoes ?? []) {
        resultado[localizacao.ip] = localizacao;
      }
    }
    return resultado;
  } catch {
    // Localização é enriquecimento: falhar não pode esconder nem bloquear logs.
    return {};
  }
}

export function rotuloLocalizacaoIp(localizacao: LocalizacaoIp | undefined): string | null {
  if (!localizacao) return null;
  const estado = localizacao.estadoCodigo || localizacao.estado;
  return [localizacao.cidade, estado].filter(Boolean).join(', ')
    || localizacao.pais
    || null;
}
