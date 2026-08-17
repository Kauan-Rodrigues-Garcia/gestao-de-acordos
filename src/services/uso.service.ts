/**
 * uso.service.ts — leitura e escrita do monitoramento de uso.
 *
 * A escrita passa por `fn_uso_registrar`, que resolve a identidade de
 * `auth.uid()`: nada aqui manda quem é o usuário. `uso_telas` não tem policy de
 * INSERT/UPDATE, então este é o único caminho — um painel de uso que aceitasse
 * números vindos do cliente sem amarra não mediria nada.
 *
 * A leitura passa por RPCs que agregam no banco. 180 dias de retenção dão
 * ~97 mil linhas; trazer isso para o navegador a cada abertura do painel seriam
 * megabytes para exibir vinte linhas.
 */

import { supabase } from '@/lib/supabase';

export interface UsoPorPessoa {
  usuario_id:   string;
  nome:         string;
  cargo:        string | null;
  aberturas:    number;
  segundos:     number;
  dias_ativos:  number;
  telas_usadas: number;
  ultimo_em:    string | null;
}

export interface UsoPorTela {
  tela:      string;
  aberturas: number;
  segundos:  number;
  pessoas:   number;
}

export interface UsoPorDia {
  dia:       string;
  aberturas: number;
  segundos:  number;
  pessoas:   number;
}

export interface AdocaoTela {
  usuario_id: string;
  nome:       string;
  cargo:      string | null;
  aberturas:  number;
  segundos:   number;
  ultimo_em:  string | null;
}

export interface JanelaUso {
  empresaId: string;
  /** 'yyyy-MM-dd' */
  desde: string;
  ate:   string;
  /** Cargo a isolar. `null` = todos. */
  cargo?: string | null;
}

/**
 * Soma uso da tela para o usuário da sessão.
 *
 * Nunca estoura: é chamada de dentro de um efeito de navegação, e derrubar a
 * tela por causa de telemetria seria trocar um dado gerencial por um defeito de
 * produto. Falha vira aviso no console e nada mais.
 */
export async function registrarUso(
  tela: string, segundos: number, abertura: boolean,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('fn_uso_registrar', {
      p_tela: tela,
      p_segundos: Math.max(0, Math.round(segundos)),
      p_abertura: abertura,
    });
    if (error) console.warn('[uso.service] registrarUso:', error.message);
  } catch (e) {
    console.warn('[uso.service] registrarUso:', e instanceof Error ? e.message : e);
  }
}

/**
 * Nomes aceitos por `ler`.
 *
 * União fechada, e não `string`: o cliente do Supabase tipa `rpc()` pelo catálogo
 * de funções, e aceitar `string` aqui desligaria essa checagem para as quatro
 * chamadas — um nome errado de RPC só apareceria em produção, como lista vazia.
 */
type RpcLeituraUso =
  | 'fn_uso_por_pessoa'
  | 'fn_uso_por_tela'
  | 'fn_uso_por_dia'
  | 'fn_uso_adocao_tela';

/** Chamada comum das quatro RPCs de leitura. Erro vira lista vazia. */
async function ler<T>(
  rpc: RpcLeituraUso, janela: JanelaUso, extra: Record<string, unknown> = {},
): Promise<T[]> {
  try {
    const { data, error } = await supabase.rpc(rpc, {
      p_empresa_id: janela.empresaId,
      p_desde: janela.desde,
      p_ate:   janela.ate,
      p_cargo: janela.cargo ?? null,
      ...extra,
    });
    if (error) {
      console.warn(`[uso.service] ${rpc}:`, error.message);
      return [];
    }
    return (data as T[]) ?? [];
  } catch (e) {
    console.warn(`[uso.service] ${rpc}:`, e instanceof Error ? e.message : e);
    return [];
  }
}

export function buscarUsoPorPessoa(j: JanelaUso): Promise<UsoPorPessoa[]> {
  return ler<UsoPorPessoa>('fn_uso_por_pessoa', j);
}

export function buscarUsoPorTela(j: JanelaUso): Promise<UsoPorTela[]> {
  return ler<UsoPorTela>('fn_uso_por_tela', j);
}

export function buscarUsoPorDia(j: JanelaUso): Promise<UsoPorDia[]> {
  return ler<UsoPorDia>('fn_uso_por_dia', j);
}

/**
 * Uso de UMA tela, incluindo quem não a usou.
 *
 * É a consulta que responde a pergunta que originou o painel. O achado útil não
 * é o ranking de quem abre — é a lista de quem NUNCA abriu, e essa lista não
 * existe dentro de `uso_telas`, porque quem não usou não tem linha.
 */
export function buscarAdocaoTela(j: JanelaUso, tela: string): Promise<AdocaoTela[]> {
  return ler<AdocaoTela>('fn_uso_adocao_tela', j, { p_tela: tela });
}
