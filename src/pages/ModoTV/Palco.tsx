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
}

export function Palco({ fontes, aviso, selecionadaId, onSelecionar }: PalcoProps) {
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0);

  /*
   * `ResizeObserver` e não `window.resize`: a prévia da mesa muda de tamanho
   * quando o painel lateral abre, e nisso a janela não muda em nada.
   */
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala(escalaDoPalco(el.clientWidth, el.clientHeight));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={caixa}
      className="relative w-full h-full overflow-hidden bg-[#0a0f13]"
      style={{ display: 'grid', placeItems: 'center' }}
    >
      <div
        style={{
          width: PALCO_LARGURA,
          height: PALCO_ALTURA,
          transform: `scale(${escala})`,
          transformOrigin: 'center',
          position: 'relative',
          flexShrink: 0,
          background: '#0a0f13',
          // Sem a escala medida ainda: não pisca o palco em tamanho natural.
          visibility: escala > 0 ? 'visible' : 'hidden',
        }}
      >
        {ordenarPorCamada(fontes).map(fonte => (
          <div
            key={fonte.id}
            style={estiloDaFonte(fonte)}
            onClick={onSelecionar ? () => onSelecionar(fonte.id) : undefined}
            className={
              selecionadaId === fonte.id
                ? 'outline outline-4 outline-dashed outline-sky-400/80'
                : undefined
            }
          >
            <DesenhoDaFonte fonte={fonte} />
          </div>
        ))}

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
    default:        return null;
  }
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
