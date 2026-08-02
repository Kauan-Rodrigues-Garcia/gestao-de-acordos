/**
 * cpf.ts — reconhecer um CPF onde ele não deveria estar.
 *
 * A diretoria fixou em 28/07/2026 que nenhum CPF de cliente fica no banco
 * (migration 20260728b removeu as colunas que existiam). Mas o campo de código
 * do acordo é texto livre, e um operador digitou o CPF do cliente ali — dado
 * pessoal entrando por uma porta que ninguém estava olhando.
 *
 * ## Por que validar o dígito verificador, e não só "tem 11 dígitos"
 *
 * Bloquear todo valor de 11 dígitos seria mais simples e pegaria mais casos —
 * mas bloqueia trabalho legítimo se algum código do ERP tiver esse tamanho, e
 * um bloqueio falso é pior que uma passagem falsa: o operador não consegue
 * tabular e não entende por quê.
 *
 * Conferindo os dígitos verificadores, a chance de um número qualquer de 11
 * dígitos ser confundido com CPF é ~1%. E os códigos reais que o ERP emite
 * (conferidos nos relatórios de julho/2026 das duas empresas) têm 7 ou 8
 * dígitos — bem longe da faixa. O preço é deixar passar um CPF digitado com
 * erro de digitação, que também não é um código válido e cai nas outras
 * checagens.
 */

/** Só os dígitos — o valor pode vir como `123.456.789-09`, com espaços etc. */
export function apenasDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/**
 * Calcula um dígito verificador de CPF.
 * `pesoInicial` é 10 para o primeiro dígito e 11 para o segundo.
 */
function digitoVerificador(digitos: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < pesoInicial - 1; i++) {
    soma += Number(digitos[i]) * (pesoInicial - i);
  }
  const resto = (soma * 10) % 11;
  // 10 e 11 viram 0 — é a regra da Receita, não um arredondamento.
  return resto >= 10 ? 0 : resto;
}

/**
 * O valor é um CPF válido?
 *
 * Aceita com ou sem máscara. Sequências de um dígito só (`111.111.111-11`)
 * passam na conta dos verificadores e por isso são recusadas à parte — é o
 * caso clássico que deixa um validador ingênuo aprovar um CPF impossível.
 */
export function ehCpf(valor: unknown): boolean {
  const d = apenasDigitos(valor);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  return digitoVerificador(d, 10) === Number(d[9])
      && digitoVerificador(d, 11) === Number(d[10]);
}

/** Mensagem única para as telas — a mesma frase em todos os formulários. */
export const ERRO_CPF_NO_CODIGO =
  'Esse número é um CPF. Use o código do cliente no ERP — CPF não pode ser gravado no sistema.';
