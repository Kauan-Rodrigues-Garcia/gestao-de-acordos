/**
 * EscolhaAparencia — os três sistemas, lado a lado, para escolher um.
 * ─────────────────────────────────────────────────────────────────────────────
 * Cada cartão é uma amostra do sistema que representa: usa as cores, a
 * tipografia, a forma da janela e a posição da barra de tarefas DAQUELE tema,
 * não as do tema ativo. A pessoa vê a diferença antes de escolher, em vez de
 * ler três nomes.
 *
 * Serve em dois lugares: na inicialização da primeira visita e no programa
 * Configurações. Por isso não sabe nada de roteiro — só avisa qual foi clicado.
 *
 * Os estilos da amostra são `style` em linha de propósito: são os tokens de um
 * tema que NÃO é o ativo, então as variáveis `--creator-*` da raiz não servem.
 */
import type { CSSProperties } from 'react';
import { LISTA_TEMAS, type TemaCreators, type TokensTema } from '../theme/themes';

/** A forma da janela em miniatura, por token de forma. */
function estiloDaJanela(t: TokensTema): CSSProperties {
  const base: CSSProperties = {
    background: t.cores.fundo,
    border: `${t.bordaLargura} solid ${t.cores.borda}`,
  };
  switch (t.forma) {
    case 'chanfro':
      return {
        ...base,
        borderColor: t.cores.primaria,
        clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))',
      };
    case 'bloco':
      return { ...base, boxShadow: '5px 5px 0 rgba(0,0,0,.65)' };
    case 'relevo':
      return {
        ...base,
        borderColor: `${t.cores.superficie} ${t.cores.textoSuave} ${t.cores.textoSuave} ${t.cores.superficie}`,
      };
  }
}

function Cartao({
  t, atual, aoEscolher,
}: {
  t: TokensTema;
  atual: boolean;
  aoEscolher: (id: TemaCreators) => void;
}) {
  return (
    <button
      type="button"
      className="creators-lab__aparencia"
      onClick={() => aoEscolher(t.id)}
      aria-pressed={atual}
      aria-label={`${t.nome}: ${t.descricao}`}
      style={{ '--creator-aparencia-contorno': t.cores.primaria } as CSSProperties}
    >
      <span
        className="creators-lab__aparencia-amostra"
        style={{ background: t.cores.papel }}
        aria-hidden="true"
      >
        <span className="creators-lab__aparencia-janela" style={estiloDaJanela(t)}>
          <span
            style={{
              height: 12,
              flex: 'none',
              background: t.cores.tituloFundo,
              display: 'flex',
              alignItems: 'center',
              justifyContent: t.janela.ladoBotoes === 'direita' ? 'flex-end' : 'flex-start',
              gap: 2,
              padding: '0 3px',
            }}
          >
            {[0, 1, 2].map(i => (
              <i key={i} style={{ width: 5, height: 5, background: t.cores.tituloTexto, display: 'block' }} />
            ))}
          </span>
          <span style={{ flex: 1, padding: 6, display: 'grid', gap: 4, alignContent: 'start' }}>
            <i style={{ height: 5, width: '70%', background: t.cores.primaria, display: 'block' }} />
            <i style={{ height: 4, width: '90%', background: t.cores.textoSuave, display: 'block', opacity: .7 }} />
            <i style={{ height: 4, width: '55%', background: t.cores.textoSuave, display: 'block', opacity: .7 }} />
          </span>
        </span>
        <span
          className="creators-lab__aparencia-barra"
          style={{
            [t.barra.posicao === 'topo' ? 'top' : 'bottom']: 0,
            background: t.cores.barraFundo,
            borderTop: t.barra.posicao === 'base' ? `2px solid ${t.cores.primaria}` : undefined,
            borderBottom: t.barra.posicao === 'topo' ? `1px solid ${t.cores.primaria}` : undefined,
          }}
        />
      </span>

      <span>
        <span
          style={{
            display: 'block',
            fontFamily: t.fontes.display,
            fontSize: '1.15rem',
            fontWeight: 700,
            color: 'var(--creator-escolha-titulo, #fff)',
          }}
        >
          {t.nome}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 2,
            fontFamily: t.fontes.corpo,
            fontSize: '.74rem',
            lineHeight: 1.45,
            color: 'var(--creator-escolha-texto, rgba(255,255,255,.6))',
          }}
        >
          {t.descricao}
        </span>
      </span>
    </button>
  );
}

export function EscolhaAparencia({
  atual, aoEscolher,
}: {
  /** O tema em uso, para marcar o cartão. `null` quando ainda não há escolha. */
  atual: TemaCreators | null;
  aoEscolher: (id: TemaCreators) => void;
}) {
  return (
    <div className="creators-lab__aparencias">
      {LISTA_TEMAS.map(t => (
        <Cartao key={t.id} t={t} atual={atual === t.id} aoEscolher={aoEscolher} />
      ))}
    </div>
  );
}
