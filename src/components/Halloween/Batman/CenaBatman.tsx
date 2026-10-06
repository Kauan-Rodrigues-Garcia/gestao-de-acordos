/**
 * CenaBatman — o fundo do modo Batman (ver `modoBatman.ts`).
 *
 * O nível do modo, lido a cada quadro, leva tudo junto:
 *
 *   0 a 50%  — o fundo puxa para um vermelho-escuro (no tema claro também), e
 *              o Halloween de antes (chuva, nuvens, vultos, fantasmas) some na
 *              mesma medida (`--hw-bat`, lido em `halloween.css`);
 *   25 a 75% — sobe a névoa vermelha;
 *   50 a 100% — uma luz vermelha começa a falhar;
 *   50% em diante — ele sobe (na mesa); com a entrada de 3,5 s, o tema está
 *              inteiro em ~3,5 s.
 *
 * Por baixo de tudo, Gotham (`gotham/CenaGotham.tsx`, 05/10/2026): na mesa, a
 * Gotham Square do filme na chuva; no Analítico, o bat-sinal pela janela. Ela
 * entra junto com o vermelho e segue a música. No Analítico ela substitui os
 * vultos atrás do vidro (que continuam no código, escondidos: a figura que os
 * desenhava é quem move o quadro). A carta do Charada e o Batmóvel moram na
 * caixa das camadas, por cima do conteúdo.
 *
 * Dois jeitos:
 *   - `mesa` (Dashboard e Acordos): ele SAI DE TRÁS da tabela, no vão do
 *     cabeçalho — `[data-hw-batman-topo]` diz onde fica o vão e
 *     `[data-hw-batman-chao]`, a linha atrás da qual o peito some. Ele, o
 *     brilho vermelho e a névoa dele moram DENTRO do `<main>` (num palco atrás
 *     do conteúdo): rolam junto com a tabela pelo próprio navegador. Antes
 *     ficavam no fundo fixo, seguindo a tabela a 30 quadros por segundo — e
 *     tremiam ao rolar a página. Onde há lanterna, ela mira nele.
 *   - `vultos` (Analítico): no lugar dos vultos, atrás do vidro fosco — surge
 *     de um lado, fica, some, volta do outro. Fica no fundo fixo, como eles.
 *
 * A foto é recortada (fundo transparente): nenhum retângulo aparece, nem com a
 * luz apagada.
 *
 * ## Leve
 *
 * - Canvas em meia resolução, 30 quadros por segundo (como a `Fumaca`); a
 *   névoa dele, na mesa, num canvas pequeno só em volta dele.
 * - Variável CSS só é escrita quando muda: com o tema inteiro no ar, o
 *   `--hw-bat` (herdado pela página toda) fica parado e não refaz estilo de
 *   nada. A luz que pisca escreve só no palco dele.
 * - Vidro sem `backdrop-filter`: desfocar a tela inteira a cada piscada da luz
 *   era o item mais caro. Na mesa ele só desfocava um degradê (que já é liso);
 *   no Analítico o desfoque vai direto na foto. Fica o reflexo do vidro.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import { ehTemaEscuro } from '@/lib/temas';
import { cn } from '@/lib/utils';
import { desenharLufada } from '../lufada';
import { SUBIDA_MS, definirAlvoBatman, nivelAgora, useModoBatman, type EstadoBatman } from './modoBatman';
import { AconteceEmGotham, FundoGotham } from './gotham/CenaGotham';
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
type Lugar = { x: number; y: number; w: number; h: number };

/** Onde ele fica na `mesa`, em px do `palco` (que rola com a página); `null` se a tela não tem vão para ele. */
function lugarNaMesa(palco: DOMRect): Lugar | null {
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
  const w = Math.round(Math.min(196, Math.max(150, palco.width * 0.14)));
  const h = Math.round(w * PROPORCAO);
  if (ate - de < w) return null;
  const x = de + (ate - de - w) * 0.72;
  // O peito (60% da altura) fica logo atrás da linha de baixo.
  const y = chao.getBoundingClientRect().top + 6 - h * 0.6;
  return { x: Math.round(x - palco.left), y: Math.round(y - palco.top), w, h };
}

/** A luz que falha: zumbe, engasga, às vezes apaga ou dá um clarão — sem degrau seco. */
function criarLuz() {
  let luz = 1, luzVis = 1, ate = 0;
  const seq: [number, number][] = [];
  return (agora: number, dt: number) => {
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
    // Apaga e acende com um rastro curto (filamento) e respira por baixo.
    luzVis += (luz - luzVis) * (1 - Math.exp(-dt * (luz < luzVis ? 16 : 11)));
    return luzVis * (1 + 0.06 * Math.sin((agora / 1000) * (2 * Math.PI / 4.2)));
  };
}

/** Escreve a variável só se o valor mudou (escrever igual também refaz estilo). */
function escritor(el: HTMLElement) {
  const ultimo = new Map<string, string>();
  return (nome: string, valor: string) => {
    if (ultimo.get(nome) === valor) return;
    ultimo.set(nome, valor);
    el.style.setProperty(nome, valor);
  };
}

/** Desenha um punhado de lufadas num canvas e devolve o quadro seguinte de cada uma. */
function desenharLufadas(cx: CanvasRenderingContext2D, lista: Particula[], forca: number, dt: number, renova: () => Particula) {
  const sprites = lufadasVermelhas();
  for (const p of lista) {
    p.vida += dt;
    if (p.vida >= p.dur) { Object.assign(p, renova()); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.esc += p.cresce * dt;
    if (forca < 0.005) continue;
    const s = sprites[p.sprite], tam = s.width * p.esc;
    cx.globalAlpha = Math.sin((p.vida / p.dur) * Math.PI) * p.a * forca;
    cx.setTransform(Math.cos(p.rot), Math.sin(p.rot), -Math.sin(p.rot), Math.cos(p.rot), p.x, p.y);
    cx.drawImage(s, -tam / 2, -tam / 2, tam, tam);
  }
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.globalAlpha = 1;
}

/** Lufadas em volta de um centro (px do canvas), nascendo embaixo e subindo devagar. */
function lufadaPerto(cx: number, cy: number, r: number, qualquerLugar: boolean): Particula {
  return {
    x: cx + acaso(-0.75, 0.75) * r, y: cy + (qualquerLugar ? acaso(-0.6, 0.7) : acaso(0.3, 0.8)) * r,
    vx: acaso(-3, 3), vy: -acaso(1.5, 5), rot: Math.random() * 6.28, vr: acaso(-0.1, 0.1), esc: acaso(0.6, 1.15), cresce: acaso(0.02, 0.05),
    vida: qualquerLugar ? acaso(0, 14) : 0, dur: acaso(12, 22), sprite: Math.floor(Math.random() * 4), a: acaso(0.6, 1),
  };
}

/**
 * Ele já pode subir? Da metade da entrada em diante (e com o tema inteiro): esperar a
 * entrada acabar para só então começar a subir deixava o tema pela metade por segundos.
 */
function useEleSobe(e: EstadoBatman): boolean {
  const [sobe, setSobe] = useState(e.fase === 'dentro');
  useEffect(() => {
    if (e.fase !== 'entrando') { setSobe(e.fase === 'dentro'); return; }
    const falta = (0.5 - e.n0) * SUBIDA_MS;
    setSobe(falta <= 0);
    if (falta <= 0) return;
    const t = setTimeout(() => setSobe(true), falta);
    return () => clearTimeout(t);
  }, [e]);
  return sobe;
}

export function FundoBatman({ modo }: { modo: 'mesa' | 'vultos' }) {
  const { resolvedTheme } = useTheme();
  const claro = !ehTemaEscuro(resolvedTheme);
  const modoBatman = useModoBatman();
  const { fase } = modoBatman;
  const eleSobe = useEleSobe(modoBatman);
  const raiz = useRef<HTMLDivElement>(null);
  const figura = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const brilho = useRef<HTMLDivElement>(null);
  const telaPerto = useRef<HTMLCanvasElement>(null);
  // Na mesa ele mora dentro do `<main>` (ver o cabeçalho).
  const [main, setMain] = useState<HTMLElement | null>(null);
  // A caixa das camadas: a carta do Charada e o Batmóvel passam por cima do conteúdo.
  const [caixa, setCaixa] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMain(modo === 'mesa' ? raiz.current?.parentElement?.querySelector<HTMLElement>(':scope > main') ?? null : null);
    setCaixa(raiz.current?.parentElement ?? null);
  }, [modo]);

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
    const el = raiz.current, cv = tela.current;
    const pai = el?.parentElement;
    const cx = cv?.getContext('2d');
    if (!el || !cv || !cx || !pai) return;
    const naMesa = modo === 'mesa';
    // Na mesa, espera o palco existir dentro do `<main>`.
    const pal = palco.current, fig = figura.current, bri = brilho.current, cvPerto = telaPerto.current;
    const cxPerto = cvPerto?.getContext('2d') ?? null;
    if (naMesa && (!pal || !fig || !bri || !cvPerto || !cxPerto)) return;
    if (!naMesa && !fig) return;

    const varPai = escritor(pai), varFundo = escritor(el), varPalco = pal ? escritor(pal) : varFundo;
    const luzQueFalha = criarLuz();

    let parts: Particula[] = [];
    const nova = (qualquerLugar: boolean): Particula => ({
      x: acaso(-0.1, 1.1) * cv.width, y: qualquerLugar ? acaso(0, 1.1) * cv.height : cv.height + acaso(20, 120),
      vx: acaso(-6, 10), vy: -acaso(4, 13), rot: Math.random() * 6.28, vr: acaso(-0.12, 0.12), esc: acaso(1.2, 2.4), cresce: acaso(0.03, 0.08),
      vida: qualquerLugar ? acaso(0, 20) : 0, dur: acaso(22, 38), sprite: Math.floor(Math.random() * 4), a: acaso(0.55, 1),
    });
    const ajustar = () => {
      cv.width = Math.max(1, Math.round(cv.clientWidth / 2));
      cv.height = Math.max(1, Math.round(cv.clientHeight / 2));
      parts = Array.from({ length: Math.round(Math.min(32, Math.max(14, (cv.width * cv.height) / 7000))) }, () => nova(true));
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(cv);

    // A névoa dele: no Analítico, no canvas do fundo; na mesa, no canvas pequeno do palco.
    let perto: Particula[] = [];
    let centro = { x: 0, y: 0, r: 98 };
    const novaPerto = () => lufadaPerto(centro.x, centro.y, centro.r, false);

    // Na mesa: onde ele está (px do palco). A lanterna pergunta pela cabeça no próprio quadro.
    let lugar: Lugar | null = null, chaveLugar = '';
    if (naMesa && fig) {
      definirAlvoBatman(() => {
        if (!lugar) return null;
        const r = fig.getBoundingClientRect();
        return { x: r.left + r.width * 0.34, y: r.top + r.height * 0.3 };
      });
    }

    let ultimo = 0, rodando = true;
    const quadro = (agora: number) => {
      if (!rodando) return;
      if (agora - ultimo < 32) { requestAnimationFrame(quadro); return; }
      const dt = Math.min(0.1, (agora - ultimo) / 1000);
      ultimo = agora;

      const nivel = nivelAgora();
      const verm = lim(nivel / 0.5), nevoa = lim((nivel - 0.25) / 0.5), pisca = lim((nivel - 0.5) / 0.5);
      const luz = luzQueFalha(agora, dt);
      const luzEf = 1 + (luz - 1) * pisca;
      varPai('--hw-bat', verm.toFixed(3));
      varFundo('--verm', verm.toFixed(3));
      varPalco('--luz', luzEf.toFixed(3));
      varPalco('--luzv', (pisca * Math.min(1.35, luz) * 0.9).toFixed(3));

      if (naMesa && pal && fig && bri && cvPerto && cxPerto) {
        // Relativo ao palco, que rola com a página: rolando, nada disto muda.
        const l = lugarNaMesa(pal.getBoundingClientRect());
        const chave = l ? `${l.x}:${l.y}:${l.w}` : 'sem';
        if (chave !== chaveLugar) {
          chaveLugar = chave;
          lugar = l;
          pal.classList.toggle('sem-lugar', !l);
          if (l) {
            Object.assign(fig.style, { left: `${l.x}px`, top: `${l.y}px`, width: `${l.w}px`, height: `${l.h}px` });
            // O brilho vermelho atrás da cabeça.
            const bw = l.w * 4, bh = l.h * 4.2;
            Object.assign(bri.style, { left: `${l.x + l.w * 0.4 - bw / 2}px`, top: `${l.y + l.h * 0.36 - bh / 2}px`, width: `${bw}px`, height: `${bh}px` });
            // O canvas da névoa dele, só em volta dele (meia resolução).
            const cw = Math.round(l.w * 2.8), ch = Math.round(l.h * 1.7);
            Object.assign(cvPerto.style, { left: `${l.x + l.w * 0.48 - cw / 2}px`, top: `${l.y + l.h * 0.45 - ch / 2}px`, width: `${cw}px`, height: `${ch}px` });
            cvPerto.width = Math.round(cw / 2); cvPerto.height = Math.round(ch / 2);
            centro = { x: cvPerto.width / 2, y: cvPerto.height / 2, r: l.w / 2 };
            perto = Array.from({ length: 14 }, () => lufadaPerto(centro.x, centro.y, centro.r, true));
          }
        }
        cxPerto.clearRect(0, 0, cvPerto.width, cvPerto.height);
        if (lugar) desenharLufadas(cxPerto, perto, 0.62 * nevoa * (0.5 + 0.5 * Math.min(1, luzEf)), dt, novaPerto);
      }

      // A névoa geral da tela — só na mesa. No Analítico a janela do bat-sinal
      // (`gotham/janela.tsx`) tomou o lugar dos vultos: a névoa, a figura e o
      // brilho estão escondidos, e desenhá-los (ou medir a figura, que força
      // layout) seria trabalho jogado fora a cada quadro.
      if (naMesa) {
        cx.clearRect(0, 0, cv.width, cv.height);
        desenharLufadas(cx, parts, 0.6 * nevoa * (0.4 + 0.6 * Math.min(1, luzEf)), dt, () => nova(false));
      }
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
  }, [modo, main]);

  const naMesa = modo === 'mesa';
  const imagem = <div className="sobe"><img src={FOTO_BATMAN} alt="" draggable={false} /></div>;
  return (
    <div ref={raiz} className={cn('hw-batman', modo)} aria-hidden="true">
      <div className="hw-bat-verm" />
      <FundoGotham modo={modo} />
      {!naMesa && <div className="hw-bat-luz" />}
      {!naMesa && <div ref={figura} className="hw-bat-figura">{imagem}</div>}
      <canvas ref={tela} className="hw-bat-fumaca" />
      <div className="hw-bat-vidro" />
      {naMesa && main && createPortal(
        <div ref={palco} className="hw-bat-palco" aria-hidden="true">
          <div ref={brilho} className="hw-bat-brilho" />
          <div ref={figura} className={cn('hw-bat-figura', eleSobe && 'visivel')}>{imagem}</div>
          <canvas ref={telaPerto} className="hw-bat-fumaca-perto" />
        </div>,
        main,
      )}
      {caixa && createPortal(<AconteceEmGotham />, caixa)}
    </div>
  );
}
