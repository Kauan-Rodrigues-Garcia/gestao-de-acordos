/**
 * Destaque.tsx — a cena «Destaque do dia»: escolhe o estilo pelo campo
 * «Estilo» da tela (29/10/2026: gibi, sério, fofo, pixel art, neon e jornal).
 *
 * «Surpresa» sorteia um estilo cada vez que a cena entra no rodízio — a TV e
 * a prévia podem sortear diferente, e tudo bem.
 */
import { useState } from 'react';
import { opcao } from '../templates';
import type { PropsEstilo } from './comum';
import { DestaqueGibi } from './Gibi';
import { DestaqueSerio } from './Serio';
import { DestaqueFofo } from './Fofo';
import { DestaquePixel } from './Pixel';
import { DestaqueNeon } from './Neon';
import { DestaqueJornal } from './Jornal';

const ESTILOS = {
  gibi: DestaqueGibi,
  serio: DestaqueSerio,
  fofo: DestaqueFofo,
  pixel: DestaquePixel,
  neon: DestaqueNeon,
  jornal: DestaqueJornal,
} as const;

type Estilo = keyof typeof ESTILOS;
const NOMES = Object.keys(ESTILOS) as Estilo[];

export function Destaque(props: PropsEstilo) {
  const escolhido = opcao<string>(props.tela, 'estilo');
  const [sorteado] = useState<Estilo>(() => NOMES[Math.floor(Math.random() * NOMES.length)]);
  const estilo: Estilo = escolhido === 'surpresa' ? sorteado : (escolhido in ESTILOS ? escolhido as Estilo : 'gibi');
  const Desenho = ESTILOS[estilo];
  return <Desenho {...props} />;
}
