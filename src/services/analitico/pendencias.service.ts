/**
 * pendencias.service.ts — o que o 58 trouxe e o 59 ainda não confirmou.
 *
 * ## O que é uma pendência
 *
 * Enquanto o 59 não for a fonte horária, o 58 chega antes em alguns momentos do
 * dia. A linha que ele traz e que o 59 ainda não tem é uma **pendência**: conta
 * normalmente no sistema, mas está esperando confirmação da fonte oficial.
 *
 * Não é erro, e não é divergência. É defasagem — e a pergunta que importa é há
 * quanto tempo ela dura.
 *
 * ## A escalada mede oportunidades perdidas, não tempo
 *
 * «1ª importação pendente, 2ª crítica» conta quantas vezes o 59 rodou **sem
 * ver** aquela linha:
 *
 * | promoções do 59 desde | severidade    | o que significa |
 * |---|---|---|
 * | 0 | `aguardando` | o 59 não rodou desde que o 58 trouxe. Não é cobrança de ninguém. |
 * | 1 | `pendente`   | o 59 rodou uma vez e não viu. |
 * | 2+ | `critico`   | rodou duas ou mais e continua sem ver. Aqui alguém olha. |
 *
 * Contar promoções, e não horas, é o que separa «o 59 está atrasado» de «o 59
 * rodou e não trouxe» — que são problemas de dono diferente.
 *
 * ## Derivada, não carimbada
 *
 * O desenho inicial carimbava a confirmação na linha. A medição desfez: derivar
 * custa 92 ms contra 289 do carimbo, e é mais correto — se o ERP estornar um
 * pagamento e o lote novo do 59 não o trouxer, o carimbo diria «confirmado»
 * para sempre, e a derivação volta a apontar a pendência.
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { lerDo59, VALIDADE_58_MS } from '@/services/mestre/cache59';

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

export type Severidade = 'critico' | 'pendente' | 'aguardando';

export interface Pendencia {
  id: string;
  setorId: string | null;
  setorNome: string | null;
  /** O login do ERP. Sobrevive a quem não tem perfil. */
  operadorUsuario: string;
  /** Nome congelado em `composicao_mes`; cai para o login quando não há perfil. */
  operadorNome: string;
  nr: string;
  dia: string;
  formaPagamento: string;
  valor: number;
  importadoEm: string;
  /** Quantas vezes o 59 foi promovido depois de o 58 trazer esta linha. */
  promocoesDesde: number;
  severidade: Severidade;
  /** O 59 tem este NR, mas em outro setor. Então é recorte, não ausência. */
  no59EmOutroSetor: boolean;
}

export interface ResumoPendencia {
  setorId: string | null;
  setorNome: string | null;
  severidade: Severidade;
  linhas: number;
  valor: number;
}

/** Do mais grave para o menos. A mesma ordem do banco. */
export const ORDEM_SEVERIDADE: Severidade[] = ['critico', 'pendente', 'aguardando'];

/**
 * Esta severidade pede alguém agora?
 *
 * `aguardando` não pede: o 59 nem rodou desde que o 58 trouxe a linha, e cobrar
 * alguém por isso seria cobrar pelo relógio. `pendente` é aviso. `critico` é o
 * que merece ser aberto.
 */
export function pedeAcao(s: Severidade): boolean {
  return s === 'critico';
}

export const ROTULO_SEVERIDADE: Record<Severidade, { curto: string; porque: string }> = {
  critico: {
    curto: 'Crítico',
    porque:
      'O 59 já foi importado duas vezes ou mais depois de o 58 trazer esta linha, e nas ' +
      'duas ela não veio. Ou o ERP tirou do 59 o que manteve no 58, ou a carteira desta ' +
      'cobrança não está vinculada a este setor.',
  },
  pendente: {
    curto: 'Pendente',
    porque:
      'O 59 rodou uma vez depois de o 58 trazer esta linha e não a trouxe. Uma vez ainda ' +
      'pode ser o horário da exportação; na segunda vira crítico.',
  },
  aguardando: {
    curto: 'Aguardando',
    porque:
      'O 58 trouxe esta linha e o 59 ainda não rodou desde então. Não há o que cobrar de ' +
      'ninguém: é só a ordem em que os dois relatórios chegaram.',
  },
};

/**
 * Guardada por um minuto (`VALIDADE_58_MS`): o 58 muda a cada importação de
 * setor. O «Atualizar» do painel descarta na hora — ver `cache59.ts`.
 */
export function buscarPendencias(
  empresaId: string,
  mes: string,
  opcoes: { setorId?: string | null; limite?: number } = {},
): Promise<Pendencia[]> {
  return lerDo59(['pendencias', empresaId, mes, opcoes.setorId, opcoes.limite],
    () => buscarPendenciasNoBanco(empresaId, mes, opcoes), VALIDADE_58_MS);
}

async function buscarPendenciasNoBanco(
  empresaId: string,
  mes: string,
  opcoes: { setorId?: string | null; limite?: number } = {},
): Promise<Pendencia[]> {
  const { data, error } = await rpcSemTipo<{
    id: string; setor_id: string | null; setor_nome: string | null;
    operador_usuario: string; operador_nome: string; codigo: string;
    data_pagamento: string; forma_pagamento: string; valor_recebido: unknown;
    importado_em: string; promocoes_desde: unknown; severidade: Severidade;
    no_59_em_outro_setor: boolean;
  }[]>('fn_analitico_pendencias', {
    p_empresa_id: empresaId,
    p_mes: mes,
    p_setor_id: opcoes.setorId ?? null,
    p_limite: opcoes.limite ?? 300,
  });
  if (error) throw new Error(error.message);

  return (data ?? []).map(p => ({
    id:              p.id,
    setorId:         p.setor_id,
    setorNome:       p.setor_nome,
    operadorUsuario: p.operador_usuario,
    operadorNome:    p.operador_nome,
    nr:              p.codigo,
    dia:             p.data_pagamento,
    formaPagamento:  p.forma_pagamento,
    valor:           n(p.valor_recebido),
    importadoEm:     p.importado_em,
    promocoesDesde:  n(p.promocoes_desde),
    severidade:      p.severidade,
    no59EmOutroSetor: p.no_59_em_outro_setor,
  }));
}

export function buscarResumoPendencias(
  empresaId: string,
  mes: string,
): Promise<ResumoPendencia[]> {
  return lerDo59(['pendencias-resumo', empresaId, mes],
    () => buscarResumoPendenciasNoBanco(empresaId, mes), VALIDADE_58_MS);
}

async function buscarResumoPendenciasNoBanco(
  empresaId: string,
  mes: string,
): Promise<ResumoPendencia[]> {
  const { data, error } = await rpcSemTipo<{
    setor_id: string | null; setor_nome: string | null;
    severidade: Severidade; linhas: unknown; valor: unknown;
  }[]>('fn_analitico_pendencias_resumo', { p_empresa_id: empresaId, p_mes: mes });
  if (error) throw new Error(error.message);

  return (data ?? []).map(r => ({
    setorId:    r.setor_id,
    setorNome:  r.setor_nome,
    severidade: r.severidade,
    linhas:     n(r.linhas),
    valor:      n(r.valor),
  }));
}

/** Um total por severidade, para os cartões do topo. */
export function totalPorSeveridade(
  resumo: ResumoPendencia[],
): Array<{ severidade: Severidade; linhas: number; valor: number }> {
  const por = new Map<Severidade, { linhas: number; valor: number }>();
  for (const r of resumo) {
    const atual = por.get(r.severidade) ?? { linhas: 0, valor: 0 };
    por.set(r.severidade, { linhas: atual.linhas + r.linhas, valor: atual.valor + r.valor });
  }
  return ORDEM_SEVERIDADE
    .filter(s => por.has(s))
    .map(s => ({ severidade: s, ...por.get(s)! }));
}
