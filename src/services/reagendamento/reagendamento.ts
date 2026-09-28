/**
 * reagendamento.ts — quem mostra o botão de calendário, e por quê.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O botão de reagendar cria a PRÓXIMA parcela de um acordo parcelado. Ele é a
 * porta de recuperação: o caminho normal é o modal que abre sozinho ao marcar a
 * parcela como paga, e o botão existe para quem fechou aquele modal, marcou pago
 * por outra tela, ou importou o acordo já pago.
 *
 * ## Por que este arquivo existe
 *
 * A regra estava escrita quatro vezes, com quatro respostas diferentes:
 *
 *   • `pages/Dashboard/helpers.ts` ......... ['boleto', 'pix']
 *   • `AcordoDetalheInline/helpers.ts` ..... PP ['boleto','pix'] / BK +['cartao']
 *   • `components/payloadEdicaoAcordo.ts` .. ['boleto','cartao_recorrente','pix_automatico']
 *   • `pages/Acordos/index.tsx` ............ isTipoParcelado(tipo, false), o `false` fixo
 *
 * Os três defeitos que o usuário via na tela saíam daí:
 *
 * 1. **Cartão de Crédito da BookPlay nunca mostrava o botão.** A tabela do
 *    Dashboard é a mesma nos dois tenants (`PPTableBody` recebe `isPP`), mas o
 *    filtro de tipo era a lista da PaguePlay, sem 'cartao'. Um acordo parcelado
 *    no cartão ficava sem como agendar a 2ª parcela.
 *
 * 2. **Da 3ª parcela em diante o botão sumia para sempre.** O controle do que
 *    «já foi reagendado» era por GRUPO: bastava existir uma parcela com
 *    `numero_parcela > 1` para o grupo inteiro ser dado como resolvido. Num
 *    acordo de 3x, assim que a parcela 2 nascia, nem a 1 nem a 2 mostravam
 *    botão — e a parcela 3 não tinha como ser criada pela tela.
 *
 * 3. **O aviso de duplicidade dependia do mês do filtro.** A consulta que
 *    procurava a parcela já agendada olhava só o mês seguinte ao do filtro, e
 *    só na PaguePlay. Quem reagendava para dois meses à frente voltava a ver o
 *    botão, e um segundo clique criava a parcela repetida — não há UNIQUE em
 *    (acordo_grupo_id, numero_parcela) no banco para segurar isso.
 *
 * Agora a pergunta tem um dono só, e a resposta é por PARCELA, não por grupo.
 *
 * ## O que NÃO reagenda
 *
 * PIX Automático e Cartão Recorrente: quem parcela ali é a recorrência, e o que
 * se lança é a autorização. Ver `lib/formasRecorrentes.ts` — a regra é de
 * 05/09/2026 e vale nos dois tenants.
 *
 * ## O que mudou em 28/09/2026
 *
 * O botão deixou de exigir `status = 'pago'`. O pedido foi textual: «tem que
 * aparecer para qualquer acordo que seja parcelamento e não esteja agendado».
 * A parcela criada nasce `verificar_pendente`, então agendar antes de receber
 * não inventa recebimento — só adianta a tabulação.
 */
import { ehFormaRecorrente } from '@/lib/formasRecorrentes';

/**
 * As formas que aceitam parcelamento em cada tenant.
 *
 * Os `value` reais gravados em `acordos.tipo` (ver
 * `components/AcordoNovoInline/constants.ts`):
 *
 *   PaguePlay ... 'boleto' (o form mostra "Boleto / PIX" e grava 'boleto'),
 *                 'cartao' — à vista, não parcela.
 *   BookPlay .... 'boleto', 'pix', 'cartao' parcelam;
 *                 'pix_automatico' e 'cartao_recorrente' não.
 *
 * A PaguePlay mantém 'pix' na lista por causa do histórico: antes de o form
 * consolidar as duas formas em "Boleto / PIX" havia linhas gravadas como 'pix',
 * e elas continuam parceladas.
 */
export const TIPOS_QUE_PARCELAM_PAGUEPLAY = ['boleto', 'pix'] as const;
export const TIPOS_QUE_PARCELAM_BOOKPLAY  = ['boleto', 'pix', 'cartao'] as const;

/** A forma de pagamento aceita parcelamento neste tenant? */
export function tipoParcela(tipo: string | null | undefined, isPaguePlay: boolean): boolean {
  if (!tipo) return false;
  if (ehFormaRecorrente(tipo)) return false;
  const lista: readonly string[] = isPaguePlay
    ? TIPOS_QUE_PARCELAM_PAGUEPLAY
    : TIPOS_QUE_PARCELAM_BOOKPLAY;
  return lista.includes(tipo);
}

/** O mínimo que precisamos saber de uma linha para decidir o botão. */
export interface ParcelaReagendavel {
  tipo?: string | null;
  parcelas?: number | null;
  numero_parcela?: number | null;
  acordo_grupo_id?: string | null;
}

/** Por que o botão não aparece. `null` em `motivo` = aparece. */
export type MotivoSemReagendar =
  /** PIX Automático / Cartão Recorrente: a recorrência é que parcela. */
  | 'recorrente'
  /** A forma não parcela neste tenant (ex.: Cartão à vista na PaguePlay). */
  | 'tipo_nao_parcela'
  /** `parcelas <= 1`: não é parcelamento. */
  | 'parcela_unica'
  /** Esta já é a última parcela do acordo. */
  | 'ultima_parcela'
  /** Sem grupo não há como ligar a próxima parcela a esta. */
  | 'sem_grupo'
  /** A próxima parcela já existe — foi agendada ou adicionada à mão. */
  | 'ja_agendada';

export interface DecisaoReagendar {
  pode: boolean;
  motivo: MotivoSemReagendar | null;
  /** O número da parcela que o botão criaria. */
  proximaNumero: number;
  totalParcelas: number;
}

/**
 * A chave de uma parcela dentro do grupo.
 *
 * É por aqui que a decisão deixa de ser por grupo e passa a ser por parcela —
 * o defeito 2 do cabeçalho.
 */
export function chaveParcela(grupoId: string, numero: number): string {
  return `${grupoId}#${numero}`;
}

/** As chaves de todas as parcelas que já existem, para `podeReagendar`. */
export function chavesExistentes(
  linhas: readonly ParcelaReagendavel[],
): Set<string> {
  const s = new Set<string>();
  for (const l of linhas) {
    if (l.acordo_grupo_id) s.add(chaveParcela(l.acordo_grupo_id, l.numero_parcela ?? 1));
  }
  return s;
}

/**
 * O botão de reagendar aparece nesta linha?
 *
 * @param parcela    a linha da tabela.
 * @param isPaguePlay tenant — decide a lista de formas que parcelam.
 * @param existentes chaves de `chaveParcela` de todas as parcelas conhecidas.
 *                   Quando a tela não sabe (consulta ainda carregando), passar
 *                   um Set vazio mostra o botão; o duplo-clique continua barrado
 *                   pela conferência no servidor, dentro de `handleReagendar`.
 */
export function podeReagendar(
  parcela: ParcelaReagendavel,
  isPaguePlay: boolean,
  existentes: ReadonlySet<string>,
): DecisaoReagendar {
  const total  = parcela.parcelas ?? 1;
  const numero = parcela.numero_parcela ?? 1;
  const base   = { pode: false, proximaNumero: numero + 1, totalParcelas: total };

  if (ehFormaRecorrente(parcela.tipo))            return { ...base, motivo: 'recorrente' };
  if (!tipoParcela(parcela.tipo, isPaguePlay))    return { ...base, motivo: 'tipo_nao_parcela' };
  if (total <= 1)                                 return { ...base, motivo: 'parcela_unica' };
  if (numero >= total)                            return { ...base, motivo: 'ultima_parcela' };
  if (!parcela.acordo_grupo_id)                   return { ...base, motivo: 'sem_grupo' };
  if (existentes.has(chaveParcela(parcela.acordo_grupo_id, numero + 1))) {
    return { ...base, motivo: 'ja_agendada' };
  }
  return { ...base, pode: true, motivo: null };
}

/** O texto do `title`/`aria-label` do botão. */
export function rotuloReagendar(d: DecisaoReagendar): string {
  return `Reagendar parcela ${d.proximaNumero}/${d.totalParcelas}`;
}

/**
 * O erro do insert é a parcela repetida?
 *
 * `23505` é o unique_violation do Postgres; `uq_acordos_grupo_parcela` é o
 * índice da migration 20260928230000, que fecha a corrida entre o «confere e
 * insere» das três telas. Enquanto o índice não estiver no banco esta função
 * simplesmente nunca casa, e a mensagem crua continua aparecendo.
 */
export function ehParcelaDuplicada(
  erro: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!erro) return false;
  return erro.code === '23505'
    || /uq_acordos_grupo_parcela/i.test(erro.message ?? '');
}

/** A frase para quando a parcela já existe — a mesma nas três telas. */
export function avisoParcelaJaAgendada(proximaNumero: number, total: number): string {
  return `Parcela ${proximaNumero}/${total} já foi reagendada.`;
}
