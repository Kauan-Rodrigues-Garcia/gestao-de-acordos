/**
 * ArcadeCabinet — a máquina de fliperama, com um jogo de verdade dentro.
 * ─────────────────────────────────────────────────────────────────────────────
 * O gabinete é CSS (`creators-lab__gabinete` e vizinhos). O jogo é canvas. A
 * regra do jogo é `lib/fliperama.ts`, que não conhece canvas nem React — este
 * arquivo só lê a entrada, chama `avancar` e desenha o resultado.
 *
 * ## Por que canvas e não DOM
 *
 * São 40 tijolos, uma bola e uma raquete mudando 60 vezes por segundo. Em DOM
 * isso é 42 elementos com `transform` por quadro; em canvas é um `clearRect` e
 * 42 `fillRect`, sem tocar em layout nenhum. E o `image-rendering: pixelated`
 * do vidro dá a serrilha de máquina antiga de graça.
 *
 * ## Nada roda sozinho
 *
 * O laço só começa quando a pessoa aperta INSERT COIN, e para quando a aba
 * some (`visibilitychange`) ou quando o gabinete sai da tela
 * (`IntersectionObserver`). Uma máquina de fliperama numa página de portfólio
 * não pode ficar queimando bateria de celular no fundo do scroll.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SecaoLab } from '../components/SecaoLab';
import { useCreators } from '../theme/CreatorsProvider';
import {
  ALTURA, ALTURA_RAQUETE, LARGURA, LARGURA_RAQUETE, RAIO_BOLA,
  VIDAS_INICIAIS, Y_RAQUETE, avancar, novoJogo, tijolosVivos,
  type EstadoJogo, type Entrada,
} from '../lib/fliperama';

/** Deslocamento máximo do manche decorativo, em pixels de tela. */
const CURSO_MANCHE = 7;

const CHAVE_RECORDE = 'creatorsLab:fliperamaRecorde';

function lerRecorde(): number {
  try {
    const cru = Number(localStorage.getItem(CHAVE_RECORDE));
    return Number.isFinite(cru) && cru > 0 ? cru : 0;
  } catch { return 0; }
}

function gravarRecorde(v: number): void {
  try { localStorage.setItem(CHAVE_RECORDE, String(v)); } catch { /* modo privado */ }
}

/** A cor de cada linha de tijolo, tirada da paleta do tema ativo. */
function coresDoTema(c: {
  primaria: string; secundaria: string; acento: string; texto: string; textoSuave: string;
}): string[] {
  return [c.acento, c.primaria, c.secundaria, c.primaria, c.textoSuave];
}

export function ArcadeCabinet() {
  const { tokens, registrar, movimentoReduzido } = useCreators();
  const vocab = tokens.vocab;

  const telaRef    = useRef<HTMLCanvasElement | null>(null);
  const gabineteRef = useRef<HTMLDivElement | null>(null);

  /*
   * O estado do jogo vive num ref, não em `useState`.
   *
   * São 60 passos por segundo: um `setState` por passo re-renderizaria o React
   * 60 vezes por segundo à toa, porque nada do JSX depende da posição da bola —
   * quem desenha é o canvas. O que a interface precisa saber (pontos, vidas,
   * fase) é copiado para o `placar` só quando muda de verdade.
   */
  const jogoRef    = useRef<EstadoJogo>(novoJogo(0));
  const entradaRef = useRef<Entrada>({});
  const laçoRef    = useRef<number | null>(null);
  const ultimoRef  = useRef<number>(0);

  const [ligado, setLigado]   = useState(false);
  const [visivel, setVisivel] = useState(false);
  const [placar, setPlacar]   = useState({
    pontos: 0, vidas: VIDAS_INICIAIS, fase: 'pronto' as EstadoJogo['fase'],
    recorde: 0, restantes: 0,
  });

  // Recorde só é lido no cliente — o valor inicial do ref é 0 de propósito,
  // para o primeiro render não depender de localStorage.
  useEffect(() => {
    const r = lerRecorde();
    jogoRef.current = novoJogo(r);
    setPlacar(p => ({ ...p, recorde: r, restantes: tijolosVivos(jogoRef.current.tijolos) }));
  }, []);

  const desenhar = useCallback(() => {
    const tela = telaRef.current;
    const ctx = tela?.getContext('2d');
    if (!tela || !ctx) return;

    const e = jogoRef.current;
    const c = tokens.cores;
    const paleta = coresDoTema(c);

    /*
     * O manche acompanha a raquete.
     *
     * Escrito direto na variável CSS do gabinete, de dentro do laço: um
     * `setState` por quadro só para inclinar um enfeite de 16 px re-renderiza
     * a seção 60 vezes por segundo à toa.
     */
    gabineteRef.current?.style.setProperty(
      '--manche',
      `${((e.raqueteX - LARGURA / 2) / (LARGURA / 2)) * CURSO_MANCHE}px`,
    );

    ctx.clearRect(0, 0, LARGURA, ALTURA);

    // Fundo do tubo.
    ctx.fillStyle = '#05030F';
    ctx.fillRect(0, 0, LARGURA, ALTURA);

    // Moldura interna: a área jogável fica visivelmente delimitada.
    ctx.strokeStyle = c.borda;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, LARGURA - 2, ALTURA - 2);

    // Placar no topo, dentro da tela — como nas máquinas de verdade.
    ctx.fillStyle = c.textoSuave;
    ctx.font = '10px "JetBrains Mono", Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(`SCORE ${String(e.pontos).padStart(5, '0')}`, 8, 10);
    ctx.textAlign = 'right';
    ctx.fillText(`HI ${String(e.recorde).padStart(5, '0')}`, LARGURA - 8, 10);
    ctx.textAlign = 'left';

    // Vidas, como bolinhas.
    for (let i = 0; i < e.vidas; i++) {
      ctx.fillStyle = c.acento;
      ctx.beginPath();
      ctx.arc(10 + i * 9, 30, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tijolos.
    for (const t of e.tijolos) {
      if (!t.vivo) continue;
      ctx.fillStyle = paleta[t.linha % paleta.length];
      ctx.fillRect(t.x, t.y, t.l, t.a);
      // Filete escuro embaixo: dá volume sem custar outra passada de desenho.
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(t.x, t.y + t.a - 2, t.l, 2);
    }

    // Raquete.
    ctx.fillStyle = c.texto;
    ctx.fillRect(
      e.raqueteX - LARGURA_RAQUETE / 2, Y_RAQUETE,
      LARGURA_RAQUETE, ALTURA_RAQUETE,
    );
    ctx.fillStyle = c.primaria;
    ctx.fillRect(e.raqueteX - LARGURA_RAQUETE / 2, Y_RAQUETE, LARGURA_RAQUETE, 2);

    // Bola.
    ctx.fillStyle = c.primaria;
    ctx.beginPath();
    ctx.arc(e.bola.x, e.bola.y, RAIO_BOLA, 0, Math.PI * 2);
    ctx.fill();

    // Mensagens de estado, centralizadas.
    const mensagem =
      e.fase === 'pronto' ? vocab.entrada
      : e.fase === 'fim'    ? vocab.erro
      : e.fase === 'venceu' ? vocab.sucesso
      : null;

    if (mensagem) {
      ctx.textAlign = 'center';
      ctx.fillStyle = e.fase === 'fim' ? c.acento : c.primaria;
      ctx.font = 'bold 16px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(mensagem, LARGURA / 2, ALTURA / 2 - 26);
      ctx.fillStyle = c.textoSuave;
      ctx.font = '9px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(
        e.fase === 'pronto' ? 'clique ou espaço para sacar' : 'clique ou espaço para recomeçar',
        LARGURA / 2, ALTURA / 2 - 4,
      );
      ctx.textAlign = 'left';
    }
  }, [tokens, vocab]);

  /*
   * O laço. Um `requestAnimationFrame` só, e ele mesmo se reagenda — nada de
   * `setInterval`, que continua disparando quando a aba dorme e devolve todos
   * os quadros atrasados de uma vez ao voltar.
   */
  useEffect(() => {
    if (!ligado || !visivel) {
      if (laçoRef.current !== null) { cancelAnimationFrame(laçoRef.current); laçoRef.current = null; }
      // Um quadro parado, para a tela não ficar preta enquanto pausada.
      desenhar();
      return;
    }

    ultimoRef.current = performance.now();

    const quadro = (agora: number) => {
      const dt = (agora - ultimoRef.current) / 1000;
      ultimoRef.current = agora;

      const antes  = jogoRef.current;
      const depois = avancar(antes, dt, entradaRef.current);
      entradaRef.current = { ...entradaRef.current, acionar: false };
      jogoRef.current = depois;

      // Só toca no React quando algo que a interface mostra realmente mudou.
      if (
        depois.pontos !== antes.pontos ||
        depois.vidas  !== antes.vidas  ||
        depois.fase   !== antes.fase   ||
        depois.recorde !== antes.recorde
      ) {
        setPlacar({
          pontos: depois.pontos, vidas: depois.vidas, fase: depois.fase,
          recorde: depois.recorde, restantes: tijolosVivos(depois.tijolos),
        });
        if (depois.recorde > antes.recorde) gravarRecorde(depois.recorde);
        if (depois.fase === 'venceu' && antes.fase !== 'venceu') {
          registrar({ segredoArcade: true });
        }
      }

      desenhar();
      laçoRef.current = requestAnimationFrame(quadro);
    };

    laçoRef.current = requestAnimationFrame(quadro);
    return () => {
      if (laçoRef.current !== null) { cancelAnimationFrame(laçoRef.current); laçoRef.current = null; }
    };
  }, [ligado, visivel, desenhar, registrar]);

  // Redesenha quando o tema troca, mesmo com a máquina desligada.
  useEffect(() => { desenhar(); }, [desenhar]);

  // Só considera visível o gabinete que está na tela E numa aba em primeiro
  // plano. As duas condições, porque nenhuma sozinha cobre a outra.
  useEffect(() => {
    const alvo = gabineteRef.current;
    if (!alvo) return;

    let naTela = false;
    const atualizar = () => setVisivel(naTela && document.visibilityState === 'visible');

    const obs = new IntersectionObserver(([entrada]) => {
      naTela = entrada.isIntersecting;
      atualizar();
    }, { threshold: 0.25 });
    obs.observe(alvo);

    document.addEventListener('visibilitychange', atualizar);
    return () => {
      obs.disconnect();
      document.removeEventListener('visibilitychange', atualizar);
    };
  }, []);

  /** Converte a posição do ponteiro na tela para pixel de jogo. */
  const mirar = useCallback((clienteX: number) => {
    const tela = telaRef.current;
    if (!tela) return;
    const r = tela.getBoundingClientRect();
    if (r.width === 0) return;
    entradaRef.current.alvoRaquete = ((clienteX - r.left) / r.width) * LARGURA;
  }, []);

  const acionar = useCallback(() => {
    if (!ligado) setLigado(true);
    entradaRef.current.acionar = true;
  }, [ligado]);

  /*
   * Teclado: setas movem, espaço/enter sacam.
   *
   * Registrado no elemento, não em `window` — uma página inteira não pode
   * perder a rolagem por espaço só porque existe um fliperama no meio dela. E
   * `preventDefault` só nas teclas que o jogo realmente usa.
   */
  const aoTeclar = useCallback((e: React.KeyboardEvent) => {
    const passo = 18;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const atual = entradaRef.current.alvoRaquete ?? jogoRef.current.raqueteX;
      entradaRef.current.alvoRaquete = atual + (e.key === 'ArrowLeft' ? -passo : passo);
      if (!ligado) setLigado(true);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      acionar();
    }
  }, [acionar, ligado]);

  const arcade = tokens.id === 'arcade';

  return (
    <SecaoLab
      id="fliperama"
      rotulo={arcade ? 'coin-op' : 'simulação interativa'}
      titulo={vocab.fliperama}
      descricao={
        arcade
          ? 'Uma máquina de verdade: física própria, três vidas e recorde guardado. Zerar a tela libera uma conquista.'
          : 'Simulação em canvas com física escrita à mão — colisão círculo-retângulo, ângulo de devolução pela posição do impacto e passo de integração com teto.'
      }
    >
      <div ref={gabineteRef} className="creators-lab__gabinete">
        <div className="creators-lab__marquise">
          <span className={movimentoReduzido ? undefined : 'creators-lab__piscar'}>
            {arcade ? 'CREATORS ARCADE' : 'BRK-01 // SIMULADOR'}
          </span>
        </div>

        <div className="creators-lab__lampadas" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${i * 0.14}s` }} />
          ))}
        </div>

        {/*
          O canvas é o controle: recebe foco, tem rótulo e responde a teclado.
          Por isso `role="application"` — é um widget interativo, não uma
          figura, e o leitor de tela precisa entregar as setas para ele.
        */}
        <div className="creators-lab__vidro mt-3">
          <canvas
            ref={telaRef}
            width={LARGURA}
            height={ALTURA}
            role="application"
            tabIndex={0}
            aria-label={
              `Quebra-blocos. ${placar.pontos} pontos, ${placar.vidas} vidas, ` +
              `${placar.restantes} blocos restantes. Setas movem, espaço saca.`
            }
            onPointerMove={e => mirar(e.clientX)}
            onPointerDown={e => { mirar(e.clientX); acionar(); }}
            onKeyDown={aoTeclar}
            style={{ touchAction: 'none', cursor: ligado ? 'none' : 'pointer' }}
          />
        </div>

        <div className="creators-lab__controles">
          <div className="creators-lab__manche" aria-hidden="true"><i /><b /></div>

          <button
            type="button"
            className="creators-lab__botao-fisico"
            onClick={acionar}
            aria-label={placar.fase === 'pronto' ? 'Sacar a bola' : 'Recomeçar a partida'}
            title="Sacar / recomeçar"
          />

          <div className="creators-lab__ficha-slot" aria-hidden="true" />
        </div>

        {/*
          O placar também em texto, fora do canvas: pixel desenhado não é lido
          por leitor de tela, e `aria-live` avisa quando o número muda.
        */}
        <p
          className="creators-lab__mono mt-3 text-center text-[.68rem]"
          style={{ color: tokens.cores.textoSuave }}
          aria-live="polite"
        >
          {arcade ? 'SCORE' : 'PONTOS'} {placar.pontos}
          {' · '}RECORDE {placar.recorde}
          {' · '}{placar.vidas} {placar.vidas === 1 ? 'vida' : 'vidas'}
        </p>
      </div>

      <p
        className="creators-lab__mono mx-auto mt-4 max-w-md text-center text-[.66rem] leading-relaxed"
        style={{ color: tokens.cores.textoSuave }}
      >
        Mouse, toque ou setas do teclado movem a raquete. Onde a bola bate na
        raquete decide o ângulo de saída — no meio ela sobe reta, na ponta sai
        deitada.
      </p>
    </SecaoLab>
  );
}
