/**
 * ArcadeCabinet — a máquina de fliperama, com uma ficha por pessoa.
 * ─────────────────────────────────────────────────────────────────────────────
 * O móvel é `components/GabineteFliperama`; a regra do jogo é
 * `lib/fliperama.ts`; a conta da câmera é `lib/enquadramento.ts`. Este arquivo
 * é o que amarra os três ao banco — e é o único que sabe que existe uma ficha.
 *
 * ## Uma ficha, e a ficha queima ao entrar
 *
 * A linha nasce quando a partida COMEÇA, não quando termina. É o que fecha a
 * brecha óbvia: jogar, ver que o placar ficou ruim e recarregar a página antes
 * de morrer. O preço é que abandonar no meio também queima — e por isso o
 * aviso está na tela, com todas as letras, ANTES de o botão aparecer.
 *
 * O servidor é quem decide: `iniciarPartida` só passa uma vez (chave
 * primária), e o gatilho recusa encerrar partida já encerrada. Se o front
 * inteiro estiver mentindo, o banco continua contando a verdade.
 *
 * ## Por que canvas
 *
 * São 40 tijolos, uma bola e uma raquete mudando 60 vezes por segundo. Em DOM
 * seriam 42 elementos com `transform` por quadro; em canvas é um `clearRect` e
 * 42 `fillRect`, sem tocar em layout. E `image-rendering: pixelated` dá a
 * serrilha de máquina antiga de graça.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

import { useAuth } from '@/hooks/useAuth';
import {
  buscarMinhaFicha, buscarRankingFliperama, encerrarPartida, iniciarPartida,
  type EstadoFicha, type LinhaRanking,
} from '@/services/creatorsLab.service';

import { SecaoLab } from '../components/SecaoLab';
import { GabineteFliperama } from '../components/GabineteFliperama';
import { RankingFliperama } from '../components/RankingFliperama';
import { useCreators } from '../theme/CreatorsProvider';
import {
  DURACAO_CAMERA, EASE_CAMERA, SEM_ENQUADRAMENTO, enquadrar, formatarDuracao,
  type Enquadramento,
} from '../lib/enquadramento';
import {
  ALTURA, ALTURA_RAQUETE, LARGURA, LARGURA_RAQUETE, RAIO_BOLA, VIDAS_INICIAIS,
  Y_RAQUETE, avancar, novoJogo, tijolosVivos,
  type Entrada, type EstadoJogo,
} from '../lib/fliperama';

/** Deslocamento máximo do manche decorativo, em pixels de tela. */
const CURSO_MANCHE = 7;

/** A cor de cada linha de tijolo, tirada da paleta do tema ativo. */
function coresDoTema(c: {
  primaria: string; secundaria: string; acento: string; texto: string; textoSuave: string;
}): string[] {
  return [c.acento, c.primaria, c.secundaria, c.primaria, c.textoSuave];
}

export function ArcadeCabinet() {
  const { tokens, registrar, movimentoReduzido, focarMaquina } = useCreators();
  const { perfil } = useAuth();
  const vocab = tokens.vocab;
  const arcade = tokens.id === 'arcade';

  const telaRef     = useRef<HTMLCanvasElement | null>(null);
  const maquinaRef  = useRef<HTMLDivElement | null>(null);

  /*
   * O estado do jogo vive num ref, não em `useState`.
   *
   * São 60 passos por segundo, e nada do JSX depende da posição da bola — quem
   * desenha é o canvas. O que a interface mostra (pontos, vidas, fase) é
   * copiado para o `placar` só quando muda de verdade.
   */
  const jogoRef    = useRef<EstadoJogo>(novoJogo(0));
  const entradaRef = useRef<Entrada>({});
  const laçoRef    = useRef<number | null>(null);
  const ultimoRef  = useRef<number>(0);
  /** Trava contra encerrar a mesma partida duas vezes. */
  const encerrandoRef = useRef(false);

  const [ficha, setFicha]     = useState<EstadoFicha | null>(null);   // null = carregando
  const [ranking, setRanking] = useState<LinhaRanking[] | null>(null);
  const [emJogo, setEmJogo]   = useState(false);
  const [visivel, setVisivel] = useState(false);
  const [quadro, setQuadro]   = useState<Enquadramento>(SEM_ENQUADRAMENTO);
  const [premioAberto, setPremioAberto] = useState(false);

  const [placar, setPlacar] = useState({
    pontos: 0, vidas: VIDAS_INICIAIS, fase: 'pronto' as EstadoJogo['fase'],
    restantes: 0,
  });

  const recarregar = useCallback(async () => {
    const [f, r] = await Promise.all([buscarMinhaFicha(), buscarRankingFliperama()]);
    setFicha(f);
    setRanking(r);
  }, []);

  useEffect(() => { void recarregar(); }, [recarregar]);

  /**
   * Sem banco, o jogo continua existindo — só não conta.
   *
   * É a mesma tolerância do resto do Lab: entre o deploy do front e a migration
   * aplicada à mão existe uma janela, e nela a máquina precisa funcionar como
   * brinquedo em vez de virar um cartão de erro.
   */
  const semRegistro = ficha?.tipo === 'indisponivel';

  // ── Desenho ────────────────────────────────────────────────────────────────

  const desenhar = useCallback(() => {
    const tela = telaRef.current;
    const ctx = tela?.getContext('2d');
    if (!tela || !ctx) return;

    const e = jogoRef.current;
    const c = tokens.cores;
    const paleta = coresDoTema(c);

    /* O manche acompanha a raquete. Escrito direto na variável CSS, de dentro
       do laço: um `setState` por quadro só para inclinar um enfeite de 18 px
       re-renderizaria a seção 60 vezes por segundo à toa. */
    maquinaRef.current?.style.setProperty(
      '--manche',
      `${((e.raqueteX - LARGURA / 2) / (LARGURA / 2)) * CURSO_MANCHE}px`,
    );

    ctx.clearRect(0, 0, LARGURA, ALTURA);
    ctx.fillStyle = '#060916';
    ctx.fillRect(0, 0, LARGURA, ALTURA);

    ctx.strokeStyle = c.borda;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, LARGURA - 2, ALTURA - 2);

    ctx.font = '10px "JetBrains Mono", Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = c.textoSuave;
    ctx.fillText(`SCORE ${String(e.pontos).padStart(5, '0')}`, 8, 10);

    for (let i = 0; i < e.vidas; i++) {
      ctx.fillStyle = c.acento;
      ctx.beginPath();
      ctx.arc(LARGURA - 12 - i * 9, 14, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const t of e.tijolos) {
      if (!t.vivo) continue;
      ctx.fillStyle = paleta[t.linha % paleta.length];
      ctx.fillRect(t.x, t.y, t.l, t.a);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(t.x, t.y + t.a - 2, t.l, 2);
    }

    ctx.fillStyle = c.texto;
    ctx.fillRect(e.raqueteX - LARGURA_RAQUETE / 2, Y_RAQUETE, LARGURA_RAQUETE, ALTURA_RAQUETE);
    ctx.fillStyle = c.primaria;
    ctx.fillRect(e.raqueteX - LARGURA_RAQUETE / 2, Y_RAQUETE, LARGURA_RAQUETE, 2);

    ctx.fillStyle = c.primaria;
    ctx.beginPath();
    ctx.arc(e.bola.x, e.bola.y, RAIO_BOLA, 0, Math.PI * 2);
    ctx.fill();

    // A tela de espera: quando ninguém está jogando, o tubo mostra o convite.
    if (!emJogo) {
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      ctx.fillRect(0, 0, LARGURA, ALTURA);
      ctx.textAlign = 'center';
      ctx.fillStyle = c.primaria;
      ctx.font = 'bold 15px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(vocab.entrada, LARGURA / 2, ALTURA / 2 - 22);
      ctx.fillStyle = c.textoSuave;
      ctx.font = '9px "JetBrains Mono", Consolas, monospace';
      ctx.fillText('uma ficha por pessoa', LARGURA / 2, ALTURA / 2 + 2);
      ctx.textAlign = 'left';
      return;
    }

    const mensagem =
      e.fase === 'pronto' ? 'PRONTO?'
      : e.fase === 'fim'    ? vocab.erro
      : e.fase === 'venceu' ? vocab.sucesso
      : null;

    if (mensagem) {
      ctx.textAlign = 'center';
      ctx.fillStyle = e.fase === 'fim' ? c.acento : c.primaria;
      ctx.font = 'bold 16px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(mensagem, LARGURA / 2, ALTURA / 2 - 26);
      if (e.fase === 'pronto') {
        ctx.fillStyle = c.textoSuave;
        ctx.font = '9px "JetBrains Mono", Consolas, monospace';
        ctx.fillText('clique ou espaço para sacar', LARGURA / 2, ALTURA / 2 - 4);
      }
      ctx.textAlign = 'left';
    }
  }, [tokens, vocab, emJogo]);

  // ── Fim de partida ─────────────────────────────────────────────────────────

  const concluir = useCallback(async (final: EstadoJogo) => {
    if (encerrandoRef.current) return;
    encerrandoRef.current = true;

    const venceu = final.fase === 'venceu';
    if (venceu) registrar({ segredoArcade: true });

    if (!semRegistro) {
      await encerrarPartida({
        pontos: final.pontos,
        vidasUsadas: VIDAS_INICIAIS - final.vidas,
        venceu,
      });
      await recarregar();
    }

    setEmJogo(false);
    setPremioAberto(venceu);
  }, [registrar, semRegistro, recarregar]);

  // ── O laço ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!emJogo || !visivel) {
      if (laçoRef.current !== null) { cancelAnimationFrame(laçoRef.current); laçoRef.current = null; }
      desenhar();   // um quadro parado, para o tubo não ficar preto
      return;
    }

    ultimoRef.current = performance.now();

    const passo = (agora: number) => {
      const dt = (agora - ultimoRef.current) / 1000;
      ultimoRef.current = agora;

      const antes  = jogoRef.current;
      const depois = avancar(antes, dt, entradaRef.current);
      entradaRef.current = { ...entradaRef.current, acionar: false };
      jogoRef.current = depois;

      if (
        depois.pontos !== antes.pontos ||
        depois.vidas  !== antes.vidas  ||
        depois.fase   !== antes.fase
      ) {
        setPlacar({
          pontos: depois.pontos, vidas: depois.vidas, fase: depois.fase,
          restantes: tijolosVivos(depois.tijolos),
        });
      }

      desenhar();

      // Fim de partida: NÃO reagenda. A ficha é uma só, então não existe
      // "recomeçar" — a máquina volta para a tela de espera.
      if (depois.fase === 'venceu' || depois.fase === 'fim') {
        laçoRef.current = null;
        void concluir(depois);
        return;
      }

      laçoRef.current = requestAnimationFrame(passo);
    };

    laçoRef.current = requestAnimationFrame(passo);
    return () => {
      if (laçoRef.current !== null) { cancelAnimationFrame(laçoRef.current); laçoRef.current = null; }
    };
  }, [emJogo, visivel, desenhar, concluir]);

  useEffect(() => { desenhar(); }, [desenhar]);

  // Só é "visível" o gabinete na tela E numa aba em primeiro plano. As duas
  // condições, porque nenhuma sozinha cobre a outra.
  useEffect(() => {
    const alvo = maquinaRef.current;
    if (!alvo) return;

    let naTela = false;
    const atualizar = () => setVisivel(naTela && document.visibilityState === 'visible');

    const obs = new IntersectionObserver(([e]) => { naTela = e.isIntersecting; atualizar(); },
      { threshold: 0.2 });
    obs.observe(alvo);
    document.addEventListener('visibilitychange', atualizar);

    return () => {
      obs.disconnect();
      document.removeEventListener('visibilitychange', atualizar);
    };
  }, []);

  // ── Câmera ─────────────────────────────────────────────────────────────────

  /*
   * A aproximação: o gabinete sai do fluxo da página e vem para a frente. A
   * conta está em `lib/enquadramento.ts` e depende de ONDE o elemento está,
   * então é medida na hora — e remedida quando a janela muda de tamanho, senão
   * girar o celular no meio da partida deixaria a máquina fora da tela.
   *
   * A página fica travada enquanto isso: com o gabinete deslocado por
   * `transform`, rolar a página o levaria embora.
   */
  // Avisa a raiz do Lab, que é quem desenha a cortina.
  useEffect(() => { focarMaquina(emJogo); }, [emJogo, focarMaquina]);

  useEffect(() => {
    if (!emJogo) { setQuadro(SEM_ENQUADRAMENTO); return; }

    const medir = () => {
      const alvo = maquinaRef.current;
      if (!alvo) return;
      const r = alvo.getBoundingClientRect();
      setQuadro(enquadrar(
        { x: r.x, y: r.y, largura: r.width, altura: r.height },
        { largura: window.innerWidth, altura: window.innerHeight },
      ));
    };

    medir();
    window.addEventListener('resize', medir);

    const rolagemAntes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('resize', medir);
      document.body.style.overflow = rolagemAntes;
    };
  }, [emJogo]);

  // ── Entrada ────────────────────────────────────────────────────────────────

  const mirar = useCallback((clienteX: number) => {
    const tela = telaRef.current;
    if (!tela) return;
    const r = tela.getBoundingClientRect();
    if (r.width === 0) return;
    entradaRef.current.alvoRaquete = ((clienteX - r.left) / r.width) * LARGURA;
  }, []);

  const acionar = useCallback(() => {
    if (!emJogo) return;
    entradaRef.current.acionar = true;
  }, [emJogo]);

  const aoTeclar = useCallback((e: React.KeyboardEvent) => {
    if (!emJogo) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const atual = entradaRef.current.alvoRaquete ?? jogoRef.current.raqueteX;
      entradaRef.current.alvoRaquete = atual + (e.key === 'ArrowLeft' ? -18 : 18);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      acionar();
    }
  }, [acionar, emJogo]);

  // ── Começar e abandonar ────────────────────────────────────────────────────

  const comecar = useCallback(async () => {
    if (!semRegistro) {
      const ok = await iniciarPartida();
      if (!ok) { await recarregar(); return; }   // outra aba já tinha começado
      setFicha({ tipo: 'emAndamento', iniciadoEm: new Date().toISOString() });
    }
    jogoRef.current = novoJogo(0);
    entradaRef.current = {};
    encerrandoRef.current = false;
    setPlacar({ pontos: 0, vidas: VIDAS_INICIAIS, fase: 'pronto', restantes: 0 });
    setEmJogo(true);
    // Foco no tubo: quem entrou por teclado precisa poder jogar por teclado.
    window.setTimeout(() => telaRef.current?.focus(), DURACAO_CAMERA * 1000);
  }, [semRegistro, recarregar]);

  /**
   * A ficha ficou em aberto de uma sessão anterior.
   *
   * Deixar a pessoa continuar seria reabrir a brecha que a inserção no início
   * fecha: o estado do jogo mora no navegador, então "continuar" é sempre
   * "recomeçar". O aviso antes de inserir a ficha diz exatamente isto, e aqui
   * só resta reconhecer o que aconteceu.
   */
  const assumirAbandono = useCallback(async () => {
    await encerrarPartida({ pontos: 0, vidasUsadas: VIDAS_INICIAIS, venceu: false });
    await recarregar();
  }, [recarregar]);

  const meuId = perfil?.id ?? null;
  const minhaLinha = useMemo(
    () => ranking?.find(l => l.usuarioId === meuId) ?? null,
    [ranking, meuId],
  );

  // ── Tela ───────────────────────────────────────────────────────────────────

  const c = tokens.cores;

  return (
    <SecaoLab
      id="fliperama"
      rotulo={arcade ? 'coin-op' : 'simulação interativa'}
      titulo={vocab.fliperama}
      descricao={
        arcade
          ? 'Uma máquina de verdade, com uma ficha por pessoa. Três vidas, um ranking e um prêmio para quem zerar.'
          : 'Simulação em canvas com física escrita à mão. Uma execução por operador, com resultado registrado.'
      }
    >
      {/* A cortina que escurece a página é renderizada na RAIZ do Lab, não
          aqui — ver o comentário em `index.tsx`. Esta seção só avisa quando a
          câmera está na máquina. */}
      <motion.div
        animate={{ x: quadro.x, y: quadro.y, scale: quadro.escala }}
        transition={
          movimentoReduzido
            ? { duration: 0 }
            : { duration: DURACAO_CAMERA, ease: EASE_CAMERA }
        }
        /*
         * O `z-index` fica NESTE elemento, não no gabinete lá dentro.
         *
         * `animate` com x/y/scale escreve um `transform`, e isso cria contexto
         * de empilhamento: um `z-index` posto no gabinete ficaria preso aqui
         * dentro e a cortina passaria por cima dele. Aqui fora, o valor compete
         * no mesmo contexto da cortina (`.creators-lab__conteudo`).
         */
        style={{
          transformOrigin: 'center',
          position: 'relative',
          zIndex: emJogo ? 61 : undefined,
        }}
      >
        <GabineteFliperama
          ref={maquinaRef}
          focado={emJogo}
          titulo={arcade ? 'CREATORS ARCADE' : 'BRK-01'}
          selo={semRegistro ? 'MODO LIVRE' : '1 CRÉDITO'}
          piscar={!movimentoReduzido && !emJogo}
          aoAcionar={acionar}
          rotuloAcao="Sacar a bola"
        >
          <canvas
            ref={telaRef}
            width={LARGURA}
            height={ALTURA}
            role="application"
            tabIndex={0}
            aria-label={
              emJogo
                ? `Quebra-blocos. ${placar.pontos} pontos, ${placar.vidas} vidas, `
                  + `${placar.restantes} blocos restantes. Setas movem, espaço saca.`
                : 'Máquina de fliperama, desligada. O botão abaixo insere a ficha.'
            }
            onPointerMove={e => mirar(e.clientX)}
            onPointerDown={e => { mirar(e.clientX); acionar(); }}
            onKeyDown={aoTeclar}
            style={{ touchAction: 'none', cursor: emJogo ? 'none' : 'default' }}
          />
        </GabineteFliperama>
      </motion.div>

      {/* Placar em texto: pixel desenhado não é lido por leitor de tela. */}
      {emJogo && (
        <p
          className="creators-lab__mono mt-4 text-center text-[.7rem]"
          style={{ color: c.textoSuave, position: 'relative', zIndex: 61 }}
          aria-live="polite"
        >
          {placar.pontos} pontos · {placar.vidas} {placar.vidas === 1 ? 'vida' : 'vidas'}
        </p>
      )}

      {!emJogo && (
        <div className="mx-auto mt-8 max-w-lg">
          {ficha === null && (
            <p className="creators-lab__mono text-center text-xs" style={{ color: c.textoSuave }}>
              carregando ficha...
            </p>
          )}

          {ficha?.tipo === 'nunca' && (
            <PainelAviso aoComecar={comecar} />
          )}

          {ficha?.tipo === 'emAndamento' && (
            <div className="creators-lab__painel p-5 text-center">
              <p className="creators-lab__rotulo" style={{ color: c.acento }}>ficha em aberto</p>
              <p className="mt-2 text-sm" style={{ color: c.texto }}>
                Você inseriu a ficha e a partida não foi concluída.
              </p>
              <p className="mt-1 text-xs" style={{ color: c.textoSuave }}>
                O estado do jogo mora no navegador, então continuar seria recomeçar —
                e a ficha era uma só. Era isso que o aviso dizia.
              </p>
              <button className="creators-lab__btn mt-4" onClick={() => void assumirAbandono()}>
                encerrar partida
              </button>
            </div>
          )}

          {ficha?.tipo === 'encerrada' && (
            <ResultadoFinal ficha={ficha} aoVerPremio={() => setPremioAberto(true)} />
          )}

          {semRegistro && (
            <div className="creators-lab__painel p-5 text-center">
              <p className="creators-lab__rotulo" style={{ color: c.secundaria }}>modo livre</p>
              <p className="mt-2 text-xs" style={{ color: c.textoSuave }}>
                O placar não está sendo registrado — jogue à vontade, quantas vezes quiser.
              </p>
              <button className="creators-lab__btn mt-4" onClick={() => void comecar()}>
                {vocab.entrada}
              </button>
            </div>
          )}
        </div>
      )}

      {/* O prêmio. Aparece na vitória e fica disponível depois. */}
      {premioAberto && (
        <div className="creators-lab__painel creators-lab__painel--marcado mx-auto mt-6 max-w-lg p-5">
          <p className="creators-lab__rotulo" style={{ color: c.primaria }}>prêmio</p>
          <h3 className="mt-2 text-xl" style={{ color: c.primaria }}>👑 Você zerou a máquina</h3>
          <p className="mt-3 text-sm" style={{ color: c.texto }}>
            Sua coroa fica no ranking e no painel de descobridores, para sempre.
          </p>
          <p className="mt-2 text-sm" style={{ color: c.textoSuave }}>
            E o terminal desta página ganhou um comando que só responde a você:
            digite <span className="creators-lab__mono" style={{ color: c.acento }}>premio</span> lá embaixo.
          </p>
          <button
            className="creators-lab__btn mt-4"
            onClick={() => setPremioAberto(false)}
            style={{ borderColor: c.borda }}
          >
            {vocab.fechar}
          </button>
        </div>
      )}

      {/* Ranking. Sempre visível — ver quem já passou por aqui faz parte. */}
      {!emJogo && ranking && (
        <div className="mt-10">
          <p className="creators-lab__rotulo mb-2" style={{ color: c.secundaria }}>
            {arcade ? 'HIGH SCORES' : 'ranking'}
          </p>
          <p className="creators-lab__mono mb-3 text-[.66rem]" style={{ color: c.textoSuave }}>
            critérios, nesta ordem: zerou a máquina · pontos · menos vidas gastas · menos tempo
          </p>
          <RankingFliperama linhas={ranking} meuId={meuId} />
          {minhaLinha && (
            <p className="creators-lab__mono mt-3 text-[.66rem]" style={{ color: c.textoSuave }}>
              Sua posição: {minhaLinha.posicao}º de {ranking.length}.
            </p>
          )}
        </div>
      )}

      <p
        className="creators-lab__mono mx-auto mt-6 max-w-md text-center text-[.66rem] leading-relaxed"
        style={{ color: c.textoSuave }}
      >
        Mouse, toque ou setas movem a raquete. Onde a bola bate na raquete decide
        o ângulo de saída — no meio ela sobe reta, na ponta sai deitada.
      </p>
    </SecaoLab>
  );
}

/**
 * O aviso antes da ficha.
 *
 * Precisa dizer as três coisas ANTES do botão, e não depois: uma chance só,
 * três vidas, e sair no meio queima do mesmo jeito. Um aviso que aparece
 * depois do clique não é aviso, é desculpa.
 */
function PainelAviso({ aoComecar }: { aoComecar: () => Promise<void> }) {
  const { tokens } = useCreators();
  const c = tokens.cores;
  const [inserindo, setInserindo] = useState(false);

  return (
    <div className="creators-lab__painel creators-lab__painel--marcado p-5 text-center">
      <p className="creators-lab__rotulo" style={{ color: c.acento }}>atenção</p>
      <h3 className="mt-2 text-lg" style={{ color: c.primaria }}>
        Você tem UMA ficha
      </h3>

      <ul
        className="creators-lab__mono mx-auto mt-4 max-w-sm space-y-2 text-left text-[.72rem]"
        style={{ color: c.texto }}
      >
        <li>▸ uma única partida por pessoa, com três vidas;</li>
        <li>▸ sair da página no meio queima a ficha do mesmo jeito;</li>
        <li>▸ pontuação, vidas gastas e tempo entram no ranking;</li>
        <li style={{ color: c.primaria }}>▸ quem zerar a máquina ganha um prêmio surpresa.</li>
      </ul>

      <button
        className="creators-lab__btn mt-5"
        disabled={inserindo}
        onClick={async () => { setInserindo(true); await aoComecar(); setInserindo(false); }}
      >
        {inserindo ? 'inserindo...' : '▶ inserir ficha'}
      </button>
    </div>
  );
}

/** O que ficou registrado da partida desta pessoa. */
function ResultadoFinal({
  ficha, aoVerPremio,
}: {
  ficha: Extract<EstadoFicha, { tipo: 'encerrada' }>;
  aoVerPremio: () => void;
}) {
  const { tokens } = useCreators();
  const c = tokens.cores;

  return (
    <div className="creators-lab__painel p-5 text-center">
      <p className="creators-lab__rotulo" style={{ color: ficha.venceu ? c.primaria : c.textoSuave }}>
        {ficha.venceu ? 'máquina zerada' : 'ficha usada'}
      </p>

      <p className="mt-3 creators-lab__mono text-sm" style={{ color: c.texto }}>
        {ficha.pontos} pontos · {ficha.vidasUsadas} {ficha.vidasUsadas === 1 ? 'vida' : 'vidas'} ·{' '}
        {formatarDuracao(ficha.duracaoMs)}
      </p>

      <p className="mt-2 text-xs" style={{ color: c.textoSuave }}>
        {ficha.venceu
          ? 'Está no ranking com a coroa.'
          : 'Sua ficha acabou aqui. O ranking abaixo continua valendo.'}
      </p>

      {ficha.venceu && (
        <button className="creators-lab__btn mt-4" onClick={aoVerPremio}>
          👑 ver o prêmio
        </button>
      )}
    </div>
  );
}
