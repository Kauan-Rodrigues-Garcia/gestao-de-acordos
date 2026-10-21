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
 */

/** O que o setor pode trocar: só o que decide o dia útil. */
export interface DiasUteisSetor {
  feriados: string[];
  contar_dia_atual: boolean;
}

/** setor_id → exceção do mês. Setor ausente segue a geral. */
export type DiasUteisPorSetor = Record<string, DiasUteisSetor>;

/** A régua já escolhida, pronta para `diasUteisDoMes`/`diasUteisDecorridos`. */
export interface ReguaDiasUteis {
  feriados: string[];
  contarDiaAtual: boolean;
  /** true = veio da exceção do setor; false = da configuração geral. */
  doSetor: boolean;
}

/** O formato que `getMetasConfig` devolve — só as partes que a régua lê. */
export interface FonteDiasUteis {
  data: { feriados?: string[] | null; contar_dia_atual?: boolean | null } | null;
  porSetor?: DiasUteisPorSetor | null;
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

export function diasUteisDoSetor(
  fonte: FonteDiasUteis | null | undefined,
  setorId: string | null | undefined,
): ReguaDiasUteis {
  const excecao = setorId ? fonte?.porSetor?.[setorId] : undefined;
  if (excecao) {
    return {
      feriados: excecao.feriados ?? [],
      contarDiaAtual: excecao.contar_dia_atual === true,
      doSetor: true,
    };
  }
  return {
    feriados: fonte?.data?.feriados ?? [],
    contarDiaAtual: fonte?.data?.contar_dia_atual === true,
    doSetor: false,
  };
}
