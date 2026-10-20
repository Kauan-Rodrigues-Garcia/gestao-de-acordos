/**
 * leve.ts — a chefona em computador fraco (pedido do Kauan, 15/10/2026: «tudo
 * otimizado para rodar em PCs mais fracos»).
 *
 * A chefona fica LEVE quando qualquer um destes sinais aparece:
 *
 *   - o Modo leve do Gestão está ligado nesta máquina (`lib/modoLeve.ts`);
 *   - o navegador desenha sem placa de vídeo (`Halloween/aguenta.ts`);
 *   - a máquina é modesta pelas dicas do navegador: 4 núcleos ou menos, ou
 *     4 GB ou menos (`maquinaModesta`);
 *   - a própria luta engasgou: o palco mede os quadros e, passando de
 *     `QUADRO_PESADO_MS` em média por `JANELA_S`, liga o leve no meio da luta
 *     (`marcarChefonaLeve`). Vale para a aba até ela fechar.
 *
 * Leve, ela desenha a 30 quadros por segundo e com menos partículas, e as
 * poções que mexem na página inteira trocam o `filter` do `#root` (que obriga o
 * navegador a repintar o Gestão todo a cada quadro) por um véu de cor por cima,
 * que a placa de vídeo só compõe. A luta, os tiros e a vida são os mesmos.
 */
import { semPlacaDeVideo } from '@/components/Halloween/aguenta';
import { maquinaModesta, modoLeveLigado } from '@/lib/modoLeve';

/** A média de duração do quadro (ms) que liga o leve no meio da luta (menos de 25 quadros por segundo). */
export const QUADRO_PESADO_MS = 40;
/** Quantos segundos de quadros entram na média. */
export const JANELA_S = 3;

const CHAVE = 'gestao:chefona-leve';

let engasgou = (() => {
  try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(CHAVE) === '1'; } catch { return false; }
})();

let calculado: boolean | null = null;

/** A chefona deve rodar leve nesta máquina? */
export function chefonaLeve(): boolean {
  if (engasgou) return true;
  if (calculado === null) {
    let modesta = false;
    try {
      const nav = navigator as Navigator & { deviceMemory?: number };
      modesta = maquinaModesta({ nucleos: nav.hardwareConcurrency, memoriaGb: nav.deviceMemory });
    } catch { /* sem dica: fica com os outros sinais */ }
    let semPlaca = false;
    try { semPlaca = semPlacaDeVideo(); } catch { /* sem a pergunta: fica com os outros sinais */ }
    calculado = modesta || semPlaca;
  }
  let modoLeve = false;
  try { modoLeve = modoLeveLigado(); } catch { /* sem localStorage */ }
  return calculado || modoLeve;
}

/** A luta engasgou nesta aba: daqui em diante, leve. */
export function marcarChefonaLeve(): void {
  engasgou = true;
  try { sessionStorage.setItem(CHAVE, '1'); } catch { /* modo privado: vale até recarregar */ }
}

/**
 * O vigia dos quadros: recebe a duração de cada quadro (ms) e diz quando a média
 * de `JANELA_S` passou de `QUADRO_PESADO_MS`. Puro: testado sem navegador.
 */
export function criarVigiaDeQuadros(): (ms: number) => boolean {
  let soma = 0, n = 0;
  return ms => {
    soma += ms;
    n += 1;
    if (soma < JANELA_S * 1000) return false;
    const pesado = soma / n > QUADRO_PESADO_MS;
    soma = 0;
    n = 0;
    return pesado;
  };
}

/** Só para os testes: esquece o que já sabia. */
export function __resetChefonaLeve(): void {
  engasgou = false;
  calculado = null;
}
