/**
 * Trava do Banco de Horas (18/11/2026).
 *
 * A aba entra na main, mas NÃO pode ser liberada para ninguém até haver
 * autorização. Enquanto `BANCO_HORAS_LIBERADO` for `false`, só o super_admin
 * vê o item do menu e abre a rota — nem o administrador (que teria por acesso
 * total), nem cargo com `ver_banco_horas` ligado no painel.
 *
 * Depois de liberada, só a liderança entra (decisão do usuário, 18/11/2026):
 * `CARGOS_DO_BANCO_HORAS`. Operador, ouvidoria, elite, RH e assistente ADM
 * ficam de fora de vez, mesmo com a chave ligada no painel ou por exceção da
 * pessoa. Para quem está na lista, quem decide continua sendo o painel
 * (`ver_banco_horas` e o alcance `banco_horas_escopo_*`).
 *
 * O banco tem a mesma regra (migration 20261118200000): `fn_banco_horas_cargo_passa`
 * nas portas de leitura e de gerência, e `fn_banco_horas_liberado()` como o
 * interruptor de lá. Para liberar, os DOIS lados mudam juntos: este valor vira
 * `true` e `fn_banco_horas_liberado()` passa a devolver `true`.
 *
 * LIBERADO em 19/11/2026 (autorização do Cleber): migration 20261119140000 vira
 * o interruptor do banco e liga `ver_banco_horas` + `banco_horas_escopo_setor`
 * no cargo `lider`. Travar de novo = os dois lados de volta para `false`.
 */
export const BANCO_HORAS_LIBERADO = true;

/** Os únicos cargos que podem ter o Banco de Horas depois de liberado. */
export const CARGOS_DO_BANCO_HORAS: readonly string[] = [
  'lider', 'gerencia', 'diretoria', 'administrador', 'super_admin',
];

/** Esta pessoa passa pela trava? (A chave e o alcance são conferidos à parte.) */
export function passaTravaBancoHoras(cargo: string | null | undefined): boolean {
  if (cargo === 'super_admin') return true;
  return BANCO_HORAS_LIBERADO && !!cargo && CARGOS_DO_BANCO_HORAS.includes(cargo);
}
