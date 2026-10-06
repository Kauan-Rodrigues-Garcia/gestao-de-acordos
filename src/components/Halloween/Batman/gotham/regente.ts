/**
 * regente.ts — a cena de Gotham acompanha a música do Batman (pedido de 05/10/2026).
 *
 * Conforme o tema toca:
 *
 *   - a CHUVA começa com a música e enche nos primeiros 25 s — só com a gota do
 *     player ligada (`prefs.chuva`, desligada de fábrica desde 06/10/2026);
 *   - os RAIOS começam depois de 20 s e ficam mais frequentes até o fim (idem:
 *     sem chuva, sem raio nem trovão);
 *   - o VERMELHO chega com a música (06/10/2026): a cena entra na noite de
 *     Gotham, sem vermelho, e avermelha conforme a faixa passa, inteira perto
 *     do fim (`VERMELHO_CHEIO`). Antes ela já entrava toda vermelha;
 *   - os LETREIROS piscam cada vez mais.
 *
 * Tudo multiplicado pela entrada do modo (`nivelAgora`, de `modoBatman`): na
 * entrada e na saída do tema, a cena sobe e desce junto com o vermelho.
 *
 * Os sons (chuva, trovão, ronco do Batmóvel) só tocam com a música TOCANDO,
 * no volume do Som ambiente: quem pausou para ficar com o tema em silêncio não
 * leva um trovão de surpresa.
 *
 * Fora do React: quem desenha lê `niveisAgora()` no próprio quadro.
 */
import { ganhoDoVolume, lerEstadoSom, progresso } from '../../SomAmbiente/motor';
import { FAIXA_BATMAN, lerModoBatman, nivelAgora } from '../modoBatman';

export interface Niveis {
  /** Densidade da chuva (0 a 1). */
  chuva: number;
  /** Frequência dos raios (0 = nenhum). */
  raios: number;
  /** Quanto a cena puxa para o vermelho (0 a 1): o fundo, o tom da cidade, a névoa e a luz vermelha. */
  tom: number;
  /** Quanto os letreiros piscam (0 a 1). */
  piscar: number;
}

const lim = (v: number) => Math.max(0, Math.min(1, v));
/** Em que segundo da música a chuva está cheia. */
export const CHUVA_CHEIA_S = 25;
/** A partir de que segundo caem raios. */
export const RAIOS_DESDE_S = 20;
/** Em que fração da música o vermelho está inteiro. */
export const VERMELHO_CHEIO = 0.9;

/**
 * Os níveis num ponto da música. `ponto`: segundo atual e duração da faixa;
 * `null` quando não se sabe (F5 antes de a música carregar) — vale o meio da
 * faixa. `entrada`: o nível do modo (0 a 1). Puro: dá para testar.
 */
export function niveisNaMusica(ponto: { atual: number; duracao: number } | null, entrada: number): Niveis {
  const e = lim(entrada / 0.5);
  const atual = ponto ? ponto.atual : 60;
  const fracao = ponto && ponto.duracao > 0 ? lim(ponto.atual / ponto.duracao) : 0.5;
  return {
    chuva: e * lim(atual / CHUVA_CHEIA_S),
    raios: atual < RAIOS_DESDE_S ? 0 : e * (0.35 + 1.4 * fracao),
    tom: e * lim(fracao / VERMELHO_CHEIO),
    piscar: e * (0.15 + 0.85 * fracao),
  };
}

// ── Ao vivo ──────────────────────────────────────────────────────────────────

let ultimoPonto: { atual: number; duracao: number } | null = null;

/**
 * A gota do player, suavizada: ligar ou desligar faz a chuva (e os raios) subir
 * ou baixar em ~2 s, em vez de sumir de um quadro para o outro. A primeira
 * leitura (F5) já vale o que está gravado.
 */
let chuvaSuave = -1;
let chuvaEm = 0;
function fatorDaChuva(ligada: boolean): number {
  const alvo = ligada ? 1 : 0;
  const agora = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (chuvaSuave < 0) chuvaSuave = alvo;
  else chuvaSuave += (alvo - chuvaSuave) * (1 - Math.exp(-((agora - chuvaEm) / 1000) * 1.6));
  chuvaEm = agora;
  if (Math.abs(alvo - chuvaSuave) < 0.002) chuvaSuave = alvo;
  return chuvaSuave;
}

/** Os níveis agora. Guarda o último ponto conhecido: pausado, a cena fica onde parou. */
export function niveisAgora(): Niveis {
  const s = lerEstadoSom();
  // Fora do modo, esquece: a próxima entrada começa do ponto dela, não do vermelho da anterior.
  if (lerModoBatman().fase === 'fora') ultimoPonto = null;
  if (s.noAr === FAIXA_BATMAN) {
    const p = progresso();
    if (p) ultimoPonto = p;
  }
  const n = niveisNaMusica(ultimoPonto, nivelAgora());
  const chuva = fatorDaChuva(s.prefs?.chuva === true);
  return { ...n, chuva: n.chuva * chuva, raios: n.raios * chuva };
}

/** O volume dos efeitos (0 a 1): o do Som ambiente com a música do Batman tocando; senão, zero. */
export function volumeDosEfeitos(): number {
  const s = lerEstadoSom();
  if (s.estado !== 'tocando' || s.silenciado || s.noAr !== FAIXA_BATMAN) return 0;
  return ganhoDoVolume(s.prefs.volume);
}

// ── Raio pedido (validação: `?batman=raio`) ──────────────────────────────────

let raiosPedidos = 0;
export const pedirRaio = () => { raiosPedidos++; };
export const raiosPedidosAte = () => raiosPedidos;

/** A música do Batman está tocando (mesmo silenciada)? É quando a cena acontece. */
export function musicaTocando(): boolean {
  const s = lerEstadoSom();
  return s.estado === 'tocando' && s.noAr === FAIXA_BATMAN;
}

// ── Polícia pedida (validação: `?batman=policia`) ────────────────────────────

let policiasPedidas = 0;
export const pedirPolicia = () => { policiasPedidas++; };
export const policiasPedidasAte = () => policiasPedidas;
