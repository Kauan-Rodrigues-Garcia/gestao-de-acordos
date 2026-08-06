/**
 * quantidadeParcelas.ts — mudar QUANTAS parcelas um acordo tem.
 * ─────────────────────────────────────────────────────────────────────────────
 * Na BookPlay um acordo parcelado é um GRUPO de linhas (`acordo_grupo_id`), uma
 * por parcela, e a coluna `parcelas` é o total declarado — o "de N" do 3/N.
 * Trocar esse número na edição, sozinho, deixaria o contador mentindo: 8 linhas
 * dizendo "3 parcelas", ou 3 linhas dizendo "8" e cinco parcelas que ninguém
 * nunca cobra.
 *
 * Este módulo decide o que precisa acontecer no banco para o número novo virar
 * verdade. É lógica pura de propósito — quem grava é
 * `quantidadeParcelas.service.ts`, e assim cada caso de borda (reduzir com
 * parcela paga, aumentar acordo com entrada, acordo sem grupo) dá para testar
 * sem tela e sem banco.
 *
 * Regra que vale a pena declarar em voz alta: REDUZIR apaga linha de parcela, e
 * parcela paga é dinheiro já tabulado. Por isso reduzir abaixo de uma parcela
 * paga é bloqueado, não confirmado — nenhuma tela deveria oferecer esse caminho.
 */
import { datasDoLote } from '@/lib/vencimentos';
import { MAX_PARCELAS_LOTE } from '@/services/parcelasLote';
import type { NovaParcelaInput } from '@/services/parcelas.service';

/** O mínimo que o planejamento precisa saber de cada linha do grupo. */
export interface LinhaDoGrupo {
  id:             string;
  numero_parcela: number | null;
  vencimento:     string;
  valor:          number;
  status:         string;
}

export type PlanoQuantidade =
  /** Nada a fazer: o número não mudou. */
  | { acao: 'nada' }
  /** Só o contador muda — nenhuma linha entra ou sai. */
  | { acao: 'contador'; novoTotal: number }
  /** Faltam parcelas para o número novo: estas linhas precisam ser criadas. */
  | { acao: 'criar';    novoTotal: number; inputs: NovaParcelaInput[] }
  /** Sobram parcelas: estas linhas precisam sair (as de número mais alto). */
  | { acao: 'remover';  novoTotal: number; linhas: LinhaDoGrupo[] }
  /** Não dá para fazer, e o motivo é para mostrar ao operador. */
  | { acao: 'bloqueado'; motivo: string };

const numeroDe = (l: LinhaDoGrupo) => l.numero_parcela ?? 1;

/**
 * O que fazer para o grupo passar a ter `novaQuantidade` parcelas.
 *
 * `valorNovasParcelas` é o valor de cada linha criada — num acordo com entrada
 * é o valor das DEMAIS, nunca o da entrada: quem entra é sempre parcela 2 ou
 * posterior.
 */
export function planejarQuantidade(params: {
  linhas:             readonly LinhaDoGrupo[];
  novaQuantidade:     number;
  quantidadeAtual:    number;
  valorNovasParcelas: number;
  tipo:               string;
  isPaguePlay:        boolean;
}): PlanoQuantidade {
  const {
    linhas, novaQuantidade, quantidadeAtual, valorNovasParcelas, tipo, isPaguePlay,
  } = params;

  if (!Number.isFinite(novaQuantidade) || novaQuantidade < 1) {
    return { acao: 'bloqueado', motivo: 'A quantidade de parcelas precisa ser pelo menos 1.' };
  }
  if (novaQuantidade > MAX_PARCELAS_LOTE) {
    return { acao: 'bloqueado', motivo: `A quantidade de parcelas não passa de ${MAX_PARCELAS_LOTE}.` };
  }
  if (novaQuantidade === quantidadeAtual) return { acao: 'nada' };

  const ordenadas = [...linhas].sort((a, b) => numeroDe(a) - numeroDe(b));
  const maiorNumero = ordenadas.length ? numeroDe(ordenadas[ordenadas.length - 1]) : 0;

  // ── Reduzir ───────────────────────────────────────────────────────────────
  if (novaQuantidade < quantidadeAtual) {
    const sobrando = ordenadas.filter(l => numeroDe(l) > novaQuantidade);
    const pagas    = sobrando.filter(l => l.status === 'pago');
    if (pagas.length) {
      const numeros = pagas.map(numeroDe).join(', ');
      return {
        acao: 'bloqueado',
        motivo: pagas.length === 1
          ? `A parcela ${numeros} já está paga e seria apagada. Reduza para ${Math.max(...pagas.map(numeroDe))} ou mais.`
          : `As parcelas ${numeros} já estão pagas e seriam apagadas. Reduza para ${Math.max(...pagas.map(numeroDe))} ou mais.`,
      };
    }
    // Sem linha sobrando: o grupo tinha menos linhas do que o total declarado
    // (as que faltavam eram só as "virtuais" que o detalhe desenha).
    if (!sobrando.length) return { acao: 'contador', novoTotal: novaQuantidade };
    return { acao: 'remover', novoTotal: novaQuantidade, linhas: sobrando };
  }

  // ── Aumentar ──────────────────────────────────────────────────────────────
  const faltam = novaQuantidade - Math.max(maiorNumero, quantidadeAtual);
  if (faltam <= 0) return { acao: 'contador', novoTotal: novaQuantidade };

  const ultima = ordenadas[ordenadas.length - 1];
  if (!ultima?.vencimento) {
    return { acao: 'bloqueado', motivo: 'Não foi possível calcular o vencimento das novas parcelas.' };
  }
  if (!(valorNovasParcelas > 0)) {
    return { acao: 'bloqueado', motivo: 'Não foi possível definir o valor das novas parcelas.' };
  }

  // A primeira data devolvida é a da ÚLTIMA parcela existente — descartada com
  // o slice(1). As novas continuam a cadência do acordo em vez de recomeçar.
  const datas = datasDoLote(ultima.vencimento, faltam + 1, isPaguePlay).slice(1);

  return {
    acao: 'criar',
    novoTotal: novaQuantidade,
    inputs: datas.map(vencimento => ({
      vencimento,
      valor:  valorNovasParcelas,
      tipo,
      status: 'verificar_pendente',
    })),
  };
}

/** Frase pronta para a confirmação de remoção — a tela não monta a sua. */
export function descreverRemocao(plano: Extract<PlanoQuantidade, { acao: 'remover' }>): string {
  const numeros = plano.linhas.map(numeroDe).sort((a, b) => a - b);
  return numeros.length === 1
    ? `A parcela ${numeros[0]} será apagada.`
    : `As parcelas ${numeros.join(', ')} serão apagadas.`;
}
