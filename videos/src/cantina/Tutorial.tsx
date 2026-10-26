// O tutorial escrito (cópia do de `pix-automatico`, que ainda está fora da
// main): no lugar da narração, um balão preso à peça da tela de que ele fala.
// A peça ganha um contorno na cor do sistema; um fio liga o contorno ao balão;
// o balão diz o que é e para que serve.
//
// O contorno mora DENTRO da câmera (coordenadas do app), o balão FORA dela, em
// pixels da tela: assim o texto tem sempre o mesmo tamanho, legível, por mais
// que a câmera aproxime ou afaste.

import { Check } from 'lucide-react';
import { useCurrentFrame } from 'remotion';
import { naTela, type Quadro } from './camera';
import { ACELERA, entre, mola, ms } from '../movimento';
import { COR, FONTE, SOMBRA_FLUTUA } from '../tema';
import type { Ret } from './geo';

export type Lado = 'cima' | 'baixo' | 'esquerda' | 'direita';

export type Dica = {
  de: number;
  ate: number;
  /** A peça, em coordenadas do app NO FRAME (já com a rolagem). */
  alvo: (f: number) => Ret;
  lado: Lado;
  /** «1», «2»…: o selo redondo do balão. Sem ele, o balão é só texto. */
  selo?: string;
  titulo: string;
  texto?: string;
  largura?: number;
  /** Distância do balão até a peça, em px da tela. */
  distancia?: number;
  /** Desloca o balão ao longo do lado (px da tela), para não cobrir algo. */
  desvio?: number;
};

/** Quanto do balão está à vista no frame: 0 → 1 → 0. */
function presenca(f: number, d: Dica) {
  if (f < d.de || f > d.ate) return 0;
  const entra = mola(f, d.de, { mass: 1, stiffness: 190, damping: 20, overshootClamping: false });
  const sai = entre(f, d.ate - ms(260), d.ate, 0, 1, ACELERA);
  return Math.max(0, Math.min(1.05, entra) * (1 - sai));
}

/** O contorno da peça, dentro da câmera. */
export const Realces: React.FC<{ dicas: Dica[] }> = ({ dicas }) => {
  const f = useCurrentFrame();
  return (
    <>
      {dicas.map((d, i) => {
        const p = Math.min(1, presenca(f, d));
        if (p <= 0.001) return null;
        const r = d.alvo(f);
        const folga = 6;
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: r.x - folga, top: r.y - folga, width: r.l + 2 * folga, height: r.a + 2 * folga,
              borderRadius: 14, pointerEvents: 'none', zIndex: 50,
              border: `2.5px solid color-mix(in oklch, var(--primary) ${Math.round(90 * p)}%, transparent)`,
              boxShadow: `0 0 0 ${7 * p}px color-mix(in oklch, var(--primary) ${Math.round(14 * p)}%, transparent)`,
            }}
          />
        );
      })}
    </>
  );
};

/** O ponto da peça de onde sai o fio: o meio da borda do lado do balão. */
function ancora(r: Ret, lado: Lado) {
  const folga = 9;
  if (lado === 'baixo') return { x: r.x + r.l / 2, y: r.y + r.a + folga };
  if (lado === 'cima') return { x: r.x + r.l / 2, y: r.y - folga };
  if (lado === 'esquerda') return { x: r.x - folga, y: r.y + r.a / 2 };
  return { x: r.x + r.l + folga, y: r.y + r.a / 2 };
}

/** Os balões, em pixels da tela. */
export const Baloes: React.FC<{ dicas: Dica[]; camEm: (f: number) => Quadro }> = ({ dicas, camEm }) => {
  const f = useCurrentFrame();
  const cam = camEm(f);
  return (
    <>
      {dicas.map((d, i) => {
        const p = presenca(f, d);
        if (p <= 0.001) return null;
        const a = naTela(ancora(d.alvo(f), d.lado), cam);
        const largura = d.largura ?? 420;
        const dist = d.distancia ?? 64;
        const desvio = d.desvio ?? 0;
        // o canto do balão, conforme o lado; preso dentro da tela com margem
        let x = a.x - largura / 2 + desvio;
        let y = a.y + dist;
        if (d.lado === 'cima') y = a.y - dist;
        if (d.lado === 'esquerda') { x = a.x - dist - largura; y = a.y + desvio; }
        if (d.lado === 'direita') { x = a.x + dist; y = a.y + desvio; }
        x = Math.max(28, Math.min(1920 - 28 - largura, x));
        const verticalCentro = d.lado === 'esquerda' || d.lado === 'direita';
        const transformCaixa = d.lado === 'cima' ? 'translateY(-100%)' : verticalCentro ? 'translateY(-50%)' : undefined;
        // o fio vai da peça até a borda do balão mais próxima
        const fimFio = d.lado === 'baixo' ? { x: Math.max(x + 24, Math.min(x + largura - 24, a.x)), y }
          : d.lado === 'cima' ? { x: Math.max(x + 24, Math.min(x + largura - 24, a.x)), y }
            : d.lado === 'esquerda' ? { x: x + largura, y: a.y + desvio } : { x, y: a.y + desvio };
        const fio = Math.min(1, entre(f, d.de, d.de + ms(320), 0, 1));
        const fx = a.x + (fimFio.x - a.x) * fio;
        const fy = a.y + (fimFio.y - a.y) * fio;
        const desloca = (1 - Math.min(1, p)) * 16;
        const dx = d.lado === 'esquerda' ? desloca : d.lado === 'direita' ? -desloca : 0;
        const dy = d.lado === 'cima' ? desloca : d.lado === 'baixo' ? -desloca : 0;
        return (
          <div key={i} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: Math.min(1, p * 1.3) }}>
            <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
              <line x1={a.x} y1={a.y} x2={fx} y2={fy} stroke="var(--primary)" strokeWidth={2.5} strokeDasharray="2 6" strokeLinecap="round" />
              <circle cx={a.x} cy={a.y} r={6.5} fill="var(--primary)" stroke="#ffffff" strokeWidth={2.5} />
              <circle cx={a.x} cy={a.y} r={6.5 + 10 * ((f / 60) % 1.2) / 1.2} fill="none" stroke="var(--primary)" strokeOpacity={0.5 * (1 - ((f / 60) % 1.2) / 1.2)} strokeWidth={2} />
            </svg>
            <div
              style={{
                position: 'absolute', left: x, top: y, width: largura,
                transform: `${transformCaixa ?? ''} translate(${dx}px, ${dy}px) scale(${0.94 + 0.06 * Math.min(1, p)})`,
                transformOrigin: d.lado === 'cima' ? '50% 100%' : d.lado === 'baixo' ? '50% 0%' : d.lado === 'esquerda' ? '100% 50%' : '0% 50%',
                fontFamily: FONTE, background: '#ffffff', borderRadius: 18, boxShadow: SOMBRA_FLUTUA,
                border: '1px solid rgba(15,27,38,0.08)', padding: '18px 22px 19px', display: 'flex', gap: 14, alignItems: 'flex-start',
              }}
            >
              {d.selo && (
                <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 18, background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>
                  {d.selo}
                </span>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: COR.texto, letterSpacing: -0.4, lineHeight: 1.2 }}>{d.titulo}</div>
                {d.texto && <div style={{ marginTop: 6, fontSize: 20.5, fontWeight: 500, color: COR.textoSuave, lineHeight: 1.38 }}>{d.texto}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
};

// ── a barra de etapas, embaixo da manchete ──────────────────────────────
export type Etapa = { rotulo: string; de: number };

export const Etapas: React.FC<{ etapas: Etapa[]; ate: number; y?: number }> = ({ etapas, ate, y = 132 }) => {
  const f = useCurrentFrame();
  const aparece = entre(f, etapas[0].de, etapas[0].de + ms(500), 0, 1);
  const some = entre(f, ate, ate + ms(350), 0, 1, ACELERA);
  if (aparece <= 0 || some >= 1) return null;
  const atual = etapas.reduce((k, e, i) => (f >= e.de ? i : k), 0);
  return (
    <div style={{ position: 'absolute', top: y, width: 1920, display: 'flex', justifyContent: 'center', fontFamily: FONTE, opacity: aparece * (1 - some), transform: `translateY(${(1 - aparece) * 10}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 5, borderRadius: 999, background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(15,27,38,0.08)', boxShadow: '0 4px 14px rgba(15,27,38,0.06)' }}>
        {etapas.map((e, i) => {
          const feito = i < atual;
          const ativo = i === atual;
          const acende = ativo ? entre(f, e.de, e.de + ms(300), 0, 1) : feito ? 1 : 0;
          return (
            <div
              key={e.rotulo}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 6px', borderRadius: 999,
                background: ativo ? `color-mix(in oklch, var(--primary) ${Math.round(12 * acende)}%, transparent)` : 'transparent',
                color: ativo ? COR.texto : feito ? COR.textoSuave : COR.textoFraco,
                fontSize: 17, fontWeight: ativo ? 700 : 600,
              }}
            >
              <span
                style={{
                  width: 24, height: 24, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
                  background: feito ? 'var(--success)' : ativo ? 'var(--primary)' : 'rgba(15,27,38,0.08)',
                  color: feito || ativo ? '#fff' : COR.textoFraco,
                }}
              >
                {feito ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              {e.rotulo}
            </div>
          );
        })}
      </div>
    </div>
  );
};
