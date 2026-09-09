/**
 * mesPix.ts — a que DIA e a que MÊS pertence uma linha do Pix Automático.
 *
 * ## O defeito que isto conserta
 *
 * `criado_em` é `timestamptz` e chega do PostgREST em UTC. A aba tinha duas
 * réguas para a mesma pergunta:
 *
 *   • a tabela e o filtro de período liam a data em **São Paulo**
 *     (`toLocaleDateString('pt-BR')` / `dataLocalDaLinha`);
 *   • os cards, a dobra, o ranking, a premiação e o fechamento cortavam o mês
 *     com `criado_em.startsWith('2026-09')` — ou seja, em **UTC**.
 *
 * São Paulo é UTC−3, então um acordo registrado em 31/08 às 21h30 grava
 * `2026-09-01T00:30:00Z`: a tabela mostrava **31/08** e os cards contavam o
 * acordo em **setembro**. A janela é estreita (21h–00h do último dia do mês) e
 * é justamente quando a operação corre para fechar a meta do mês.
 *
 * `instanteDoDiaPix` já protegia o lançamento retroativo gravando meio-dia
 * local; o registro ao vivo à noite não tinha proteção nenhuma.
 *
 * Daqui para a frente existe UMA régua: o fuso da operação. Quem pergunta "de
 * que mês é esta linha?" pergunta a `mesLocalPix` / `noMesPix`, e a resposta é
 * a mesma que a pessoa lê na coluna de data.
 *
 * ## Por que o cache
 *
 * `Intl.DateTimeFormat` é caro e estas funções são chamadas por LINHA dentro
 * de `useMemo`s que recalculam a cada digitação no filtro. O formatador é um
 * só (criado uma vez) e o resultado por instante fica num mapa: as mesmas
 * strings de `criado_em` reaparecem em todo recálculo.
 */

/** O fuso da operação. Não é configurável de propósito: a empresa é uma só. */
const FUSO = 'America/Sao_Paulo';

/**
 * `en-CA` devolve `yyyy-MM-dd`, que é o formato que compara como texto — o
 * mesmo truque de `dataLocalDaLinha`, agora num lugar só.
 */
const FORMATADOR = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * Instante → dia local. O mapa não cresce sem limite: passado o teto ele é
 * esvaziado inteiro, porque uma troca de mês na aba invalida o conjunto todo
 * de qualquer forma e um LRU aqui seria mais código do que benefício.
 */
const CACHE = new Map<string, string>();
const CACHE_MAX = 20_000;

/**
 * A data (`yyyy-MM-dd`) de um instante do banco no fuso da operação.
 *
 * Entrada inválida devolve os dez primeiros caracteres — é o que a tela já
 * fazia, e é melhor que estourar no meio de uma tabela.
 */
export function dataLocalPix(criadoEm: string): string {
  const bruto = String(criadoEm ?? '');
  const emCache = CACHE.get(bruto);
  if (emCache !== undefined) return emCache;

  const d = new Date(bruto);
  const dia = Number.isNaN(d.getTime()) ? bruto.slice(0, 10) : FORMATADOR.format(d);

  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  CACHE.set(bruto, dia);
  return dia;
}

/** O mês (`yyyy-MM`) de um instante do banco, no fuso da operação. */
export function mesLocalPix(criadoEm: string): string {
  return dataLocalPix(criadoEm).slice(0, 7);
}

/**
 * A linha pertence a este mês (`yyyy-MM`)?
 *
 * Substitui `criado_em.startsWith(mes)` em toda a aba. Mês vazio devolve
 * `true`: "sem recorte de mês" é o comportamento de quem não passa filtro.
 */
export function noMesPix(criadoEm: string, mes: string): boolean {
  if (!mes) return true;
  return mesLocalPix(criadoEm) === mes;
}
