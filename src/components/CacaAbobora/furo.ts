/**
 * furo.ts — o tiro que pegou na parede: um furo e um pouco de poeira, com o
 * disparo e o ricochete. Do zumbi comum (`cena.tsx`) e do chefão
 * (`cenaChefao.tsx`).
 */
import { somRicochete, somTiro } from './sons';

export function furo(x: number, y: number): void {
  somTiro();
  somRicochete();
  const el = document.createElement('div');
  el.className = 'zb-furo';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 700);
}
