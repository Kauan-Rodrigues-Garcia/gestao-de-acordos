/**
 * Invasao.tsx — a caça de volta, por cima do mural (pedido de 28/10/2026:
 * «após passar o mouse por cima da Caça aos Zumbis sai alguns zumbis andando
 * na tela, com eles podendo matar; mesma coisa das bruxas»). O mouse entra
 * na foto da gincana e eles invadem: os zumbis atravessam o chão andando, as
 * bruxas cruzam o alto na vassoura. Um clique mata (na cabeça vale mais,
 * como na caça); quem chega do outro lado escapa. No fim, a conta.
 *
 * Os desenhos são os do jogo (`Insignias/desenhos`), nos quadros de andar e
 * de voar, e as mortes também (pedido de 28/10: «pegue do Gestão»): o zumbi
 * estoura e tomba com a física da caça, a bruxa cai da vassoura e espatifa no
 * chão (os fofos ficam tontos), tudo pintado como no jogo (`pintarMortes.ts`).
 * O clique confere o pixel, não a caixa. É um canvas só, que não
 * pega o mouse: o clique é lido na janela e só é engolido quando acerta um
 * deles (o resto do mural continua clicável). A conta é só desta tela.
 */
import { useEffect, useRef, useState } from 'react';
import { ZUMBIS, PRIMEIRO_PASSO, MS_POR_PASSO, LARGURA as LZ, ALTURA as AZ } from '@/components/Insignias/desenhos/zumbis';
import { quadrosDoZumbi } from '@/components/Insignias/desenhos/pixels';
import { BRUXAS, VOO, MS_POR_QUADRO, LARGURA as LB, ALTURA as AB, PARTE_DO_NUMERO, alvoDaParte, parteNoPonto } from '@/components/Insignias/desenhos/bruxas/arte';
import { esquecer, quadrosDa } from '@/components/Insignias/desenhos/bruxas/pixels';
import { avancar as avancarQueda, criarQueda, type Morte as MorteDaBruxa, type Queda } from '@/components/Insignias/desenhos/bruxas/queda';
import {
  desenharQueda, desenharTontura, matarZumbi, pintarChaoNovo, pintarZumbiMorrendo, zumbiAcabou,
  type ChaoDaQueda, type ZumbiMorrendo,
} from './pintarMortes';
import { plural } from './texto';

export type Invasor = 'zumbi' | 'bruxa';
/** Onde o clique pegou. */
type Alvo = 'cabeca' | 'corpo' | 'vassoura';

/** Os pontos da caça (`Insignias/pontuacao.ts`): 5 por pego, mais 10 na cabeça. */
const PONTO = 5, NA_CABECA = 10;
/** As linhas da cabeça do zumbi (`SpriteZumbi`: a cabeça cabe nas linhas 0 a 13). */
const CABECA_DO_ZUMBI = 14;
/** Os zumbis do jogo olham para a direita (`fisica.ts`): quem anda para a esquerda é espelhado. */
const ZUMBI_OLHA = 1;
/** A bruxa no chão: quanto o corpo fica e quanto leva apagando (no jogo eram 9 s; aqui a tela é emprestada). */
const CORPO_S = 4.5, CORPO_APAGA_S = 1.2;

interface Bicho {
  tipo: Invasor;
  qual: number;
  x: number;
  y: number;
  y0: number;
  dir: 1 | -1;
  vel: number;
  esc: number;
  t: number;
  fase: number;
  /** Segundos desde que morreu (null = vivo). */
  morto: number | null;
  entra: number;
  /** A morte do jogo: a do zumbi (o palco dele) ou a queda da bruxa. */
  zumbi?: ZumbiMorrendo;
  queda?: Queda;
  /** Fugiu pelo outro lado. */
  fugiu?: boolean;
}

interface Texto { x: number; y: number; txt: string; t: number; forte: boolean }

// Os quadros de cada um, num canvas, guardados.
const canvasDoZumbi = new Map<number, { quadros: HTMLCanvasElement[]; dados: ImageData[] }>();
function quadrosZ(i: number) {
  let q = canvasDoZumbi.get(i);
  if (!q) {
    const dados = quadrosDoZumbi(ZUMBIS[i]).slice(PRIMEIRO_PASSO, PRIMEIRO_PASSO + 4);
    const quadros = dados.map(d => {
      const c = document.createElement('canvas');
      c.width = d.width; c.height = d.height;
      c.getContext('2d')?.putImageData(d, 0, 0);
      return c;
    });
    q = { quadros, dados };
    canvasDoZumbi.set(i, q);
  }
  return q;
}

export function Invasao({ tipo, v, leve, aoAcabar }: {
  tipo: Invasor;
  v: number;
  leve: boolean;
  aoAcabar: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const vRef = useRef(v);
  vRef.current = v;
  const fim = useRef(aoAcabar);
  fim.current = aoAcabar;
  const total = tipo === 'zumbi' ? (leve ? 4 : 7) : (leve ? 3 : 6);
  const [placar, setPlacar] = useState({ pegos: 0, pontos: 0, acabou: false });

  useEffect(() => {
    const c = cv.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const W = c.width = window.innerWidth;
    const H = c.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
    const acaso = Math.random;
    const base = Math.max(3, Math.round(Math.min(W, H) / 180));

    // Quem vem, e quando.
    const bichos: Bicho[] = Array.from({ length: total }, (_, i) => {
      const dir: 1 | -1 = acaso() < 0.5 ? 1 : -1;
      if (tipo === 'zumbi') {
        const fundo = acaso();
        const y = H * (0.68 + fundo * 0.28);
        const esc = base + (fundo > 0.55 ? 1 : 0);
        return {
          tipo, qual: i % ZUMBIS.length, dir, esc, y, y0: y, t: 0, fase: 0, morto: null as number | null,
          x: dir > 0 ? -LZ * esc : W + LZ * esc,
          vel: (110 + acaso() * 60) * (H / 900), entra: i * 0.55,
        };
      }
      const esc = Math.max(2, base - 2);
      const y0 = H * (0.14 + acaso() * 0.42);
      return {
        tipo, qual: i % BRUXAS.length, dir, esc, y: y0, y0, t: 0, fase: acaso() * 6, morto: null as number | null,
        x: dir > 0 ? -LB * esc : W + LB * esc,
        vel: (230 + acaso() * 110) * (W / 1600), entra: i * 0.6,
      };
    });
    const textos: Texto[] = [];
    // As bruxas caem num mundo em pixel da arte (como no palco do jogo): um
    // canvas para o chão sujo e um para os corpos, ampliados na tela.
    const escB = Math.max(2, base - 2);
    const mundoL = Math.ceil(W / escB), mundoA = Math.ceil(H / escB);
    const chaoDoMundo = mundoA - 3;
    const novoCanvas = () => { const m = document.createElement('canvas'); m.width = mundoL; m.height = mundoA; return m; };
    const mundoChao = novoCanvas(), mundoCorpos = novoCanvas();
    const cChao = mundoChao.getContext('2d')!, cCorpos = mundoCorpos.getContext('2d')!;
    const jaPintado = new Map<Queda, ChaoDaQueda>();
    const idsDoGiro = new Set<number>();
    let relogio = 0, pegos = 0, pontos = 0, terminou = -1;

    const caixa = (b: Bicho) => {
      const l = (b.tipo === 'zumbi' ? LZ : LB) * b.esc, a = (b.tipo === 'zumbi' ? AZ : AB) * b.esc;
      return b.tipo === 'zumbi' ? { x: b.x - l / 2, y: b.y - a, l, a } : { x: b.x - l / 2, y: b.y - a / 2, l, a };
    };
    const quadroDe = (b: Bicho) => Math.floor((b.t * 1000) / (b.tipo === 'zumbi' ? MS_POR_PASSO : MS_POR_QUADRO)) % (b.tipo === 'zumbi' ? 4 : VOO.length);
    const espelhado = (b: Bicho) => (b.tipo === 'zumbi' ? b.dir !== ZUMBI_OLHA : b.dir < 0);

    /** Acertou? Devolve onde; `null` = errou. Confere o pixel (com um de folga). */
    const acerto = (b: Bicho, mx: number, my: number): Alvo | null => {
      if (b.morto != null || relogio < b.entra) return null;
      const k = caixa(b);
      if (mx < k.x || my < k.y || mx >= k.x + k.l || my >= k.y + k.a) return null;
      let px = Math.floor((mx - k.x) / b.esc);
      const py = Math.floor((my - k.y) / b.esc);
      const larg = b.tipo === 'zumbi' ? LZ : LB;
      // O espelho da bruxa já vem desenhado no canvas da esquerda; o do zumbi é o do canvas.
      if (espelhado(b)) px = larg - 1 - px;
      const q = quadroDe(b);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = px + dx, y = py + dy;
        if (b.tipo === 'zumbi') {
          const d = quadrosZ(b.qual).dados[q];
          if (x >= 0 && y >= 0 && x < d.width && y < d.height && d.data[(y * d.width + x) * 4 + 3] > 0) return y < CABECA_DO_ZUMBI ? 'cabeca' : 'corpo';
        } else {
          const img = quadrosDa(BRUXAS[b.qual], false).imagens[q];
          const n = parteNoPonto(img, x, y);
          if (n > 0) {
            const parte = PARTE_DO_NUMERO[n];
            const a = parte ? alvoDaParte(parte) : null;
            return a === 'cabeca' || a === 'vassoura' ? a : 'corpo';
          }
        }
      }
      return null;
    };

    /** O pixel do sprite onde o clique pegou, no desenho sem espelho (o do jogo). */
    const pixelDoClique = (b: Bicho, mx: number, my: number) => {
      const k = caixa(b);
      let x = Math.floor((mx - k.x) / b.esc);
      if (espelhado(b)) x = (b.tipo === 'zumbi' ? LZ : LB) - 1 - x;
      return { x, y: Math.floor((my - k.y) / b.esc) };
    };

    const matar = (b: Bicho, mx: number, my: number, alvo: Alvo) => {
      const cabeca = alvo === 'cabeca';
      b.morto = 0;
      const q = quadroDe(b);
      const impacto = pixelDoClique(b, mx, my);
      if (b.tipo === 'zumbi') {
        b.zumbi = matarZumbi(b.qual, PRIMEIRO_PASSO + q, cabeca ? 'cabeca' : 'corpo', impacto);
      } else {
        const k = caixa(b);
        const morte: MorteDaBruxa = alvo === 'vassoura' ? 'vassoura' : cabeca ? 'cabeca' : 'corpo';
        b.queda = criarQueda({
          bruxa: BRUXAS[b.qual], quadro: q, lado: b.dir, x: k.x / escB, y: k.y / escB,
          vx: (b.dir * b.vel) / escB, vy: 0, morte, impacto, chao: chaoDoMundo, largura: mundoL,
        });
        jaPintado.set(b.queda, { raios: [], sujou: false });
      }
      pegos++;
      const ganho = PONTO + (cabeca ? NA_CABECA : 0);
      pontos += ganho;
      const fofa = b.tipo === 'bruxa' && !!BRUXAS[b.qual].fofa;
      const nome = cabeca ? (fofa ? 'BONK!' : 'HEADSHOT!') : alvo === 'vassoura' ? 'VASSOURADA!' : '';
      textos.push({ x: Math.max(130, Math.min(window.innerWidth - 130, mx)), y: Math.max(40, my - 20), txt: nome ? `${nome} +${ganho}` : `+${ganho}`, t: 0, forte: cabeca });
      setPlacar({ pegos, pontos, acabou: false });
    };

    const clique = (e: PointerEvent) => {
      if (terminou >= 0) return;
      // De cima para baixo: o da frente (o mais embaixo, no chão) primeiro.
      const ordem = bichos.slice().sort((a, b) => b.y - a.y);
      for (const b of ordem) {
        const r = acerto(b, e.clientX, e.clientY);
        if (r == null) continue;
        e.preventDefault();
        e.stopPropagation();
        matar(b, e.clientX, e.clientY, r);
        return;
      }
    };
    const mira = (e: PointerEvent) => {
      const em = bichos.some(b => acerto(b, e.clientX, e.clientY) != null);
      document.documentElement.classList.toggle('portal-mira', em);
    };
    window.addEventListener('pointerdown', clique, true);
    window.addEventListener('pointermove', mira, { passive: true });

    let id = 0, antes = performance.now();
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, (agora - antes) / 1000) * vRef.current;
      antes = agora;
      relogio += dt;
      ctx.clearRect(0, 0, W, H);

      // As bruxas que caíram: a queda do jogo, no mundo em pixel da arte.
      cCorpos.clearRect(0, 0, mundoL, mundoA);
      for (const b of bichos) {
        const q = b.queda;
        if (!q || b.morto == null) continue;
        avancarQueda(q, dt);
        q.eventos.length = 0;
        pintarChaoNovo(cChao, q, jaPintado.get(q)!);
        const a = b.morto < CORPO_S ? 1 : Math.max(0, 1 - (b.morto - CORPO_S) / CORPO_APAGA_S);
        if (a <= 0) continue;
        cCorpos.globalAlpha = a;
        desenharQueda(cCorpos, q, idsDoGiro);
        if (q.tonta) desenharTontura(cCorpos, q, agora);
      }
      cCorpos.globalAlpha = 1;
      ctx.drawImage(mundoChao, 0, 0, mundoL * escB, mundoA * escB);
      ctx.drawImage(mundoCorpos, 0, 0, mundoL * escB, mundoA * escB);

      // Os bichos, de trás para a frente.
      for (const b of bichos.slice().sort((a, c) => a.y - c.y)) {
        if (relogio < b.entra || b.fugiu) continue;
        b.t += dt;
        const k = caixa(b);
        if (b.morto != null) {
          b.morto += dt;
          // O zumbi morre no palco dele, no lugar e no quadro em que estava.
          if (b.zumbi && !zumbiAcabou(b.zumbi)) pintarZumbiMorrendo(ctx, b.zumbi, dt, k.x, k.y, b.esc, espelhado(b));
          continue;
        }
        b.x += b.dir * b.vel * dt;
        if (b.tipo === 'bruxa') b.y = b.y0 + Math.sin(b.t * 2.2 + b.fase) * 34 * (H / 900);
        if (b.x < -k.l * 1.2 || b.x > W + k.l * 1.2) { b.fugiu = true; continue; }
        const q = quadroDe(b);
        const img = b.tipo === 'zumbi'
          ? quadrosZ(b.qual).quadros[q]
          : (b.dir > 0 ? quadrosDa(BRUXAS[b.qual], false).direita : quadrosDa(BRUXAS[b.qual], false).esquerda)[q];
        ctx.save();
        if (b.tipo === 'zumbi' && espelhado(b)) {
          ctx.translate(k.x + k.l, k.y);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, k.l, k.a);
        } else {
          ctx.drawImage(img, k.x, k.y, k.l, k.a);
        }
        ctx.restore();
      }

      // Os pontos.
      ctx.textAlign = 'center';
      for (let i = textos.length - 1; i >= 0; i--) {
        const t = textos[i];
        t.t += dt;
        if (t.t > 1) { textos.splice(i, 1); continue; }
        ctx.globalAlpha = 1 - Math.max(0, t.t - 0.6) / 0.4;
        ctx.font = `${t.forte ? 22 : 18}px "Press Start 2P", monospace`;
        ctx.fillStyle = '#000';
        ctx.fillText(t.txt, t.x + 3, t.y - t.t * 50 + 3);
        ctx.fillStyle = t.forte ? '#ffd34d' : '#9dff5c';
        ctx.fillText(t.txt, t.x, t.y - t.t * 50);
      }
      ctx.globalAlpha = 1;

      // Todos saíram (do outro lado, ou mortos e já apagados): a conta, e acaba.
      const saiu = (b: Bicho) => !!b.fugiu || (b.zumbi ? zumbiAcabou(b.zumbi) : b.morto != null && b.morto > CORPO_S + CORPO_APAGA_S);
      const todos = bichos.every(b => relogio >= b.entra && saiu(b));
      if (todos && terminou < 0) { terminou = relogio; setPlacar({ pegos, pontos, acabou: true }); }
      if (terminou >= 0 && relogio - terminou > 2.2) { fim.current(); return; }
      id = requestAnimationFrame(quadro);
    };
    id = requestAnimationFrame(quadro);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('pointerdown', clique, true);
      window.removeEventListener('pointermove', mira);
      document.documentElement.classList.remove('portal-mira');
      esquecer(idsDoGiro);
    };
  }, [tipo, total, leve]);

  const nome = tipo === 'zumbi' ? ['zumbi', 'zumbis'] as const : ['bruxa', 'bruxas'] as const;
  return (
    <>
      <canvas ref={cv} className="mural-invasao" aria-hidden />
      <div className={`mural-invasao-placar${placar.acabou ? ' mural-invasao-fim' : ''}`} role="status">
        {placar.acabou
          ? <>Você pegou {placar.pegos} de {plural(total, nome[0], nome[1])}{placar.pontos ? ` · ${placar.pontos} pts` : ''}</>
          : <>{tipo === 'zumbi' ? 'Os zumbis voltaram!' : 'As bruxas voltaram!'} <span>{placar.pegos}/{total} · clique para pegar</span></>}
      </div>
    </>
  );
}
