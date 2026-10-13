/**
 * Palco.tsx — desenha a cena.
 *
 * ## O componente é UM só, de propósito
 *
 * A prévia da mesa e a TV da parede renderizam ESTE arquivo, com as mesmas
 * props, mudando apenas o tamanho da caixa. Não existe "componente de prévia":
 * se existisse, ele e o palco divergiriam com o tempo — sempre divergem —, e a
 * promessa de "o que eu vejo é o que vai ao ar" morreria em silêncio, que é o
 * pior jeito de morrer.
 *
 * Se um dia alguém precisar de um comportamento "só na prévia", o caminho é uma
 * prop aqui dentro, nunca um segundo componente.
 *
 * ## Tudo em pixel de PALCO
 *
 * Os tamanhos abaixo (72px, 40px…) são pixels do palco de 1920×1080, não da
 * tela. O `scale` do contêiner reduz tudo junto. Por isso é seguro escrever
 * número grande aqui: numa prévia de 560px de largura eles viram um terço.
 */
import { useEffect, useRef, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { alvoDiario } from './templates';
import { Roleta, Bingo, SorteioPessoa } from './Jogos';
import {
  PALCO_LARGURA,
  PALCO_ALTURA,
  escalaDoPalco,
  estiloDaFonte,
  encaixar,
  limitarAoPalco,
  ordenarPorCamada,
  percentualDaMeta,
  primeiroNome,
  redimensionar,
  texto,
  numero,
  ligado,
  ALCAS,
  alcaEhCanto,
  alcaNoOeste,
  type Alca,
  type Redimensionamento,
  type Fonte,
  type LinhaRanking,
  type DadosMeta,
  type DadosDesafio,
  type DadosSorteio,
} from './geometria';

interface PalcoProps {
  fontes: readonly Fonte[];
  /** Mostrado quando não há cena no ar. A TV nunca fica em branco sem explicação. */
  aviso?: string | null;
  /** Contorno pontilhado na fonte selecionada. Só a mesa usa. */
  selecionadaId?: string | null;
  onSelecionar?: (id: string) => void;
  /**
   * Arrasto. Só a mesa passa — na TV não há cursor.
   *
   * `definitivo` separa o que é feedback do que é gravação: durante o arrasto
   * chega `false` a cada quadro (só estado local), e no soltar chega `true`
   * uma vez. Sem essa distinção, arrastar produziria um UPDATE por pixel.
   */
  onMoverFonte?: (id: string, x: number, y: number, definitivo: boolean) => void;
  /**
   * Redimensionar pelas alças. Só a mesa passa, e só a fonte SELECIONADA
   * ganha alças — oito pontinhos em cada elemento da cena seria um campo de
   * minas sobre a arte.
   *
   * Mesma separação de `onMoverFonte`: `definitivo` só no soltar.
   */
  onRedimensionar?: (id: string, r: Redimensionamento, definitivo: boolean) => void;
}

/** Tamanho da alça em pixels DE TELA — ver `contraEscala`. */
const ALCA_PX = 12;

export function Palco({
  fontes, aviso, selecionadaId, onSelecionar, onMoverFonte, onRedimensionar,
}: PalcoProps) {
  const caixa = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0);
  /*
   * Guarda a distância entre o cursor e o CENTRO da fonte no momento em que ela
   * foi pega. Sem isso, pegar uma fonte pela borda faria ela pular para debaixo
   * do cursor — o elemento salta antes de começar a andar, e a pessoa perde a
   * referência do que estava fazendo.
   */
  const [arrastando, setArrastando] = useState<
    { id: string; desvioX: number; desvioY: number } | null
  >(null);
  /*
   * O redimensionamento guarda o estado INICIAL da fonte, não o corrente.
   *
   * Recalcular sempre a partir do início é o que mantém a borda oposta parada:
   * aplicar deltas sobre o valor já alterado acumula o arredondamento de cada
   * quadro, e depois de atravessar o palco a âncora escorregou visivelmente.
   */
  const [redimensionando, setRedimensionando] = useState<
    { id: string; alca: Alca; inicio: { x: number; largura: number; escala: number } } | null
  >(null);

  /*
   * Converte a posição do ponteiro em % do palco.
   *
   * Usa o retângulo do canvas JÁ ESCALADO, então a conta vale igual numa prévia
   * de 400px e numa TV de 1920 — nenhuma referência à escala aparece aqui.
   */
  const posicaoEmPercentual = (e: React.PointerEvent): { x: number; y: number } | null => {
    const el = canvas.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return {
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    };
  };

  const aoArrastar = (e: React.PointerEvent, definitivo: boolean) => {
    if (!arrastando || !onMoverFonte) return;
    const p = posicaoEmPercentual(e);
    if (!p) return;
    onMoverFonte(
      arrastando.id,
      limitarAoPalco(encaixar(p.x + arrastando.desvioX)),
      limitarAoPalco(encaixar(p.y + arrastando.desvioY)),
      definitivo,
    );
  };

  const aoRedimensionar = (e: React.PointerEvent, definitivo: boolean) => {
    if (!redimensionando || !onRedimensionar) return;
    const p = posicaoEmPercentual(e);
    if (!p) return;
    onRedimensionar(
      redimensionando.id,
      redimensionar(redimensionando.inicio, redimensionando.alca, p.x),
      definitivo,
    );
  };

  /** Um gesto de cada vez: ou anda, ou cresce. */
  const emGesto = !!arrastando || !!redimensionando;

  const aoMover = (e: React.PointerEvent, definitivo: boolean) => {
    if (arrastando) aoArrastar(e, definitivo);
    else aoRedimensionar(e, definitivo);
  };

  const encerrarGesto = () => { setArrastando(null); setRedimensionando(null); };

  /*
   * `ResizeObserver` e não `window.resize`: a prévia da mesa muda de tamanho
   * quando o painel lateral abre, e nisso a janela não muda em nada.
   *
   * `getBoundingClientRect` e não `clientWidth`: o segundo arredonda para
   * inteiro, e o erro de meio pixel na escala desloca visivelmente uma fonte
   * posicionada perto da borda.
   */
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      setEscala(escalaDoPalco(r.width, r.height));
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    /*
     * `absolute inset-0` e NÃO `w-full h-full`.
     *
     * Este foi um defeito real: com `h-full`, a altura vinha de `height: 100%`,
     * e percentual só resolve contra pai de altura DEFINIDA. Na mesa o pai tira
     * a altura de `aspect-ratio`, que não conta — a altura media 0, a escala
     * dava 0 e o palco inteiro ficava `visibility: hidden`. A prévia ficava
     * preta e nada do que se adicionasse aparecia.
     *
     * Não dava para notar pela TV: lá o pai é `fixed inset-0`, tem altura de
     * verdade e sempre funcionou. `inset-0` faz os dois casos medirem igual.
     */
    <div
      ref={caixa}
      className="absolute inset-0 overflow-hidden bg-[#0a0f13]"
      onPointerMove={emGesto ? e => aoMover(e, false) : undefined}
      onPointerUp={emGesto ? e => { aoMover(e, true); encerrarGesto(); } : undefined}
      // Ponteiro saiu da caixa com o botão apertado: grava onde parou em vez de
      // deixar a fonte "presa" ao cursor para sempre.
      onPointerLeave={emGesto ? e => { aoMover(e, true); encerrarGesto(); } : undefined}
    >
      <div
        ref={canvas}
        style={{
          width: PALCO_LARGURA,
          height: PALCO_ALTURA,
          /*
           * Centralizado pelo próprio transform, e não por `place-items` do
           * grid: um filho de 1920px dentro de uma caixa de 500px transborda, e
           * centralizar transbordamento é comportamento sutil demais para a
           * peça que sustenta "a prévia é igual à TV".
           */
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${escala})`,
          background: '#0a0f13',
          // Sem a escala medida ainda: não pisca o palco em tamanho natural.
          visibility: escala > 0 ? 'visible' : 'hidden',
        }}
      >
        {/*
          `visivel` some da prévia também, e não só da TV. A prévia existe para
          responder "é isto que vai aparecer?" — mostrar na mesa o que a parede
          não mostra transformaria a resposta em mentira.
        */}
        {ordenarPorCamada(fontes.filter(f => f.visivel !== false)).map(fonte => (
          <div
            key={fonte.id}
            style={{
              ...estiloDaFonte(fonte),
              cursor: onMoverFonte ? (arrastando?.id === fonte.id ? 'grabbing' : 'grab') : undefined,
              // Sem isto o navegador começa a arrastar a imagem/o texto como
              // conteúdo, e o arrasto da fonte nunca chega ao fim.
              touchAction: onMoverFonte ? 'none' : undefined,
              userSelect: onMoverFonte ? 'none' : undefined,
            }}
            onPointerDown={onMoverFonte ? e => {
              e.preventDefault();
              onSelecionar?.(fonte.id);
              const p = posicaoEmPercentual(e);
              setArrastando({
                id: fonte.id,
                desvioX: p ? fonte.x - p.x : 0,
                desvioY: p ? fonte.y - p.y : 0,
              });
            } : undefined}
            onClick={onSelecionar && !onMoverFonte ? () => onSelecionar(fonte.id) : undefined}
            className={
              selecionadaId === fonte.id
                ? 'outline outline-4 outline-dashed outline-sky-400/80'
                : undefined
            }
          >
            <DesenhoDaFonte fonte={fonte} />

            {/*
              As alças, só na fonte selecionada e só na mesa.

              Ficam DENTRO da caixa da fonte para acompanharem posição e
              tamanho sem nenhuma conta — mas por isso herdam o `scale` dela e
              o do palco. `contraEscala` desfaz os dois: a alça mede os mesmos
              12px na prévia de 400px e na TV de 1920, que é o que a torna
              clicável em vez de decorativa.
            */}
            {onRedimensionar && selecionadaId === fonte.id && escala > 0 && (
              <Alcas
                fonte={fonte}
                contraEscala={1 / (escala * (fonte.escala || 1))}
                aoPegar={(alca, e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setArrastando(null);
                  setRedimensionando({
                    id: fonte.id,
                    alca,
                    inicio: { x: fonte.x, largura: fonte.largura, escala: fonte.escala },
                  });
                }}
              />
            )}
          </div>
        ))}

        {/* Guias do meio, só enquanto arrasta e só na mesa. */}
        {arrastando && (
          <>
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2,
                          marginLeft: -1, background: 'rgba(127,216,232,.55)', zIndex: 9999 }} />
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2,
                          marginTop: -1, background: 'rgba(127,216,232,.55)', zIndex: 9999 }} />
          </>
        )}

        {aviso && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
              padding: 80,
            }}
          >
            <p style={{ color: '#8fa3ab', fontSize: 64, fontWeight: 600, lineHeight: 1.3 }}>
              {aviso}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── As alças de redimensionar ────────────────────────────────────────────────

/** Onde cada alça encosta na caixa da fonte, em % da própria caixa. */
const CANTO_DA_ALCA: Record<Alca, { esquerda: string; topo: string }> = {
  nw: { esquerda: '0%',   topo: '0%'   },
  ne: { esquerda: '100%', topo: '0%'   },
  sw: { esquerda: '0%',   topo: '100%' },
  se: { esquerda: '100%', topo: '100%' },
  w:  { esquerda: '0%',   topo: '50%'  },
  e:  { esquerda: '100%', topo: '50%'  },
};

const CURSOR_DA_ALCA: Record<Alca, string> = {
  nw: 'nwse-resize', se: 'nwse-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  w:  'ew-resize',   e:  'ew-resize',
};

/**
 * Os seis pontos de agarrar da fonte selecionada.
 *
 * Cantos crescem a fonte inteira (escala); laterais mudam só a largura da
 * caixa. Não há alça em cima nem embaixo porque a altura vem do conteúdo —
 * ver `ALCAS` em `geometria.ts`.
 *
 * A área CLICÁVEL é maior que o desenho: um quadradinho de 12px é difícil de
 * pegar com o mouse, e mais ainda no toque. O `padding` do botão cresce o alvo
 * sem engordar o ponto que a pessoa vê.
 */
function Alcas({
  fonte, contraEscala, aoPegar,
}: {
  fonte: Fonte;
  contraEscala: number;
  aoPegar: (alca: Alca, e: React.PointerEvent) => void;
}) {
  const lado = ALCA_PX * contraEscala;
  return (
    <>
      {ALCAS.map(alca => (
        <div
          key={alca}
          role="presentation"
          onPointerDown={e => aoPegar(alca, e)}
          style={{
            position: 'absolute',
            left: CANTO_DA_ALCA[alca].esquerda,
            top: CANTO_DA_ALCA[alca].topo,
            width: lado,
            height: lado,
            marginLeft: -lado / 2,
            marginTop: -lado / 2,
            boxSizing: 'border-box',
            background: '#ffffff',
            border: `${Math.max(1, lado / 8)}px solid #38bdf8`,
            borderRadius: alcaEhCanto(alca) ? lado / 6 : lado / 2,
            cursor: CURSOR_DA_ALCA[alca],
            touchAction: 'none',
            zIndex: 10,
            boxShadow: `0 0 ${lado / 2}px rgba(0,0,0,.45)`,
          }}
          title={alcaEhCanto(alca)
            ? 'Arraste para crescer a fonte inteira'
            : `Arraste para mudar a largura da caixa (${alcaNoOeste(alca) ? 'esquerda' : 'direita'})`}
        />
      ))}
      {/* O tamanho atual, para quem quer um número e não o olho. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '0%',
          transform: 'translate(-50%, -140%)',
          background: 'rgba(2,17,26,.86)',
          color: '#bde8f5',
          padding: `${2 * contraEscala}px ${7 * contraEscala}px`,
          borderRadius: 999 * contraEscala,
          fontSize: 11 * contraEscala,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          fontVariantNumeric: 'tabular-nums',
          zIndex: 10,
        }}
      >
        {fonte.largura.toFixed(0)}% · {fonte.escala.toFixed(2)}×
      </div>
    </>
  );
}

// ── Cada tipo de fonte ───────────────────────────────────────────────────────

function DesenhoDaFonte({ fonte }: { fonte: Fonte }) {
  switch (fonte.tipo) {
    case 'texto':   return <FonteTexto  config={fonte.config} />;
    case 'imagem':  return <FonteImagem config={fonte.config} />;
    case 'ranking': return <FonteRanking config={fonte.config} dados={fonte.dados as LinhaRanking[] | null} />;
    case 'meta':    return <FonteMeta    config={fonte.config} dados={fonte.dados as DadosMeta | null} />;
    case 'fundo':   return <FonteFundo   config={fonte.config} />;
    case 'relogio': return <FonteRelogio config={fonte.config} />;
    case 'video':   return <FonteVideo   fonte={fonte} />;
    case 'desafio': return <FonteDesafio config={fonte.config} dados={fonte.dados as DadosDesafio | null} />;
    case 'sorteio': return <FonteSorteio config={fonte.config} dados={fonte.dados as DadosSorteio | null} />;
    default:        return null;
  }
}

/** O desafio que está valendo: nome, prêmio e quanto falta. */
function FonteDesafio({
  config, dados,
}: { config: Record<string, unknown>; dados: DadosDesafio | null }) {
  if (!dados) {
    return (
      <p style={{ margin: 0, color: '#5b7079', fontSize: 40 }}>
        Nenhum desafio no ar neste setor
      </p>
    );
  }
  const dias = Number(dados.dias_restantes) || 0;
  return (
    <div>
      <h3 style={{ margin: '0 0 20px', color: '#7fd8e8', fontSize: 40, fontWeight: 700,
                   letterSpacing: '.06em', textTransform: 'uppercase' }}>
        {texto(config, 'titulo', 'Desafio')}
      </h3>
      <p style={{ margin: '0 0 16px', color: '#ffffff', fontSize: 72, fontWeight: 800,
                  lineHeight: 1.05, textWrap: 'balance' }}>
        {dados.nome}
      </p>
      {dados.premio && (
        <p style={{ margin: '0 0 20px', color: '#e8f1f3', fontSize: 44, fontWeight: 500 }}>
          🏆 {dados.premio}
        </p>
      )}
      <p style={{ margin: 0, color: dias <= 2 ? '#e8a33d' : '#8fa3ab', fontSize: 40,
                  fontWeight: 700 }}>
        {dias === 0 ? 'Último dia!' : dias === 1 ? 'Falta 1 dia' : `Faltam ${dias} dias`}
      </p>
    </div>
  );
}

/**
 * Roleta e bingo.
 *
 * O vencedor e os números vêm PRONTOS do servidor — esta tela só desenha. Se o
 * sorteio fosse decidido aqui, duas telas do mesmo setor mostrariam vencedores
 * diferentes, e não haveria como responder depois quem realmente ganhou.
 */
/**
 * O jogo, seja ele qual for.
 *
 * A fonte diz em `config.modelo` o que ela é, e o banco já devolveu o jogo
 * daquele tipo. Aqui só se escolhe o desenho — os três moram em `Jogos.tsx`,
 * porque cada um tem animação própria e juntá-los aqui faria deste arquivo o
 * lugar onde tudo cabe.
 */
function FonteSorteio({
  config, dados,
}: { config: Record<string, unknown>; dados: DadosSorteio | null }) {
  const modelo = texto(config, 'modelo', dados?.tipo ?? 'roleta');

  if (!dados) {
    return (
      <p style={{ margin: 0, color: '#5b7079', fontSize: 40 }}>
        Nenhum {modelo === 'bingo' ? 'bingo' : modelo === 'sorteio' ? 'sorteio' : 'giro'} aberto —
        abra um no painel da mesa.
      </p>
    );
  }

  if (modelo === 'bingo')   return <Bingo config={config} dados={dados} />;
  if (modelo === 'sorteio') return <SorteioPessoa config={config} dados={dados} />;
  return <Roleta config={config} dados={dados} />;
}

/**
 * Vídeo em laço.
 *
 * `muted` no atributo E `volume` na propriedade: o navegador só aceita começar
 * a tocar sozinho se o vídeo estiver mudo, então todo vídeo NASCE mudo e o som
 * só entra depois que alguém destravou o áudio da página (ver `TvPalco`). Sem
 * isso o vídeo nem começa — e não há erro nenhum na tela dizendo por quê.
 */
function FonteVideo({ fonte }: { fonte: Fonte }) {
  const video = useRef<HTMLVideoElement>(null);
  const url = texto(fonte.config, 'url', '');
  const mudo = fonte.mudo !== false;
  const volume = Math.max(0, Math.min(1, Number(fonte.volume ?? 1)));

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.volume = volume;
    el.muted = mudo;
    // `play()` rejeita quando a política de autoplay barra. Engolir é correto:
    // é o estado esperado até alguém destravar o áudio, não um defeito.
    void el.play().catch(() => {});
  }, [volume, mudo, url]);

  if (!url) {
    return (
      <div style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center',
                    border: '4px dashed #2a3a42', borderRadius: 12, color: '#5b7079', fontSize: 32 }}>
        Sem vídeo
      </div>
    );
  }

  return (
    <video
      ref={video}
      src={url}
      loop
      autoPlay
      playsInline
      muted={mudo}
      style={{
        display: 'block',
        width: '100%',
        borderRadius: numero(fonte.config, 'arredondamento', 16),
        objectFit: texto(fonte.config, 'ajuste', 'cover') as 'cover' | 'contain',
      }}
    />
  );
}

/**
 * Fundo — cor sólida ou degradê.
 *
 * Cobre o palco inteiro ignorando a largura e a posição da fonte: fundo que se
 * arrasta é fundo que alguém vai deixar torto sem perceber. Nasce na camada
 * mais baixa (ver `adicionarFonte`), e é o que separa "tela preta com coisas
 * em cima" de tela acabada.
 */
function FonteFundo({ config }: { config: Record<string, unknown> }) {
  const cor = texto(config, 'cor', '#0a0f13');
  const segunda = texto(config, 'cor_2', '');
  return (
    <div
      style={{
        position: 'fixed',
        left: 0, top: 0,
        width: PALCO_LARGURA, height: PALCO_ALTURA,
        background: segunda
          ? `linear-gradient(${numero(config, 'angulo', 160)}deg, ${cor}, ${segunda})`
          : cor,
      }}
    />
  );
}

/**
 * Relógio — hora de São Paulo, não a do PC.
 *
 * O PC da TV pode estar com o fuso errado e ninguém repararia; o relógio na
 * parede errado, todo mundo repara. O minuto é redesenhado por um `setInterval`
 * de 10s: um relógio parado é pior que relógio nenhum.
 */
function FonteRelogio({ config }: { config: Record<string, unknown> }) {
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  const comSegundos = ligado(config, 'segundos', false);
  const hora = agora.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    ...(comSegundos ? { second: '2-digit' as const } : {}),
  });

  return (
    <p
      style={{
        margin: 0,
        color: texto(config, 'cor', '#ffffff'),
        fontSize: numero(config, 'tamanho', 120),
        fontWeight: 800,
        textAlign: 'center',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        textShadow: '0 2px 12px rgba(0,0,0,.45)',
      }}
    >
      {hora}
    </p>
  );
}

function FonteTexto({ config }: { config: Record<string, unknown> }) {
  return (
    <p
      style={{
        margin: 0,
        color: texto(config, 'cor', '#ffffff'),
        fontSize: numero(config, 'tamanho', 72),
        fontWeight: numero(config, 'peso', 700),
        textAlign: texto(config, 'alinhamento', 'center') as 'left' | 'center' | 'right',
        lineHeight: 1.15,
        textWrap: 'balance',
        // Texto claro sobre arte clara acontece. A sombra é o que garante que
        // dê para ler mesmo quando o fundo não colabora.
        textShadow: '0 2px 12px rgba(0,0,0,.45)',
      }}
    >
      {texto(config, 'texto', 'Texto')}
    </p>
  );
}

function FonteImagem({ config }: { config: Record<string, unknown> }) {
  const url = texto(config, 'url', '');
  if (!url) {
    return (
      <div style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center',
                    border: '4px dashed #2a3a42', borderRadius: 12, color: '#5b7079', fontSize: 32 }}>
        Sem imagem
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      style={{
        display: 'block',
        width: '100%',
        borderRadius: numero(config, 'arredondamento', 16),
        objectFit: texto(config, 'ajuste', 'cover') as 'cover' | 'contain',
      }}
    />
  );
}

/**
 * O pódio.
 *
 * Ordem de desenho 2º–1º–3º, que é como pódio se lê: o mais alto no meio.
 * Ordenar por colocação da esquerda para a direita poria o campeão na ponta e
 * quebraria o reconhecimento imediato da forma.
 */
function RankingPodio({
  config, linhas,
}: { config: Record<string, unknown>; linhas: LinhaRanking[] }) {
  const mostrarValor = ligado(config, 'mostrar_valor', true);
  const tres = linhas.slice(0, 3);
  const ordem = [tres[1], tres[0], tres[2]];
  const alturas = [230, 330, 170];
  const cores = ['#a9bcc3', '#e8c65a', '#c98a52'];
  const posicoes = [2, 1, 3];

  if (tres.length === 0) {
    return (
      <div>
        <Titulo>{texto(config, 'titulo', 'Pódio do mês')}</Titulo>
        <p style={{ color: CINZA, fontSize: 40 }}>Sem recebimento no mês ainda.</p>
      </div>
    );
  }

  return (
    <div>
      <Titulo>{texto(config, 'titulo', 'Pódio do mês')}</Titulo>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, justifyContent: 'center' }}>
        {ordem.map((pessoa, i) => {
          if (!pessoa) return <div key={i} style={{ flex: 1 }} />;
          return (
            <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
              {pessoa.foto_url
                ? <img src={pessoa.foto_url} alt=""
                       style={{ width: 132, height: 132, borderRadius: '50%', objectFit: 'cover',
                                margin: '0 auto 16px', border: `6px solid ${cores[i]}` }} />
                : <div style={{ width: 132, height: 132, borderRadius: '50%', margin: '0 auto 16px',
                                background: 'rgba(255,255,255,.10)', border: `6px solid ${cores[i]}` }} />}
              <p style={{ margin: '0 0 6px', color: '#ffffff', fontSize: 46, fontWeight: 700,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {primeiroNome(pessoa.nome)}
              </p>
              {mostrarValor && (
                <p style={{ margin: '0 0 14px', color: CINZA, fontSize: 34, fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums' }}>
                  {formatBRL(pessoa.total)}
                </p>
              )}
              <div style={{
                height: alturas[i], borderRadius: '14px 14px 0 0',
                background: `linear-gradient(180deg, ${cores[i]}, rgba(255,255,255,.06))`,
                display: 'grid', placeItems: 'center',
              }}>
                <span style={{ color: '#06141b', fontSize: 96, fontWeight: 900 }}>{posicoes[i]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FonteRanking({
  config, dados,
}: { config: Record<string, unknown>; dados: LinhaRanking[] | null }) {
  const linhas = Array.isArray(dados) ? dados : [];
  const mostrarValor = ligado(config, 'mostrar_valor', true);

  if (texto(config, 'modelo', 'lista') === 'podio') {
    return <RankingPodio config={config} linhas={linhas} />;
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 28px', color: '#7fd8e8', fontSize: 44, fontWeight: 700,
                   letterSpacing: '.06em', textTransform: 'uppercase' }}>
        {texto(config, 'titulo', 'Ranking do mês')}
      </h3>

      {linhas.length === 0 ? (
        <p style={{ margin: 0, color: '#5b7079', fontSize: 40 }}>Sem recebimento no mês ainda</p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex',
                     flexDirection: 'column', gap: 14 }}>
          {linhas.map((linha, i) => (
            <li
              key={`${linha.nome}-${i}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 24,
                // O primeiro lugar ganha destaque. Ranking sem pódio visível é
                // lista, e lista não motiva ninguém.
                background: i === 0 ? 'rgba(127,216,232,.14)' : 'rgba(255,255,255,.04)',
                border: i === 0 ? '2px solid rgba(127,216,232,.5)' : '2px solid transparent',
                borderRadius: 14, padding: '14px 24px',
              }}
            >
              <span style={{ color: i === 0 ? '#7fd8e8' : '#6d838c', fontSize: 46,
                             fontWeight: 800, width: 68, flexShrink: 0,
                             fontVariantNumeric: 'tabular-nums' }}>
                {i + 1}
              </span>

              {linha.foto_url && (
                <img src={linha.foto_url} alt="" style={{ width: 68, height: 68, borderRadius: '50%',
                                                          objectFit: 'cover', flexShrink: 0 }} />
              )}

              <span style={{ color: '#e8f1f3', fontSize: 46, fontWeight: 600, flex: 1,
                             overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {primeiroNome(linha.nome)}
              </span>

              {mostrarValor && (
                <span style={{ color: i === 0 ? '#7fd8e8' : '#a9bcc3', fontSize: 44, fontWeight: 700,
                               fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {formatBRL(linha.total)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/*
 * ── Os modelos de meta ───────────────────────────────────────────────────────
 *
 * Todos leem o MESMO pacote (`fn_tv_metricas_setor`). O que muda é qual número
 * ganha o palco. Ver `templates.ts` para as receitas.
 */

const CIANO = '#7fd8e8';
const VERDE = '#5fbe7e';
const CINZA = '#8fa3ab';

/**
 * Um número que ANDA até o valor novo, em vez de pular.
 *
 * É o pedido de "atualizar sem parecer loading": quando o analítico é
 * importado, a parede não deve piscar um número novo — ela deve subir até ele.
 * Uma contagem de 900ms é longa o bastante para o olho seguir e curta o
 * bastante para não atrasar a informação.
 *
 * `prefers-reduced-motion` corta a animação inteira: quem pediu menos movimento
 * recebe o valor final direto, e não uma versão mais lenta do mesmo efeito.
 */
function useNumeroSuave(alvo: number, duracaoMs = 900): number {
  const [valor, setValor] = useState(alvo);
  const de = useRef(alvo);

  useEffect(() => {
    const parado = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (parado || !Number.isFinite(alvo)) { de.current = alvo; setValor(alvo); return; }

    const inicio = performance.now();
    const partida = de.current;
    if (partida === alvo) return;

    let vivo = true;
    const passo = (agora: number) => {
      if (!vivo) return;
      const t = Math.min(1, (agora - inicio) / duracaoMs);
      // easeOutCubic: rápido no começo, assentando no fim. É o que faz o número
      // "chegar" em vez de parar de repente.
      const suave = 1 - Math.pow(1 - t, 3);
      setValor(partida + (alvo - partida) * suave);
      if (t < 1) requestAnimationFrame(passo);
      else de.current = alvo;
    };
    requestAnimationFrame(passo);
    return () => { vivo = false; de.current = alvo; };
  }, [alvo, duracaoMs]);

  return valor;
}

function Titulo({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <h3 style={{ margin: '0 0 20px', color: CIANO, fontSize: 44, fontWeight: 700,
                 letterSpacing: '.06em', textTransform: 'uppercase' }}>
      {children}
    </h3>
  );
}

function FonteMeta({
  config, dados,
}: { config: Record<string, unknown>; dados: DadosMeta | null }) {
  const modelo = texto(config, 'modelo', 'barra');
  const titulo = texto(config, 'titulo', '');

  switch (modelo) {
    case 'rosca':      return <MetaRosca      titulo={titulo} config={config} dados={dados} />;
    case 'projecao':   return <MetaProjecao   titulo={titulo} dados={dados} />;
    case 'diaria':     return <MetaDiaria     titulo={titulo} config={config} dados={dados} />;
    case 'ritmo':      return <MetaRitmo      titulo={titulo} dados={dados} />;
    case 'termometro': return <MetaTermometro titulo={titulo} dados={dados} />;
    case 'placar':     return <MetaPlacar     titulo={titulo} dados={dados} />;
    default:           return <MetaBarra      titulo={titulo} dados={dados} />;
  }
}

function MetaBarra({ titulo, dados }: { titulo: string; dados: DadosMeta | null }) {
  const { exibido, barra } = percentualDaMeta(dados);
  const bateu = exibido >= 100;
  const recebido = useNumeroSuave(dados?.realizado ?? 0);
  const pct = useNumeroSuave(barra);

  return (
    <div>
      <Titulo>{titulo || 'Meta do mês'}</Titulo>

      <p style={{ margin: '0 0 8px', color: '#ffffff', fontSize: 116, fontWeight: 800,
                  lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {formatBRL(recebido)}
      </p>

      <p style={{ margin: '0 0 28px', color: CINZA, fontSize: 40, fontWeight: 500 }}>
        de {formatBRL(dados?.alvo ?? 0)}
      </p>

      <div style={{ height: 34, borderRadius: 17, background: 'rgba(255,255,255,.09)',
                    overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 17,
                      background: bateu ? VERDE : CIANO }} />
      </div>

      <p style={{ margin: '20px 0 0', color: bateu ? VERDE : '#a9bcc3', fontSize: 52,
                  fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {exibido}%{bateu ? ' — meta batida' : ''}
      </p>
    </div>
  );
}

/**
 * A rosca.
 *
 * SVG e não um `conic-gradient`: o gradiente cônico não anima, e a rosca existe
 * justamente para fechar diante de quem está olhando. Com `stroke-dasharray` o
 * anel cresce junto com o número.
 */
function MetaRosca({
  titulo, config, dados,
}: { titulo: string; config: Record<string, unknown>; dados: DadosMeta | null }) {
  const { exibido, barra } = percentualDaMeta(dados);
  const bateu = exibido >= 100;
  const pct = useNumeroSuave(barra);
  const recebido = useNumeroSuave(dados?.realizado ?? 0);

  const raio = 42;
  const volta = 2 * Math.PI * raio;

  return (
    <div style={{ textAlign: 'center' }}>
      <Titulo>{titulo}</Titulo>
      <div style={{ position: 'relative' }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', display: 'block', overflow: 'visible' }}>
          {/* -90° põe o zero no topo; sem isso o anel começa às três horas. */}
          <g transform="rotate(-90 50 50)">
            <circle cx="50" cy="50" r={raio} fill="none"
                    stroke="rgba(255,255,255,.10)" strokeWidth="11" />
            <circle
              cx="50" cy="50" r={raio} fill="none"
              stroke={bateu ? VERDE : CIANO} strokeWidth="11" strokeLinecap="round"
              strokeDasharray={volta}
              strokeDashoffset={volta * (1 - pct / 100)}
            />
          </g>
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        }}>
          <div>
            <p style={{ margin: 0, color: bateu ? VERDE : '#ffffff', fontSize: 92, fontWeight: 800,
                        lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {exibido}%
            </p>
            {ligado(config, 'mostrar_valor', true) && (
              <p style={{ margin: '10px 0 0', color: CINZA, fontSize: 34, fontWeight: 600 }}>
                {formatBRL(recebido)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaProjecao({ titulo, dados }: { titulo: string; dados: DadosMeta | null }) {
  const alvo = Number(dados?.alvo) || 0;
  const projecao = Number(dados?.projecao) || 0;
  const suave = useNumeroSuave(projecao);
  const diferenca = projecao - alvo;
  const vaiBater = diferenca >= 0;
  const restantes = Number(dados?.dias_restantes) || 0;

  return (
    <div>
      <Titulo>{titulo || 'Projeção do mês'}</Titulo>
      <p style={{ margin: '0 0 10px', color: vaiBater ? VERDE : '#e8a33d', fontSize: 110,
                  fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {formatBRL(suave)}
      </p>
      <p style={{ margin: '0 0 24px', color: CINZA, fontSize: 38, fontWeight: 500 }}>
        no ritmo de hoje, contra a meta de {formatBRL(alvo)}
      </p>
      <p style={{ margin: 0, color: vaiBater ? VERDE : '#e8a33d', fontSize: 52, fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums' }}>
        {vaiBater ? '+' : '−'}{formatBRL(Math.abs(diferenca))}
        <span style={{ color: CINZA, fontSize: 34, fontWeight: 500 }}>
          {vaiBater ? ' acima da meta' : ' abaixo da meta'}
        </span>
      </p>
      {restantes > 0 && (
        <p style={{ margin: '14px 0 0', color: CINZA, fontSize: 32 }}>
          faltam {restantes} {restantes === 1 ? 'dia útil' : 'dias úteis'}
        </p>
      )}
    </div>
  );
}

function MetaDiaria({
  titulo, config, dados,
}: { titulo: string; config: Record<string, unknown>; dados: DadosMeta | null }) {
  const alvo = alvoDiario(config, Number(dados?.meta_diaria) || 0);
  const hoje = Number(dados?.realizado_hoje) || 0;
  const suave = useNumeroSuave(hoje);
  const pct = alvo > 0 ? Math.min(100, (hoje / alvo) * 100) : 0;
  const pctSuave = useNumeroSuave(pct);
  const bateu = alvo > 0 && hoje >= alvo;

  return (
    <div>
      <Titulo>{titulo || 'Meta de hoje'}</Titulo>
      <p style={{ margin: '0 0 8px', color: bateu ? VERDE : '#ffffff', fontSize: 108,
                  fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {formatBRL(suave)}
      </p>
      <p style={{ margin: '0 0 26px', color: CINZA, fontSize: 38, fontWeight: 500 }}>
        de {formatBRL(alvo)} hoje
        {config.origem === 'manual' && (
          <span style={{ color: '#e8a33d' }}> · desafio</span>
        )}
      </p>
      <div style={{ height: 28, borderRadius: 14, background: 'rgba(255,255,255,.09)',
                    overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pctSuave}%`, borderRadius: 14,
                      background: bateu ? VERDE : CIANO }} />
      </div>
      {bateu && (
        <p style={{ margin: '18px 0 0', color: VERDE, fontSize: 46, fontWeight: 800 }}>
          Meta do dia batida
        </p>
      )}
    </div>
  );
}

function MetaRitmo({ titulo, dados }: { titulo: string; dados: DadosMeta | null }) {
  const ritmo = Number(dados?.ritmo_necessario) || 0;
  const suave = useNumeroSuave(ritmo);
  const restantes = Number(dados?.dias_restantes) || 0;
  const acabou = restantes === 0;

  return (
    <div>
      <Titulo>{titulo || 'Precisamos por dia'}</Titulo>
      <p style={{ margin: '0 0 10px', color: acabou ? VERDE : '#ffffff', fontSize: 112,
                  fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {acabou ? formatBRL(0) : formatBRL(suave)}
      </p>
      <p style={{ margin: 0, color: CINZA, fontSize: 38, fontWeight: 500 }}>
        {acabou
          ? 'o mês fechou'
          : `por dia útil, nos ${restantes} que faltam`}
      </p>
      <p style={{ margin: '22px 0 0', color: CINZA, fontSize: 32 }}>
        faltam {formatBRL(Number(dados?.falta) || 0)} para a meta
      </p>
    </div>
  );
}

function MetaTermometro({ titulo, dados }: { titulo: string; dados: DadosMeta | null }) {
  const { exibido, barra } = percentualDaMeta(dados);
  const bateu = exibido >= 100;
  const pct = useNumeroSuave(barra);

  return (
    <div style={{ textAlign: 'center' }}>
      <Titulo>{titulo}</Titulo>
      {/* A coluna cresce DE BAIXO: `justifyContent: flex-end` faz o preenchimento
          encostar no fundo, que é como termômetro se lê. */}
      <div style={{
        height: 520, width: '100%', borderRadius: 999, background: 'rgba(255,255,255,.09)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        overflow: 'hidden', border: '4px solid rgba(255,255,255,.14)',
      }}>
        <div style={{
          height: `${pct}%`, borderRadius: 999,
          background: bateu ? VERDE : `linear-gradient(0deg, ${CIANO}, #b6ecf7)`,
        }} />
      </div>
      <p style={{ margin: '20px 0 0', color: bateu ? VERDE : '#ffffff', fontSize: 68,
                  fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {exibido}%
      </p>
    </div>
  );
}

function MetaPlacar({ titulo, dados }: { titulo: string; dados: DadosMeta | null }) {
  const recebido = useNumeroSuave(dados?.realizado ?? 0);
  const falta = useNumeroSuave(Number(dados?.falta) || 0);
  const bateu = (Number(dados?.falta) || 0) <= 0 && (Number(dados?.alvo) || 0) > 0;

  const celula = (rotulo: string, valor: string, cor: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ margin: '0 0 8px', color: CINZA, fontSize: 30, fontWeight: 600,
                  letterSpacing: '.08em', textTransform: 'uppercase' }}>{rotulo}</p>
      <p style={{ margin: 0, color: cor, fontSize: 62, fontWeight: 800, lineHeight: 1.05,
                  fontVariantNumeric: 'tabular-nums' }}>{valor}</p>
    </div>
  );

  return (
    <div>
      <Titulo>{titulo}</Titulo>
      <div style={{ display: 'flex', gap: 36, alignItems: 'flex-start' }}>
        {celula('Recebido', formatBRL(recebido), '#ffffff')}
        {celula('Meta', formatBRL(dados?.alvo ?? 0), CIANO)}
        {celula(bateu ? 'Passou' : 'Falta',
                formatBRL(bateu ? Math.abs(Number(dados?.realizado) - Number(dados?.alvo)) : falta),
                bateu ? VERDE : '#e8a33d')}
      </div>
    </div>
  );
}
