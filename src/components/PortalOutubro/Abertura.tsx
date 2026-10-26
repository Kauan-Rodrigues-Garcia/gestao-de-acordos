/**
 * Abertura.tsx — 16h de sexta: o vidro quebra e o portal abre.
 *
 *   0,0 s  a tela treme forte, as rachaduras correm do meio para as bordas
 *   1,6 s  clarão; o vidro vira cacos
 *   1,9 s  os cacos caem (de dentro para fora), e atrás deles está a noite
 *   3,2 s  o portal cresce no meio, girando
 *   4,8 s  «O portal se abriu»
 *   7,8 s  passa para o mural
 *
 * Os tempos dividem pela velocidade do mural (o painel de teste e os botões
 * do mural). «Pular» e Esc vão direto ao mural.
 *
 * ## Leve (26/10/2026: «está bem lagado»)
 *
 * Os cacos eram polígonos de um SVG só, e cada um que caía fazia o navegador
 * repintar a tela inteira, a cada quadro (45% da CPU no teste). Agora cada
 * caco é um pedaço de HTML recortado do tamanho dele, e cair é só deslocar —
 * a placa de vídeo faz. A rede de rachaduras é uma camada parada (dois
 * caminhos), separada dos raios que crescem. No modo leve não há cacos nem
 * raios crescendo: o clarão e a noite aparecem.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ALTURA, LARGURA, gerarRachaduras, sorteador } from './rachaduras';
import { useVelocidadeDoMural } from './estado';
import { PortalGirando } from './PortalGirando';

const MEIO: [number, number] = [LARGURA / 2, ALTURA / 2];

type Etapa = 'tremendo' | 'quebrando' | 'portal' | 'titulo';

const QUANDO: Readonly<Record<Etapa, number>> = { tremendo: 0, quebrando: 1600, portal: 3200, titulo: 4800 };
const FIM_MS = 7800;

/** Os raios que saem do meio (a quebra), com o ângulo de cada um. */
function raiosDaQuebra() {
  const acaso = sorteador(3110);
  const n = 18;
  return Array.from({ length: n }, (_, i) => {
    const base = (i / n) * Math.PI * 2 + (acaso() - 0.5) * 0.18;
    let x = MEIO[0], y = MEIO[1], ang = base, andado = 0;
    const pontos: string[] = [`${x} ${y}`];
    while (andado < 1300) {
      // Vidro quebra em reta: passos longos e só um desvio pequeno.
      const passo = 60 + acaso() * 70;
      ang += (base - ang) * 0.4 + (acaso() - 0.5) * 0.22;
      x += Math.cos(ang) * passo;
      y += Math.sin(ang) * passo;
      andado += passo;
      pontos.push(`${Math.round(x)} ${Math.round(y)}`);
    }
    return { angulo: base, d: 'M' + pontos.join('L'), comprimento: andado };
  });
}

interface Caco {
  /** Os cantos na caixa 1920 × 1080. */
  cantos: [number, number][];
  dx: number;
  dy: number;
  giro: number;
  atraso: number;
}

/** Os cacos: as fatias entre os raios, cortadas em anéis. */
function cacos(angulos: number[]): Caco[] {
  const aneis = [0, 170, 420, 760, 1400];
  const ordenados = [...angulos].sort((a, b) => a - b);
  const lista: Caco[] = [];
  const acaso = sorteador(77);
  for (let i = 0; i < ordenados.length; i++) {
    const a0 = ordenados[i], a1 = i + 1 < ordenados.length ? ordenados[i + 1] : ordenados[0] + Math.PI * 2;
    for (let j = 0; j < aneis.length - 1; j++) {
      const r0 = aneis[j] * (0.9 + acaso() * 0.2), r1 = aneis[j + 1] * (0.9 + acaso() * 0.2);
      const p = (r: number, a: number): [number, number] => [MEIO[0] + Math.cos(a) * r, MEIO[1] + Math.sin(a) * r];
      const meio = (a0 + a1) / 2;
      lista.push({
        cantos: [p(r0, a0), p(r0, a1), p(r1, a1), p(r1, a0)],
        dx: Math.round(Math.cos(meio) * (120 + acaso() * 200)),
        dy: Math.round(Math.sin(meio) * 80 + 700 + acaso() * 300),
        giro: Math.round((acaso() - 0.5) * 160),
        atraso: Math.round(j * 110 + acaso() * 160),
      });
    }
  }
  return lista;
}

/** Da caixa 1920 × 1080 para a tela (a caixa cobre a tela, como `slice`). */
function mapaDaTela() {
  const w = window.innerWidth, h = window.innerHeight;
  const escala = Math.max(w / LARGURA, h / ALTURA);
  const ox = (w - LARGURA * escala) / 2, oy = (h - ALTURA * escala) / 2;
  return (x: number, y: number): [number, number] => [x * escala + ox, y * escala + oy];
}

/**
 * Cada caco vira um pedaço de HTML do tamanho dele, recortado no formato. A
 * queda é uma animação com os números prontos de cada caco (Web Animations):
 * com variável do CSS dentro da animação o Chrome não a entrega à placa de
 * vídeo e recalcula o estilo a cada quadro.
 */
function CacosDeHtml({ lista, v }: { lista: readonly Caco[]; v: number }) {
  const raiz = useRef<HTMLDivElement>(null);
  const pecas = useMemo(() => {
    const naTela = mapaDaTela();
    return lista.map(c => {
      const pts = c.cantos.map(([x, y]) => naTela(x, y));
      const x0 = Math.floor(Math.min(...pts.map(p => p[0]))), y0 = Math.floor(Math.min(...pts.map(p => p[1])));
      const x1 = Math.ceil(Math.max(...pts.map(p => p[0]))), y1 = Math.ceil(Math.max(...pts.map(p => p[1])));
      const recorte = `polygon(${pts.map(([x, y]) => `${Math.round(x - x0)}px ${Math.round(y - y0)}px`).join(', ')})`;
      return { left: x0, top: y0, width: x1 - x0, height: y1 - y0, clipPath: recorte, c };
    });
  }, [lista]);
  useEffect(() => {
    const els = Array.from(raiz.current?.children ?? []) as HTMLElement[];
    const anims = els.map((el, i) => {
      const c = pecas[i]?.c;
      if (!c || typeof el.animate !== 'function') return null;
      return el.animate(
        [{ transform: 'none', opacity: 1 }, { transform: `translate(${c.dx}px, ${c.dy}px) rotate(${c.giro}deg)`, opacity: 0 }],
        { duration: 1500 / v, delay: (300 + c.atraso) / v, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)', fill: 'forwards' },
      );
    });
    return () => { for (const a of anims) a?.cancel(); };
    // A queda é uma só: mudar a velocidade no meio não recomeça.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pecas]);
  return (
    <div ref={raiz} className="portal-cacos-pecas">
      {pecas.map((p, i) => (
        <div key={i} className="portal-caco" style={{ left: p.left, top: p.top, width: p.width, height: p.height, clipPath: p.clipPath }} />
      ))}
    </div>
  );
}

const SVG_PROPS = { viewBox: `0 0 ${LARGURA} ${ALTURA}`, preserveAspectRatio: 'xMidYMid slice', fill: 'none', strokeLinecap: 'round' } as const;

export function Abertura({ aoTerminar, leve }: { aoTerminar: () => void; leve: boolean }) {
  const v = useVelocidadeDoMural();
  const [etapa, setEtapa] = useState<Etapa>('tremendo');
  const raios = useMemo(raiosDaQuebra, []);
  // A rede inteira em dois caminhos (fresta e fio): desenhada uma vez, parada.
  const rede = useMemo(() => {
    const todas = gerarRachaduras();
    return { d: todas.map(r => r.d).join(''), largura: 1.4 };
  }, []);
  const pedacos = useMemo(() => cacos(raios.map(r => r.angulo)), [raios]);
  const contornos = useMemo(
    () => pedacos.map(c => 'M' + c.cantos.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join('L') + 'Z').join(''),
    [pedacos],
  );

  useEffect(() => {
    const ts = (Object.entries(QUANDO) as [Etapa, number][])
      .filter(([, ms]) => ms > 0)
      .map(([e, ms]) => window.setTimeout(() => setEtapa(e), ms / v));
    ts.push(window.setTimeout(aoTerminar, FIM_MS / v));
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoTerminar(); };
    window.addEventListener('keydown', tecla);
    return () => { for (const t of ts) window.clearTimeout(t); window.removeEventListener('keydown', tecla); };
    // A abertura é uma só: mudar a velocidade no meio não recomeça.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quebrou = etapa !== 'tremendo';
  const estilo = { ['--v' as string]: v } as CSSProperties;

  return (
    <div className={`portal-abertura${leve ? ' portal-leve' : ''}`} style={estilo} role="dialog" aria-label="O portal de outubro está abrindo">
      {/* Atrás de tudo, a noite e o portal: os cacos caem e ela aparece. */}
      {quebrou && (
        <div className="portal-noite">
          <div className="portal-bandeirinhas" aria-hidden />
          {(etapa === 'portal' || etapa === 'titulo') && <PortalGirando className="portal-abertura-anel" />}
          {etapa === 'titulo' && (
            <div className="portal-abertura-titulo">
              <h1 className="portal-titulo">O portal se abriu</h1>
              <p className="portal-sub">Outubro no Gestão</p>
            </div>
          )}
        </div>
      )}

      {/* O vidro trincando: a rede (parada) e os raios do meio (crescendo), cada um na sua camada. */}
      {!quebrou && (
        <div className={`portal-abertura-vidro${leve ? '' : ' portal-treme-forte'}`} aria-hidden>
          <svg {...SVG_PROPS}>
            <path d={rede.d} stroke="rgb(255 255 255 / 0.9)" strokeWidth={1} transform="translate(0.8 0.8)" />
            <path d={rede.d} stroke="rgb(20 24 22 / 0.72)" strokeWidth={rede.largura} />
          </svg>
          {/* Os raios crescem do meio esticando a camada (a placa de vídeo faz), não redesenhando o traço. */}
          <div className={leve ? 'portal-raios' : 'portal-raios portal-raios-crescem'}>
            <svg {...SVG_PROPS}>
              <path d={raios.map(r => r.d).join('')} stroke="rgb(20 24 22 / 0.8)" strokeWidth={2.6} />
            </svg>
          </div>
        </div>
      )}

      {/* Os cacos caindo (fora do modo leve), com o contorno claro sumindo logo. */}
      {quebrou && !leve && (
        <div className="portal-cacos" aria-hidden>
          <CacosDeHtml lista={pedacos} v={v} />
          <svg className="portal-cacos-contorno" {...SVG_PROPS}>
            <path d={contornos} stroke="rgb(255 255 255 / 0.75)" strokeWidth={2} />
          </svg>
        </div>
      )}

      {etapa === 'quebrando' && <div className="portal-clarao" aria-hidden />}

      <button type="button" className="portal-pular" onClick={aoTerminar}>Pular</button>
    </div>
  );
}
