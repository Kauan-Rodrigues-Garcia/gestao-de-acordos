/**
 * CenaBatman — o fundo do modo Batman (ver `modoBatman.ts`).
 *
 * Mora atrás do `<main>` (que fica transparente nas telas com cena), junto do
 * `FundoHalloween`. O nível do modo, lido a cada quadro, leva tudo junto:
 *
 *   0 a 50%  — o fundo puxa para um vermelho-escuro (no tema claro também), e
 *              o Halloween de antes (chuva, nuvens, vultos, fantasmas) some na
 *              mesma medida (`--hw-bat`, lido em `halloween.css`);
 *   25 a 75% — sobe a névoa vermelha;
 *   50 a 100% — uma luz vermelha começa a falhar;
 *   fase `dentro` — ele aparece.
 *
 * Dois jeitos:
 *   - `mesa` (Dashboard e Acordos): ele SAI DE TRÁS da tabela, no vão do
 *     cabeçalho — `[data-hw-batman-topo]` diz onde fica o vão e
 *     `[data-hw-batman-chao]`, o primeiro bloco que o esconde do peito para
 *     baixo. Fica parado até a música sair. Onde há lanterna, ela mira nele
 *     (a cabeça vai para `definirAlvoBatman`).
 *   - `vultos` (Analítico): no lugar dos vultos, atrás do vidro fosco — surge
 *     de um lado, fica, some, volta do outro.
 *
 * A foto é recortada (fundo transparente): nenhum retângulo aparece, nem com a
 * luz apagada. Leve como a `Fumaca`: canvas em meia resolução, 30 quadros por
 * segundo, e só as variáveis CSS mudam a cada quadro.
 */
import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { ehTemaEscuro } from '@/lib/temas';
import { cn } from '@/lib/utils';
import { desenharLufada } from '../lufada';
import { definirAlvoBatman, nivelAgora, useModoBatman } from './modoBatman';
import './batman.css';

const FOTO_BATMAN = '/images/halloween/batman.png';
/** Proporção da foto recortada (560 × 714). */
const PROPORCAO = 714 / 560;

const acaso = (min: number, max: number) => min + Math.random() * (max - min);
const lim = (v: number) => Math.max(0, Math.min(1, v));

/** As lufadas vermelhas, feitas uma vez por aba (o ruído é caro). */
let lufadas: HTMLCanvasElement[] | null = null;
function lufadasVermelhas() {
  if (!lufadas) lufadas = [desenharLufada(160, 170, 14, 20), desenharLufada(160, 140, 8, 14), desenharLufada(160, 90, 4, 8), desenharLufada(160, 55, 2, 6)];
  return lufadas;
}

type Particula = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; esc: number; cresce: number; vida: number; dur: number; sprite: number; a: number };

/** Onde ele fica na `mesa`, em px da caixa da cena; `null` se a tela não tem vão para ele. */
function lugarNaMesa(caixa: DOMRect): { x: number; y: number; w: number; h: number } | null {
  const topo = document.querySelector<HTMLElement>('[data-hw-batman-topo]');
  const chao = document.querySelector<HTMLElement>('[data-hw-batman-chao]');
  if (!topo || !chao) return null;
  const t = topo.getBoundingClientRect();
  const filhos = [...topo.children].filter(f => (f as HTMLElement).offsetParent !== null);
  const primeiro = filhos[0]?.getBoundingClientRect();
  const ultimo = filhos.length > 1 ? filhos[filhos.length - 1].getBoundingClientRect() : null;
  // O vão: do fim do texto da esquerda até os botões da direita (ou o fim do cabeçalho).
  const de = (primeiro ? primeiro.right : t.left) + 24;
  const ate = (ultimo && ultimo.width > 0 ? ultimo.left : t.right) - 16;
  const w = Math.round(Math.min(196, Math.max(150, caixa.width * 0.14)));
  const h = w * PROPORCAO;
  if (ate - de < w) return null;
  const x = de + (ate - de - w) * 0.72;
  // O peito (60% da altura) fica logo atrás do topo do bloco de baixo.
  const y = chao.getBoundingClientRect().top + 6 - h * 0.6;
  return { x: x - caixa.left, y: y - caixa.top, w, h };
}

export function FundoBatman({ modo }: { modo: 'mesa' | 'vultos' }) {
  const { resolvedTheme } = useTheme();
  const claro = !ehTemaEscuro(resolvedTheme);
  const { fase } = useModoBatman();
  const raiz = useRef<HTMLDivElement>(null);
  const figura = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);

  // No tema claro, o texto solto no fundo (saudação, título) clareia junto com o vermelho.
  useEffect(() => {
    const pai = raiz.current?.parentElement;
    if (!pai) return;
    pai.classList.toggle('hw-bat-claro', claro);
    return () => { pai.classList.remove('hw-bat-claro'); };
  }, [claro]);

  // ── Analítico: aparece de um lado, fica, some, volta do outro ──
  useEffect(() => {
    const fig = figura.current;
    if (modo !== 'vultos' || !fig) return;
    if (fase !== 'dentro') { fig.classList.remove('visivel'); return; }
    let vivo = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const depois = (ms: number) => new Promise<void>(r => { const t = setTimeout(() => { timers.delete(t); r(); }, ms); timers.add(t); });
    void (async () => {
      let anterior: 'dir' | 'esq' | null = null;
      await depois(400);
      while (vivo) {
        let lado: 'dir' | 'esq' = Math.random() < 0.6 ? 'dir' : 'esq';
        if (lado === anterior && Math.random() < 0.6) lado = lado === 'dir' ? 'esq' : 'dir';
        anterior = lado;
        // Virado para dentro da tela: na direita olha para a esquerda (como na foto).
        fig.style.setProperty('--x', `${lado === 'dir' ? acaso(52, 60) : acaso(8, 18)}%`);
        fig.style.setProperty('--lado', lado === 'dir' ? '1' : '-1');
        fig.style.setProperty('--esc', acaso(0.92, 1.06).toFixed(2));
        await depois(60);
        if (!vivo) return;
        fig.classList.add('visivel');
        await depois(acaso(10_000, 15_000));
        if (!vivo) return;
        fig.classList.remove('visivel');
        await depois(3_600 + acaso(1_200, 3_600));
      }
    })();
    return () => { vivo = false; timers.forEach(clearTimeout); fig.classList.remove('visivel'); };
  }, [modo, fase]);

  // ── O quadro: nível, luz, névoa e o lugar dele ──
  useEffect(() => {
    const el = raiz.current, cv = tela.current, fig = figura.current;
    const pai = el?.parentElement;
    const cx = cv?.getContext('2d');
    if (!el || !cv || !cx || !fig || !pai) return;
    const sprites = lufadasVermelhas();

    let parts: Particula[] = [], perto: Particula[] = [];
    let centro = { x: 0, y: 0, r: 98 };
    const nova = (qualquerLugar: boolean): Particula => ({
      x: acaso(-0.1, 1.1) * cv.width, y: qualquerLugar ? acaso(0, 1.1) * cv.height : cv.height + acaso(20, 120),
      vx: acaso(-6, 10), vy: -acaso(4, 13), rot: Math.random() * 6.28, vr: acaso(-0.12, 0.12), esc: acaso(1.2, 2.4), cresce: acaso(0.03, 0.08),
      vida: qualquerLugar ? acaso(0, 20) : 0, dur: acaso(22, 38), sprite: Math.floor(Math.random() * 4), a: acaso(0.55, 1),
    });
    // A névoa dele: nasce atrás da tabela, sobe devagar e o envolve.
    const novaPerto = (qualquerLugar: boolean): Particula => ({
      x: centro.x + acaso(-0.75, 0.75) * centro.r, y: centro.y + (qualquerLugar ? acaso(-0.6, 0.7) : acaso(0.3, 0.8)) * centro.r,
      vx: acaso(-3, 3), vy: -acaso(1.5, 5), rot: Math.random() * 6.28, vr: acaso(-0.1, 0.1), esc: acaso(0.6, 1.15), cresce: acaso(0.02, 0.05),
      vida: qualquerLugar ? acaso(0, 14) : 0, dur: acaso(12, 22), sprite: Math.floor(Math.random() * 4), a: acaso(0.6, 1),
    });
    const ajustar = () => {
      cv.width = Math.max(1, Math.round(cv.clientWidth / 2));
      cv.height = Math.max(1, Math.round(cv.clientHeight / 2));
      parts = Array.from({ length: Math.round(Math.min(32, Math.max(14, (cv.width * cv.height) / 7000))) }, () => nova(true));
      perto = [];
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(cv);

    // A luz que falha: zumbe, engasga, às vezes apaga ou dá um clarão. Sem
    // degrau seco: apaga e acende com um rastro curto e respira por baixo.
    let luz = 1, luzVis = 1, ate = 0;
    const seq: [number, number][] = [];
    let ultimo = 0, rodando = true;
    let lugar = '';

    const quadro = (agora: number) => {
      if (!rodando) return;
      if (agora - ultimo < 32) { requestAnimationFrame(quadro); return; }
      const dt = Math.min(0.1, (agora - ultimo) / 1000);
      ultimo = agora;

      const nivel = nivelAgora();
      const verm = lim(nivel / 0.5), nevoa = lim((nivel - 0.25) / 0.5), pisca = lim((nivel - 0.5) / 0.5);

      if (agora >= ate) {
        const passo = seq.shift();
        if (passo) { luz = passo[0]; ate = agora + passo[1]; }
        else {
          const s = Math.random();
          if (s < 0.04) seq.push([acaso(0.15, 0.35), acaso(40, 70)], [acaso(0.8, 1), acaso(30, 60)], [acaso(0.02, 0.12), acaso(60, 110)], [acaso(0.6, 0.9), acaso(30, 50)], [acaso(0.05, 0.2), acaso(80, 160)], [1, 0]);
          else if (s < 0.058) seq.push([acaso(0.3, 0.5), 50], [0.02, acaso(900, 2000)], [0.55, 60], [0.08, 90], [0.9, 50], [0.2, 70], [1, 0]);
          else if (s < 0.066) seq.push([1.7, 60], [0.25, 90], [1.5, 50], [0.4, 70], [1.2, 60], [1, 0]);
          else { luz = acaso(0.84, 1); ate = agora + acaso(160, 340); }
        }
      }
      luzVis += (luz - luzVis) * (1 - Math.exp(-dt * (luz < luzVis ? 16 : 11)));
      const respira = 1 + 0.06 * Math.sin((agora / 1000) * (2 * Math.PI / 4.2));
      const luzEf = 1 + (luzVis * respira - 1) * pisca;
      el.style.setProperty('--verm', verm.toFixed(3));
      el.style.setProperty('--luz', luzEf.toFixed(3));
      el.style.setProperty('--luzv', (pisca * Math.min(1.35, luzVis * respira) * 0.9).toFixed(3));
      pai.style.setProperty('--hw-bat', verm.toFixed(3));

      // O lugar dele.
      const caixa = el.getBoundingClientRect();
      let fx: number, fy: number, fw: number, fh: number;
      if (modo === 'mesa') {
        const l = lugarNaMesa(caixa);
        const chave = l ? `${Math.round(l.x)}:${Math.round(l.y)}:${l.w}` : 'sem';
        if (chave !== lugar) {
          lugar = chave;
          el.classList.toggle('hw-bat-sem-lugar', !l);
          if (l) Object.assign(fig.style, { left: `${l.x}px`, top: `${l.y}px`, width: `${l.w}px`, height: `${l.h}px` });
        }
        if (l) {
          ({ x: fx, y: fy, w: fw, h: fh } = l);
          definirAlvoBatman({ x: caixa.left + fx + fw * 0.34, y: caixa.top + fy + fh * 0.3 });
        } else {
          fx = caixa.width * 0.7; fy = 0; fw = 196; fh = 250;
          definirAlvoBatman(null);
        }
      } else {
        fx = fig.offsetLeft; fy = fig.offsetTop; fw = fig.offsetWidth; fh = fig.offsetHeight;
      }
      el.style.setProperty('--lx', `${(((fx + fw * 0.4) / Math.max(1, caixa.width)) * 100).toFixed(1)}%`);
      el.style.setProperty('--ly', `${(((fy + fh * 0.36) / Math.max(1, caixa.height)) * 100).toFixed(1)}%`);
      const novoCentro = { x: (fx + fw * 0.48) / 2, y: (fy + fh * 0.45) / 2, r: fw / 2 };
      if (!perto.length || Math.abs(novoCentro.x - centro.x) > 40 || Math.abs(novoCentro.y - centro.y) > 40) {
        centro = novoCentro;
        perto = Array.from({ length: 14 }, () => novaPerto(true));
      } else centro = novoCentro;

      // A névoa: a geral da tela e a dele.
      cx.clearRect(0, 0, cv.width, cv.height);
      const forca = 0.6 * nevoa * (0.4 + 0.6 * Math.min(1, luzEf));
      const forcaPerto = 0.62 * nevoa * (0.5 + 0.5 * Math.min(1, luzEf));
      const desenhar = (lista: Particula[], f: number, renova: (q: boolean) => Particula) => {
        for (const p of lista) {
          p.vida += dt;
          if (p.vida >= p.dur) { Object.assign(p, renova(false)); continue; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.esc += p.cresce * dt;
          if (f < 0.005) continue;
          const s = sprites[p.sprite], tam = s.width * p.esc;
          cx.globalAlpha = Math.sin((p.vida / p.dur) * Math.PI) * p.a * f;
          cx.setTransform(Math.cos(p.rot), Math.sin(p.rot), -Math.sin(p.rot), Math.cos(p.rot), p.x, p.y);
          cx.drawImage(s, -tam / 2, -tam / 2, tam, tam);
        }
      };
      desenhar(parts, forca, nova);
      // No Analítico a névoa dele só faz sentido com ele na tela.
      desenhar(perto, modo === 'vultos' && !fig.classList.contains('visivel') ? forcaPerto * 0.4 : forcaPerto, novaPerto);
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.globalAlpha = 1;
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
    return () => {
      rodando = false;
      obs.disconnect();
      definirAlvoBatman(null);
      // Saiu da tela no meio do modo: o Halloween de antes volta inteiro aqui.
      pai.style.removeProperty('--hw-bat');
    };
  }, [modo]);

  const naMesa = modo === 'mesa';
  return (
    <div ref={raiz} className={cn('hw-batman', modo)} aria-hidden="true">
      <div className="hw-bat-verm" />
      <div className="hw-bat-luz" />
      {/* Na mesa ele fica NA FRENTE do vidro (nítido); no Analítico, atrás (como os vultos). */}
      {naMesa && <div className="hw-bat-vidro" />}
      <div ref={figura} className={cn('hw-bat-figura', naMesa && fase === 'dentro' && 'visivel')}>
        <div className="sobe"><img src={FOTO_BATMAN} alt="" draggable={false} /></div>
      </div>
      <canvas ref={tela} className="hw-bat-fumaca" />
      {!naMesa && <div className="hw-bat-vidro" />}
    </div>
  );
}

