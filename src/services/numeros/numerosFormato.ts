/**
 * numerosFormato.ts — o número de WhatsApp em uma forma só.
 *
 * ## Por que normalizar é a regra central, e não detalhe de tela
 *
 * O pedido diz que o mesmo número não pode ser cadastrado duas vezes, e quem
 * cumpre isso é `UNIQUE (empresa_id, numero)` no banco. Só que um índice único
 * compara TEXTO: `(18) 99999-9999` e `18999999999` são duas strings diferentes,
 * e o banco gravaria as duas sem reclamar.
 *
 * Então a máscara nunca chega ao banco. O que se grava é sempre o resultado de
 * `normalizarNumero`: só dígitos, sem código de país. A máscara existe na
 * exibição, e só ali.
 *
 * ## O que NÃO se valida, e por quê
 *
 * O nono dígito. A regra brasileira diz que celular começa com 9 depois do DDD,
 * mas estes números são comprados por site, com DDD aleatório, e recusar um
 * número que existe de verdade por causa de uma regra de formato é pior do que
 * aceitar um número torto: o torto alguém corrige quando percebe; o recusado
 * trava a operação sem explicação convincente.
 *
 * Pelo mesmo motivo não há lista de DDDs válidos. A faixa 11–99 recusa o que é
 * impossível (DDD nunca começa com 0 ou 1x abaixo de 11) e aceita o resto.
 *
 * Módulo puro, sem React e sem Supabase — como `cpf.ts` e `money.ts`. As mesmas
 * respostas valem no diálogo de cadastro, no serviço e no teste.
 */

/** Menor DDD que existe no Brasil. */
const DDD_MIN = 11;
/** Maior DDD possível. Não há 100. */
const DDD_MAX = 99;

/** Fixo com DDD. */
const DIGITOS_FIXO = 10;
/** Celular com DDD e o nono dígito. */
const DIGITOS_CELULAR = 11;

/** Código do Brasil, quando o número vem copiado de fora com `+55`. */
const CODIGO_PAIS = '55';

/**
 * Só os dígitos, e sem o `55` do país quando ele sobra.
 *
 * A retirada do `55` acontece apenas em 12 ou 13 dígitos, e essa condição é o
 * que separa país de DDD: `55999998888` tem 11 dígitos e é um celular de Santa
 * Maria (DDD 55) já pronto. Cortar ali transformaria um número legítimo do Rio
 * Grande do Sul em outro número — o tipo de erro que só aparece quando alguém
 * reclama que a mensagem foi para a pessoa errada.
 */
export function normalizarNumero(valor: unknown): string {
  const digitos = String(valor ?? '').replace(/\D/g, '');

  const temPais = digitos.startsWith(CODIGO_PAIS)
    && (digitos.length === DIGITOS_FIXO + 2 || digitos.length === DIGITOS_CELULAR + 2);

  return temPais ? digitos.slice(CODIGO_PAIS.length) : digitos;
}

/** O DDD do número já normalizado. `0` quando não há dígito suficiente. */
function dddDe(normalizado: string): number {
  return Number(normalizado.slice(0, 2) || 0);
}

/** O número serve para cadastrar? Aceita valor mascarado — normaliza antes. */
export function numeroValido(valor: unknown): boolean {
  return erroDoNumero(valor) === null;
}

/**
 * O que há de errado com este número, na frase que a tela mostra.
 *
 * Devolve `null` quando não há nada de errado. Uma função só para a mensagem e
 * a decisão nunca discordarem: `numeroValido` é esta mesma função perguntando
 * se houve erro.
 */
export function erroDoNumero(valor: unknown): string | null {
  const numero = normalizarNumero(valor);

  if (numero.length === 0) {
    return 'Informe o número de WhatsApp.';
  }
  if (numero.length !== DIGITOS_FIXO && numero.length !== DIGITOS_CELULAR) {
    return 'O número precisa ter 10 ou 11 dígitos, contando o DDD.';
  }

  const ddd = dddDe(numero);
  if (ddd < DDD_MIN || ddd > DDD_MAX) {
    return `DDD inválido. Use um DDD entre ${DDD_MIN} e ${DDD_MAX}.`;
  }

  return null;
}

/**
 * O número como a pessoa lê: `(18) 99999-9999`.
 *
 * Número que não dá para formatar volta como veio. Esconder um valor torto é
 * pior do que exibi-lo torto — escondido, ninguém corrige.
 */
export function mascararNumero(valor: unknown): string {
  const numero = normalizarNumero(valor);
  const ddd = numero.slice(0, 2);
  const resto = numero.slice(2);

  if (numero.length === DIGITOS_CELULAR) {
    return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
  }
  if (numero.length === DIGITOS_FIXO) {
    return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
  }

  return String(valor ?? '');
}
