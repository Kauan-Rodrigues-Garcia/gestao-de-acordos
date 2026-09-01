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
  texto,
  numero,
  ligado,
  type Fonte,
  type LinhaRanking,
  type DadosMeta,
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
}

export function Palco({
  fontes, aviso, selecionadaId, onSelecionar, onMoverFonte,
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
      onPointerMove={arrastando ? e => aoArrastar(e, false) : undefined}
      onPointerUp={arrastando ? e => { aoArrastar(e, true); setArrastando(null); } : undefined}
      // Ponteiro saiu da caixa com o botão apertado: grava onde parou em vez de
      // deixar a fonte "presa" ao cursor para sempre.
      onPointerLeave={arrastando ? e => { aoArrastar(e, true); setArrastando(null); } : undefined}
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
    default:        return null;
  }
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

function FonteRanking({
  config, dados,
}: { config: Record<string, unknown>; dados: LinhaRanking[] | null }) {
  const linhas = Array.isArray(dados) ? dados : [];
  const mostrarValor = ligado(config, 'mostrar_valor', true);

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

function FonteMeta({
  config, dados,
}: { config: Record<string, unknown>; dados: DadosMeta | null }) {
  const { exibido, barra } = percentualDaMeta(dados);
  const bateu = exibido >= 100;

  return (
    <div>
      <h3 style={{ margin: '0 0 20px', color: '#7fd8e8', fontSize: 44, fontWeight: 700,
                   letterSpacing: '.06em', textTransform: 'uppercase' }}>
        {texto(config, 'titulo', 'Meta do mês')}
      </h3>

      <p style={{ margin: '0 0 8px', color: '#ffffff', fontSize: 116, fontWeight: 800,
                  lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {formatBRL(dados?.realizado ?? 0)}
      </p>

      <p style={{ margin: '0 0 28px', color: '#8fa3ab', fontSize: 40, fontWeight: 500 }}>
        de {formatBRL(dados?.alvo ?? 0)}
      </p>

      <div style={{ height: 34, borderRadius: 17, background: 'rgba(255,255,255,.09)',
                    overflow: 'hidden' }}>
        <div
          style={{
            height: '100%', width: `${barra}%`, borderRadius: 17,
            background: bateu ? '#5fbe7e' : '#7fd8e8',
            transition: 'width .6s ease',
          }}
        />
      </div>

      <p style={{ margin: '20px 0 0', color: bateu ? '#5fbe7e' : '#a9bcc3', fontSize: 52,
                  fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {exibido}%{bateu ? ' — meta batida' : ''}
      </p>
    </div>
  );
}
