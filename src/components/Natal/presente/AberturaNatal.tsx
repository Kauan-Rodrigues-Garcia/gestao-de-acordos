/**
 * AberturaNatal — a passagem de outubro para o Natal (Cleber, 28/10/2026).
 *
 *   1. O presente: grande, no alto e no meio da tela, no caminho. O sistema
 *      segue usável, mas só ele leva adiante.
 *   2. O clique: quem não está no tema claro padrão (claro, com o menu claro)
 *      vê um aviso junto do botão de tema, e o tema muda — o vídeo é o
 *      sistema nesse tema.
 *   3. A luz: sai do presente e toma a tela. É a mesma luz do primeiro quadro
 *      do vídeo, então a troca não aparece: o vídeo «é» o sistema se animando.
 *      Nada de carregando: o vídeo já desceu enquanto o presente esperava.
 *   4. O vídeo acaba no mural embrulhado no papel deste presente
 *      (`arte.tsx`). Ele encolhe e é sugado de volta para dentro do presente,
 *      e o sistema atrás fica cinza. A música de Natal começa do 0:00, só para
 *      quem abriu (`tocarAbertura`).
 *   5. O presente estoura numa nevasca (`Nevasca.tsx`) que leva o tema: por
 *      onde a neve passa, o cinza sai e o Natal aparece. Do presente sai o
 *      cartão de boas-vindas, de gorro (`Cartao.tsx`). (Cleber, 29/10/2026.)
 *   6. «Entrar no Natal»: o cartão sai, a neve assenta e a música passa para
 *      a rádio, a mesma para todo mundo (`passarParaRadio`).
 *
 * Dois avisos para quem monta: `aoTemaEntrar` no estouro (o tema liga atrás
 * do véu, com a abertura ainda na tela) e `aoTerminar` quando ela some.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import { aplicarMenuEscuro, menuEscuroLigado } from '@/components/ThemeToggle';
import { passarParaRadio, tocarAbertura } from '../musica';
import { Laco, estiloDaFita, estiloDoPapel } from './arte';
import { Cartao } from './Cartao';
import { Nevasca, type FaseNevasca } from './Nevasca';
import './presente.css';

/** A letra do cartão: serifada e macia. Desce enquanto o vídeo toca. */
const FONTE_DO_CARTAO = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,500&display=swap';
function carregarFonteDoCartao() {
  if (document.getElementById('np-fonte-cartao')) return;
  const l = document.createElement('link');
  l.id = 'np-fonte-cartao';
  l.rel = 'stylesheet';
  l.href = FONTE_DO_CARTAO;
  document.head.appendChild(l);
}

/** O vídeo (`videos/`, composição `AberturaNatal`, versão para a web). */
export const VIDEO_ABERTURA = '/video/natal/abertura.mp4';
/** A luz do presente: a mesma do primeiro quadro do vídeo (`videos/src/natal/VideoNatal.tsx`, `Luz`). */
const LUZ = 'radial-gradient(circle at 50% 14%, #fffdf2 0%, #fff1c2 26%, #f8d474 58%, #eeb23c 100%)';

type Fase = 'presente' | 'tema' | 'luz' | 'video' | 'volta' | 'fecha' | 'nevasca' | 'saindo';

const NEVASCA: Partial<Record<Fase, FaseNevasca>> = { volta: 'cinza', fecha: 'cinza', nevasca: 'solta', saindo: 'acalma' };

const espera = (ms: number) => new Promise(r => window.setTimeout(r, ms));

export function AberturaNatal({ aoTemaEntrar, aoTerminar }: { aoTemaEntrar: () => void; aoTerminar: () => void }) {
  const [fase, setFase] = useState<Fase>('presente');
  /** De onde a nevasca sai: o meio do presente. */
  const [origem, setOrigem] = useState({ x: window.innerWidth / 2, y: 148 });
  const botaoEntrar = useRef<HTMLButtonElement>(null);
  useEffect(carregarFonteDoCartao, []);
  const { resolvedTheme, setTheme } = useTheme();
  const video = useRef<HTMLVideoElement>(null);
  const presente = useRef<HTMLButtonElement>(null);
  const [avisoTema, setAvisoTema] = useState<{ x: number; y: number } | null>(null);
  /** Para onde o vídeo encolhe: o meio do presente, e a escala até o tamanho dele. */
  const [destino, setDestino] = useState<{ x: number; y: number; escala: number } | null>(null);

  const medirPresente = useCallback(() => {
    const r = presente.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, largura: r.width };
  }, []);

  const abrir = useCallback(async () => {
    if (fase !== 'presente') return;
    // O vídeo é o sistema no tema claro com o menu claro: quem está em outro, troca (com aviso).
    if (resolvedTheme !== 'light' || menuEscuroLigado()) {
      const botao = document.querySelector<HTMLElement>('[data-tema-botao]')?.getBoundingClientRect();
      setAvisoTema(botao ? { x: botao.left + botao.width / 2, y: botao.bottom + 10 } : { x: window.innerWidth - 220, y: 64 });
      setFase('tema');
      await espera(500);
      setTheme('light');
      aplicarMenuEscuro(false);
      await espera(1900);
      setAvisoTema(null);
    }
    setFase('luz');
    const v = video.current;
    // O clique liberou o som; o vídeo começa quando a luz já tomou a tela.
    await espera(650);
    if (v) {
      v.currentTime = 0;
      try { await v.play(); } catch { v.muted = true; await v.play().catch((): void => undefined); }
    }
    setFase('video');
  }, [fase, resolvedTheme, setTheme]);

  // O fim do vídeo: a música começa, ele encolhe até o presente, o presente
  // fecha e estoura na nevasca, que traz o tema.
  const aoAcabar = useCallback(async () => {
    tocarAbertura();
    const p = medirPresente();
    if (p) {
      setDestino({ x: p.x - window.innerWidth / 2, y: p.y - window.innerHeight / 2, escala: (p.largura * 0.82) / window.innerWidth });
      setOrigem({ x: p.x, y: p.y });
    }
    setFase('volta');
    await espera(1150);
    setFase('fecha');
    await espera(700);
    aoTemaEntrar();
    setFase('nevasca');
    await espera(900);
    botaoEntrar.current?.focus({ preventScroll: true });
  }, [medirPresente, aoTemaEntrar]);

  // O cartão sai primeiro; a rádio só entra com ele fora da tela.
  const entrar = useCallback(async () => {
    setFase('saindo');
    await espera(450);
    passarParaRadio();
    await espera(500);
    aoTerminar();
  }, [aoTerminar]);

  // Do vídeo ao cartão, a página não rola (a abertura está «no lugar» dela).
  useEffect(() => {
    if (fase === 'presente' || fase === 'tema') return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, [fase]);

  /*
   * O vídeo vai inteiro na tela (sem cortar a borda), e a sobra dos lados ou de
   * cima e de baixo ganha a cor da borda do quadro que está passando — o cinza
   * do sistema, a noite da montagem —, para não aparecer faixa de vídeo. Lê só
   * a beirada do quadro (8 px de cada lado, reduzidos a 2 × 16) a cada 250 ms:
   * nada pesa.
   */
  useEffect(() => {
    if (fase !== 'video' && fase !== 'volta') return;
    const v = video.current;
    const tela = document.createElement('canvas');
    tela.width = 16; tela.height = 16;
    const c = tela.getContext('2d', { willReadFrequently: true });
    if (!v || !c) return;
    const rgb = (d: Uint8ClampedArray, i: number) => `rgb(${d[i]} ${d[i + 1]} ${d[i + 2]})`;
    const ler = () => {
      const L = v.videoWidth, A = v.videoHeight;
      if (!L || !A) return;
      try {
        c.clearRect(0, 0, 16, 16);
        // Tela mais larga que 16:9: a sobra é dos lados, e segue o degradê da beirada, de cima a baixo.
        if (window.innerWidth / window.innerHeight > L / A) {
          c.drawImage(v, 0, 0, 8, A, 0, 0, 1, 16);
          c.drawImage(v, L - 8, 0, 8, A, 1, 0, 1, 16);
          const d = c.getImageData(0, 0, 2, 16).data;
          const lado = (k: number) => Array.from({ length: 16 }, (_, y) => rgb(d, (y * 2 + k) * 4)).join(', ');
          v.style.background = `linear-gradient(to bottom, ${lado(0)}) left / 50% 100% no-repeat, linear-gradient(to bottom, ${lado(1)}) right / 50% 100% no-repeat`;
        } else {
          c.drawImage(v, 0, 0, L, 8, 0, 0, 16, 1);
          c.drawImage(v, 0, A - 8, L, 8, 0, 1, 16, 1);
          const d = c.getImageData(0, 0, 16, 2).data;
          const faixa = (k: number) => Array.from({ length: 16 }, (_, x) => rgb(d, (k * 16 + x) * 4)).join(', ');
          v.style.background = `linear-gradient(to right, ${faixa(0)}) top / 100% 50% no-repeat, linear-gradient(to right, ${faixa(1)}) bottom / 100% 50% no-repeat`;
        }
      } catch { /* quadro ainda não pronto */ }
    };
    ler();
    const id = window.setInterval(ler, 250);
    return () => window.clearInterval(id);
  }, [fase]);

  const tampaAberta = fase === 'luz' || fase === 'video' || fase === 'volta';

  const faseDaNevasca = NEVASCA[fase];

  return createPortal(
    <div className={`np-abertura np-fase-${fase}`} style={{ ['--np-ox' as string]: `${origem.x}px`, ['--np-oy' as string]: `${origem.y}px` }}>
      {faseDaNevasca && <Nevasca fase={faseDaNevasca} origem={origem} />}

      {(
        <button
          ref={presente}
          type="button"
          className={`np-presente${tampaAberta ? ' np-presente-aberto' : ''}`}
          onClick={() => void abrir()}
          aria-label="Abrir o presente"
          disabled={fase !== 'presente'}
        >
          <span className="np-brilho" aria-hidden />
          <span className="np-caixa" style={estiloDoPapel(15)}>
            <span className="np-fita-v" style={estiloDaFita(true)} />
            <span className="np-fita-h" style={estiloDaFita(false)} />
          </span>
          <span className="np-tampa" style={estiloDoPapel(15)}>
            <span className="np-fita-v" style={estiloDaFita(true)} />
            <Laco largura={92} className="np-laco" />
          </span>
          {fase === 'presente' && <span className="np-dica">Clique para abrir</span>}
        </button>
      )}

      {avisoTema && (
        <div className="np-aviso-tema" style={{ left: avisoTema.x, top: avisoTema.y }} role="status">
          <span className="np-aviso-seta" aria-hidden />
          <b>Mudando para o tema Claro</b>
          <span>Para você ver tudo do jeito certo.</span>
        </div>
      )}

      {/* A luz do presente tomando a tela (a mesma do primeiro quadro do vídeo). */}
      <div className="np-luz" style={{ background: LUZ }} aria-hidden />

      {/* O vídeo: sempre montado, baixando desde que o presente apareceu. */}
      <video
        ref={video}
        className="np-video"
        src={VIDEO_ABERTURA}
        preload="auto"
        playsInline
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        onEnded={() => void aoAcabar()}
        style={destino ? { ['--np-x' as string]: `${destino.x}px`, ['--np-y' as string]: `${destino.y}px`, ['--np-escala' as string]: destino.escala } : undefined}
        aria-hidden
      />

      {(fase === 'nevasca' || fase === 'saindo') && (
        <Cartao ref={botaoEntrar} aoEntrar={() => void entrar()} saindo={fase === 'saindo'} />
      )}
    </div>,
    document.body,
  );
}
