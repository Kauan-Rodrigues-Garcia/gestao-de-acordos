/**
 * trilha.ts — a música do lobby da Bruxa do Pântano, presa ao relógio da contagem.
 *
 * ## O pedido (16/10/2026, Cleber)
 *
 * A contagem passa a ter 3 minutos. Quem entra no lobby ouve «The Mad King»
 * (RokNardin) começando quase no início em 10% e subindo até 15% na
 * hora em que a bruxa nasce. A bruxa nasce exatamente no DROP da música, e
 * durante a luta ela segue em 15% (16/10: o Cleber testou 0→20%, 15→30% e 7→20%; ficou 10→15%).
 *
 * ## A conta
 *
 * O que manda é quanto FALTA para a bruxa nascer, não quando a pessoa entrou:
 *
 *     posição da música = drop − falta
 *
 * Então a música começa quando faltam 2:27,4 (32,6 s depois de abrir a contagem),
 * e quem entra no meio cai no mesmo ponto da música que todo mundo. Quem
 * entrou faltando 1:00 ouve a partir do 1:26. Na luta, a conta continua
 * (falta negativa): 1 minuto de luta é o 3:26 da música.
 *
 * O volume sobe em curva (devagar no começo, mais rápido no fim), porque o
 * ouvido percebe volume em escala de potência: subida reta pareceria que a
 * música «pula» no começo e depois para de crescer.
 *
 * Tudo aqui é conta pura (sem áudio nem DOM), para dar para testar.
 */

/** A contagem inteira, do aviso até a bruxa nascer (s). */
export const CONTAGEM_LOBBY_S = 180;
/**
 * O segundo da música em que a bruxa nasce: o DROP, medido no arquivo.
 *
 * O Cleber pediu o 2:26, mas ouvindo achou a música «quase 1 s atrasada». Na
 * energia do arquivo (janelas de 10 ms) a subida começa em 2:27,23 e a pancada
 * do drop cai em 2:27,41: a bruxa nascia 1,4 s antes dele.
 */
export const PONTO_DA_BRUXA_S = 2 * 60 + 27.4;
/** A duração da faixa: o arquivo foi cortado em 4:35 (a espera, 2 min de luta e folga; 3,3 MB em vez de 6,3). */
export const DURACAO_MUSICA_S = 275;
/** O volume na luta (e o teto da subida). */
export const VOLUME_LUTA = 0.15;
/** O volume no primeiro segundo da música. */
export const VOLUME_INICIO = 0.1;
/** A curva da subida (2 = quadrática). */
const CURVA = 2.2;
/** Desvio tolerado antes de pular a música para o ponto certo (s). */
export const TOLERANCIA_S = 0.25;

/** Onde a música deveria estar agora (s), ou `null` se ainda não começou ou já acabou. */
export function posicaoDaMusica(faltaS: number): number | null {
  const pos = PONTO_DA_BRUXA_S - faltaS;
  if (pos < 0 || pos >= DURACAO_MUSICA_S) return null;
  return pos;
}

/** Quanto falta para a música começar (s); 0 se já começou. */
export function faltaParaMusica(faltaS: number): number {
  return Math.max(0, faltaS - PONTO_DA_BRUXA_S);
}

/** O volume de agora (0..1): sobe em curva até `VOLUME_LUTA` na chegada e fica nele. */
export function volumeDaMusica(faltaS: number): number {
  const pos = posicaoDaMusica(faltaS);
  if (pos === null) return 0;
  if (faltaS <= 0) return VOLUME_LUTA;
  const p = pos / PONTO_DA_BRUXA_S;
  return VOLUME_INICIO + (VOLUME_LUTA - VOLUME_INICIO) * Math.pow(p, CURVA);
}

/** Se a música tocando em `atualS` está longe demais de onde deveria (`alvoS`). */
export function precisaPular(atualS: number, alvoS: number): boolean {
  return Math.abs(atualS - alvoS) > TOLERANCIA_S;
}

/** 146 → «2:26». */
export function mmss(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
