// O Rei do Pop zumbi (o chefão da Caça, 09/10/2026), como era no sistema
// (arquivo morto, `cenaChefao.tsx`): sobe da terra com o «hee-hee», abre com
// «THRILLER!», dança os passos dele (com o nome de cada um), leva tiro de todo
// lado — o clarão, o «-1», o «-3 HEADSHOT!», o sangue —, esquiva com
// «HEE-HEE!», perde um braço e depois o outro conforme a vida cai, e no fim
// foge de moonwalk («FUI!»), como fugia quando ninguém dava conta dele.
//
// O movimento, os passos, as poses e os quadros são os do app
// (`chefaoMovimento.ts`, `chefaoArte.ts`), com sorteio de semente fixa e
// rodados quadro a quadro — o mesmo quadro sai sempre igual. O CSS é o da
// Caça (`caca.css`), com as animações dele escritas pelo quadro.
// Tudo nas coordenadas do app.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { ALTURA, LARGURA, montarQuadro } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/zumbis';
import { imagemParaPixels } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/pixels';
import {
  CHEFAO, DANO_CABECA, DANO_CORPO, PERDE_NO_ESTAGIO, cssDaTransforma, estagioDaVida, zumbiDaPose, type Estagio,
} from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/chefaoArte';
import {
  comecarFuga, criarMovimento, desviar, mover, quadroAtual, type Movimento,
} from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/chefaoMovimento';
import { recortar } from '../../../arquivo-morto/caca-zumbis-bruxas/src/components/CacaAbobora/chefaoEfeitos';
import { APP_L } from '../app/layout';
import { ms, s } from '../movimento';
import { CabecaZumbi } from './Caca';
import { REI_DO_POP } from './dados';
import { ALTURA_NATAL } from './Detalhes';

const FPS = 60;
const ESCALA = 3;
/**
 * A posição do MJ vai sem arredondar: andando devagar, o pixel inteiro só
 * mudava a cada 2 ou 3 quadros e ele parecia travar (Cleber, 28/10).
 */
const naTela = (v: number) => v;
const L = LARGURA * ESCALA;
const A = ALTURA * ESCALA;
const CAIXA = { largura: L, altura: A };
const ENTRADA_MS = 1_200;
/** O mesmo `RITMO_POR_ESTAGIO` de `chefaoMovimento.ts` (lá não é exportado): machucado, dança mais devagar. */
const RITMO_DO_ESTAGIO = [1, 1, 1.08, 1.18] as const;
/** A luta grande de verdade: 10.840 de vida, 62 pessoas. */
const VIDA_MAX = REI_DO_POP.vidaMax;
/** Quanto cada tiro de todo mundo tira da barra: a luta do vídeo leva uns 70% da vida. */
const POR_TIRO = 33;

function sorteio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── O roteiro ───────────────────────────────────────────────────────────────

export type TipoTexto = 'dano' | 'hs' | 'esquiva' | 'passo' | 'final';
type Texto = { f: number; x: number; y: number; texto: string; tipo: TipoTexto };
type Gota = { f: number; x: number; y: number; dx: number; dy: number; escura: boolean };
type Pedaco = { f: number; pixels: ImageData; x: number; y: number; vx: number; vy: number; vr: number; espelho: boolean; chao: number };
type Som = { f: number; arquivo: string; volume: number };

/** Os tiros de todo mundo: em rajadas, de várias mãos ao mesmo tempo. */
/**
 * `meu`: o tiro de quem assiste. No sistema cada um via o letreiro e o sangue
 * só dos PRÓPRIOS tiros — o dos outros aparecia como a vida caindo.
 */
type Tiro = { f: number; tipo: 'corpo' | 'cabeca' | 'esquiva'; meu: boolean };

/**
 * `area`: a faixa da tela onde ele anda (no sistema, o conteúdo inteiro; na
 * Arena, só o chão do cemitério). `dura`: até quando a cena vai (padrão 11,5 s).
 */
export function roteiroDoChefao(E: number, o: { area?: { top: number; altura: number; largura?: number }; dura?: number; onde?: { x: number; y: number } } = {}) {
  const rnd = sorteio(91);
  const tiros: Tiro[] = [];
  // 2,4 s depois de chegar começa a chuva de tiros, por 4,4 s.
  for (let t = s(2.4); t < s(6.8); t += ms(110)) {
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const r = rnd();
      tiros.push({ f: E + t + k * 2, tipo: r < 0.05 ? 'esquiva' : r < 0.3 ? 'cabeca' : 'corpo', meu: rnd() < 0.35 });
    }
  }
  return { entra: E, tiros, foge: E + s(7.2), sai: E + s(o.dura ?? 11.5), area: { largura: APP_L, ...(o.area ?? { top: 0, altura: ALTURA_NATAL }) }, onde: o.onde ?? { x: 1080, y: 470 } };
}
export type RoteiroChefao = ReturnType<typeof roteiroDoChefao>;

type Estado = {
  m: Movimento; vida: number; estagio: Estagio; levouAte: number;
  textos: Texto[]; gotas: Gota[]; pedacos: Pedaco[]; manchas: { f: number; x: number; y: number; tam: number }[];
  sons: Som[]; poeira: { f: number; x: number; y: number }[];
};

/** A cena inteira até `ate`, quadro a quadro. Determinística. */
function simular(r: RoteiroChefao, ate: number): Estado {
  const rnd = sorteio(7);
  const largura = r.area.largura, altura = r.area.altura;
  const t0 = (r.entra / FPS) * 1000;
  const m = criarMovimento(largura, altura, CAIXA, t0, ENTRADA_MS, rnd);
  // Entra do lado direito do meio: a fuga de moonwalk sai pela direita.
  m.x = r.onde.x; m.y = r.onde.y;
  const e: Estado = { m, vida: VIDA_MAX, estagio: 0, levouAte: -1, textos: [], gotas: [], pedacos: [], manchas: [], sons: [], poeira: [] };
  const respingo = (f: number, x: number, y: number, forca: number) => {
    const n = Math.round(4 + forca * 6);
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2;
      const dist = 10 + rnd() * (16 + forca * 26);
      e.gotas.push({ f, x, y, dx: Math.round((Math.cos(ang) * dist) / 2) * 2, dy: Math.round((Math.sin(ang) * dist + 14) / 2) * 2, escura: i % 2 === 1 });
    }
  };
  e.sons.push({ f: r.entra, arquivo: 'chefao/chega', volume: 0.4 }, { f: r.entra + ms(350), arquivo: 'chefao/hee-hee', volume: 0.5 });
  e.textos.push({ f: r.entra + ms(ENTRADA_MS), x: m.x + L / 2, y: m.y - 8, texto: 'THRILLER!', tipo: 'passo' });
  const fim = Math.min(ate, r.sai);
  let ultimoHee = -Infinity;
  for (let f = r.entra; f < fim; f++) {
    const agora = (f / FPS) * 1000;
    if (f === r.foge) {
      comecarFuga(m, largura, CAIXA);
      e.textos.push({ f, x: m.x + L / 2, y: m.y - 8, texto: 'FUI!', tipo: 'passo' });
      e.sons.push({ f, arquivo: 'chefao/hee-hee', volume: 0.5 });
    }
    for (const tiro of r.tiros) {
      if (tiro.f !== f || f < r.entra + ms(ENTRADA_MS)) continue;
      if (tiro.tipo === 'esquiva' && tiro.meu) {
        const de = { x: m.x, y: m.y };
        const onde = desviar(m, rnd() < 0.5 ? 'passinho' : 'deslize', rnd() < 0.5 ? -1 : 1, agora, largura, altura, CAIXA, rnd);
        e.textos.push({ f, x: de.x + L / 2, y: de.y - 6, texto: 'ESQUIVOU!', tipo: 'esquiva' });
        e.textos.push({ f, x: onde.x + L / 2, y: onde.y - 16, texto: 'HEE-HEE!', tipo: 'passo' });
        if (f - ultimoHee > s(1.5)) { e.sons.push({ f, arquivo: 'chefao/hee-hee', volume: 0.6 }); ultimoHee = f; }
        continue;
      }
      if (tiro.tipo === 'esquiva') continue;
      const cabeca = tiro.tipo === 'cabeca';
      const dano = cabeca ? DANO_CABECA : DANO_CORPO;
      e.vida = Math.max(1, e.vida - dano * POR_TIRO);
      const lx = m.x + L * (0.3 + rnd() * 0.4);
      const ly = m.y - m.ar + (cabeca ? A * 0.16 : A * (0.4 + rnd() * 0.3));
      if (tiro.meu) {
        e.levouAte = f + ms(90);
        e.textos.push({ f, x: lx, y: ly - 10, texto: cabeca ? `-${DANO_CABECA} HEADSHOT!` : `-${DANO_CORPO}`, tipo: cabeca ? 'hs' : 'dano' });
        respingo(f, lx, ly, cabeca ? 0.8 : 0.35);
        if (rnd() < 0.35) e.manchas.push({ f, x: lx + (rnd() - 0.5) * 24, y: m.y + A - 4 + (rnd() - 0.5) * 10, tam: cabeca ? 0.35 : 0.15 });
        e.sons.push({ f, arquivo: cabeca ? 'chefao/acerto-cabeca' : 'chefao/acerto', volume: 0.32 });
      }
      // A vida cruzou um limiar: perde uma parte (o braço de trás, depois o da frente).
      const novo = estagioDaVida(e.vida, VIDA_MAX);
      for (let est = e.estagio + 1; est <= novo; est++) {
        const parte = PERDE_NO_ESTAGIO[est as Estagio];
        const { qd } = quadroAtual(m, agora);
        const chao = m.y + A - 4;
        if (parte) {
          const img = montarQuadro(zumbiDaPose(qd, (est - 1) as Estagio), qd.quadro, p => p === parte);
          const rec = recortar(img);
          if (rec) {
            const espelho = m.lado < 0;
            const px = espelho ? m.x + (LARGURA - rec.x - rec.pixels.width) * ESCALA : m.x + rec.x * ESCALA;
            const py = m.y - m.ar + rec.y * ESCALA;
            const voa = (espelho ? 1 : -1) * (160 + rnd() * 140);
            e.pedacos.push({ f, pixels: rec.pixels, x: px, y: py, vx: voa, vy: -420 - rnd() * 160, vr: (voa > 0 ? 1 : -1) * (540 + rnd() * 360), espelho, chao: chao + (rnd() - 0.3) * 18 });
            respingo(f, px + (rec.pixels.width * ESCALA) / 2, py + 6, 1);
            respingo(f, px + (rec.pixels.width * ESCALA) / 2, py + 12, 1);
          }
          e.manchas.push({ f, x: m.x + L / 2, y: chao, tam: 0.9 });
          e.sons.push({ f, arquivo: 'chefao/arranca', volume: 0.45 });
          e.textos.push({ f, x: m.x + L / 2, y: m.y - 10, texto: parte === 'bracoTras' ? 'LÁ SE VAI UM BRAÇO!' : 'E O OUTRO!', tipo: 'final' });
        }
        m.trancoAte = agora + 300;
        m.trancoLado = m.lado;
      }
      e.estagio = novo;
    }
    for (const ev of mover(m, 1000 / FPS, agora, largura, altura, CAIXA, e.estagio, rnd)) {
      if (ev.tipo === 'passo' && f > r.entra + ms(ENTRADA_MS) + ms(200)) {
        e.textos.push({ f, x: m.x + L / 2, y: m.y - 8, texto: ev.passo.nome, tipo: 'passo' });
      } else if (ev.tipo === 'pousou') {
        e.sons.push({ f, arquivo: 'chefao/pouso', volume: 0.4 });
        e.poeira.push({ f, x: ev.x + L / 2, y: ev.y + A });
      } else if (ev.tipo === 'pe') {
        if (rnd() < 0.5) e.sons.push({ f, arquivo: 'chefao/moonwalk', volume: 0.35 });
        if (rnd() < 0.5) e.poeira.push({ f, x: m.x + L / 2 + (m.lado > 0 ? -12 : 12), y: m.y + A });
      }
    }
  }
  return e;
}

// ── O desenho ───────────────────────────────────────────────────────────────

const DURACAO: Record<TipoTexto, [number, number]> = { dano: [0.9, 9], hs: [0.9, 9], esquiva: [0.9, 9], passo: [1.5, 15], final: [2.2, 22] };

/** `zb-chefao-texto`: sobe, cresce e some, em degraus. */
function estiloDoTexto(t: Texto, f: number): React.CSSProperties | null {
  const [dur, passos] = DURACAO[t.tipo];
  const k = (f - t.f) / (dur * FPS);
  if (k < 0 || k >= 1) return null;
  const p = Math.floor(k * passos) / passos;
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  let y: number, esc: number, op = 1;
  if (p < 0.15) { y = lerp(0, -14, p / 0.15); esc = lerp(0.6, 1.15, p / 0.15); }
  else if (p < 0.3) { y = lerp(-14, -20, (p - 0.15) / 0.15); esc = lerp(1.15, 1, (p - 0.15) / 0.15); }
  else { y = lerp(-20, -38, (p - 0.3) / 0.7); esc = 1; op = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2; }
  return { left: Math.round(t.x), top: Math.round(t.y), transform: `translate(-50%, ${y}px) scale(${esc})`, opacity: op };
}

const Sprite: React.FC<{ pixels: ImageData; style?: React.CSSProperties; className?: string }> = ({ pixels, style, className }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => { ref.current?.getContext('2d')?.putImageData(pixels, 0, 0); }, [pixels]);
  return <canvas ref={ref} width={pixels.width} height={pixels.height} className={className} style={style} />;
};

export const ReiDoPop: React.FC<{ r: RoteiroChefao }> = ({ r }) => {
  const f = useCurrentFrame();
  const e = useMemo(() => (f >= r.entra && f <= r.sai ? simular(r, f + 1) : null), [r, f]);
  if (!e) return null;
  const agora = (f / FPS) * 1000;
  const { m } = e;
  const { qd, t: t0, achata: achata0 } = quadroAtual(m, agora);
  const quadro = imagemParaPixels(montarQuadro(zumbiDaPose(qd, e.estagio, false), qd.quadro), true);
  /*
   * A dança do app troca de pose a cada 80–240 ms (4 a 12 quadros por
   * segundo): na tela grande do vídeo isso parecia travar (Cleber, 06/11). O
   * desenho continua o do app, mas entre uma pose e a próxima o corpo vai
   * girando e subindo aos poucos, a cada quadro do vídeo, e cada troca de
   * pose dá um tranco de leve (amassa e volta) — o passo marca o ritmo.
   */
  let t = t0;
  let achata = achata0;
  if (!m.acao && !m.fugindo) {
    const lista = m.passo.quadros;
    const prox = lista[(m.qi + 1) % lista.length].transforma;
    const dur = m.passo.msPorQuadro * RITMO_DO_ESTAGIO[e.estagio];
    const u = Math.min(1, m.acc / dur);
    // Segura a pose na primeira metade e vai para a próxima na segunda.
    const k = u < 0.45 ? 0 : (() => { const v = (u - 0.45) / 0.55; return v * v * (3 - 2 * v); })();
    if (prox.vira === t0.vira) t = { ...t0, gira: t0.gira + (prox.gira - t0.gira) * k, sobe: t0.sobe + (prox.sobe - t0.sobe) * k };
    achata = Math.max(achata0, 0.35 * Math.max(0, 1 - m.acc / 110));
  }
  // O balanço contínuo do corpo (respira no ritmo), para nunca ficar parado entre as poses.
  const balanco = Math.sin((agora / 1000) * Math.PI * 2 * 1.6) * 1.4;
  const holofote = 0.78 + 0.22 * Math.abs(Math.sin((agora / 1000) * Math.PI * 1.25));
  const entrando = f < r.entra + ms(ENTRADA_MS);
  const sobe = entrando ? Math.floor(Math.min(1, (f - r.entra) / ms(1000)) * 20) / 20 : 1;
  const levou = f < e.levouAte;
  const pct = (e.vida / VIDA_MAX) * 100;
  const hud = Math.floor(Math.min(1, (f - r.entra) / ms(500)) * 5) / 5;
  const hudSai = f > r.foge + s(2.2) ? Math.floor(Math.min(1, (f - r.foge - s(2.2)) / ms(500)) * 5) / 5 : 0;
  const falta = 5 * 60 - Math.floor((f - r.entra) / FPS) - 32;
  return (
    <div className="nt-caca" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* O painel da luta, no alto */}
      <div className="zb-chefao-hud" style={{ top: 10, transform: `translate(-50%, ${(-140 * (1 - hud)) + (-140 * hudSai)}%)` }}>
        <CabecaZumbi zumbi={CHEFAO} escala={2} morta={false} />
        <div className="zb-chefao-hud-meio">
          <div className="zb-chefao-hud-titulo">
            <span>REI DO POP ZUMBI</span>
            <span className="zb-chefao-hud-relogio">{`${Math.floor(falta / 60)}:${String(falta % 60).padStart(2, '0')}`}</span>
          </div>
          <div className="zb-chefao-vida">
            <div className="zb-chefao-vida-barra" style={{ width: `${pct}%`, transition: 'none' }} />
            <span className="zb-chefao-vida-numero">{e.vida} / {VIDA_MAX}</span>
          </div>
          <div className="zb-chefao-hud-linha">{REI_DO_POP.pessoas} na caçada</div>
        </div>
        {/* O top 3 da luta de verdade (`zb-chefao-top`). */}
        <ol className="zb-chefao-top">
          {REI_DO_POP.top.map((g, i) => (
            <li key={g.nome}><span className="pos">{i + 1}º</span><span>{g.nome.split(' ').slice(0, 2).join(' ')}</span><span className="dano">{g.dano}</span></li>
          ))}
        </ol>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: r.area.top, height: r.area.altura }}>
      {/* As manchas no chão e os pedaços que caíram */}
      {e.manchas.map((mc, i) => (
        <div key={`m${i}`} style={{ position: 'absolute', left: mc.x - 14 * mc.tam - 4, top: mc.y - 3, width: 28 * mc.tam + 8, height: 6 + 6 * mc.tam, background: '#6e0a12', opacity: 0.55, imageRendering: 'pixelated', boxShadow: `${6 * mc.tam}px 3px 0 -1px #c8202a` }} />
      ))}
      {e.pedacos.map((p, i) => {
        // `pedacoQueVoa`: gravidade 1500 px/s², quica no chão e para.
        let x = p.x, y = p.y, vx = p.vx, vy = p.vy, rot = 0, vr = p.vr;
        const meia = (p.pixels.height * ESCALA) / 2;
        for (let k = 0; k < f - p.f; k++) {
          const dt = 1 / FPS;
          vy += 1500 * dt; x += vx * dt; y += vy * dt; rot += vr * dt;
          if (y + meia >= p.chao) {
            y = p.chao - meia;
            if (Math.abs(vy) > 120) { vy *= -0.32; vx *= 0.55; vr *= 0.45; } else { vy = 0; vx *= 0.82; vr *= 0.7; if (Math.abs(vx) < 6) { rot = Math.round(rot / 90) * 90; vx = 0; vr = 0; } }
          }
        }
        return <Sprite key={`p${i}`} pixels={p.pixels} style={{ position: 'absolute', left: 0, top: 0, width: p.pixels.width * ESCALA, height: p.pixels.height * ESCALA, imageRendering: 'pixelated', transform: `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(${Math.round(rot / 15) * 15}deg)${p.espelho ? ' scaleX(-1)' : ''}` }} />;
      })}
      {/* O holofote no chão e ele */}
      <div className="zb-chefao-chao" style={{ width: L, height: A, opacity: holofote, transform: `translate(${naTela(m.x)}px, ${naTela(m.y)}px) scale(${(1 - Math.min(0.5, m.ar / 240)).toFixed(2)})` }} />
      <div className={entrando ? 'zb-chefao entrando' : 'zb-chefao'} style={{ width: L, height: A, transform: `translate(${naTela(m.x)}px, ${naTela(m.y - m.ar)}px)` }}>
        <span className={levou ? 'zb-chefao-corpo levou' : 'zb-chefao-corpo'} style={{ transform: `translateY(${balanco}px) ${cssDaTransforma(t, m.lado, ESCALA, achata)}` }}>
          <Sprite pixels={quadro} className="zb-chefao-sprite" style={{ transform: `translateY(${(1 - sobe) * 100}%)` }} />
        </span>
      </div>
      {/* O sangue e os letreiros */}
      {e.gotas.map((g, i) => {
        const k = (f - g.f) / ms(550);
        if (k < 0 || k >= 1) return null;
        const p = Math.floor(k * 8) / 8;
        return <div key={`g${i}`} className={g.escura ? 'zb-chefao-gota escura' : 'zb-chefao-gota'} style={{ left: Math.round(g.x), top: Math.round(g.y), transform: `translate(${g.dx * p}px, ${g.dy * p}px)`, opacity: p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4 }} />;
      })}
      {e.poeira.map((p, i) => {
        const k = (f - p.f) / ms(450);
        if (k < 0 || k >= 1) return null;
        return <div key={`d${i}`} style={{ position: 'absolute', left: p.x - 6, top: p.y - 4 - 10 * k, width: 4, height: 4, background: '#cfc6b4', opacity: 1 - k, boxShadow: '8px 2px 0 #b9ae99, -6px 3px 0 #b9ae99' }} />;
      })}
      {e.textos.slice(-60).map((tx, i) => {
        const st = estiloDoTexto(tx, f);
        return st && <div key={`t${i}`} className={`zb-chefao-texto ${tx.tipo}`} style={st}>{tx.texto}</div>;
      })}
      </div>
    </div>
  );
};

/** Os sons da luta (os do app, gravados de `sons.ts`) e a trilha de 8 bits dele. */
/** `trilha`: a trilha de 8 bits dele (na Arena fica só a música do Halloween). `volume`: o quanto dos efeitos. */
export const SonsDoChefao: React.FC<{ r: RoteiroChefao; trilha?: boolean; volume?: number; enxuto?: boolean }> = ({ r, trilha = true, volume = 1, enxuto = false }) => {
  const { sons: todos } = useMemo(() => simular(r, r.sai), [r]);
  // Enxuto (a Arena, 06/11): os acertos espaçados, sem o pé do moonwalk.
  let ultimoAcerto = -Infinity;
  const sons = !enxuto ? todos : todos.filter(sm => {
    if (sm.arquivo === 'chefao/moonwalk') return false;
    if (!sm.arquivo.startsWith('chefao/acerto')) return true;
    if (sm.f - ultimoAcerto < ms(220)) return false;
    ultimoAcerto = sm.f;
    return true;
  });
  return (
    <>
      {trilha && (
        <Sequence from={r.entra} durationInFrames={r.sai - r.entra}>
          <Audio src={staticFile('natal/chefao/trilha.wav')} volume={0.4} />
        </Sequence>
      )}
      {sons.map((sm, i) => (
        <Sequence key={i} from={sm.f} durationInFrames={s(3)}><Audio src={staticFile(`natal/${sm.arquivo}.wav`)} volume={sm.volume * volume} /></Sequence>
      ))}
    </>
  );
};
