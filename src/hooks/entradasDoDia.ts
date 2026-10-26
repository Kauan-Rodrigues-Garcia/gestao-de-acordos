/**
 * entradasDoDia.ts — o «Entrou agora» do desafio do dia, um por desafio para a
 * sessão inteira (26/10/2026).
 *
 * Antes cada `usePlacarDoDia` comparava as leituras por conta própria, e o
 * card guardava a lista no próprio estado. Três defeitos saíam disso:
 *
 *   • a gaveta fica montada depois do primeiro clique e guardava a última
 *     leitura de quando foi fechada: aberta horas depois (ou aberta em OUTRO
 *     desafio), anunciava tudo o que entrou nesse meio tempo — ou o placar
 *     inteiro do outro desafio — como um lote só, com a hora de agora;
 *   • o card começava vazio a cada abertura, mesmo com a pílula tendo visto
 *     os pagamentos chegarem;
 *   • uma releitura sem novidade dentro dos 9 s do anúncio cancelava o timer,
 *     e o anúncio da pílula ficava preso até o lote seguinte.
 *
 * Aqui a comparação é uma só por desafio, contra a última leitura de qualquer
 * tela, e a lista é compartilhada: a pílula, a gaveta e a tela do desafio
 * contam a mesma história.
 */
import { entradasNovas, linhasDoPlacar, type Contribuinte, type Entrada, type PlacarDoDia } from '@/services/desafios/desafioDoDia';

/** Um lote que entrou: o que mudou entre duas leituras seguidas. */
export interface LoteDeEntradas {
  id: number;
  /** Quando a leitura chegou (ms). */
  em: number;
  entradas: Entrada[];
}

/** Quantos lotes o card guarda. */
export const LOTES_NO_FEED = 6;

/**
 * Leitura anterior mais velha que isto não serve de comparação: a diferença
 * seria o acumulado, não o que «entrou agora». Uma rodada do robô (1 h) e
 * folga — com a aba em segundo plano a releitura de 5 min para, e só o sinal
 * do relatório acorda o placar.
 */
export const COMPARACAO_MAX_MS = 70 * 60 * 1000;

const vistos = new Map<string, { linhas: Contribuinte[]; em: number }>();
const feeds = new Map<string, LoteDeEntradas[]>();
const ouvintes = new Set<() => void>();
const VAZIO: LoteDeEntradas[] = [];
let proximoLote = 1;

/**
 * Registra uma leitura do placar. Chamada a cada busca que volta do banco,
 * mesmo sem novidade — é isso que mantém a última leitura fresca.
 *
 * @param em       quando a busca voltou (ms) — o `dataUpdatedAt` da consulta.
 * @param anunciar a tela acompanha ao vivo. Quem lê uma vez ao abrir (o
 *                 gerente que só enxerga o desafio) atualiza a comparação mas
 *                 não anuncia: a diferença para a visita anterior não é «agora».
 */
export function registrarLeitura(desafioId: string, placar: PlacarDoDia, em: number, anunciar = true): void {
  const anterior = vistos.get(desafioId);
  // Leitura repetida (outra tela com o mesmo cache) ou fora de ordem: nada.
  if (anterior && em <= anterior.em) return;
  const linhas = linhasDoPlacar(placar);
  vistos.set(desafioId, { linhas, em });
  // A primeira leitura, e a que vem depois de um buraco, não são «entrada»:
  // são o placar que já existia.
  if (!anunciar || !anterior || em - anterior.em > COMPARACAO_MAX_MS) return;
  const novas = entradasNovas(anterior.linhas, linhas);
  if (!novas.length) return;
  const lote: LoteDeEntradas = { id: proximoLote++, em, entradas: novas };
  feeds.set(desafioId, [lote, ...(feeds.get(desafioId) ?? VAZIO)].slice(0, LOTES_NO_FEED));
  for (const f of ouvintes) f();
}

/** Os lotes do desafio, o mais novo primeiro. Mesma referência até mudar. */
export function feedDoDesafio(desafioId: string | null): LoteDeEntradas[] {
  return (desafioId && feeds.get(desafioId)) || VAZIO;
}

export function ouvirEntradas(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** Só para teste. */
export function zerarEntradas(): void {
  vistos.clear();
  feeds.clear();
  proximoLote = 1;
}
