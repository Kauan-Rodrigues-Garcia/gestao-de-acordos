/**
 * AberturaNatal — a passagem de outubro para o Natal (Cleber, 28/10/2026;
 * refeita em 04/11/2026). Cada pessoa abre o seu presente na hora que quiser.
 *
 *   1. A espera: um presente pequeno, bem detalhado e piscando
 *      (`PresenteDetalhado.tsx`), em cima da bolha do chat, com o balão «Veja
 *      esta mensagem de 2 minutos para desbloquear o tema de Natal». O balão
 *      fica até a pessoa fechar no ×, e volta depois de `DICA_VOLTA_MS`.
 *   2. O clique pergunta antes: é um vídeo de 2 minutos, para ver com tempo.
 *      «Não tenho agora» devolve o presente; «Tenho agora» segue. O vídeo só
 *      começa a baixar aqui (23 MB: baixar para todo mundo que só vê o
 *      presente pesaria na rede da operação).
 *   3. Quem não está no tema claro padrão (claro, com o menu claro) vê um
 *      aviso junto do botão de tema, e o tema muda — o vídeo é o sistema nesse
 *      tema.
 *   4. O presente abre: chacoalha, a tampa salta e sai a luz amarela de
 *      dentro, que toma a tela. É a mesma luz do primeiro quadro do vídeo.
 *   5. O vídeo, com pausar, tirar o som e fechar no canto de cima. É o da
 *      cidade do setor (`abertura.ts`): Marília tem o dela. Fechar (ou Esc)
 *      pausa e pergunta (Cleber, 09/11/2026): «Continuar assistindo» volta de
 *      onde parou; «Assistir mais tarde» devolve o presente, e o vídeo
 *      recomeça do início na próxima vez; «Pular e liberar o Natal» segue como
 *      se o vídeo tivesse acabado. Vídeo que não carrega cai na mesma pergunta.
 *   6. O vídeo acaba no mural embrulhado no papel do presente, que encolhe e
 *      vira a carta do Polo Norte (`Carta.tsx`): o lacre racha em purpurina,
 *      a aba abre e a carta sobe — e vira o bilhete (`Cartao.tsx`), com o
 *      sistema embaçado atrás. Junto com o bilhete a música começa DO COMEÇO,
 *      só para esta pessoa (`tocarAbertura`); quando a faixa acaba, entra a
 *      rádio de todo mundo.
 *   7. Enquanto a pessoa lê, o Natal monta atrás do embaçado (`aoTemaEntrar`;
 *      o código dele desce durante o vídeo, por `aoPreparar`). O botão libera
 *      depois de 5 s.
 *   8. «Entrar no Natal»: o bilhete sai e uma nevasca (`Nevasca.tsx`) abre o
 *      embaçado de dentro para fora, e o Natal aparece por onde a neve passa.
 *      Uns segundos depois, o botão da música avisa que dá para desligar
 *      (`agendarAvisoDaMusica`).
 *
 * O modo leve fica em pausa do «Tenho agora» até o fim (`pausarModoLeve`): a
 * abertura roda inteira para todo mundo, e o modo volta sozinho depois.
 *
 * `aoTemaEntrar` liga o tema (com a abertura ainda na tela) e `aoTerminar`
 * avisa que ela sumiu. Os botões de teste da prévia (`PreviaNatal.tsx`) pulam
 * etapas pelo evento `EVENTO_ABERTURA`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import type { EventoDaAbertura } from '../abertura';
import { aplicarMenuEscuro, menuEscuroLigado } from '@/lib/menuEscuro';
import { pausarModoLeve } from '@/lib/modoLeve';
import { agendarAvisoDaMusica, tocarAbertura } from '../musica';
import { EVENTO_ABERTURA, type PuloDaAbertura } from '../previa';
import { ALTURA_DA_CARTA, Carta, LARGURA_DA_CARTA, SUBIDA_DA_CARTA, type EtapaDaCarta } from './Carta';
import { CONTAGEM_DO_CARTAO_S, Cartao } from './Cartao';
import { Confete, PURPURINA } from './Confete';
import { Nevasca, type FaseNevasca } from './Nevasca';
import { PresenteDetalhado } from './PresenteDetalhado';
import { carregarFonteDoNatal } from '../fonteDoNatal';
import './presente.css';

/** O vídeo de Birigui (`videos/`, composição `AberturaNatal`, versão para a web); o de Marília em `abertura.ts`. */
export const VIDEO_ABERTURA = '/video/natal/abertura.mp4';
/** A luz do presente: a mesma do primeiro quadro do vídeo (`videos/src/natal/VideoNatal.tsx`, `Luz`). */
const LUZ = 'radial-gradient(circle at 50% 14%, #fffdf2 0%, #fff1c2 26%, #f8d474 58%, #eeb23c 100%)';

/** Fechou o balão no ×: ele volta depois disso. */
const DICA_VOLTA_MS = 45_000;
/** Do «Entrar no Natal» até a neve assentar: o tempo da frente cobrir a tela (`Nevasca.tsx`). */
const NEVASCA_MS = 5_600;
/** Do bilhete na tela até o Natal montar atrás dele. */
const TEMA_ENTRA_MS = 1_600;
/** Depois que tudo acabou, quando o botão da música avisa. */
const AVISO_DA_MUSICA_MS = 6_000;

type Fase = 'espera' | 'confirma' | 'tema' | 'abrindo' | 'luz' | 'video' | 'pausa' | 'carta' | 'bilhete' | 'nevasca' | 'assenta';

const NEVASCA: Partial<Record<Fase, FaseNevasca>> = { carta: 'cinza', bilhete: 'cinza', nevasca: 'solta', assenta: 'acalma' };

type Ponto = { x: number; y: number };

const espera = (ms: number) => new Promise(r => window.setTimeout(r, ms));
/** O envelope fica no meio da tela, um pouco acima. */
const pontoDaCarta = (): Ponto => ({ x: window.innerWidth / 2, y: window.innerHeight * 0.52 });
/** O meio do bilhete (`.np-cartao`, top 57%): de onde a nevasca sai. */
const pontoDoCartao = (): Ponto => ({ x: window.innerWidth / 2, y: window.innerHeight * 0.57 });

export function AberturaNatal({ aoTemaEntrar, aoTerminar, aoPreparar, oculto = false, video: srcDoVideo = VIDEO_ABERTURA, aoMarcar }: {
  aoTemaEntrar: () => void;
  aoTerminar: () => void;
  /** O vídeo da cidade (`abertura.ts`, `VIDEOS`). */
  video?: string;
  /** Cada passo que vale para o card de acompanhamento: assistiu, pulou, adiou. */
  aoMarcar?: (evento: EventoDaAbertura) => void;
  /** Baixa o código do tema (as camadas, o trem, o botão da música): chamado durante o vídeo. */
  aoPreparar?: () => Promise<unknown>;
  /** A prévia escondeu o presente (só vale na espera: aberto, vai até o fim). */
  oculto?: boolean;
}) {
  const [fase, setFase] = useState<Fase>('espera');
  const faseAtual = useRef<Fase>('espera');
  const irPara = useCallback((f: Fase) => { faseAtual.current = f; setFase(f); }, []);
  /** De onde a luz e a nevasca saem, e para onde o cartão nasce. */
  const [origem, setOrigem] = useState<Ponto>({ x: window.innerWidth - 52, y: window.innerHeight - 130 });
  const [dica, setDica] = useState(true);
  const [falta, setFalta] = useState(CONTAGEM_DO_CARTAO_S);
  const [carta, setCarta] = useState<{ etapa: EtapaDaCarta; ponto: Ponto } | null>(null);
  const [purpurina, setPurpurina] = useState<Ponto | null>(null);
  const [videoPausado, setVideoPausado] = useState(false);
  const [videoMudo, setVideoMudo] = useState(false);
  /** O vídeo não carregou (rede, arquivo): a pergunta do «fechar» explica e oferece pular. */
  const [videoFalhou, setVideoFalhou] = useState(false);
  /** O erro pode chegar antes do vídeo começar (ele baixa desde o clique no presente). */
  const videoQuebrado = useRef(false);
  const botaoContinuar = useRef<HTMLButtonElement>(null);
  const botaoEntrar = useRef<HTMLButtonElement>(null);
  const botaoTenho = useRef<HTMLButtonElement>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const video = useRef<HTMLVideoElement>(null);
  const presente = useRef<HTMLButtonElement>(null);
  const [avisoTema, setAvisoTema] = useState<Ponto | null>(null);
  /** Para onde o vídeo encolhe: o meio da tela, no tamanho do envelope. */
  const [encolhe, setEncolhe] = useState<number | null>(null);
  const vivo = useRef(true);
  /** Sobe a cada «fechar o vídeo»: o que estava esperando para continuar desiste. */
  const rodada = useRef(0);
  const soltarLeve = useRef<(() => void) | null>(null);
  const preparo = useRef<Promise<unknown> | null>(null);
  const temaLigado = useRef(false);

  useEffect(carregarFonteDoNatal, []);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      // Saiu no meio (a prévia reiniciou, a pessoa saiu da conta): o modo leve volta.
      soltarLeve.current?.();
      soltarLeve.current = null;
    };
  }, []);

  /** Espera e diz se ainda vale continuar (a abertura na tela, e o vídeo não foi fechado). */
  const aguardar = useCallback(async (ms: number) => {
    const r = rodada.current;
    await espera(ms);
    return vivo.current && rodada.current === r;
  }, []);

  const soltarModoLeve = useCallback(() => {
    soltarLeve.current?.();
    soltarLeve.current = null;
  }, []);

  const preparar = useCallback(() => {
    if (preparo.current || !aoPreparar) return;
    // Na folga do navegador: o vídeo tocando não pode engasgar.
    const ocioso = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    preparo.current = new Promise(res => {
      const ir = () => { aoPreparar().then(res, res); };
      if (ocioso) ocioso(ir, { timeout: 4000 }); else window.setTimeout(ir, 1200);
    });
  }, [aoPreparar]);

  const ligarTema = useCallback(() => {
    if (temaLigado.current) return;
    temaLigado.current = true;
    aoTemaEntrar();
  }, [aoTemaEntrar]);

  /** Começa a baixar o vídeo (só depois do clique no presente). */
  const baixarVideo = useCallback(() => {
    const v = video.current;
    if (!v || v.preload === 'auto') return;
    v.preload = 'auto';
    v.load();
  }, []);

  // ── 1. O balão: fica até a pessoa fechar; fechado, volta depois de um tempo ──
  useEffect(() => {
    if (fase !== 'espera' || dica) return;
    const id = window.setTimeout(() => setDica(true), DICA_VOLTA_MS);
    return () => window.clearTimeout(id);
  }, [fase, dica]);

  // ── 7. O bilhete, a música do começo, o Natal atrás e a contagem ──
  const mostrarBilhete = useCallback(async (de: Ponto) => {
    setOrigem(de);
    setFalta(CONTAGEM_DO_CARTAO_S);
    irPara('bilhete');
    tocarAbertura();
    if (!(await aguardar(TEMA_ENTRA_MS))) return;
    // O código já desceu no vídeo; se não, espera um pouco por ele (sem travar o bilhete).
    preparar();
    await Promise.race([preparo.current, espera(1500)]);
    if (!vivo.current) return;
    ligarTema();
  }, [aguardar, irPara, ligarTema, preparar]);

  // A contagem anda com o bilhete na tela (começa depois que ele chega).
  useEffect(() => {
    if (fase !== 'bilhete') return;
    let id = 0;
    const comeca = window.setTimeout(() => {
      id = window.setInterval(() => setFalta(f => Math.max(0, f - 1)), 1000);
    }, 900);
    return () => { window.clearTimeout(comeca); window.clearInterval(id); };
  }, [fase]);
  useEffect(() => {
    if (fase === 'bilhete' && falta === 0) botaoEntrar.current?.focus({ preventScroll: true });
  }, [fase, falta]);

  // ── 6. O vídeo acaba e vira a carta do Polo Norte ──
  const aoAcabar = useCallback(async (pulou = false) => {
    if (!(['video', 'pausa', 'espera', 'confirma'] as Fase[]).includes(faseAtual.current)) return;
    if (faseAtual.current === 'video' || faseAtual.current === 'pausa') aoMarcar?.(pulou ? 'pulou' : 'assistiu');
    rodada.current += 1;
    video.current?.pause();
    setVideoFalhou(false);
    soltarLeve.current ??= pausarModoLeve();
    const p = pontoDaCarta();
    setEncolhe(LARGURA_DA_CARTA / window.innerWidth);
    setCarta({ etapa: 'chega', ponto: p });
    irPara('carta');
    if (!(await aguardar(2100))) return;
    setCarta({ etapa: 'lacre', ponto: p });
    if (!(await aguardar(1050))) return;
    // O lacre racha: purpurina dourada de onde ele estava (na ponta da aba).
    setPurpurina({ x: p.x, y: p.y - ALTURA_DA_CARTA / 2 + ALTURA_DA_CARTA * 0.58 });
    setCarta({ etapa: 'abre', ponto: p });
    if (!(await aguardar(650))) return;
    setCarta({ etapa: 'sai', ponto: p });
    if (!(await aguardar(850))) return;
    setCarta({ etapa: 'vai', ponto: p });
    void mostrarBilhete({ x: p.x, y: p.y - SUBIDA_DA_CARTA / 2 });
  }, [aguardar, aoMarcar, irPara, mostrarBilhete]);

  // ── 2. O clique no presente: pergunta antes ──
  const perguntar = useCallback(() => {
    if (faseAtual.current !== 'espera') return;
    setDica(false);
    baixarVideo();
    irPara('confirma');
  }, [baixarVideo, irPara]);
  useEffect(() => { if (fase === 'confirma') botaoTenho.current?.focus({ preventScroll: true }); }, [fase]);

  const naoAgora = useCallback(() => {
    if (faseAtual.current === 'confirma') irPara('espera');
  }, [irPara]);

  // ── 3 a 5: o tema claro, o presente abrindo, a luz e o vídeo ──
  const abrir = useCallback(async () => {
    if (faseAtual.current !== 'confirma') return;
    soltarLeve.current ??= pausarModoLeve();
    const r = presente.current?.getBoundingClientRect();
    if (r) setOrigem({ x: r.left + r.width / 2, y: r.top + r.height * 0.45 });
    // O vídeo é o sistema no tema claro com o menu claro: quem está em outro, troca (com aviso).
    if (resolvedTheme !== 'light' || menuEscuroLigado()) {
      const botao = document.querySelector<HTMLElement>('[data-tema-botao]')?.getBoundingClientRect();
      setAvisoTema(botao ? { x: botao.left + botao.width / 2, y: botao.bottom + 10 } : { x: window.innerWidth - 220, y: 64 });
      irPara('tema');
      if (!(await aguardar(500))) return;
      setTheme('light');
      aplicarMenuEscuro(false);
      if (!(await aguardar(1900))) return;
      setAvisoTema(null);
    }
    irPara('abrindo');
    if (!(await aguardar(1250))) return;
    irPara('luz');
    preparar();
    const v = video.current;
    // O clique liberou o som; o vídeo começa quando a luz já tomou a tela.
    if (!(await aguardar(700))) return;
    if (v) {
      v.currentTime = 0;
      v.muted = false;
      setVideoMudo(false);
      setVideoPausado(false);
      try { await v.play(); } catch { v.muted = true; setVideoMudo(true); await v.play().catch((): void => undefined); }
    }
    // (Lido de novo depois das esperas: o vídeo pode ter sido fechado ou pulado no meio.)
    if (!vivo.current || (faseAtual.current as Fase) !== 'luz') return;
    // Não carregou (rede, arquivo): em vez da tela parada, a pergunta com o aviso.
    if (videoQuebrado.current || v?.error) { setVideoFalhou(true); setVideoPausado(true); irPara('pausa'); return; }
    irPara('video');
  }, [aguardar, irPara, preparar, resolvedTheme, setTheme]);

  // ── 5. Os botões do vídeo ──
  const alternarPausa = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) { void v.play().catch((): void => undefined); setVideoPausado(false); }
    else { v.pause(); setVideoPausado(true); }
  }, []);
  const alternarSom = useCallback(() => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setVideoMudo(v.muted);
  }, []);
  /** O × (ou Esc) no vídeo: pausa e pergunta o que a pessoa quer (`pausa`). */
  const perguntarFechar = useCallback(() => {
    if (faseAtual.current !== 'video' && faseAtual.current !== 'luz') return;
    rodada.current += 1;
    video.current?.pause();
    setVideoPausado(true);
    irPara('pausa');
  }, [irPara]);
  useEffect(() => { if (fase === 'pausa') botaoContinuar.current?.focus({ preventScroll: true }); }, [fase]);

  /** «Continuar assistindo»: volta de onde parou. */
  const continuarVideo = useCallback(() => {
    if (faseAtual.current !== 'pausa') return;
    const v = video.current;
    irPara('video');
    setVideoPausado(false);
    if (v) void v.play().catch(() => { v.muted = true; setVideoMudo(true); return v.play().catch((): void => undefined); });
  }, [irPara]);

  /** «Assistir mais tarde»: o presente volta a esperar, e o vídeo recomeça do início na próxima vez. */
  const fecharVideo = useCallback(() => {
    if (faseAtual.current === 'pausa') aoMarcar?.('adiou');
    rodada.current += 1;
    const v = video.current;
    if (v) { v.pause(); v.currentTime = 0; }
    setEncolhe(null);
    setVideoPausado(false);
    setVideoFalhou(false);
    // Deu erro? Na próxima vez baixa de novo.
    if (videoQuebrado.current && v) { videoQuebrado.current = false; v.preload = 'none'; v.removeAttribute('src'); v.load(); v.src = srcDoVideo; }
    soltarModoLeve();
    irPara('espera');
  }, [aoMarcar, irPara, soltarModoLeve, srcDoVideo]);

  /** O vídeo não carregou: em vez de tela parada, a pergunta (com o aviso). */
  const aoFalharVideo = useCallback(() => {
    videoQuebrado.current = true;
    if (faseAtual.current !== 'video' && faseAtual.current !== 'luz') return;
    setVideoFalhou(true);
    perguntarFechar();
  }, [perguntarFechar]);

  // ── 8. A nevasca leva o embaçado e a neve assenta ──
  const entrar = useCallback(async () => {
    if (faseAtual.current !== 'bilhete') return;
    ligarTema();
    setOrigem(pontoDoCartao());
    irPara('nevasca');
    if (!(await aguardar(NEVASCA_MS))) return;
    irPara('assenta');
    if (!(await aguardar(1100))) return;
    agendarAvisoDaMusica(AVISO_DA_MUSICA_MS);
    soltarModoLeve();
    aoTerminar();
  }, [aguardar, aoTerminar, irPara, ligarTema, soltarModoLeve]);

  // Os botões de teste da prévia: pular para o fim do vídeo ou direto para o bilhete.
  useEffect(() => {
    const pular = (e: Event) => {
      const pulo = (e as CustomEvent<PuloDaAbertura>).detail;
      const v = video.current;
      if (pulo === 'fim-do-video') {
        if (faseAtual.current === 'video' && v?.duration) v.currentTime = Math.max(0, v.duration - 3);
        else if (faseAtual.current === 'espera' || faseAtual.current === 'confirma') void aoAcabar();
      } else if (pulo === 'bilhete' && ['espera', 'confirma', 'video', 'carta'].includes(faseAtual.current)) {
        soltarLeve.current ??= pausarModoLeve();
        rodada.current += 1;
        v?.pause();
        setCarta(null);
        const p = pontoDaCarta();
        void mostrarBilhete({ x: p.x, y: p.y - SUBIDA_DA_CARTA / 2 });
      }
    };
    window.addEventListener(EVENTO_ABERTURA, pular);
    return () => window.removeEventListener(EVENTO_ABERTURA, pular);
  }, [aoAcabar, mostrarBilhete]);

  // Do presente abrindo ao fim, a página não rola (a abertura está «no lugar» dela).
  useEffect(() => {
    if (fase === 'espera' || fase === 'confirma' || fase === 'tema') return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = antes; };
  }, [fase]);

  // Esc: na pergunta é «Não tenho agora»; no vídeo, pausa e pergunta; na pausa, continua.
  useEffect(() => {
    if (fase !== 'confirma' && fase !== 'video' && fase !== 'pausa') return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (fase === 'confirma') naoAgora();
      else if (fase === 'video') perguntarFechar();
      else if (!videoFalhou) continuarVideo();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fase, naoAgora, perguntarFechar, continuarVideo, videoFalhou]);

  /*
   * O vídeo vai inteiro na tela (sem cortar a borda), e a sobra dos lados ou de
   * cima e de baixo ganha a cor da borda do quadro que está passando — o cinza
   * do sistema, a noite da montagem —, para não aparecer faixa de vídeo. Lê só
   * a beirada do quadro (8 px de cada lado, reduzidos a 2 × 16) a cada 250 ms:
   * nada pesa.
   */
  useEffect(() => {
    if (fase !== 'video') return;
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

  if (oculto && fase === 'espera') return null;

  const faseDaNevasca = NEVASCA[fase];
  const presenteNaTela = fase === 'espera' || fase === 'confirma' || fase === 'tema' || fase === 'abrindo' || fase === 'luz';

  return createPortal(
    <div
      className={`np-abertura np-fase-${fase}`}
      // A abertura anima mesmo no modo leve (ver `index.css`): na espera a pausa ainda não começou.
      data-anima-sempre=""
      style={{ ['--np-ox' as string]: `${origem.x}px`, ['--np-oy' as string]: `${origem.y}px` }}
    >
      {faseDaNevasca && <Nevasca fase={faseDaNevasca} origem={origem} />}

      {/* 1–4: o presente em cima do chat */}
      {presenteNaTela && (
        <div className="np-espera">
          {dica && fase === 'espera' && (
            <div className="np-espera-dica" role="status">
              <button type="button" className="np-espera-dica-fechar" onClick={() => setDica(false)} aria-label="Fechar o aviso do presente">
                <X className="h-3.5 w-3.5" />
              </button>
              <b>🎁 Um presente para você!</b>
              <span>Veja esta mensagem de 2 minutos para desbloquear o tema de Natal.</span>
            </div>
          )}
          {fase === 'confirma' && (
            <div className="np-confirma" role="dialog" aria-modal="false" aria-labelledby="np-confirma-titulo">
              <b id="np-confirma-titulo">Tem 2 minutinhos livres? ⏱️</b>
              <span>
                Este presente é um vídeo de 2 minutos, com som, que desbloqueia o tema de Natal.
                Abra quando tiver um tempinho — ele fica aqui esperando por você.
              </span>
              <div className="np-confirma-botoes">
                <button type="button" onClick={naoAgora}>Não tenho agora</button>
                <button ref={botaoTenho} type="button" className="principal" onClick={() => void abrir()}>Tenho agora</button>
              </div>
            </div>
          )}
          <button
            ref={presente}
            type="button"
            className="np-espera-presente"
            onClick={perguntar}
            aria-label="Abrir o presente de Natal (uma mensagem de 2 minutos que desbloqueia o tema de Natal)"
            disabled={fase !== 'espera'}
          >
            <span className="np-espera-halo" aria-hidden />
            <span className="np-espera-raios" aria-hidden />
            <PresenteDetalhado aberto={fase === 'abrindo' || fase === 'luz'} />
          </button>
        </div>
      )}

      {avisoTema && (
        <div className="np-aviso-tema" style={{ left: avisoTema.x, top: avisoTema.y }} role="status">
          <span className="np-aviso-seta" aria-hidden />
          <b>Mudando para o tema Claro</b>
          <span>Para você ver tudo do jeito certo.</span>
        </div>
      )}

      {/* A luz de dentro do presente tomando a tela (a mesma do primeiro quadro do vídeo). */}
      <div className="np-luz" style={{ background: LUZ }} aria-hidden />

      {/* O vídeo: só baixa depois do clique no presente (`baixarVideo`). */}
      <video
        ref={video}
        className="np-video"
        src={srcDoVideo}
        preload="none"
        playsInline
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        onEnded={() => void aoAcabar()}
        onError={aoFalharVideo}
        style={encolhe ? { ['--np-escala' as string]: encolhe } : undefined}
        aria-hidden
      />
      {fase === 'video' && (
        <div className="np-video-controles">
          <button type="button" onClick={alternarPausa} aria-label={videoPausado ? 'Continuar o vídeo' : 'Pausar o vídeo'} title={videoPausado ? 'Continuar' : 'Pausar'}>
            {videoPausado ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button type="button" onClick={alternarSom} aria-label={videoMudo ? 'Ligar o som do vídeo' : 'Tirar o som do vídeo'} title={videoMudo ? 'Ligar o som' : 'Tirar o som'}>
            {videoMudo ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button type="button" onClick={perguntarFechar} aria-label="Fechar o vídeo" title="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 5b. Fechou no meio: o vídeo fica parado atrás, e a pergunta no meio da tela. */}
      {fase === 'pausa' && (
        <div className="np-pausa-fundo">
          <div className="np-pausa" role="dialog" aria-modal="true" aria-labelledby="np-pausa-titulo">
            <b id="np-pausa-titulo">{videoFalhou ? 'O vídeo não carregou 😕' : 'Vai parar por aqui? 🎁'}</b>
            <span>
              {videoFalhou
                ? 'Pode ser a internet. Tente de novo mais tarde, ou pule o vídeo e já entre no Natal.'
                : 'Dá para terminar agora, deixar para depois (o presente volta e o vídeo começa do início) ou pular e já entrar no Natal.'}
            </span>
            <div className="np-pausa-botoes">
              {!videoFalhou && (
                <button ref={botaoContinuar} type="button" className="principal" onClick={continuarVideo}>
                  <Play className="h-3.5 w-3.5" aria-hidden /> Continuar assistindo
                </button>
              )}
              <button ref={videoFalhou ? botaoContinuar : undefined} type="button" onClick={fecharVideo}>Assistir mais tarde</button>
              <button type="button" className="pular" onClick={() => void aoAcabar(true)}>Pular e liberar o Natal</button>
            </div>
          </div>
        </div>
      )}

      {/* 6: a carta do Polo Norte, e a purpurina do lacre */}
      {carta && (fase === 'carta' || fase === 'bilhete') && <Carta etapa={carta.etapa} x={carta.ponto.x} y={carta.ponto.y} />}
      {purpurina && fase === 'carta' && <Confete origem={purpurina} cores={PURPURINA} quantidade={110} forca={0.5} />}
      {fase === 'bilhete' && <div className="np-clarao" aria-hidden />}

      {(fase === 'bilhete' || fase === 'nevasca') && (
        <Cartao ref={botaoEntrar} aoEntrar={() => void entrar()} saindo={fase === 'nevasca'} falta={falta} />
      )}
    </div>,
    document.body,
  );
}
