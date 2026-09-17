/**
 * divergencias.service.ts — onde o 59 e o 58 discordam, e por quê.
 *
 * ## A classe é o produto, não a lista
 *
 * Listar toda diferença entre as duas fontes é fácil e inútil. Em setembro/2026
 * a lista crua tinha **1.213 NRs e R$ 420 mil** — e quase tudo tinha explicação
 * que não é divergência: setor que não importou o 58, dia que o 58 ainda não
 * alcançou, dia ainda aberto dos dois lados.
 *
 * Por isso cada linha vem com uma `classe`, e é ela que decide o que aparece
 * primeiro. Depois de classificar, sobraram **6 divergências reais, R$ 1.174,08
 * no mês inteiro** — um número que uma pessoa consegue olhar uma por uma.
 *
 * ## As cinco classes
 *
 * | classe          | o que é                                    | age? |
 * |-----------------|--------------------------------------------|------|
 * | `divergencia`   | nada explica                               | sim  |
 * | `estrutural`    | o NR está do outro lado, em outro setor    | não  |
 * | `dia_aberto`    | hoje, ou o último dia do 58 daquele setor  | não  |
 * | `aguardando_58` | o 58 do setor não chegou nesse dia         | importar |
 * | `sem_58`        | o setor não importou o 58 neste mês        | importar |
 *
 * `dia_aberto` é a que não estava à vista e resolveu o grosso do ruído: o
 * **último dia importado de cada setor é parcial**. O 58 do Play 1 foi exportado
 * no meio do dia 11; o 59 tem o dia 11 inteiro. As 198 «divergências» do Play 1
 * caíam todas ali.
 *
 * ## Isto só lê
 *
 * Nenhuma função daqui grava. Corrigir divergência é a Fase 4, e será ação
 * explícita de quem tem poder para isso — nunca efeito colateral de abrir a aba.
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { lerDo59, VALIDADE_58_MS } from './cache59';

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

export type ClasseDivergencia =
  | 'divergencia'
  | 'estrutural'
  | 'dia_aberto'
  | 'aguardando_58'
  | 'sem_58';

export type SituacaoDivergencia = 'so_no_59' | 'so_no_58' | 'valor_difere';

export interface Divergencia {
  setorId: string | null;
  setorNome: string | null;
  /** O login do ERP. É a chave de quem cobrou, e sobrevive a quem não tem perfil. */
  cobradora: string;
  operadorId: string | null;
  /** Nome congelado em `composicao_mes`; cai para o login quando não há perfil. */
  operadorNome: string;
  nr: string;
  dia: string;
  valor59: number;
  valor58: number;
  /** 59 menos 58. Positivo = o 59 tem mais. */
  delta: number;
  situacao: SituacaoDivergencia;
  classe: ClasseDivergencia;
  /** Até que dia o 58 daquele setor chegou. `null` = não importou no mês. */
  ultimoDia58: string | null;
}

export interface ResumoDivergencia {
  setorId: string | null;
  setorNome: string | null;
  ultimoDia58: string | null;
  classe: ClasseDivergencia;
  nrs: number;
  valor: number;
}

/**
 * A ordem em que as classes importam.
 *
 * É a mesma do banco, repetida aqui porque a tela ordena de novo depois de
 * filtrar — e as duas ordens precisam concordar, senão a lista embaralha quando
 * alguém troca o filtro.
 */
export const ORDEM_CLASSE: ClasseDivergencia[] = [
  'divergencia',
  'estrutural',
  'dia_aberto',
  'aguardando_58',
  'sem_58',
];

/**
 * Esta classe pede ação de alguém?
 *
 * `divergencia` pede olho humano. `sem_58` e `aguardando_58` pedem importação —
 * ação, mas de outra natureza. `estrutural` e `dia_aberto` não pedem nada: são
 * o sistema funcionando.
 */
export function pedeAtencao(c: ClasseDivergencia): boolean {
  return c === 'divergencia';
}

/**
 * Esta classe se resolve importando o 58?
 *
 * Só `aguardando_58`. `sem_58` parece a mesma coisa e não é: aqueles setores
 * **ainda não foram integrados ao sistema de gestão**, então não existe 58 deles
 * para importar. Chamar isso de «falta importar» manda alguém procurar um
 * arquivo que não existe — e, pior, sugere que o número está errado quando ele
 * está certo: o 59 é a única fonte daquele dinheiro até a integração acontecer.
 *
 * Em setembro/2026 são Jornada Play e Manutenção, R$ 197.401,20.
 */
export function pedeImportacao(c: ClasseDivergencia): boolean {
  return c === 'aguardando_58';
}

/**
 * Esta classe está esperando algo que não é do dia a dia de quem olha a tela?
 *
 * `sem_58` espera a integração do setor, que é projeto, não tarefa. A tela
 * mostra como estado — não como pendência de ninguém.
 */
export function esperaIntegracao(c: ClasseDivergencia): boolean {
  return c === 'sem_58';
}

/** O rótulo curto de cada classe, e a frase que explica o porquê. */
export const ROTULO_CLASSE: Record<ClasseDivergencia, { curto: string; porque: string }> = {
  divergencia: {
    curto: 'Divergência',
    porque:
      'Os dois lados cobrem este dia e mesmo assim discordam. Nada no recorte explica — ' +
      'é o caso que alguém precisa olhar. O mais comum é pagamento lançado no ERP depois ' +
      'da exportação daquele 58.',
  },
  estrutural: {
    curto: 'Estrutural',
    porque:
      'O mesmo NR existe do outro lado, em outro setor ou outra carteira. É o recorte ' +
      'por carteira funcionando — rateio, ou cobrança feita por quem é de outro setor. ' +
      'Não é erro.',
  },
  dia_aberto: {
    curto: 'Dia aberto',
    porque:
      'O dia ainda está em movimento: ou é hoje, ou é o último dia do 58 deste setor — ' +
      'que é parcial, porque o relatório foi exportado no meio do dia. Os dois lados ' +
      'ainda vão mudar.',
  },
  aguardando_58: {
    curto: 'Aguardando o 58',
    porque:
      'O 58 deste setor ainda não chegou nesta data. Não há o que conferir: falta ' +
      'importar o relatório mais recente.',
  },
  sem_58: {
    curto: 'Setor não integrado',
    porque:
      'Este setor ainda não foi integrado ao sistema de gestão, então não existe 58 dele ' +
      'para importar. O 59 é a única fonte deste dinheiro, e o valor conta normalmente — ' +
      'só não há com o que conferir até a integração acontecer.',
  },
};

interface DivergenciaCrua {
  setor_id: string | null;
  setor_nome: string | null;
  cobradora: string;
  operador_id: string | null;
  operador_nome: string;
  nr_documento: string;
  dia: string;
  valor_59: unknown;
  valor_58: unknown;
  delta: unknown;
  situacao: SituacaoDivergencia;
  classe: ClasseDivergencia;
  ultimo_dia_58: string | null;
}

function paraDivergencia(d: DivergenciaCrua): Divergencia {
  return {
    setorId:      d.setor_id,
    setorNome:    d.setor_nome,
    cobradora:    d.cobradora,
    operadorId:   d.operador_id,
    operadorNome: d.operador_nome,
    nr:           d.nr_documento,
    dia:          d.dia,
    valor59:      n(d.valor_59),
    valor58:      n(d.valor_58),
    delta:        n(d.delta),
    situacao:     d.situacao,
    classe:       d.classe,
    ultimoDia58:  d.ultimo_dia_58,
  };
}

interface ResumoCru {
  setor_id: string | null; setor_nome: string | null; ultimo_dia_58: string | null;
  classe: ClasseDivergencia; nrs: unknown; valor: unknown;
}

function paraResumo(r: ResumoCru): ResumoDivergencia {
  return {
    setorId:     r.setor_id,
    setorNome:   r.setor_nome,
    ultimoDia58: r.ultimo_dia_58,
    classe:      r.classe,
    nrs:         n(r.nrs),
    valor:       n(r.valor),
  };
}

export async function buscarDivergencias(
  empresaId: string,
  mes: string,
  opcoes: {
    setorId?: string | null;
    cobradora?: string | null;
    classe?: ClasseDivergencia | null;
    limite?: number;
  } = {},
): Promise<Divergencia[]> {
  const { data, error } = await rpcSemTipo<DivergenciaCrua[]>('fn_mestre_divergencias', {
    p_empresa_id: empresaId,
    p_mes: mes,
    p_setor_id: opcoes.setorId ?? null,
    p_cobradora: opcoes.cobradora ?? null,
    p_classe: opcoes.classe ?? null,
    p_limite: opcoes.limite ?? 300,
  });
  if (error) throw new Error(error.message);

  return (data ?? []).map(paraDivergencia);
}

export async function buscarResumoDivergencias(
  empresaId: string,
  mes: string,
): Promise<ResumoDivergencia[]> {
  const { data, error } = await rpcSemTipo<ResumoCru[]>(
    'fn_mestre_divergencias_resumo', { p_empresa_id: empresaId, p_mes: mes },
  );
  if (error) throw new Error(error.message);

  return (data ?? []).map(paraResumo);
}

export interface Conferencia {
  resumo: ResumoDivergencia[];
  /** As primeiras `limite` linhas, na ordem de `fn_mestre_divergencias`. */
  linhas: Divergencia[];
}

/**
 * Resumo e lista da conferência numa chamada só (17/09/2026).
 *
 * A aba pedia `buscarResumoDivergencias` e `buscarDivergencias` juntas, e o
 * resumo, no banco, chama `fn_mestre_divergencias` inteira de novo: o cruzamento
 * do 58 com o 59 do mês rodava duas vezes em paralelo a cada abertura.
 * `fn_mestre_conferencia` roda o cruzamento uma vez e devolve os dois — o teste
 * em PGlite da migration 20260917160000 confere que batem com as funções de
 * antes.
 *
 * Guardada por um minuto (o 58 muda a cada importação de setor). Sem a migration,
 * cai nas duas chamadas de antes: mesma resposta, mais cara.
 */
export function buscarConferencia(
  empresaId: string, mes: string, limite = 500,
): Promise<Conferencia> {
  return lerDo59(['conferencia', empresaId, mes, limite], async () => {
    const { data, error } = await rpcSemTipo<{ resumo: ResumoCru[]; linhas: DivergenciaCrua[] }>(
      'fn_mestre_conferencia', { p_empresa_id: empresaId, p_mes: mes, p_limite: limite },
    );
    if (error) {
      if (/fn_mestre_conferencia/i.test(error.message)
          && /schema cache|does not exist|could not find/i.test(error.message)) {
        const [resumo, linhas] = await Promise.all([
          buscarResumoDivergencias(empresaId, mes),
          buscarDivergencias(empresaId, mes, { limite }),
        ]);
        return { resumo, linhas };
      }
      throw new Error(error.message);
    }
    return {
      resumo: Array.isArray(data?.resumo) ? data.resumo.map(paraResumo) : [],
      linhas: Array.isArray(data?.linhas) ? data.linhas.map(paraDivergencia) : [],
    };
  }, VALIDADE_58_MS);
}

/** Um total por classe, para os cartões do topo da aba. */
export function totalPorClasse(
  resumo: ResumoDivergencia[],
): Array<{ classe: ClasseDivergencia; nrs: number; valor: number }> {
  const porClasse = new Map<ClasseDivergencia, { nrs: number; valor: number }>();
  for (const r of resumo) {
    const atual = porClasse.get(r.classe) ?? { nrs: 0, valor: 0 };
    porClasse.set(r.classe, { nrs: atual.nrs + r.nrs, valor: atual.valor + r.valor });
  }
  return ORDEM_CLASSE
    .filter(c => porClasse.has(c))
    .map(c => ({ classe: c, ...porClasse.get(c)! }));
}

/**
 * Até que dia o 58 de cada setor chegou.
 *
 * Sai do resumo porque o banco já calculou — refazer a conta no cliente seria
 * uma segunda verdade sobre o mesmo fato.
 */
export function ultimoDiaPorSetor(resumo: ResumoDivergencia[]): Map<string, string | null> {
  const mapa = new Map<string, string | null>();
  for (const r of resumo) {
    if (!r.setorId) continue;
    if (!mapa.has(r.setorId)) mapa.set(r.setorId, r.ultimoDia58);
  }
  return mapa;
}
