/**
 * Puxando.tsx — ela puxa o mural para a tela (pedido de 28/10/2026: «depois
 * que acabar ele sai puxando o mural com uma animação boa, pensando nas
 * imagens»; refeito em 29/10: «melhorar a animação dele puxando o mural da
 * melhor forma»). O corpo inteiro, por cima do palco e do mural, no mesmo
 * tamanho e no mesmo lugar em que estava na toca:
 *
 *   vira      estica os dois braços para a direita
 *   corre     dispara de lado até a borda da tela, com o rastro borrado
 *             atrás (a foto dela correndo na caverna)
 *   agarra    fecha as luvas na borda do mural, que aparece com um tranco
 *             (poeira da cortiça, a tela treme), e treme tomando impulso
 *   trancos   três puxões, cada um mais forte: embala para o mural, joga o
 *             tronco para trás (poeira nos pés, a tela treme) e o mural, que
 *             resiste, devolve um pedaço e a arrasta junto
 *   prepara   agacha toda para trás, a boca aberta, tremendo; o mural range
 *   arranca   dispara para a esquerda arrastando o mural, com o rastro e os
 *             riscos de velocidade
 *   baque     o mural bate na borda da esquerda na hora em que chega: passa
 *             um tico, volta na mola, a tela treme e a poeira sobe
 *
 * O mural anda pelo `transform` dele (o elemento vem por `mural`); no fim o
 * transform volta a vazio e `aoTerminar` avisa. Os tempos dividem pela
 * velocidade do mural. No modo leve, sem poeira e sem riscos.
 */
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { PALETA_DA_COISA } from './arte';
import { ALTURA_DA_COISA, CORPO_X, LARGURA_PUXANDO, MAO_PUXANDO, PUXANDO } from './desenho';
import { pintarGrade } from './derry';
import { sorteador } from '../acaso';

const VIRA = 0.3;
const AGARRA = 0.55;
/** Os três puxões: a força (o tremor e a poeira) e quanto do caminho cada um arrasta. */
const TRANCOS: readonly { forca: number; ganho: number }[] = [
  { forca: 0.55, ganho: 0.05 },
  { forca: 0.8, ganho: 0.075 },
  { forca: 1, ganho: 0.1 },
];
const EMBALO = 0.1;
const PUXAO = 0.14;
const SEGURA = 0.22;
const TRANCO = EMBALO + PUXAO + SEGURA;
/** O tanto de cada puxão que o mural devolve, resistindo. */
const CEDE = 0.18;
const PREPARA = 0.45;
const ARRANCA = 0.6;
/** O pedaço da arrancada em que ela acelera (depois corre igual). */
const ACELERA = 0.22;
/** Do baque até ela avisar que acabou (a mola do mural). */
const ASSENTA = 0.55;
const PASSO = 0.07;
/** Quantos pixels dela por segundo ela corre até a borda. */
const CORRE = 150;
/** A borda do mural fica sob a luva, três pixels antes do meio dela. */
const BORDA = 3;
const RASTROS = 3;
/** Onde ficam os pés no quadro (x de um pé ao outro, y da sola). */
const PES = [CORPO_X + 4, CORPO_X + 40, ALTURA_DA_COISA - 1] as const;

const POEIRA = ['#3b2616', '#5a3a22', '#7a5233', '#9a6e45'];
const CORTICA = ['#5c4027', '#8b6b4a', '#c9a777'];

function quadro(linhas: readonly string[]): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = LARGURA_PUXANDO;
  cv.height = ALTURA_DA_COISA;
  pintarGrade(cv.getContext('2d')!, linhas, PALETA_DA_COISA, 0, 0);
  return cv;
}

const suave = (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const sai = (k: number) => 1 - (1 - k) ** 3;
/** Acelera em `ACELERA` do tempo e depois corre na mesma velocidade, sem tranco. */
const corrida = (k: number) => (k < ACELERA ? k * k / (2 * ACELERA) : k - ACELERA / 2) / (1 - ACELERA / 2);

/**
 * A poeira anda na grade dela, mas é pintada em grãos `FINO` vezes menores
 * (na grade dela, as lascas por cima do mural viravam blocos).
 */
const FINO = 2;

/** Um grão de poeira (ou um risco de velocidade), em pixels dela; `l` em grãos. */
interface Grao {
  x: number; y: number; vx: number; vy: number;
  idade: number; vida: number; cor: string; l: number; a: number;
  /** Cai (poeira) ou só anda (risco). */
  peso: number;
}

export function ACoisaPuxando({ x, y, px, mural, v, leve, aoTerminar }: {
  /** Onde o corpo dela estava no palco, na tela (o canto de cima à esquerda). */
  x: number;
  y: number;
  /** O tamanho de um pixel dela na tela. */
  px: number;
  mural: RefObject<HTMLDivElement | null>;
  v: RefObject<number>;
  leve: boolean;
  aoTerminar: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const poeiraRef = useRef<HTMLCanvasElement>(null);
  const rastros = useRef<(HTMLCanvasElement | null)[]>([]);
  const fim = useRef(aoTerminar);
  fim.current = aoTerminar;
  const quadros = useMemo(() => ({
    anda: PUXANDO.anda.map(quadro),
    firma: quadro(PUXANDO.firma),
    prepara: quadro(PUXANDO.prepara),
    puxa: PUXANDO.puxa.map(quadro),
    agachada: quadro(PUXANDO.agachada),
  }), []);
  // Uma puxada só: o tamanho da tela é o do começo.
  const W = window.innerWidth, H = window.innerHeight;
  const gw = Math.ceil(W / px), gh = Math.ceil(H / px);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const maoX = MAO_PUXANDO[0] * px;
    const x0 = x - CORPO_X * px;
    // Até a luva ficar inteira na tela, encostada na borda da direita.
    const xAgarra = W - 4 * px - maoX;
    const corre = Math.max(0.15, (xAgarra - x0) / (CORRE * px));
    // Puxado, a borda do mural chega a zero; ela continua até sumir.
    const xMuralNoLugar = BORDA * px - maoX;
    const xSome = -LARGURA_PUXANDO * px - 40;
    const caminho = xMuralNoLugar - xAgarra;
    // Onde ela fica depois de cada puxão (o que o mural devolveu já descontado).
    const bases = TRANCOS.reduce<number[]>((b, tr) => [...b, b[b.length - 1] + caminho * tr.ganho * (1 - CEDE)], [xAgarra]);
    const xPronta = bases[TRANCOS.length];
    const bordaDa = (sx: number) => sx + maoX - BORDA * px;

    // A tela treme: `abalo` (em pixels da tela) some sozinho.
    let abalo = 0;
    const tremor = (t: number): [number, number] => abalo < 0.4 ? [0, 0]
      : [Math.round(Math.sin(t * 97) * abalo), Math.round(Math.sin(t * 131 + 1.3) * abalo * 0.6)];
    const sacudir = (forca: number) => { abalo = Math.max(abalo, forca); };

    const muralEm = (borda: number, giro: number, [ox, oy]: [number, number]) => {
      const el = mural.current;
      if (el) el.style.transform = `translate(${Math.round(borda + ox)}px, ${oy}px)${giro ? ` rotate(${giro.toFixed(2)}deg)` : ''}`;
    };

    // A poeira e os riscos, num canvas na grade dela.
    const graos: Grao[] = [];
    const acaso = sorteador(Date.now() & 0xffff);
    const entre = (a: number, b: number) => a + acaso() * (b - a);
    const grao = (g: Omit<Grao, 'idade'>) => { if (!leve) graos.push({ ...g, idade: 0 }); };
    const poeiraNosPes = (sx: number, sy: number, n: number) => {
      for (let i = 0; i < n; i++) {
        grao({
          x: sx / px + entre(PES[0], PES[1]), y: sy / px + PES[2] - entre(0, 2),
          vx: entre(-34, 14), vy: -entre(6, 22), vida: entre(0.45, 0.9),
          cor: POEIRA[Math.floor(acaso() * POEIRA.length)], l: acaso() < 0.3 ? 2 : 1, a: 0.9, peso: 30,
        });
      }
    };
    /** Lascas da cortiça saindo pela borda do mural (`para`: o lado em que voam). */
    const lascas = (borda: number, n: number, para: number) => {
      for (let i = 0; i < n; i++) {
        grao({
          x: borda / px + entre(-1, 2), y: entre(0, gh),
          vx: para * entre(8, 46), vy: entre(-16, 6), vida: entre(0.4, 0.85),
          cor: CORTICA[Math.floor(acaso() * CORTICA.length)], l: acaso() < 0.35 ? 2 : 1, a: 0.85, peso: 26,
        });
      }
    };
    const risco = () => {
      grao({
        x: entre(gw * 0.15, gw), y: entre(0, gh), vx: -entre(420, 620), vy: 0, vida: entre(0.1, 0.18),
        cor: '#f5ecd6', l: Math.round(entre(8, 22)), a: 0.3, peso: 0,
      });
    };
    const pc = poeiraRef.current?.getContext('2d') ?? null;
    let sujo = false;
    const pintarPoeira = (dt: number) => {
      if (!pc || (!graos.length && !sujo)) return;
      pc.clearRect(0, 0, gw * FINO, gh * FINO);
      sujo = graos.length > 0;
      for (let i = graos.length - 1; i >= 0; i--) {
        const g = graos[i];
        g.idade += dt;
        if (g.idade >= g.vida) { graos.splice(i, 1); continue; }
        g.vy += g.peso * dt;
        g.vx *= 1 - Math.min(1, dt * (g.peso ? 2.2 : 0));
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        pc.globalAlpha = g.a * (1 - g.idade / g.vida);
        pc.fillStyle = g.cor;
        pc.fillRect(Math.round(g.x * FINO), Math.round(g.y * FINO), g.peso ? g.l : g.l * FINO, g.peso ? g.l : 1);
      }
      pc.globalAlpha = 1;
    };

    // O que cada canvas mostra (só repinta quando o quadro muda).
    const atuais = new Map<HTMLCanvasElement, HTMLCanvasElement>();
    const pintar = (alvo: HTMLCanvasElement, q: HTMLCanvasElement) => {
      if (atuais.get(alvo) === q) return;
      atuais.set(alvo, q);
      const c = alvo.getContext('2d')!;
      c.clearRect(0, 0, alvo.width, alvo.height);
      c.drawImage(q, 0, 0);
    };
    const por = (alvo: HTMLCanvasElement, sx: number, sy: number) => {
      alvo.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`;
    };
    // Por onde ela passou, para o rastro.
    const passou: { q: HTMLCanvasElement; x: number; y: number }[] = [];
    const semRastro = () => {
      passou.length = 0;
      rastros.current.forEach(r => { if (r) r.style.opacity = '0'; });
    };
    const mostrar = (q: HTMLCanvasElement, sx: number, sy: number, rastro: number) => {
      pintar(cv, q); por(cv, sx, sy);
      passou.unshift({ q, x: sx, y: sy });
      passou.length = Math.min(passou.length, RASTROS * 3 + 1);
      rastros.current.forEach((r, i) => {
        if (!r) return;
        const p = passou[(i + 1) * 3];
        r.style.opacity = rastro && p ? String((0.42 - i * 0.12) * rastro) : '0';
        if (p) { pintar(r, p.q); por(r, p.x, p.y); }
      });
    };

    let t = 0, antes = performance.now(), id = 0, acabou = false;
    let tranco = -1, preparou = false, baque = -1, arrancou = false;
    const passo = (agora: number) => {
      const dt = Math.min(0.05, (agora - antes) / 1000) * v.current;
      t += dt;
      antes = agora;
      abalo *= Math.exp(-dt * 9);
      const tr = tremor(t);
      let s = t;
      if (baque >= 0) {
        // Bateu: passa um tico para a esquerda e volta na mola.
        const tb = t - baque;
        if (tb < ASSENTA) {
          muralEm(-34 * Math.exp(-7 * tb) * Math.sin(15 * tb), 0, tr);
        } else if (!acabou) {
          acabou = true;
          if (mural.current) mural.current.style.transform = '';
          fim.current();
          return;
        }
      } else if (s < VIRA) {
        mostrar(quadros.anda[0], x0, y, 0);
      } else if ((s -= VIRA) < corre) {
        const k = suave(s / corre);
        mostrar(quadros.anda[Math.floor(s / PASSO) % 4], x0 + (xAgarra - x0) * k, y - Math.abs(Math.sin(s * 22)) * 2 * px, 1);
      } else if ((s -= corre) < AGARRA) {
        // A borda do mural aparece com um tranco embaixo da luva.
        if (tranco < 0) { tranco = 0; semRastro(); sacudir(3); lascas(bordaDa(xAgarra), 14, -1); }
        const k = Math.min(1, s / 0.12);
        const treme = s > 0.15 ? Math.sin(s * 80) * px * 0.6 : 0;
        mostrar(quadros.firma, xAgarra + treme + tr[0], y + tr[1], 0);
        muralEm(W + (bordaDa(xAgarra) - W) * sai(k), 0, tr);
      } else if ((s -= AGARRA) < TRANCOS.length * TRANCO) {
        const i = Math.floor(s / TRANCO);
        const r = s - i * TRANCO;
        const { forca, ganho } = TRANCOS[i];
        const base = bases[i], puxa = caminho * ganho;
        let sx: number, sy = y, giro = 0, q: HTMLCanvasElement;
        if (r < EMBALO) {
          // Embala: o tronco vem para o mural, um tico para a direita.
          q = quadros.prepara;
          sx = base + px * 1.5 * forca * Math.sin((r / EMBALO) * Math.PI * 0.5);
        } else if (r < EMBALO + PUXAO) {
          const k = (r - EMBALO) / PUXAO;
          if (tranco === i) { tranco = i + 1; sacudir(2 + 4 * forca); poeiraNosPes(base, y, Math.round(8 + 14 * forca)); lascas(bordaDa(base), Math.round(4 + 6 * forca), -1); }
          q = quadros.puxa[(i * 2 + Math.floor(k * 2)) % 4];
          sx = base + puxa * sai(k);
          sy = y + Math.sin(k * Math.PI) * px;
          giro = -Math.sin(k * Math.PI) * (0.5 + 0.9 * forca);
        } else {
          // Segura: o mural resiste, devolve um pedaço e a arrasta junto.
          const k = (r - EMBALO - PUXAO) / SEGURA;
          q = k < 0.7 ? quadros.puxa[(i * 2 + 1) % 4] : quadros.firma;
          sx = base + puxa * (1 - CEDE * suave(k)) + Math.sin(r * 90) * px * 0.5 * forca;
          giro = Math.sin(k * Math.PI * 2) * 0.25 * forca * (1 - k);
        }
        mostrar(q, sx + tr[0], sy + tr[1], 0);
        muralEm(Math.max(0, bordaDa(sx)), giro, tr);
      } else if ((s -= TRANCOS.length * TRANCO) < PREPARA) {
        // Agacha para trás, tremendo cada vez mais; o mural range.
        if (!preparou) { preparou = true; poeiraNosPes(xPronta, y, 10); }
        const k = s / PREPARA;
        const treme = Math.sin(s * 110) * px * (0.3 + 0.9 * k);
        const sx = xPronta + px * 2 * suave(k) + treme;
        mostrar(quadros.agachada, sx + tr[0], y + tr[1], 0);
        muralEm(bordaDa(sx), -1.6 * suave(k), tr);
        if (acaso() < 0.25) poeiraNosPes(xPronta, y, 1);
      } else {
        s -= PREPARA;
        if (!arrancou) { arrancou = true; sacudir(5); poeiraNosPes(xPronta + px * 2, y, 26); }
        const k = Math.min(1, s / ARRANCA);
        const sx = xPronta + px * 2 + (xSome - xPronta - px * 2) * corrida(k);
        // Sem o rastro: por cima do mural ele borrava as peças.
        mostrar(quadros.puxa[Math.floor(s / (PASSO * 0.7)) % 4], sx, y - Math.abs(Math.sin(s * 26)) * 2 * px, 0);
        for (let n = 0; n < 2; n++) risco();
        const borda = bordaDa(sx);
        muralEm(Math.max(0, borda), -1.6 * (1 - Math.min(1, k * 4)), tr);
        if (borda <= 0 || k >= 1) {
          // Chegou: ela já saiu pela esquerda.
          baque = t;
          cv.style.opacity = '0';
          semRastro();
          sacudir(11);
          lascas(0, 30, 1);
          poeiraNosPes(-CORPO_X * px, H - ALTURA_DA_COISA * px, 18);
        }
      }
      pintarPoeira(dt);
      id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const estilo = { width: LARGURA_PUXANDO * px, height: ALTURA_DA_COISA * px, transform: `translate(${x - CORPO_X * px}px, ${y}px)` };
  return (
    <>
      {Array.from({ length: RASTROS }, (_, i) => (
        <canvas
          key={i}
          ref={el => { rastros.current[i] = el; }}
          className="coisa-puxando coisa-puxando-rastro"
          width={LARGURA_PUXANDO}
          height={ALTURA_DA_COISA}
          style={{ ...estilo, opacity: 0 }}
          aria-hidden
        />
      ))}
      <canvas ref={ref} className="coisa-puxando" width={LARGURA_PUXANDO} height={ALTURA_DA_COISA} style={estilo} aria-hidden />
      {!leve && (
        <canvas ref={poeiraRef} className="coisa-puxando coisa-puxando-poeira" width={gw * FINO} height={gh * FINO} style={{ width: gw * px, height: gh * px }} aria-hidden />
      )}
    </>
  );
}
