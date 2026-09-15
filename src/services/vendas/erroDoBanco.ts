/**
 * erroDoBanco.ts — o que o PostgREST está dizendo, de verdade.
 *
 * ## Por que isto virou um módulo
 *
 * A mesma função existia copiada em três serviços de Vendas, e as três estavam
 * erradas do mesmo jeito:
 *
 *     /relation|does not exist|schema cache|could not find/i
 *
 * Em 15/09/2026 a tela de Importar Vendas passou horas dizendo «a migration
 * 20260915110000 precisa ser aplicada» com a migration **já aplicada**. O erro
 * verdadeiro era outro:
 *
 *     Could not find a relationship between 'vendas_lotes' and 'perfis'
 *     in the schema cache
 *
 * `vendas_lotes.importado_por` tinha nascido sem FOREIGN KEY, e o PostgREST
 * monta os joins da API a partir das FKs. A mensagem cita «could not find» e
 * «schema cache» — as duas coisas que o regex procurava — então a tela concluiu
 * «tabela não existe» e mandou procurar no lugar errado.
 *
 * **Vínculo que falta não é tabela que falta.** Um diz «aplique a migration»; o
 * outro, «falta uma FK». Confundir os dois custa mais caro do que não ter
 * mensagem nenhuma: erro que aponta para o lugar errado faz a pessoa mexer no
 * que estava certo.
 */

/** O que o banco respondeu, traduzido para o que é preciso fazer. */
export type TipoDeErro =
  /** A tabela ou função não existe. A migration não foi aplicada. */
  | 'ausente'
  /** Falta uma FOREIGN KEY para o join que a consulta pediu. */
  | 'sem_vinculo'
  /** O desenho mudou e o PostgREST ainda não recarregou. */
  | 'cache'
  /** Qualquer outra coisa — mostra-se como veio. */
  | 'outro';

/**
 * A ordem das perguntas importa, e é do mais específico para o mais genérico.
 *
 * «Could not find a relationship» contém «could not find» e «schema cache».
 * Perguntar por ela primeiro é o que impede que ela caia em `ausente`, que foi
 * exatamente o defeito.
 */
export function classificarErro(mensagem: string | null | undefined): TipoDeErro {
  const m = String(mensagem ?? '');
  if (m.trim() === '') return 'outro';

  if (/could not find a relationship/i.test(m)) return 'sem_vinculo';

  if (/relation .*does not exist/i.test(m)) return 'ausente';
  if (/could not find the (table|function|column)/i.test(m)) return 'ausente';

  // Sobrou «schema cache» sem dizer o que faltou: é o cache mesmo.
  if (/schema cache/i.test(m)) return 'cache';

  return 'outro';
}

/**
 * A tela deve dizer «não instalado»?
 *
 * Só quando a tabela realmente não existe. Cache é coisa de recarregar; falta
 * de vínculo é defeito de constraint, e as duas pedem outra frase.
 */
export function pareceNaoInstalado(mensagem: string | null | undefined): boolean {
  return classificarErro(mensagem) === 'ausente';
}

/**
 * A mensagem para quem está olhando a tela.
 *
 * `assunto` é o nome da coisa que não respondeu («A importação de vendas»), e
 * `migration` o arquivo a conferir quando for o caso.
 */
export function mensagemDoErro(
  mensagem: string | null | undefined,
  assunto: string,
  migration?: string,
): string {
  switch (classificarErro(mensagem)) {
    case 'ausente':
      return `${assunto} não existe neste banco.`
        + (migration ? ` A migration \`${migration}\` precisa ser aplicada.` : '');
    case 'cache':
      return `${assunto} acabou de ser criada e a API ainda não a enxerga. `
        + 'Recarregue a página em alguns segundos.';
    case 'sem_vinculo':
      // Quem lê isto é quem desenvolve, e o texto do banco nomeia as duas
      // tabelas do vínculo que falta — é a informação útil.
      return `${assunto} falhou ao juntar duas tabelas: falta uma chave estrangeira. `
        + `Detalhe do banco: ${mensagem}`;
    default:
      return mensagem?.trim() || `${assunto} não respondeu.`;
  }
}
