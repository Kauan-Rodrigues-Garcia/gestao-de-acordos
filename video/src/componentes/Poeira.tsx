// A poeira das cenas 1 e 2. Cada grão nasce de uma peça que se desfaz
// (planilha, relatório, post-it…), flutua para a direita e para cima, e na
// cena 2 é puxado para formar as duas logos — a verde e a azul.
//
// Desenhado em <canvas>: são ~1.500 grãos por quadro.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, random, staticFile, useCurrentFrame } from 'remotion';
import type { Emissor } from '../cenas/Cena01Problema';
import { FPS, SUAVE_IDA_VOLTA } from '../movimento';

export type Alvo = { x: number; y: number; cor: [number, number, number] };

export type LogoAlvo = { src: string; cx: number; cy: number; tamanho: number; cor: [number, number, number]; quantidade: number };

type Props = {
  emissores: Emissor[];
  logos: LogoAlvo[];
  /** Frame em que os grãos começam a ser puxados para as logos. */
  convergeEm: number;
  /** Quanto dura a viagem de cada grão (frames). */
  viagem: number;
  /** Frame em que a poeira some (as logos de verdade assumem). */
  someEm: number;
  duracaoSumico: number;
};

function hexParaRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lê os pixels da logo e devolve pontos espalhados sobre o traço. */
async function amostrarLogo(logo: LogoAlvo): Promise<Alvo[]> {
  const img = new Image();
  img.src = logo.src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = logo.tamanho;
  c.height = logo.tamanho;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, logo.tamanho, logo.tamanho);
  const { data } = ctx.getImageData(0, 0, logo.tamanho, logo.tamanho);
  const pontos: Alvo[] = [];
  for (let y = 0; y < logo.tamanho; y += 2) {
    for (let x = 0; x < logo.tamanho; x += 2) {
      if (data[(y * logo.tamanho + x) * 4 + 3] > 140) {
        pontos.push({ x: logo.cx - logo.tamanho / 2 + x, y: logo.cy - logo.tamanho / 2 + y, cor: logo.cor });
      }
    }
  }
  // embaralha de forma determinística e corta na quantidade pedida
  const embaralhados = pontos
    .map((p, i) => ({ p, k: random(`logo-${logo.src}-${i}`) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, logo.quantidade)
    .map((x) => x.p);
  return embaralhados;
}

type Grao = {
  x0: number;
  y0: number;
  nasce: number;
  vx: number;
  vy: number;
  fase: number;
  tam: number;
  cor: [number, number, number];
  atraso: number;
  curva: number;
};

export const Poeira: React.FC<Props> = ({ emissores, logos, convergeEm, viagem, someEm, duracaoSumico }) => {
  const frame = useCurrentFrame();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [alvos, setAlvos] = useState<Alvo[] | null>(null);
  const [handle] = useState(() => delayRender('amostrando logos'));

  useEffect(() => {
    Promise.all(logos.map(amostrarLogo)).then((lista) => {
      setAlvos(lista.flat());
      continueRender(handle);
    });
  }, [handle, logos]);

  const graos = useMemo<Grao[]>(() => {
    const lista: Grao[] = [];
    for (const e of emissores) {
      const cores = e.cores.map(hexParaRgb);
      for (let i = 0; i < e.quantidade; i++) {
        const k = `${e.id}-${i}`;
        const u = random(`u-${k}`);
        const v = random(`v-${k}`);
        lista.push({
          x0: e.x + u * e.w,
          y0: e.y + v * e.h,
          // acompanha a varredura do filtro: a esquerda some primeiro
          nasce: e.inicio + (u * 0.7 + random(`n-${k}`) * 0.3) * e.duracao,
          vx: 40 + random(`vx-${k}`) * 170,
          vy: -(20 + random(`vy-${k}`) * 120),
          fase: random(`f-${k}`) * Math.PI * 2,
          tam: 2.2 + random(`t-${k}`) * 3.6,
          cor: cores[Math.floor(random(`c-${k}`) * cores.length)],
          atraso: random(`a-${k}`) * 0.35 * viagem,
          curva: (random(`cv-${k}`) - 0.5) * 260,
        });
      }
    }
    return lista;
  }, [emissores, viagem]);

  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !alvos) return;
    ctx.clearRect(0, 0, 1920, 1080);
    const sumico = Math.min(1, Math.max(0, (frame - someEm) / duracaoSumico));
    if (sumico >= 1) return;

    graos.forEach((g, i) => {
      if (frame < g.nasce) return;
      // posição flutuando, calculada até o frame `ate`
      const pos = (ate: number) => {
        const t = (ate - g.nasce) / FPS;
        return {
          x: g.x0 + g.vx * t + Math.sin(t * 2.2 + g.fase) * 10,
          y: g.y0 + g.vy * t + Math.cos(t * 1.7 + g.fase) * 8 - 12 * t * t,
        };
      };
      const vida = (frame - g.nasce) / FPS;
      const alvo = alvos[i];
      const inicioViagem = convergeEm + g.atraso;
      let x: number;
      let y: number;
      let a: number;
      let cor = g.cor;
      let tam = g.tam;

      if (frame < inicioViagem || !alvo) {
        const p = pos(Math.min(frame, inicioViagem));
        x = p.x;
        y = p.y;
        // brilha ao nascer e vai apagando até um resto de brilho
        a = Math.max(0.5, 1 - vida * 0.3);
        if (!alvo && frame >= convergeEm) a *= Math.max(0, 1 - (frame - convergeEm) / 30);
      } else {
        const de = pos(inicioViagem);
        const k = SUAVE_IDA_VOLTA(Math.min(1, (frame - inicioViagem) / viagem));
        // curva lateral: sai em arco, chega reto
        const dx = alvo.x - de.x;
        const dy = alvo.y - de.y;
        const len = Math.hypot(dx, dy) || 1;
        const arco = Math.sin(k * Math.PI) * g.curva * Math.min(1, len / 600);
        x = de.x + dx * k + (-dy / len) * arco;
        y = de.y + dy * k + (dx / len) * arco;
        a = 0.5 + 0.5 * k;
        cor = [0, 1, 2].map((c) => Math.round(g.cor[c] + (alvo.cor[c] - g.cor[c]) * k)) as [number, number, number];
        tam = g.tam + (2.6 - g.tam) * k;
      }
      a *= 1 - sumico;
      if (a <= 0.01) return;
      ctx.fillStyle = `rgba(${cor[0]},${cor[1]},${cor[2]},${a})`;
      ctx.fillRect(x - tam / 2, y - tam / 2, tam, tam);
    });
  }, [frame, alvos, graos, convergeEm, viagem, someEm, duracaoSumico]);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <canvas ref={canvas} width={1920} height={1080} style={{ width: 1920, height: 1080 }} />
    </AbsoluteFill>
  );
};

export const logoSrc = (arquivo: string) => staticFile(`marca/${arquivo}`);
