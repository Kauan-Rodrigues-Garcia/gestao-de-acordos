/**
 * Crachá pendente — o cartão que pede o número do crachá a quem ainda não tem
 * um cadastrado (26/10/2026; no molde da pesquisa de experiência).
 *
 * O número vai para `rh_dados_operadores`, a mesma linha que Premiações e
 * Comissões (Fechamento) e o RH Gestão leem: preencheu aqui, aparece lá.
 * A pessoa só preenche — trocar um crachá já cadastrado continua com o RH.
 * Banco: migration 20261026160000.
 */
// As funções são novas (20261026160000) e ainda não estão nos tipos gerados.
import { rpcSemTipo } from '@/lib/supabaseSemTipo';

/** O crachá tem até 8 números; quem tem menos também preenche. */
export const DIGITOS_CRACHA = 8;

/** Quanto tempo de uso antes de o cartão aparecer. */
export const ESPERA_ANTES_DE_PEDIR_MS = 60_000;

/** `?previa-cracha` na URL abre o cartão na hora, sem gravar nada. */
export function pediuPreviaCrachaNaUrl(busca: string = window.location.search): boolean {
  return new URLSearchParams(busca).has('previa-cracha');
}

/** Só os números, no máximo 8 — o que a pessoa colar ou digitar. */
export function limparCracha(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, DIGITOS_CRACHA);
}

export function crachaCompleto(texto: string): boolean {
  return new RegExp(`^\\d{1,${DIGITOS_CRACHA}}$`).test(texto);
}

export async function lerTemCracha(): Promise<boolean> {
  const { data, error } = await rpcSemTipo<{ tem_cracha?: boolean }>('fn_meu_cracha_estado', {});
  if (error) throw new Error(error.message);
  return !!data?.tem_cracha;
}

export async function salvarMeuCracha(cracha: string): Promise<void> {
  const { error } = await rpcSemTipo('fn_meu_cracha_salvar', { p_cracha: cracha });
  if (error) throw new Error(error.message);
}

/** «Ana Paula Souza» → «Ana». */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? '';
}

/** «Ana Paula Souza» → «AS». */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '';
  const ultima = partes.length > 1 ? partes[partes.length - 1] : '';
  return (partes[0][0] + (ultima[0] ?? '')).toUpperCase();
}
