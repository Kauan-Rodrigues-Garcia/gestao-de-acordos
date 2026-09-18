/**
 * calculoPremiacoes.ts — as linhas do «Relatório de Premiações e Comissões».
 *
 * Pedido de 18/09/2026: a planilha que circulava (Crachá · Nome · Setor ·
 * Comissão · Premiação · Obs.) vira aba do Fechamento, com a premiação de quem
 * já bateu importada sozinha.
 *
 * ## Uma coluna por cidade, e a cidade vem do RH
 *
 * Birigui recebe PREMIAÇÃO e Marília COMISSÃO. Quem diz isso é o vínculo setor →
 * cidade + tipo do RH Gestão (`rh_config_setores`), e não o nome do setor aqui
 * no código: a linha só preenche a coluna do tipo do setor dela, e a outra fica
 * vazia («não se aplica»). Setor sem vínculo não preenche nenhuma.
 *
 * ## O valor é a comissão por meta do mês
 *
 * O mesmo `calcularComissao` do RH e da tela de Metas: faixa atingida × % do
 * mês, com o benefício do setor quando confirmado. Bônus não entra — a regra do
 * RH (16/09/2026).
 *
 *   bateu uma faixa ........ o valor
 *   tem meta e não bateu ... R$ 0,00 — é um pagamento de zero, e a Obs. diz quanto faltou
 *   sem meta / sem config .. vazio, com o motivo na Obs.
 *
 * Sem React, sem fetch.
 */
import { formatBRL } from '@/lib/money';
import type { ResultadoComissao } from '@/services/comissao/comissao';
import { rotuloSituacao, type SituacaoFechamento } from '@/services/fechamentoOperadores/situacoes';

export type TipoRemuneracao = 'premiacao' | 'comissao';

export const ROTULO_TIPO: Record<TipoRemuneracao, string> = {
  premiacao: 'Premiação',
  comissao: 'Comissão',
};

export interface VinculoSetor {
  celula: string;
  tipo: TipoRemuneracao;
}

export type EstadoPremiacao =
  /** Bateu ao menos a 1ª faixa. */
  | 'bateu'
  /** Tem meta e configuração, e ainda não bateu. */
  | 'nao_bateu'
  | 'sem_meta'
  | 'sem_config'
  /** O setor não está ligado a nenhuma cidade no RH. */
  | 'sem_cidade';

export interface LinhaPremiacao {
  operadorId: string;
  nome: string;
  equipeNome: string | null;
  setorId: string | null;
  setorNome: string;
  celula: string | null;
  tipo: TipoRemuneracao | null;
  cracha: string | null;
  /** Só na linha do tipo comissão. `null` = vazio. */
  comissao: number | null;
  /** Só na linha do tipo premiação. `null` = vazio. */
  premiacao: number | null;
  estado: EstadoPremiacao;
  /** Faixa atingida (1 = 1ª meta). `null` sem faixa. */
  faixa: number | null;
  obs: string;
}

export interface EntradaLinhaPremiacao {
  operadorId: string;
  nome: string;
  equipeNome: string | null;
  setorId: string | null;
  setorNome: string;
  vinculo: VinculoSetor | null;
  cracha: string | null;
  /** `null` = o cálculo não rodou (peças indisponíveis). */
  resultado: ResultadoComissao | null;
  /** A situação da pessoa neste fechamento, se a gerência informou. */
  situacao: SituacaoFechamento | null;
  /** Mês ainda aberto: «falta» em vez de «faltou». */
  parcial: boolean;
}

/** A situação entra na Obs. quando diz algo — assíduo é o normal. */
function situacaoNaObs(codigo: SituacaoFechamento | null): string | null {
  return !codigo || codigo === 'assiduo' ? null : rotuloSituacao(codigo);
}

function motivo(r: ResultadoComissao | null, tipo: TipoRemuneracao, parcial: boolean): {
  estado: EstadoPremiacao; valor: number | null; faixa: number | null; texto: string;
} {
  const nomeTipo = ROTULO_TIPO[tipo].toLowerCase();
  if (!r) return { estado: 'sem_config', valor: null, faixa: null, texto: 'Cálculo indisponível' };
  if (r.motivo === 'sem_meta') return { estado: 'sem_meta', valor: null, faixa: null, texto: 'Sem meta no mês' };
  if (r.motivo === 'sem_config') {
    return { estado: 'sem_config', valor: null, faixa: null, texto: `${ROTULO_TIPO[tipo]} não configurada no mês` };
  }
  if (!r.atual) {
    const falta = r.faixas.find(f => !f.atingida)?.falta ?? null;
    return {
      estado: 'nao_bateu',
      valor: 0,
      faixa: null,
      texto: falta !== null && falta > 0
        ? `Não bateu a 1ª meta · ${parcial ? 'falta' : 'faltou'} ${formatBRL(falta)}`
        : 'Não bateu a 1ª meta',
    };
  }
  const partes = [`${r.atual.ordem}ª meta`];
  if (r.beneficioAtivo) partes.push('benefício do setor');
  if (r.indireta?.atingida) partes.push('com indireta');
  return {
    estado: 'bateu',
    valor: r.total,
    faixa: r.atual.ordem,
    texto: partes.join(' · ') + (r.total <= 0 ? ` · ${nomeTipo} sem % no mês` : ''),
  };
}

export function montarLinhaPremiacao(e: EntradaLinhaPremiacao): LinhaPremiacao {
  const base = {
    operadorId: e.operadorId,
    nome: e.nome,
    equipeNome: e.equipeNome,
    setorId: e.setorId,
    setorNome: e.setorNome,
    cracha: e.cracha,
  };
  const situacao = situacaoNaObs(e.situacao);

  if (!e.vinculo) {
    return {
      ...base,
      celula: null,
      tipo: null,
      comissao: null,
      premiacao: null,
      estado: 'sem_cidade',
      faixa: null,
      obs: [situacao, 'Setor sem cidade no RH'].filter(Boolean).join(' · '),
    };
  }

  const m = motivo(e.resultado, e.vinculo.tipo, e.parcial);
  return {
    ...base,
    celula: e.vinculo.celula,
    tipo: e.vinculo.tipo,
    comissao: e.vinculo.tipo === 'comissao' ? m.valor : null,
    premiacao: e.vinculo.tipo === 'premiacao' ? m.valor : null,
    estado: m.estado,
    faixa: m.faixa,
    obs: [situacao, m.texto].filter(Boolean).join(' · '),
  };
}

/** Setor e nome, como a planilha: um setor só fica em ordem alfabética. */
export function ordenarLinhasPremiacao(linhas: readonly LinhaPremiacao[]): LinhaPremiacao[] {
  return [...linhas].sort((a, b) =>
    a.setorNome.localeCompare(b.setorNome, 'pt-BR')
    || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export interface TotalTipo {
  total: number;
  /** Linhas do tipo (com cidade ligada a ele). */
  pessoas: number;
  bateram: number;
}

export interface ResumoPremiacoes {
  premiacao: TotalTipo;
  comissao: TotalTipo;
  comCracha: number;
  semCidade: number;
  total: number;
}

export function resumirPremiacoes(linhas: readonly LinhaPremiacao[]): ResumoPremiacoes {
  const vazio = (): TotalTipo => ({ total: 0, pessoas: 0, bateram: 0 });
  const r: ResumoPremiacoes = {
    premiacao: vazio(), comissao: vazio(), comCracha: 0, semCidade: 0, total: linhas.length,
  };
  for (const l of linhas) {
    if (l.cracha) r.comCracha++;
    if (!l.tipo) { r.semCidade++; continue; }
    const t = r[l.tipo];
    t.pessoas++;
    if (l.estado === 'bateu') t.bateram++;
    t.total += (l.tipo === 'premiacao' ? l.premiacao : l.comissao) ?? 0;
  }
  // Soma em centavos para não arrastar resto de ponto flutuante até o card.
  r.premiacao.total = Math.round(r.premiacao.total * 100) / 100;
  r.comissao.total = Math.round(r.comissao.total * 100) / 100;
  return r;
}

/**
 * Crachá como a pessoa digitou, conferido antes de ir ao banco (que confere de
 * novo). Vazio apaga; `undefined` = inválido.
 */
export function lerCracha(texto: string): string | null | undefined {
  const t = texto.trim();
  if (t === '') return null;
  return /^[0-9A-Za-z./-]{1,20}$/.test(t) ? t : undefined;
}
