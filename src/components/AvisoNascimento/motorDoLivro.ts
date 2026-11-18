/**
 * motorDoLivro.ts — a cegonha traz o livro, ele abre, vira a página e vai embora.
 *
 * Fora do React de propósito: são dezenas de camadas animadas, e nada aqui pode
 * disparar render. Para não travar nos PCs da operação (8 GB, alguns 4 GB, vídeo
 * integrado):
 *   - só `transform` e `opacity`, que a placa resolve sem repintar a página;
 *   - cada parte da cegonha é um elemento próprio, nunca animação dentro de SVG;
 *   - parado, o livro aberto não tem nenhuma camada 3D;
 *   - modo leve automático: pouca memória, poucos núcleos ou quadros lentos nos
 *     primeiros instantes tiram as folhas extras, as penas e os brilhos;
 *   - cada etapa tem prazo, e qualquer erro cai no livro aberto sem animação.
 *     A tela nunca fica presa.
 *
 * De propósito não obedece «reduzir animações» do Windows: os PCs da empresa vêm
 * com isso ligado por desempenho, e aqui a animação é o próprio aviso.
 */
import { comDestaque, escapar, type ConteudoDoLivro } from './conteudo';

export interface DadosDoLivro {
  conteudo: ConteudoDoLivro;
  fotoUrl: string;
  podeRecado: boolean;
  meuRecado: string | null;
  previa: boolean;
}

export interface EventosDoLivro {
  onAberto: () => void;
  onRecado: (texto: string) => Promise<void>;
  onAdiar: () => void;
  onFim: () => void;
}

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode) => r.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode) => [...r.querySelectorAll<T>(s)];
const suave = (p: number) => (1 - Math.cos(Math.PI * p)) / 2;
const amostra = (f: (p: number) => Keyframe, n = 20): Keyframe[] => Array.from({ length: n + 1 }, (_, k) => f(k / n));
const EASE = 'cubic-bezier(.45,.05,.25,1)';
const anima = (el: Element, frames: Keyframe[], delay: number, duration: number, easing = 'linear') =>
  el.animate(frames, { delay, duration, easing, fill: 'both' });
const espera = (ms: number) => new Promise<void>(ok => { window.setTimeout(ok, ms); });
/** Termina quando as animações acabam, ou no prazo, o que vier primeiro. */
const ate = (lista: Array<Promise<unknown>>, prazo: number): Promise<unknown> =>
  Promise.race([Promise.all(lista.map(p => p.catch((): undefined => undefined))), espera(prazo)]);

const pouco = () => {
  const n = navigator as Navigator & { deviceMemory?: number };
  return (n.deviceMemory ?? 8) <= 4 || (n.hardwareConcurrency ?? 8) <= 2;
};

/** Mede os quadros reais por meio segundo, enquanto o fundo escurece. */
const quadrosLentos = () => new Promise<boolean>(ok => {
  const t: number[] = [];
  const passo = (n: number) => {
    t.push(n);
    if (n - t[0] < 450) { requestAnimationFrame(passo); return; }
    const d = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
    ok((d[Math.floor(d.length / 2)] ?? 0) > 34);
  };
  requestAnimationFrame(passo);
  window.setTimeout(() => ok(false), 900);
});

export function criarLivro(raiz: HTMLElement, dados: DadosDoLivro, ev: EventosDoLivro): () => void {
  const c = dados.conteudo;
  let ticket = 0, W = 470, H = 640, leve = pouco(), recado = dados.meuRecado ?? '', avisouAberto = false;
  raiz.className = 'ln palco';
  raiz.classList.toggle('leve', leve);

  const ehCel = () => innerWidth <= 760;
  const foto = `<img class="ph" src="${escapar(dados.fotoUrl)}" alt="${escapar(c.alt_foto)}"><i class="calha"></i>`;
  const paragrafos = c.paragrafos.map(p => `<p>${comDestaque(p)}</p>`).join('');
  const assinatura = c.assinatura ? `<p class="assina">${escapar(c.assinatura)}</p>` : '';
  const pagina = (estatica: boolean) => `<div class="p-texto"><p class="cap">${escapar(c.capitulo)}</p><h1${estatica ? '' : ' id="ln-ti"'}>${escapar(c.titulo)}</h1><div class="texto">${paragrafos}${assinatura}</div><div class="pe"><svg aria-hidden="true"><use href="#ln-coelho"/></svg>${dados.podeRecado
    ? `<${estatica ? 'span' : 'button type="button"'} class="virar">Virar a página e deixar um recadinho</${estatica ? 'span' : 'button'}>` : ''}</div></div>`;
  const recadoHtml = `<section class="recado" aria-live="polite">
    <form class="f"><h2><label for="ln-msg">${escapar(c.recado_titulo)}</label></h2>
      <div class="chips">${c.sugestoes.map(s => `<button type="button">${escapar(s)}</button>`).join('')}</div>
      <textarea id="ln-msg" maxlength="280" placeholder="Escreva com carinho…"></textarea>
      <div class="linha"><span class="conta">0/280</span></div>
      ${dados.previa ? '<p class="aviso-previa">Prévia: nada é gravado.</p>' : ''}<p class="erro-recado" hidden></p>
      <button class="enviar" disabled>Guardar meu carinho</button></form>
    <div class="guardado" hidden><svg aria-hidden="true"><use href="#ln-coracao"/></svg><h2>Recadinho guardado</h2><p>Obrigado por fazer parte deste começo.</p><blockquote></blockquote><button class="sec editar" type="button">Editar meu recadinho</button></div>
  </section>`;

  const medir = () => {
    const vw = innerWidth, alt = innerHeight - 58;
    if (ehCel()) { W = Math.min(vw - 44, 340); H = Math.min(Math.round(W * 1.36), alt - 16); }
    else { W = Math.floor((Math.min(956, vw - 32) - 16) / 2); H = Math.max(480, Math.min(640, alt - 16)); }
    raiz.style.setProperty('--T', `${Math.round(W * .1)}px`);
    raiz.style.setProperty('--W', `${W}px`);
    raiz.style.setProperty('--H', `${H}px`);
  };
  addEventListener('resize', medir);

  /* ---------- A folha que curva ---------- */
  function criarFolha(larg: number, alt: number, n: number, frente: Node | null, verso: Node | null) {
    const forca = (i: number) => (.05 + .27 * i / n).toFixed(3);
    const sw = Math.ceil(larg / n) + 2, passo = (larg - sw) / (n - 1), tiras: HTMLElement[] = [];
    let pai: HTMLElement | null = null;
    for (let i = 0; i < n; i++) {
      const t = document.createElement('div');
      t.className = 'tira';
      t.style.cssText = `width:${sw}px;height:${alt}px;left:${i ? passo : 0}px`;
      const face = (cls: 'fr' | 'vs', no: Node | null, x: number) => {
        const f = document.createElement('div');
        f.className = `face ${cls}`;
        if (no) {
          const d = document.createElement('div');
          d.className = 'conteudo';
          d.style.cssText = `left:${x}px;width:${larg}px;height:${alt}px`;
          d.append(no.cloneNode(true));
          f.append(d);
        }
        const s = document.createElement('i');
        s.className = 'somb';
        const [a, b] = cls === 'fr' ? [forca(i), forca(i + 1)] : [forca(i + 1), forca(i)];
        s.style.background = `linear-gradient(90deg,rgba(124,44,76,${a}),rgba(124,44,76,${b}))`;
        f.append(s);
        return f;
      };
      t.append(face('fr', frente, -i * passo), face('vs', verso, -(larg - sw - i * passo)));
      if (pai) pai.append(t);
      pai = t;
      tiras.push(t);
    }
    return { raiz: tiras[0], tiras };
  }
  type Folha = ReturnType<typeof criarFolha>;
  function virarFolha(f: Folha, o: { dur: number; atraso?: number; z0?: number; z1?: number; sentido?: PlaybackDirection; curva?: number }) {
    const { dur, atraso = 0, z0 = 1, z1 = 1, sentido = 'normal', curva = 10 } = o;
    const op: KeyframeAnimationOptions = { duration: dur, delay: atraso, fill: 'both', direction: sentido, easing: 'linear' };
    const n = f.tiras.length, an: Animation[] = [];
    f.tiras.forEach((t, i) => {
      const peso = .7 + .6 * i / n;
      an.push(t.animate(amostra(p => ({ transform: i
        ? `rotateY(${(-curva * peso * Math.sin(2 * Math.PI * p)).toFixed(2)}deg)`
        : `translateZ(${(z0 + (z1 - z0) * p).toFixed(2)}px) rotateY(${(-180 * suave(p)).toFixed(2)}deg)` })), op));
      $$(':scope>.face>.somb', t).forEach(s => an.push(s.animate(amostra(p => ({ opacity: Math.sin(Math.PI * p).toFixed(3) }), 10), op)));
    });
    return Promise.all(an.map(a => a.finished));
  }
  const sombra = (el: Element, de: number, a: number, dur: number, atraso: number, sentido: PlaybackDirection = 'normal') =>
    el.animate(amostra(p => ({ opacity: (p < de || p > a ? 0 : Math.sin(Math.PI * (p - de) / (a - de))).toFixed(3) }), 12),
      { duration: dur, delay: atraso, fill: 'both', direction: sentido, easing: 'linear' });
  const ancorar = (f: Folha, r: Element) => {
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:50%;top:8px;width:0;height:0;transform-style:preserve-3d';
    box.append(f.raiz);
    r.append(box);
  };
  const camadaFoto = () => Object.assign(document.createElement('div'), { innerHTML: foto, style: 'position:absolute;inset:0' });

  function chuva(x: number, y: number, n: number) {
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < (leve ? Math.min(n, 5) : n); i++) {
      const s = document.createElementNS(ns, 'svg'), u = document.createElementNS(ns, 'use');
      u.setAttribute('href', '#ln-coracao');
      s.append(u);
      s.setAttribute('class', 'part');
      raiz.append(s);
      const a = Math.random() * 6.28, r = 70 + Math.random() * 110, dx = Math.cos(a) * r, dy = Math.sin(a) * r * .7 - 50;
      s.animate([
        { transform: `translate(${x - 12}px,${y - 12}px) scale(.3)` },
        { transform: `translate(${x - 12 + dx}px,${y - 12 + dy}px) rotate(${dx / 3}deg)`, offset: .6 },
        { transform: `translate(${x - 12 + dx * 1.08}px,${y + dy + 36}px) scale(.8)`, opacity: 0 },
      ], { duration: 1100 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => s.remove();
    }
  }

  /* ---------- Livro fechado ---------- */
  const capaHtml = () => {
    const folhas = Array.from({ length: 20 }, (_, i) => `<ellipse cx="60" cy="13" rx="3.3" ry="7.8" transform="rotate(${i * 18} 60 60) rotate(30 60 13)"/>`).join('');
    return `<div class="cena"><i class="chao"></i>
    <button type="button" class="livro3d" aria-label="Abrir o livrinho">
      <span class="contra"></span><span class="miolo-d"></span><span class="miolo-b"></span><span class="miolo-c"></span><span class="lombada"></span>
      <span class="pagina-dir">${ehCel() ? foto : pagina(true)}</span><span class="fita3d"></span>
      <span class="capa3d"><span class="lado-capa dentro"></span>
        <span class="lado-capa fora"><span class="moldura">
          ${['a', 'b', 'c', 'd'].map(l => `<svg class="canto ${l}" aria-hidden="true"><use href="#ln-canto"/></svg>`).join('')}
          <svg class="guirlanda" viewBox="0 0 120 120" aria-hidden="true">${folhas}<path transform="translate(40 40) scale(.84)" d="M24 43C8 31 3 23 5 15c2-8 13-11 19-2 6-9 17-6 19 2 2 8-3 16-19 28Z"/></svg>
          <span class="era">${escapar(c.era)}</span><span class="titulo-capa">${escapar(c.titulo_capa)}</span><span class="play">${escapar(c.subtitulo_capa)}</span>
          <span class="abra">Toque para abrir</span></span>
          <svg class="faisca" style="left:24%;top:9%" aria-hidden="true"><use href="#ln-estrela"/></svg>
          <svg class="faisca" style="right:11%;top:36%;animation-delay:1s" aria-hidden="true"><use href="#ln-estrela"/></svg>
          <svg class="faisca" style="left:20%;bottom:20%;animation-delay:2s" aria-hidden="true"><use href="#ln-estrela"/></svg>
          <i class="reflexo"></i></span></span>
    </button></div>`;
  };
  const SIMBOLOS = SIMBOLOS_DO_LIVRO;
  const palco = document.createElement('div');
  palco.style.display = 'contents';
  raiz.replaceChildren(Object.assign(document.createElement('div'), { innerHTML: SIMBOLOS, style: 'position:absolute;width:0;height:0' }), palco);
  const trocar = (html: string) => { palco.innerHTML = html; raiz.scrollTop = 0; };

  /* ---------- A cegonha ---------- */
  function montarVoo() {
    medir();
    raiz.classList.remove('entregando');
    trocar(capaHtml());
    const q = $('.cena', palco).getBoundingClientRect();
    const capa = $('.fora', palco).cloneNode(true) as HTMLElement;
    const vw = innerWidth, vh = innerHeight, cx = q.left + q.width / 2, cy = q.top + q.height / 2;
    const bw0 = W + 8, bh0 = H + 16, s = ehCel() ? .42 : .36, bw = bw0 * s, bh = bh0 * s;
    const sw = Math.max(210, Math.min(bw * 2.2, 400, vw * .62)), sh = sw * .66, y0 = Math.min(vh * .13, 92), ky = y0 - bh / 2 - bw * .24;
    raiz.classList.add('entregando');
    const asa = '<div class="asa"><svg aria-hidden="true"><use href="#ln-c-asa"/></svg><div class="ponta"><svg aria-hidden="true"><use href="#ln-c-ponta"/></svg></div></div>';
    trocar(`<div class="voo" role="status" aria-label="A cegonha chegou" style="--bw0:${bw0}px;--bh0:${bh0}px;--bw:${bw}px;--bh:${bh}px;--sw:${sw}px;--sh:${sh}px;--y0:${y0}px;--ky:${ky}px">
      <i class="veu"></i>
      <div class="grupo" style="left:${cx}px;top:${cy}px;transform-origin:0 ${ky}px"><div class="carga">
        <i class="pano pano-fundo"></i><div class="mini"></div><i class="pano rede"></i><i class="pano alca e"></i><i class="pano alca d"></i><svg class="no" aria-hidden="true"><use href="#ln-c-no"/></svg>
      </div><div class="ceg"><div class="balanco"><div class="asa-longe">${asa}</div><svg aria-hidden="true"><use href="#ln-c-corpo"/></svg>${asa}</div></div></div>
      ${leve ? '' : [0, 1, 2].map(() => '<svg class="pena" aria-hidden="true"><use href="#ln-c-pena"/></svg>').join('')}</div>`);
    const v = $('.voo', palco), mini = $('.mini', v);
    capa.style.borderRadius = 'inherit';
    mini.append(capa);
    return { v, g: $('.grupo', v), carga: $('.carga', v), mini, ceg: $('.ceg', v), s, sw, sh, y0, ky, cx, cy, vw, vh };
  }
  const penas = (m: ReturnType<typeof montarVoo>, atraso: number) => $$('.pena', m.v).forEach((f, i) => {
    const x = m.cx + m.sw * (.12 + i * .13), y = m.cy + m.ky - m.sh * .12, lado = i % 2 ? 1 : -1;
    anima(f, amostra(p => ({
      opacity: Math.min(1, p * 8, (1 - p) * 3).toFixed(2),
      transform: `translate(${(x + lado * 34 * Math.sin(p * 8) + 26 * p).toFixed(1)}px,${(y + p * m.vh * .42).toFixed(1)}px) rotate(${(lado * 34 * Math.sin(p * 8) + 50 * p).toFixed(1)}deg)`,
    }), 24), atraso + i * 430, 2100);
  });

  /** A cegonha TRAZ o livro: entra com a trouxinha, solta, o pano abre e o livro cresce. */
  async function chegar() {
    const t = ++ticket;
    const m = montarVoo(), { v, g, carga, mini, ceg, s, y0, cx, cy, sw, sh, vw } = m;
    v.onclick = () => { if (t === ticket) mostrarFechado(true); };
    mini.style.transform = `translateY(${y0}px) scale(${s})`;
    g.style.visibility = 'hidden';
    anima($('.veu', v), [{ opacity: 0 }, { opacity: 1 }], 0, 480, 'ease-out');
    if (!leve && await quadrosLentos()) { leve = true; raiz.classList.add('leve'); $$('.pena', v).forEach(p => p.remove()); }
    if (t !== ticket) return;
    g.style.visibility = '';

    const VOO = 2000, X = vw - cx + sw * 1.1, Y = -(cy + sh * .45);
    anima(g, amostra(p => {
      const e = 1 - (1 - p) ** 2.6, x = X * (1 - e), y = Y * (1 - e) + 16 * Math.sin(p * 9) * (1 - p);
      return { transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(-4 * Math.sin(p * 6) * (1 - p)).toFixed(2)}deg) scale(${(.62 + .38 * e).toFixed(3)})` };
    }, 50), 0, VOO);
    anima(carga, amostra(p => ({ transform: `rotate(${(11 * Math.sin(p * 13) * (1 - p) ** 1.4).toFixed(2)}deg)` }), 50), 0, VOO + 260);
    if (!leve) penas(m, 900);

    // Solta: o laço desfaz, as alças caem e o pano abre embaixo do livro.
    const SOLTA = VOO + 300;
    anima($('.no', v), [{ transform: 'none' }, { transform: 'scale(1.2)', offset: .3 }, { transform: 'scale(0) rotate(30deg)' }], SOLTA, 300, 'ease-in');
    anima($('.pano-fundo', v), [{ transform: 'rotate(45deg) scale(.5)', opacity: 0 }, { transform: 'rotate(45deg) scale(1.05)', opacity: 1, offset: .6 }, { transform: 'rotate(45deg) scale(1)', opacity: 1 }], SOLTA + 60, 420, 'ease-out');
    anima($('.alca.e', v), [{ transform: 'none', opacity: 1 }, { transform: 'rotate(-34deg) scale(.74,.16)', opacity: 1, offset: .86 }, { transform: 'rotate(-38deg) scale(.7,.08)', opacity: 0 }], SOLTA + 90, 430, 'ease-in-out');
    anima($('.alca.d', v), [{ transform: 'none', opacity: 1 }, { transform: 'rotate(34deg) scale(.74,.16)', opacity: 1, offset: .86 }, { transform: 'rotate(38deg) scale(.7,.08)', opacity: 0 }], SOLTA + 130, 430, 'ease-in-out');
    anima($('.rede', v), [{ transform: 'none' }, { transform: 'scaleY(0)' }], SOLTA + 260, 340, 'ease-in');
    // A cegonha sobe e vai embora, batendo as asas.
    anima(ceg, amostra(p => {
      const e = p ** 1.5;
      return { transform: `translate(${(-(cx + sw * 1.2) * e).toFixed(1)}px,${(-(cy + sh) * p ** .85 + 12 * Math.sin(p * 8)).toFixed(1)}px) rotate(${(-6 * p).toFixed(2)}deg)` };
    }, 36), SOLTA + 40, 1500);
    // O livro cresce e o pano some por baixo.
    const CRESCE = SOLTA + 620;
    anima($('.pano-fundo', v), [{ transform: 'rotate(45deg) scale(1)', opacity: 1 }, { transform: 'rotate(45deg) scale(1.5)', opacity: 0 }], CRESCE + 120, 420, 'ease-out');
    const fim = anima(mini, [{ transform: `translateY(${y0}px) scale(${s})` }, { transform: 'translateY(-4px) scale(1.015)', offset: .82 }, { transform: 'none' }], CRESCE, 640, EASE).finished;
    await ate([fim], CRESCE + 1200);
    if (t === ticket) mostrarFechado(false);
  }

  function mostrarFechado(pulou: boolean) {
    const t = ++ticket;
    medir();
    raiz.classList.remove('entregando');
    trocar(`${capaHtml()}<button type="button" class="depois">Abrir depois</button>`);
    const r = $('.livro3d', palco), x = -(W / 2 + 4);
    $('.depois', palco).onclick = () => { if (t === ticket) ev.onAdiar(); };
    r.onclick = () => { void abrir(); };
    r.focus({ preventScroll: true });
    if (pulou) { r.classList.add('parado'); return; }
    const a = anima(r, [{ transform: `translateX(${x}px)` }, { transform: `translateX(${x}px) scale3d(.86,.86,.86) rotateX(11deg) rotateY(-27deg)` }], 0, 620, EASE);
    void a.finished.then(() => { if (t === ticket) { r.classList.add('parado'); a.cancel(); } }, (): undefined => undefined);
  }

  async function abrir() {
    const r = $('.livro3d', palco), t = ++ticket, cel = ehCel();
    $('.depois', palco)?.remove();
    if (!avisouAberto) { avisouAberto = true; ev.onAberto(); }
    try {
      const de = getComputedStyle(r).transform, a0 = r.matches(':hover') && !cel && r.classList.contains('parado') ? -7 : 0, x = cel ? -(W / 2 + 4) : 0;
      r.classList.remove('parado');
      r.onclick = null;
      const D = cel ? 850 : 1100, chao = $('.chao', palco), capa = $('.capa3d', r);
      anima(r, [{ transform: de }, { transform: `translateX(${x}px) translateY(0) rotateX(0deg) rotateY(0deg)` }], 0, D, EASE);
      anima(chao, [{ transform: getComputedStyle(chao).transform, opacity: 1 }, { transform: `translateX(${x}px)`, opacity: .55 }], 0, D, EASE);
      capa.style.transition = 'none';
      const lista: Array<Promise<unknown>> = [anima(capa, amostra(p => {
        const pulo = p > .84 ? 3 * Math.sin(Math.PI * (p - .84) / .16) : 0;
        return { transform: `translateZ(${(5 - 5 * p).toFixed(2)}px) rotateY(${(a0 + (-180 - a0) * suave(p) + pulo).toFixed(2)}deg)` };
      }, 28), 0, D).finished];
      if (!cel) {
        if (!leve) ([[4, 1, 640, 760], [3, 2, 800, 780]] as const).forEach(([z0, z1, atraso, dur]) => {
          const f = criarFolha(W, H, 6, null, null);
          ancorar(f, r);
          lista.push(virarFolha(f, { dur, atraso, z0, z1, curva: 9 }));
        });
        const ultima = criarFolha(W, H, leve ? 4 : 6, null, camadaFoto());
        ancorar(ultima, r);
        const sb = Object.assign(document.createElement('i'), { className: 'sb d' });
        sb.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateZ(.5px)';
        r.append(sb);
        sombra(sb, 0, 1, 1150, 980);
        $$('.pagina-dir .p-texto>*', r).forEach((el, i) => anima(el, [{ opacity: 0, transform: 'translateY(9px)' }, { opacity: 1, transform: 'none' }], 1260 + i * 110, 480, 'ease-out'));
        lista.push(virarFolha(ultima, { dur: 1150, atraso: 980, z0: 2, z1: 3, curva: 9 }));
      }
      await ate(lista, 3200);
    } catch { /* cai no livro aberto */ }
    if (t === ticket) mostrarAberto();
  }

  /* ---------- Livro aberto ---------- */
  function ligarRecado(r: HTMLElement) {
    const f = $<HTMLFormElement>('.f', r), g = $('.guardado', r), m = $<HTMLTextAreaElement>('textarea', r), b = $<HTMLButtonElement>('.enviar', r), erro = $('.erro-recado', r);
    const conta = () => { $('.conta', r).textContent = `${m.value.length}/280`; b.disabled = m.value.trim().length < 3; };
    const mostra = () => { $('blockquote', r).textContent = recado; f.hidden = true; g.hidden = false; };
    m.value = recado;
    conta();
    if (recado) mostra();
    m.oninput = conta;
    $('.chips', r).onclick = e => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === 'BUTTON') { m.value = alvo.textContent ?? ''; conta(); m.focus(); }
    };
    f.onsubmit = async e => {
      e.preventDefault();
      const texto = m.value.trim();
      if (texto.length < 3) return;
      b.disabled = true;
      erro.hidden = true;
      try {
        await ev.onRecado(texto);
        recado = texto;
        const q = b.getBoundingClientRect();
        chuva(q.left + q.width / 2, q.top, 12);
        mostra();
      } catch (err) {
        erro.textContent = err instanceof Error ? err.message : 'Não deu certo. Tente de novo.';
        erro.hidden = false;
        b.disabled = false;
      }
    };
    $('.editar', r).onclick = () => { g.hidden = true; f.hidden = false; m.focus(); };
  }

  function mostrarAberto() {
    ++ticket;
    medir();
    raiz.classList.remove('entregando');
    trocar(`<article class="aberto" data-pag="texto" role="dialog" aria-modal="true" aria-labelledby="ln-ti" tabindex="-1">
      <button type="button" class="fechar" aria-label="Fechar">&times;</button>
      <div class="p-foto"><button type="button" class="foto-btn" aria-label="Mandar corações">${foto}</button></div>
      <div class="p-dir">${pagina(false)}${dados.podeRecado ? `<div class="p-recado" inert>${recadoHtml}<button class="sec voltar" type="button">Voltar para a história</button></div>` : ''}</div>
      <i class="fita"></i></article>`);
    const a = $('.aberto', palco);
    a.focus({ preventScroll: true });
    $('.fechar', a).onclick = () => { void fechar(); };
    $('.foto-btn', a).onclick = e => chuva(e.clientX, e.clientY, 10);
    if (dados.podeRecado) {
      ligarRecado($('.recado', a));
      $('.virar', a).onclick = () => { void virarPagina(a, true); };
      $('.voltar', a).onclick = () => { void virarPagina(a, false); };
    }
    const q = $('.p-foto', a).getBoundingClientRect();
    chuva(q.left + q.width / 2, q.top + q.height * .45, 10);
  }

  async function virarPagina(a: HTMLElement, praFrente: boolean) {
    if (a.classList.contains('virando')) return;
    const t = ticket, cel = ehCel(), dir = $('.p-dir', a), q = dir.getBoundingClientRect(), b = a.getBoundingClientRect();
    const larg = Math.round(q.width), alt = Math.round(q.height), texto = $('.p-dir>.p-texto', a), rec = $('.p-recado', a);
    const frente = texto.cloneNode(true) as HTMLElement;
    frente.removeAttribute('inert');
    frente.style.visibility = 'visible';
    $$('[id]', frente).forEach(e => e.removeAttribute('id'));
    const v = document.createElement('div');
    v.style.cssText = `position:absolute;z-index:5;left:${q.left - b.left}px;top:${q.top - b.top}px;width:${larg}px;height:${alt}px;transform-style:preserve-3d;--Hf:${alt}px`;
    const sd = Object.assign(document.createElement('i'), { className: 'sb d' }), se = Object.assign(document.createElement('i'), { className: 'sb e' });
    v.append(sd, se);
    const f = criarFolha(larg, alt, cel ? 4 : leve ? 4 : 7, frente, cel ? null : camadaFoto());
    v.append(f.raiz);
    a.classList.add('virando');
    a.append(v);
    if (praFrente) a.dataset.pag = 'recado';
    const dur = 1250, sentido: PlaybackDirection = praFrente ? 'normal' : 'reverse';
    sombra(sd, 0, .62, dur, 0, sentido);
    sombra(se, .4, 1, dur, 0, sentido);
    await ate([virarFolha(f, { dur, sentido, curva: 9 })], dur + 900);
    if (t !== ticket) return;
    a.dataset.pag = praFrente ? 'recado' : 'texto';
    rec.toggleAttribute('inert', !praFrente);
    texto.toggleAttribute('inert', praFrente);
    v.remove();
    a.classList.remove('virando');
    $(praFrente ? '.voltar' : '.virar', a).focus({ preventScroll: true });
  }

  /* ---------- Fechar: a cegonha leva embora ---------- */
  async function fechar() {
    const a = $('.aberto', palco);
    if (!a || a.classList.contains('virando')) return;
    $$('.part', raiz).forEach(p => p.remove());
    const t = ++ticket, cel = ehCel();
    const atual = a.dataset.pag === 'recado' ? $('.p-recado', a).cloneNode(true) as HTMLElement : null;
    try {
      medir();
      trocar(capaHtml());
      const cena = $('.cena', palco), r = $('.livro3d', cena), capa = $('.capa3d', r), chao = $('.chao', cena);
      cena.classList.add('fechando');
      r.tabIndex = -1;
      capa.style.transition = 'none';
      if (atual && !cel) {
        atual.removeAttribute('inert');
        $$('[id]', atual).forEach(e => e.removeAttribute('id'));
        $$('[for]', atual).forEach(e => e.removeAttribute('for'));
        $('.pagina-dir', r).replaceChildren(atual);
      }
      const xFim = -(W / 2 + 4), x0 = cel ? xFim : 0, A = cel ? 0 : 380, D = 950;
      anima(r, [{ transform: `translateX(${x0}px)` }, { transform: `translateX(${xFim}px)` }], A, D, EASE);
      anima(chao, [{ transform: `translateX(${x0}px)`, opacity: .5 }, { transform: `translateX(${xFim}px)`, opacity: 1 }], A, D, EASE);
      const lista: Array<Promise<unknown>> = [anima(capa, amostra(p => {
        const pulo = p > .86 ? -2.5 * Math.sin(Math.PI * (p - .86) / .14) : 0;
        return { transform: `translateZ(${(5 * p).toFixed(2)}px) rotateY(${(-180 + 180 * suave(p) + pulo).toFixed(2)}deg)` };
      }, 28), A, D).finished];
      if (!cel) {
        const folha = criarFolha(W, H, leve ? 4 : 6, null, camadaFoto());
        ancorar(folha, r);
        lista.push(virarFolha(folha, { dur: 1000, z0: 2, z1: 3, sentido: 'reverse', curva: 9 }));
      }
      await ate(lista, 2600);
      if (t === ticket) await levar(t);
    } catch {
      if (t === ticket) terminar();
    }
  }

  async function levar(t: number) {
    const m = montarVoo(), { v, g, carga, mini, ceg, s, sw, sh, y0, cx, cy } = m;
    v.onclick = () => { if (t === ticket) terminar(); };
    anima(mini, [{ transform: 'none' }, { transform: `translateY(${y0 * 1.08}px) scale(${s * .95})`, offset: .78 }, { transform: `translateY(${y0}px) scale(${s})` }], 0, 680, EASE);
    anima($('.pano-fundo', v), [
      { transform: 'rotate(45deg) scale(0)', opacity: 1, offset: 0 }, { transform: 'rotate(45deg) scale(1.06)', opacity: 1, offset: .22 },
      { transform: 'rotate(45deg) scale(1)', opacity: 1, offset: .3 }, { transform: 'rotate(45deg) scale(1)', opacity: 1, offset: .82 },
      { transform: 'rotate(45deg) scale(.86)', opacity: 0 }], 420, 1800);
    const X0 = innerWidth - cx + sw * .25, Y0 = -(cy + sh);
    anima(ceg, amostra(p => {
      let x = 0, y: number, rot = 0;
      if (p < .6) { const e = 1 - (1 - p / .6) ** 3; x = X0 * (1 - e); y = Y0 * (1 - e) - 22 - 46 * Math.sin(Math.PI * e); rot = 8 * (1 - e); }
      else { const d = suave(Math.max(0, (p - .86) / .14)); y = -22 + (1 - d) * 5 * Math.sin((p - .6) * 22) + d * 22; }
      return { transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)` };
    }, 48), 300, 2200);
    anima($('.rede', v), [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1.06)', offset: .75 }, { transform: 'scaleY(1)' }], 1480, 400, 'ease-out');
    anima($('.alca.e', v), [{ transform: 'rotate(-38deg) scale(.7,.08)', opacity: 0 }, { transform: 'rotate(-34deg) scale(.74,.16)', opacity: 1, offset: .12 }, { transform: 'rotate(3deg) scale(1,1.03)', opacity: 1, offset: .8 }, { transform: 'none', opacity: 1 }], 1620, 500, 'ease-in-out');
    anima($('.alca.d', v), [{ transform: 'rotate(38deg) scale(.7,.08)', opacity: 0 }, { transform: 'rotate(34deg) scale(.74,.16)', opacity: 1, offset: .12 }, { transform: 'rotate(-3deg) scale(1,1.03)', opacity: 1, offset: .8 }, { transform: 'none', opacity: 1 }], 1680, 500, 'ease-in-out');
    anima($('.no', v), [{ transform: 'scale(0) rotate(-30deg)' }, { transform: 'scale(1.25) rotate(6deg)', offset: .68 }, { transform: 'none' }], 2080, 340, 'ease-out');
    const DUR = 2100, ATRASO = 2500;
    const saida = anima(g, amostra(p => {
      const x = -(cx + sw * 1.05) * p ** 1.45, y = -(cy + sh * .6) * p ** 1.08 + 20 * Math.sin(p * 9.5) * (1 - p * .35);
      return { transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(5 * Math.sin(p * 7) - 5 * p).toFixed(2)}deg) scale(${(1 - .4 * p).toFixed(3)})` };
    }, 56), ATRASO, DUR);
    anima(carga, amostra(p => ({ transform: `rotate(${(11 * Math.sin(p * 15) * Math.exp(-1.15 * p) * Math.min(1, p * 8)).toFixed(2)}deg)` }), 56), ATRASO, DUR);
    if (!leve) penas(m, 1500);
    anima($('.veu', v), [{ opacity: 1 }, { opacity: 0 }], ATRASO + 1500, 600, 'ease-in');
    await ate([saida.finished], ATRASO + DUR + 900);
    if (t === ticket) terminar();
  }
  function terminar() { ++ticket; ev.onFim(); }

  const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && $('.aberto', palco)) void fechar(); };
  addEventListener('keydown', tecla);
  void chegar().catch(() => mostrarFechado(true));

  return () => {
    ++ticket;
    removeEventListener('resize', medir);
    removeEventListener('keydown', tecla);
    raiz.replaceChildren();
  };
}

const SIMBOLOS_DO_LIVRO = `<svg width="0" height="0" aria-hidden="true">
  <symbol id="ln-estrela" viewBox="0 0 48 48"><path d="M24 2c2 13 9 20 22 22-13 2-20 9-22 22-2-13-9-20-22-22C15 22 22 15 24 2Z"/></symbol>
  <symbol id="ln-coracao" viewBox="0 0 48 48"><path d="M24 43C8 31 3 23 5 15c2-8 13-11 19-2 6-9 17-6 19 2 2 8-3 16-19 28Z" fill="#ee92aa"/></symbol>
  <symbol id="ln-coelho" viewBox="0 0 120 120"><g fill="#fff" stroke="#f3bccb" stroke-width="2"><ellipse cx="44" cy="31" rx="11" ry="29" transform="rotate(-9 44 31)"/><ellipse cx="76" cy="31" rx="11" ry="29" transform="rotate(9 76 31)"/><circle cx="60" cy="76" r="35"/></g><ellipse cx="44" cy="33" rx="4.5" ry="19" fill="#fbc9d6" transform="rotate(-9 44 33)"/><ellipse cx="76" cy="33" rx="4.5" ry="19" fill="#fbc9d6" transform="rotate(9 76 33)"/><path d="M42 73q6-6 11 0M67 73q6-6 11 0" fill="none" stroke="#7d3a55" stroke-width="3" stroke-linecap="round"/><path d="M56 84q4 4 8 0" fill="none" stroke="#c96f8d" stroke-width="3" stroke-linecap="round"/><circle cx="37" cy="84" r="6" fill="#fcd3de"/><circle cx="83" cy="84" r="6" fill="#fcd3de"/></symbol>
  <symbol id="ln-canto" viewBox="0 0 40 40"><path d="M3 37C3 17 17 3 37 3M11 37c0-14 12-26 26-26M3 3c5 0 9 4 9 9-5 0-9-4-9-9Z"/></symbol>
  <symbol id="ln-c-corpo" viewBox="0 0 400 264" overflow="visible"><g fill="none" stroke="#f28c76" stroke-linecap="round"><path stroke-width="5" d="M272 146c38 12 73 22 120 24M392 170l10-6M392 170l11 3"/><path stroke-width="5" d="M262 148c38 20 78 32 122 38M384 186l10-5M384 186l10 4"/></g><path fill="#5b4a58" d="M326 128l54 7-44 15Z"/><path fill="#fff" d="M148 120C170 88 240 84 288 116c16 10 38 18 62 22-24 10-48 12-70 9-40 18-104 12-132-27Z"/><path fill="#efdce3" d="M160 134c34 22 82 22 120 13-36 20-92 14-120-13Z"/><path fill="none" stroke="#fff" stroke-width="19" stroke-linecap="round" d="M162 116C130 130 108 122 100 104 94 92 88 88 78 86"/><path fill="#f28c76" d="M60 78 40 148l40-54Z"/><path fill="#dd7060" d="M68 92 40 148l40-54Z"/><circle cx="72" cy="84" r="17" fill="#fff"/><circle cx="79" cy="92" r="5" fill="#fbc9d6"/><circle cx="66" cy="81" r="3.3" fill="#3c2a35"/><circle cx="65" cy="80" r="1" fill="#fff"/><path fill="#ee92aa" d="M56 69c6-16 32-18 38 0Z"/><path fill="none" stroke="#a63a5e" stroke-width="4" stroke-linecap="round" d="M52 70h46"/><path fill="#fff" d="M75 64c-3-3-7 1-3 4l3 2 3-2c4-3 0-7-3-4Z"/></symbol>
  <symbol id="ln-c-asa" viewBox="0 0 400 264" overflow="visible"><path fill="currentColor" d="M176 112C188 70 226 34 268 34c8 16 4 44-12 62-20 22-52 30-80 16Z"/><path fill="none" stroke="#e3ccd5" stroke-width="2.5" stroke-linecap="round" d="M196 94c14-16 30-28 50-36M212 100c12-10 24-20 38-26M192 76c10-12 22-22 36-28"/></symbol>
  <symbol id="ln-c-ponta" viewBox="0 0 400 264" overflow="visible"><circle cx="264" cy="46" r="24" fill="currentColor"/><path fill="currentColor" d="M248 30C280 6 330-14 388-16c-8 14-20 22-32 28 6 2 12 2 18 1-10 14-24 22-38 26 5 3 10 3 15 2-16 16-42 24-66 20-14-8-30-32-37-61Z"/><path fill="#5b4a58" d="M330-8c20-5 40-8 58-8-8 14-20 22-32 28 6 2 12 2 18 1-10 14-24 22-38 26 5 3 10 3 15 2-8 8-18 14-30 17-8-20-4-48 9-66Z"/></symbol>
  <symbol id="ln-c-no" viewBox="0 0 100 65" overflow="visible"><path fill="#ee92aa" d="M50 32C36 8 12 2 4 12c-6 10 0 32 12 38 12 4 26-6 34-18Zm0 0c14-24 38-30 46-20 6 10 0 32-12 38-12 4-26-6-34-18Z"/><path fill="#d96f90" d="M38 44 26 64l14-5 6 6 4-27Zm24 0 12 20-14-5-6 6-4-27Z"/><circle cx="50" cy="32" r="11" fill="#c9587d"/></symbol>
  <symbol id="ln-c-pena" viewBox="0 0 30 30" overflow="visible"><path fill="#fff" d="M5 26C4 15 12 5 26 3c1 13-7 22-18 22Z"/><path fill="none" stroke="#e3ccd5" stroke-width="1.5" stroke-linecap="round" d="M3 28C9 20 15 13 22 7"/></symbol>
</svg>`;
