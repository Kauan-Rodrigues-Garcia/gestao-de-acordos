/**
 * diasUteisDoSetor.ts — qual régua de dia útil vale para um setor.
 *
 * O mês tem uma configuração GERAL (`metas_config_mes`: feriados e
 * `contar_dia_atual`) e, para o setor que trabalha diferente, uma EXCEÇÃO
 * (`metas_config_setor_mes`, 21/10/2026). A exceção é a lista inteira do
 * setor, não uma diferença: quando existe, ela manda sozinha; quando não, o
 * setor segue a geral.
 *
 * Os quartis não entram aqui: continuam sendo da empresa.
 *
 * Toda tela que conta dia útil de alguém pergunta aqui, com o setor desse
 * alguém. Escolher a régua em cada tela, cada uma do seu jeito, é o caminho
 * para o Dashboard e os Quartis darem projeções diferentes à mesma pessoa.
 *
 * ## Dias úteis da pessoa (09/11/2026)
 *
 * Quem começa no meio do mês (ou sai, ou volta) tem a meta proporcional
 * marcada na aba Metas, e ali pode trocar os dias do setor pelos DELA
 * (`metas_dias_uteis_pessoa`, migration 20261109170000). A lista é a dos dias
 * que a pessoa trabalha, sempre dentro dos dias úteis do setor: ela só tira
 * dias, nunca põe. Por isso entra na régua como feriados a mais — os dias do
 * setor em que ela não trabalha —, e toda conta que já lia `feriados` passa a
 * contar certo sem mudar. Passe o `perfilId` para a régua ser a da pessoa.
 */
import { listarDiasUteis } from '@/lib/diasUteis';

/** O que o setor pode trocar: só o que decide o dia útil. */
export interface DiasUteisSetor {
  feriados: string[];
  contar_dia_atual: boolean;
}

/** setor_id → exceção do mês. Setor ausente segue a geral. */
export type DiasUteisPorSetor = Record<string, DiasUteisSetor>;

/** Os dias que UMA pessoa trabalha no mês (`mes` = 'yyyy-MM'), em ISO. */
export interface DiasUteisPessoa {
  mes: string;
  dias: string[];
}

/** perfil_id → dias da pessoa no mês. Pessoa ausente segue o setor. */
export type DiasUteisPorPessoa = Record<string, DiasUteisPessoa>;

/** A régua já escolhida, pronta para `diasUteisDoMes`/`diasUteisDecorridos`. */
export interface ReguaDiasUteis {
  feriados: string[];
  contarDiaAtual: boolean;
  /** true = veio da exceção do setor; false = da configuração geral. */
  doSetor: boolean;
  /** true = a pessoa tem dias úteis próprios no mês (já aplicados em `feriados`). */
  daPessoa: boolean;
}

/** O formato que `getMetasConfig` devolve — só as partes que a régua lê. */
export interface FonteDiasUteis {
  data: { feriados?: string[] | null; contar_dia_atual?: boolean | null } | null;
  porSetor?: DiasUteisPorSetor | null;
  porPessoa?: DiasUteisPorPessoa | null;
}

/**
 * A config do mês com os dias úteis do setor no lugar dos gerais.
 *
 * Para quem recebe a config INTEIRA (feriados + quartis) e faz a conta lá
 * dentro: os quartis seguem os da empresa, só feriados e `contar_dia_atual`
 * trocam. Sem config geral devolve `null`, como antes — sem ela não há
 * quartil para medir.
 */
export function configComDiasDoSetor<T extends { feriados: string[]; contar_dia_atual?: boolean | null }>(
  config: T | null,
  porSetor: DiasUteisPorSetor | null | undefined,
  setorId: string | null | undefined,
): T | null {
  if (!config) return null;
  const excecao = setorId ? porSetor?.[setorId] : undefined;
  if (!excecao) return config;
  return { ...config, feriados: excecao.feriados, contar_dia_atual: excecao.contar_dia_atual };
}

/**
 * A régua de alguém: a do setor e, quando `perfilId` tem dias próprios no
 * mês, a do setor com os dias em que a pessoa não trabalha tirados.
 */
export function diasUteisDoSetor(
  fonte: FonteDiasUteis | null | undefined,
  setorId: string | null | undefined,
  perfilId?: string | null,
): ReguaDiasUteis {
  const excecao = setorId ? fonte?.porSetor?.[setorId] : undefined;
  const base: ReguaDiasUteis = excecao
    ? {
      feriados: excecao.feriados ?? [],
      contarDiaAtual: excecao.contar_dia_atual === true,
      doSetor: true,
      daPessoa: false,
    }
    : {
      feriados: fonte?.data?.feriados ?? [],
      contarDiaAtual: fonte?.data?.contar_dia_atual === true,
      doSetor: false,
      daPessoa: false,
    };
  const pessoal = perfilId ? fonte?.porPessoa?.[perfilId] : undefined;
  return pessoal ? reguaComDiasDaPessoa(base, pessoal) : base;
}

/**
 * A régua do setor com os dias da pessoa: os dias de segunda a sexta do mês
 * que não estão na lista dela viram feriado. O que o setor já não conta
 * (feriado dele) continua fora, mesmo que esteja na lista.
 */
export function reguaComDiasDaPessoa(base: ReguaDiasUteis, pessoal: DiasUteisPessoa): ReguaDiasUteis {
  const [ano, mes] = pessoal.mes.split('-').map(Number);
  if (!ano || !mes) return base;
  const trabalha = new Set(pessoal.dias);
  const fora = listarDiasUteis(ano, mes).filter(d => !trabalha.has(d));
  return {
    ...base,
    feriados: [...new Set([...base.feriados, ...fora])].sort(),
    daPessoa: true,
  };
}

/**
 * Os dias que a pessoa trabalha, pela régua do setor: os úteis do setor a
 * partir de `desde` e até `ate` (inclusive; vazio = sem limite). É o atalho
 * «começou em» / «saiu em» da tela.
 */
export function diasDoSetorNoIntervalo(
  mes: string, feriadosDoSetor: readonly string[], desde?: string | null, ate?: string | null,
): string[] {
  const [ano, m] = mes.split('-').map(Number);
  return listarDiasUteis(ano, m, [...feriadosDoSetor])
    .filter(d => (!desde || d >= desde) && (!ate || d <= ate));
}
