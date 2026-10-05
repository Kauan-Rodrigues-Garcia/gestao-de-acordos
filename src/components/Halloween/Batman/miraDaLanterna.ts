/**
 * miraDaLanterna.ts — no modo Batman, a lanterna para de procurar e mira nele.
 *
 * Pedido de 05/10/2026: enquanto o tema entra, o vai e vem da lanterna para
 * e ela vai virando devagar até o centro do feixe passar pela cabeça dele
 * (`alvoBatman`, publicado pela `CenaBatman`); quando ele aparece, a luz dá uma
 * piscada. Em cima dele o foco perde força — sem isso o amarelo lavava o
 * desenho. Na saída, ela volta exatamente ao começo do vai e vem e o CSS
 * reassume sem pulo.
 *
 * Enquanto mira, quem mexe no feixe é o código (`[data-mira]` desliga as
 * animações de CSS). A conta: o braço gira em volta do ombro, que fica em
 * (-31, -34) do ponto da lanterna; o centro do feixe é a reta y = 0 do braço.
 */
import { useEffect, useRef } from 'react';
import { alvoBatman, lerModoBatman, nivelAgora, useModoBatman } from './modoBatman';

const lim = (v: number) => Math.max(0, Math.min(1, v));
/** Onde o foco fica com o alcance inteiro (px do braço). */
const ALCANCE = 418;
/** O começo do vai e vem do CSS (`hw-procura` 0% e `hw-alcance` from): de onde ela sai e para onde volta. */
const INICIO_DO_CSS = { ang: 2, x: ALCANCE - 120 };

/** Ângulo (graus) e alcance do foco para o centro do feixe passar por `alvo`. Puro: dá para testar. */
export function mirar(lanterna: { x: number; y: number }, alvo: { x: number; y: number }): { ang: number; x: number } {
  const dx = alvo.x - lanterna.x + 31, dy = alvo.y - lanterna.y + 34;
  const L = Math.sqrt(Math.max(dx * dx + dy * dy - 34 * 34, 1));
  const ang = ((Math.atan2(dy, dx) - Math.atan2(34, L)) * 180) / Math.PI;
  // Nunca para trás nem para cima da barra.
  return { ang: Math.max(-4, Math.min(70, ang)), x: Math.max(120, L - 31) };
}

function lerAtual(giro: HTMLElement, foco: HTMLElement): { ang: number; x: number } {
  const m = (el: HTMLElement) => {
    const t = getComputedStyle(el).transform;
    const v = t && t !== 'none' ? t.match(/matrix\(([^)]+)\)/)?.[1].split(',').map(Number) : null;
    return v && v.length === 6 ? v : [1, 0, 0, 1, 0, 0];
  };
  const g = m(giro), f = m(foco);
  return { ang: (Math.atan2(g[1], g[0]) * 180) / Math.PI, x: ALCANCE + f[4] };
}

export function useMiraNoBatman() {
  const raiz = useRef<HTMLDivElement>(null);
  const giro = useRef<HTMLDivElement>(null);
  const cone = useRef<HTMLDivElement>(null);
  const foco = useRef<HTMLDivElement>(null);
  const trilho = useRef<HTMLDivElement>(null);
  // Liga com o modo e desliga quando ele volta a `fora` — o que só acontece com
  // o nível já em zero, ou seja, com a lanterna de volta ao começo do vai e vem.
  const ativo = useModoBatman().fase !== 'fora';

  useEffect(() => {
    const r = raiz.current, g = giro.current, c = cone.current, f = foco.current, tr = trilho.current;
    if (!ativo || !r || !g || !c || !f) return;
    let base = lerAtual(g, f);
    let mira = { ang: 5, x: ALCANCE };
    let faseAntes = lerModoBatman().fase;
    let ultimo = 0, vivo = true, ultimoQuadro = '';
    let pisca: ReturnType<typeof setTimeout> | undefined;
    // Atributo e não classe: o React reescreve o `className` quando a lanterna
    // muda de estado (desligar, susto) e levaria a marca junto.
    r.setAttribute('data-mira', '');

    const quadro = (agora: number) => {
      if (!vivo) return;
      if (agora - ultimo < 32) { requestAnimationFrame(quadro); return; }
      ultimo = agora;
      const faseAgora = lerModoBatman().fase;
      if (faseAgora !== faseAntes) {
        // Saindo: volta para o começo do vai e vem (o CSS reassume dali).
        if (faseAgora === 'saindo') base = INICIO_DO_CSS;
        if (faseAgora === 'dentro') {
          r.removeAttribute('data-mira-pisca');
          void r.offsetWidth;
          r.setAttribute('data-mira-pisca', '');
          clearTimeout(pisca);
          pisca = setTimeout(() => r.removeAttribute('data-mira-pisca'), 750);
        }
        faseAntes = faseAgora;
      }
      const w = lim(nivelAgora() / 0.5), m = w * w * (3 - 2 * w);
      const alvo = alvoBatman();
      if (alvo) {
        const p = r.getBoundingClientRect();
        mira = mirar({ x: p.left, y: p.top }, alvo);
      }
      const ang = base.ang + (mira.ang - base.ang) * m;
      const x = base.x + (mira.x - base.x) * m;
      // Parada em cima dele (tema inteiro no ar): nada muda, nada é reescrito.
      const chave = `${ang.toFixed(2)}|${x.toFixed(1)}|${m.toFixed(3)}`;
      if (chave !== ultimoQuadro) {
        ultimoQuadro = chave;
        g.style.transform = `rotate(${ang.toFixed(2)}deg)`;
        c.style.transform = `scaleX(${(x / ALCANCE).toFixed(3)})`;
        f.style.transform = `translate(${(x - ALCANCE).toFixed(1)}px, -50%)`;
        if (tr) tr.style.transform = `translateX(${(x - ALCANCE).toFixed(1)}px)`;
        r.style.setProperty('--foco', (1 - 0.88 * m).toFixed(3));
        r.style.setProperty('--cone', (1 - 0.55 * m).toFixed(3));
      }
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);

    // Fim do modo (ou a lanterna saiu da tela): devolve o feixe ao CSS, que
    // recomeça do começo do vai e vem — onde ela já está.
    return () => {
      vivo = false;
      clearTimeout(pisca);
      for (const el of [g, c, f, tr]) el?.style.removeProperty('transform');
      r.style.removeProperty('--foco');
      r.style.removeProperty('--cone');
      r.removeAttribute('data-mira');
      r.removeAttribute('data-mira-pisca');
    };
  }, [ativo]);

  return { raiz, giro, cone, foco, trilho };
}
