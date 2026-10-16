/**
 * sonsMC.ts — os sons da Bruxa do Pântano com os ARQUIVOS do Minecraft.
 *
 * Pedido do Kauan (15/10/2026): «pegar os sons do Minecraft da bruxa, de
 * tomando dano, usando poção, o do XP». Os .ogg vieram do jogo instalado no
 * computador dele (Java 1.21.10) e moram em `public/sons/minecraft/`. São da
 * Mojang: ele escolheu usar os originais sabendo disso.
 *
 * Cada função tem o mesmo nome da sintetizada em `../sons.ts` e toca o
 * arquivo; se o arquivo ainda não baixou (ou o navegador não abre .ogg), toca
 * a sintetizada no lugar. Os arquivos descem uma vez por aba, quando o palco
 * da chefona é montado (`prepararSonsMC`), durante a contagem.
 *
 * A altura de cada som varia um pouco a cada vez, como no jogo (o «pitch»
 * sorteado do Minecraft): a dor de um mob vai de 0,8 a 1,2, a bolinha de XP de
 * 0,55 a 1,25, e a pérola sai bem grave (o arco a 0,4).
 */
import { decodificarAudio, tocarAudio } from '../../sons';
import * as sint from '../sons';

export const PASTA_MC = '/sons/minecraft/';

export type SomMC =
  | 'dano' | 'bebe' | 'joga' | 'ri' | 'comemora' | 'morre' | 'vidro' | 'xp' | 'nivel'
  | 'teleporte' | 'arremesso' | 'totem' | 'desafio' | 'encantar';

const serie = (base: string, n: number) => Array.from({ length: n }, (_, i) => `${base}-${i + 1}`);

/** Os arquivos de cada som (o jogo sorteia um deles a cada vez). */
export const ARQUIVOS_MC: Readonly<Record<SomMC, readonly string[]>> = {
  dano: serie('bruxa-dano', 3),
  bebe: serie('bruxa-bebe', 4),
  joga: serie('bruxa-joga', 3),
  ri: serie('bruxa-ri', 5),
  comemora: ['bruxa-comemora'],
  morre: serie('bruxa-morre', 3),
  vidro: serie('vidro', 3),
  xp: ['xp'],
  nivel: ['nivel'],
  teleporte: serie('teleporte', 2),
  arremesso: ['arremesso'],
  totem: ['totem'],
  desafio: ['desafio'],
  encantar: serie('encantar', 3),
};

/** O volume de cada um, na mesma régua do `pico` dos sintetizados (o `VOLUME` da caça multiplica). */
const GANHO: Readonly<Record<SomMC, number>> = {
  dano: 0.5, bebe: 0.55, joga: 0.5, ri: 0.6, comemora: 0.6, morre: 0.7, vidro: 0.45,
  xp: 0.35, nivel: 0.55, teleporte: 0.5, arremesso: 0.4, totem: 0.7, desafio: 0.55, encantar: 0.6,
};

/** `undefined` = ainda não tentou; `null` = não deu (fica no sintetizado). */
const buffers = new Map<string, AudioBuffer | null>();

/** Baixa e decodifica os arquivos, uma vez por aba. Sem eles, tudo segue no sintetizado. */
export function prepararSonsMC(): void {
  for (const nomes of Object.values(ARQUIVOS_MC)) {
    for (const nome of nomes) {
      if (buffers.has(nome)) continue;
      buffers.set(nome, null);
      void fetch(`${PASTA_MC}${nome}.ogg`)
        .then(r => {
          const tipo = r.headers.get('content-type') ?? '';
          // O servidor devolve a página do app para arquivo que não existe: isso não é som.
          return r.ok && (tipo.startsWith('audio/') || tipo.includes('ogg')) ? r.arrayBuffer() : null;
        })
        .then(dados => (dados ? decodificarAudio(dados) : null))
        .then(b => { if (b) buffers.set(nome, b); })
        .catch((): void => undefined);
    }
  }
}

const sorteia = <T,>(l: readonly T[]): T => l[Math.floor(Math.random() * l.length)];

/** Toca o som pelo arquivo. `false` = não tem o arquivo: quem chamou toca o sintetizado. */
export function tocarMC(som: SomMC, o: { taxa?: number; ganho?: number; atraso?: number } = {}): boolean {
  const prontos = ARQUIVOS_MC[som].map(n => buffers.get(n)).filter((b): b is AudioBuffer => !!b);
  if (!prontos.length) return false;
  tocarAudio(sorteia(prontos), { ganho: GANHO[som] * (o.ganho ?? 1), taxa: o.taxa, atraso: o.atraso });
  return true;
}

/** O «pitch» de mob do jogo: (sorteio − sorteio) × 0,2 + 1. */
const deMob = () => (Math.random() - Math.random()) * 0.2 + 1;

// ── Os sons da chefona (os nomes de `../sons.ts`) ───────────────────────────

/** Ela apanha: o «hmf» da bruxa do jogo. */
export function somDor(): void { if (!tocarMC('dano', { taxa: deMob() })) sint.somDor(); }

/** O gole da poção (curando, ou nas manobras). */
export function somBeber(): void { if (!tocarMC('bebe', { taxa: deMob() })) sint.somBeber(); }

/** A garrafa saindo da mão. */
export function somArremesso(): void { if (!tocarMC('joga', { taxa: 0.8 + Math.random() * 0.4 })) sint.somArremesso(); }

/** A risada dela («hehehe» do jogo). */
export function somGargalhada(): void { if (!tocarMC('ri', { taxa: deMob() })) sint.somGargalhada(); }

/** A comemoração (ela fugiu ou bebeu a cura): a risada longa da bruxa da invasão. */
export function somComemora(): void { if (!tocarMC('comemora', { taxa: deMob() })) sint.somGargalhada(); }

/** A morte. */
export function somMorte(): void { if (!tocarMC('morre', { taxa: deMob() })) sint.somMorte(); }

/** A garrafa estourando. */
export function somVidro(): void { if (!tocarMC('vidro', { taxa: 0.9 + Math.random() * 0.1 })) sint.somVidro(); }

/** A bolinha de XP chegando: cada uma num tom, como no jogo. */
export function somXp(): void { if (!tocarMC('xp', { taxa: (Math.random() - Math.random()) * 0.35 + 0.9 })) sint.somXp(); }

/** Subiu de nível: quando a última bolinha chega. */
export function somNivel(): void { if (!tocarMC('nivel')) sint.somConquista(); }

/** O teleporte da Pérola do Ender (o do Enderman). */
export function somTeleporte(): void { if (!tocarMC('teleporte')) sint.somTeleporte(); }

/** A pérola saindo da mão: o arco do jogo, bem grave. */
export function somPerola(): void { if (!tocarMC('arremesso', { taxa: 0.4 / (Math.random() * 0.4 + 0.8) })) sint.somArremesso(); }

/** O Totem da Imortalidade estourando. */
export function somTotem(): void { if (!tocarMC('totem')) sint.somTotem(); }

/** A conquista: o «desafio concluído» do jogo. */
export function somConquista(): void { if (!tocarMC('desafio')) sint.somConquista(); }

/** A mesa de encantamento. */
export function somEncantamento(): void { if (!tocarMC('encantar')) sint.somEncantamento(); }
