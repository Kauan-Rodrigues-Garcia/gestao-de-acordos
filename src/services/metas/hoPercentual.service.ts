/**
 * hoPercentual.service.ts — grava o percentual de H.O. da empresa.
 *
 * Mora em `empresas.config.ho_percentual`. A escrita passa por
 * `fn_empresa_definir_ho_percentual` (migration 20260929030000), que confere
 * `metas_editar` e o intervalo — `empresas` não é tabela que o navegador
 * atualiza direto.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

/** «22,60» ou «22.6» → 0,2260. `null` quando não é um percentual válido. */
export function lerPercentualDigitado(texto: string): number | null {
  const limpo = texto.replace('%', '').replace(/\s/g, '').replace(',', '.');
  if (!limpo) return null;
  const n = Number(limpo);
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
  return Math.round(n * 100) / 10000;
}

/** 0,2260 → «22,60». */
export function percentualParaCampo(fracao: number): string {
  return (fracao * 100).toFixed(2).replace('.', ',');
}

export async function definirHoPercentual(
  empresaId: string,
  fracao: number,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { error } = await rpcSemTipo('fn_empresa_definir_ho_percentual', {
    p_empresa_id: empresaId,
    p_percentual: fracao,
  });
  if (!error) return { ok: true };
  if (/fn_empresa_definir_ho_percentual|schema cache|does not exist/i.test(error.message)) {
    return { ok: false, erro: 'O campo ainda não está no banco (migration 20260929030000).' };
  }
  return { ok: false, erro: error.message.replace(/^[A-Z_]+:\s*/, '') };
}
