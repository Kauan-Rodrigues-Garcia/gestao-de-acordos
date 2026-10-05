/**
 * setoresDosFiltros.ts — que setor pode aparecer num FILTRO de setor.
 *
 * Pedido de 05/10/2026: setor inativo não existe mais e não pode ser oferecido
 * como recorte; setor de teste/sistema (o «Padrão», o Núcleo de Inteligência e
 * Gestão) não tem operação para filtrar e só polui a lista.
 *
 * ## Mês passado não muda
 *
 * O setor fica inativo no mês em que deixou de existir — é dali para a frente
 * que ele sai do filtro. Num mês passado ele existia, tem acordo e recebimento,
 * e continua no filtro daquele mês como sempre esteve. Por isso quem monta
 * filtro de uma tela com seletor de mês passa o mês olhado (`opcoes.mes`).
 *
 * Vale para FILTRO (o seletor que recorta o que a tela mostra). Não vale para
 * cadastro: a aba Setores, o cadastro de usuário e a transferência continuam
 * precisando enxergar o Núcleo, que tem gente (Assistente ADM) de verdade.
 *
 * O critério, em ordem:
 *
 *   - `ativo = false`            → fora, a não ser num mês passado;
 *   - `tipo = 'nucleo'`          → fora (o Núcleo de Inteligência e Gestão);
 *   - id do Setor Padrão         → fora (`ID_SETOR_PADRAO`);
 *   - nome de setor de sistema   → fora (`NOMES_FORA_DOS_FILTROS`, sem acento
 *                                  e sem caixa; «teste» em qualquer posição).
 *
 * Quem consulta `setores` para um filtro pede `COLUNAS_SETOR_DO_FILTRO`, para
 * `ativo` e `tipo` chegarem até aqui. Sem as colunas, o critério decide só pelo
 * nome — melhor que nada, e não esconde setor de verdade por engano.
 */
import { mesAtual, mesValido } from '@/lib/mesReferencia';

/** As colunas que o critério precisa, para o `select` de quem monta filtro. */
export const COLUNAS_SETOR_DO_FILTRO = 'id, nome, ativo, tipo';

/**
 * O «Setor Padrão» do sistema tem o id nulo (conferido no cadastro em
 * 05/10/2026). Pelo id ele fica fora mesmo se alguém o renomear.
 */
const ID_SETOR_PADRAO = '00000000-0000-0000-0000-000000000000';

/** Nomes (normalizados) de setores de sistema/teste. */
const NOMES_FORA_DOS_FILTROS: ReadonlySet<string> = new Set([
  'padrao',
  'setor padrao',
  'inteligencia e gestao',
  'nucleo de inteligencia e gestao',
]);

function normalizar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SetorCandidatoAoFiltro {
  id?: string | null;
  nome?: string | null;
  ativo?: boolean | null;
  tipo?: string | null;
}

export interface OpcoesDoFiltro {
  /** O mês que a tela está olhando (`yyyy-MM`). Omitido = hoje. */
  mes?: string | null;
}

/** `mes` é anterior ao mês corrente? Mês ausente ou inválido conta como hoje. */
export function ehMesPassado(mes: string | null | undefined): boolean {
  return mesValido(mes) && mes < mesAtual();
}

/** Setor de sistema/teste: fora do filtro em qualquer mês. */
function ehSetorDeSistema(s: SetorCandidatoAoFiltro): boolean {
  if (s.id === ID_SETOR_PADRAO || s.tipo === 'nucleo') return true;
  const nome = normalizar(s.nome ?? '');
  return NOMES_FORA_DOS_FILTROS.has(nome) || /\bteste?s?\b/.test(nome);
}

/** O setor pode aparecer como opção de filtro? */
export function setorEntraNosFiltros(
  s: SetorCandidatoAoFiltro,
  opcoes: OpcoesDoFiltro = {},
): boolean {
  if (s.ativo === false && !ehMesPassado(opcoes.mes)) return false;
  return !ehSetorDeSistema(s);
}

/** A lista sem os setores que não entram em filtro. Não muta a entrada. */
export function setoresDosFiltros<T extends SetorCandidatoAoFiltro>(
  lista: readonly T[],
  opcoes: OpcoesDoFiltro = {},
): T[] {
  return lista.filter(s => setorEntraNosFiltros(s, opcoes));
}

/**
 * A lista do filtro para um mês, a partir das linhas de `setores`.
 *
 * Com `nomesDoMes` (o retrato de um mês fechado), o setor leva o nome daquele
 * mês — «Amauri Digital» em agosto, mesmo renomeado depois — e o setor que
 * existia naquele mês e foi apagado depois volta para a lista: os acordos que
 * ele produziu continuam na tabela e precisam de como chegar. Só o setor de
 * sistema fica fora.
 */
export function listaDoFiltroDeSetores(
  linhas: readonly ({ id: string; nome: string } & SetorCandidatoAoFiltro)[],
  nomesDoMes?: Readonly<Record<string, string>> | null,
  opcoes: OpcoesDoFiltro = {},
): { id: string; nome: string }[] {
  const lista = setoresDosFiltros(linhas, opcoes).map(s => ({
    id: s.id,
    nome: nomesDoMes?.[s.id] ?? s.nome,
  }));
  if (!nomesDoMes) return lista;

  const conhecidos = new Set(linhas.map(s => s.id));
  for (const [id, nome] of Object.entries(nomesDoMes)) {
    if (conhecidos.has(id) || ehSetorDeSistema({ id, nome })) continue;
    lista.push({ id, nome });
  }
  return lista;
}
