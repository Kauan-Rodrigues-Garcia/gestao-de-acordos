/**
 * De que empresa a pessoa sai e para qual ela vai, numa transferência.
 *
 * ## Por que não é a empresa da tela
 *
 * Desde o Usuários 2.0 (04/10/2026) a lista da cobrança junta BookPlay e
 * PaguePlay, e o seletor de setor do `DialogTransferencia` mostra os setores
 * das duas. O diálogo tomava a empresa aberta na tela como origem E destino:
 * escolher o Conecta Play (PaguePlay) para alguém do Play 5 (BookPlay) virava
 * uma troca de SETOR, o UPDATE gravava só o `setor_id`, e a FK composta
 * `perfis_setor_da_empresa_fkey` (20261002210000) recusava com 409 — o caso da
 * Layane Brito, 08/10/2026.
 *
 * Quem diz a empresa é o dado, não a tela: a de origem é a do perfil, e a de
 * destino é a do setor escolhido.
 */
import type { Perfil, Setor } from '@/lib/supabase';

/** A empresa de onde a pessoa sai: a do perfil dela. */
export function empresaDeOrigem(
  perfil: Pick<Perfil, 'empresa_id'>, empresaDaTela: string,
): string {
  return perfil.empresa_id || empresaDaTela;
}

/**
 * A empresa para onde a pessoa vai: a do setor escolhido. Sem setor (ou setor
 * sem `empresa_id`), a escolhida no campo Empresa, e por fim a da tela.
 */
export function empresaDoDestino(
  setor: Pick<Setor, 'empresa_id'> | null | undefined,
  empresaEscolhida: string | null | undefined,
  empresaDaTela: string,
): string {
  return setor?.empresa_id || empresaEscolhida || empresaDaTela;
}

/** Os setores da lista vêm de mais de uma empresa? Então o nome precisa dela. */
export function setoresDeVariasEmpresas(setores: Pick<Setor, 'empresa_id'>[]): boolean {
  return new Set(setores.map(s => s.empresa_id).filter(Boolean)).size > 1;
}
