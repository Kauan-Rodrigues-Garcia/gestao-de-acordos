/**
 * escopoDiario.ts — "esta linha do Recebimento diário é do meu setor?"
 *
 * ## O que estava quebrado
 *
 * A aba Analítico isola por setor desde sempre: o líder recebe `setorId` travado
 * no setor dele e todas as contas passam por ele. A aba **Recebimento diário**,
 * ao lado, nunca recebeu esse escopo — só a sub-aba "Por equipe" filtrava. As
 * listas "Por operador", os cards do dia e os órfãos vinham da empresa inteira,
 * então o líder do Play 4 lia os recebimentos do Receptivo e de todo o resto.
 *
 * ## Por que o diário precisa de uma regra própria
 *
 * `analitico_recebimentos` tem `setor_id` — o carimbo posto na importação, que
 * `escopoAnalitico.ts` usa. `diario_recebimentos` **não tem** essa coluna: a
 * única forma de saber a que setor uma linha pertence é pelo operador dela.
 * Daí este módulo: ele traduz "setor" em "conjunto de operadores" e filtra por
 * `operador_id`.
 *
 * A tradução usa `setoresDoOperador`, a mesma função do Analítico e do Painel
 * Líder — inclusive para clones. Um operador emprestado ao Digital conta nos
 * DOIS setores, e o líder de cada um vê o recebimento dele. Escrever aqui um
 * `info.setor_id === setorId` seria a quarta cópia da regra, e já se sabe como
 * termina: as telas divergem e ninguém consegue dizer qual está certa.
 *
 * ## Linha sem operador fica de fora
 *
 * Órfã (nome no relatório sem perfil vinculado) e "(sem vínculo)" não têm dono,
 * e sem dono não têm setor. Mostrá-las a um líder escopado seria vazar o
 * recebimento de outro setor pela porta dos fundos — quem resolve órfão é quem
 * enxerga a empresa toda.
 */
import {
  mapaSetorDaEquipe,
  setoresDoOperador,
  type ComposicaoEquipes,
} from '@/services/analitico/analitico.service';

/** O mínimo que uma linha do diário precisa expor para ser filtrada. */
export interface LinhaDiarioEscopavel {
  operador_id: string | null;
}

/** A parte da composição do mês que interessa ao escopo. */
export type VinculosDiario = Pick<
  ComposicaoEquipes,
  'equipes' | 'operadorEquipeMap' | 'equipesExtrasPorOperador'
>;

/**
 * Como esta tela está escopada para quem está olhando.
 *
 * `sem-setor` não é detalhe de borda: é um líder cujo perfil não tem setor numa
 * empresa que tem vários. Antes ele caía no "vê tudo" por omissão — exatamente
 * o vazamento que este módulo existe para fechar. Agora ele não vê nada e a
 * tela diz o porquê.
 */
export type EscopoDiario =
  | { tipo: 'tudo' }
  | { tipo: 'setor'; setorId: string }
  | { tipo: 'sem-setor' };

/**
 * Quantos setores aparecem na composição — contando o setor das equipes e o de
 * quem não tem equipe.
 *
 * Sai daqui, e não de um `count` em `setores`, porque uma consulta a mais é uma
 * consulta a mais que pode falhar: se ela falhasse, o fallback natural
 * ("não sei, mostra tudo") reabriria justamente o vazamento. Esta contagem vem
 * do mesmo dado que já é preciso carregar e não tem como dar erro sozinha.
 */
export function contarSetores(vinculos: VinculosDiario): number {
  const setores = new Set<string>();
  for (const e of vinculos.equipes) if (e.setor_id) setores.add(e.setor_id);
  for (const info of Object.values(vinculos.operadorEquipeMap)) {
    if (info.setor_id) setores.add(info.setor_id);
  }
  return setores.size;
}

/**
 * Decide o escopo da tela.
 *
 * `totalDeSetores <= 1` devolve `tudo`: numa empresa de um setor só (PaguePlay)
 * não há nada a isolar, e escopar ali só criaria o risco de zerar a tela de quem
 * está com o perfil sem setor. A regra passa a valer sozinha no dia em que a
 * empresa criar o segundo setor — sem depender de um `if` por tenant.
 */
export function escopoDoDiario(params: {
  veTodosOsSetores: boolean;
  setorDoUsuario: string | null;
  totalDeSetores: number;
}): EscopoDiario {
  const { veTodosOsSetores, setorDoUsuario, totalDeSetores } = params;
  if (veTodosOsSetores || totalDeSetores <= 1) return { tipo: 'tudo' };
  if (!setorDoUsuario) return { tipo: 'sem-setor' };
  return { tipo: 'setor', setorId: setorDoUsuario };
}

/**
 * Operadores cujo recebimento conta neste setor: os do setor MAIS os clonados
 * para uma equipe dele (com `conta_recebimento` ligado — quem monta a
 * composição já descartou os desligados).
 */
export function operadoresQueContamNoSetor(
  setorId: string,
  vinculos: VinculosDiario,
): Set<string> {
  const setorDaEquipe = mapaSetorDaEquipe(vinculos.equipes);
  const candidatos = new Set([
    ...Object.keys(vinculos.operadorEquipeMap),
    // Clone cujo perfil não veio na composição (desativado depois, por exemplo)
    // ainda tem vínculo com a equipe que o tomou emprestado.
    ...Object.keys(vinculos.equipesExtrasPorOperador),
  ]);

  const out = new Set<string>();
  for (const operadorId of candidatos) {
    const setores = setoresDoOperador(
      operadorId,
      vinculos.operadorEquipeMap,
      vinculos.equipesExtrasPorOperador,
      setorDaEquipe,
    );
    if (setores.has(setorId)) out.add(operadorId);
  }
  return out;
}

/**
 * As linhas que a pessoa pode ver.
 *
 * Filtrar aqui, na ENTRADA, e não em cada agregação: os cards do dia, a lista
 * por operador, a lista por equipe, os órfãos e os acordos ignorados saem todos
 * de `dados`. Uma peneira só na origem faz o total do dia bater com a soma das
 * listas — se cada agregação filtrasse por conta própria, bastaria esquecer uma
 * para o líder ver um total que não corresponde a nada na tela.
 */
export function linhasVisiveis<T extends LinhaDiarioEscopavel>(
  linhas: readonly T[],
  escopo: EscopoDiario,
  vinculos: VinculosDiario,
): T[] {
  if (escopo.tipo === 'tudo') return [...linhas];
  if (escopo.tipo === 'sem-setor') return [];
  const permitidos = operadoresQueContamNoSetor(escopo.setorId, vinculos);
  return linhas.filter(l => l.operador_id !== null && permitidos.has(l.operador_id));
}

// ── Filtros de tela (setor e equipe) ─────────────────────────────────────────
//
// Diferentes do ESCOPO acima. O escopo é uma regra de permissão: define o que a
// pessoa PODE ver e não é escolha dela. Estes são recortes que ela ESCOLHE
// dentro do que já pode ver — diretoria filtrando um setor, líder filtrando uma
// equipe do próprio setor.
//
// Por isso o filtro de setor é aplicado transformando o escopo (um setor
// escolhido vira `{ tipo: 'setor' }`) em vez de virar um segundo filtro
// paralelo: assim é impossível um filtro de tela ampliar o que a regra de
// permissão já restringiu.

/**
 * Operadores que contam numa equipe: os que a têm como equipe própria MAIS os
 * clonados para ela. Mesma fonte de `operadoresQueContamNoSetor`, para a
 * contagem por equipe não divergir da contagem por setor.
 */
export function operadoresDaEquipe(
  equipeId: string,
  vinculos: VinculosDiario,
): Set<string> {
  const out = new Set<string>();
  for (const [operadorId, info] of Object.entries(vinculos.operadorEquipeMap)) {
    if (info.equipe_id === equipeId) out.add(operadorId);
  }
  for (const [operadorId, extras] of Object.entries(vinculos.equipesExtrasPorOperador)) {
    if ((extras as readonly string[]).includes(equipeId)) out.add(operadorId);
  }
  return out;
}

/**
 * Recorte por equipe, aplicado DEPOIS de `linhasVisiveis`.
 *
 * `null`/vazio devolve tudo — "nenhuma equipe escolhida" é "todas", não
 * "nenhuma". Linha sem operador cai fora: sem dono não há equipe.
 */
export function filtrarPorEquipe<T extends LinhaDiarioEscopavel>(
  linhas: readonly T[],
  equipeId: string | null,
  vinculos: VinculosDiario,
): T[] {
  if (!equipeId) return [...linhas];
  const permitidos = operadoresDaEquipe(equipeId, vinculos);
  return linhas.filter(l => l.operador_id !== null && permitidos.has(l.operador_id));
}
