/**
 * Rodizio.tsx — passa as telas do painel, uma de cada vez, em tela cheia.
 *
 * O MESMO componente roda na TV e na prévia da montagem. O relógio do rodízio
 * é local: a TV não pergunta ao banco qual tela mostrar, só quais existem.
 *
 * Só a tela da vez fica montada (mais a que está saindo, durante o fade). Um
 * vídeo fora da vez não fica tocando escondido.
 */
import { useEffect, useMemo, useState } from 'react';
import type { NumerosTv, Painel } from './tipos';
import { midiaSegura, opcao, segundosDaTela } from './templates';
import { montarVisao } from './numeros';
import { PalcoTv, TelaTv } from './TelaTv';

const FADE_MS = 700;
const BASE_SUPABASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';

export interface PropsRodizio {
  painel: Painel;
  numeros: NumerosTv | null;
  /** Prévia: fixa numa tela em vez de rodar. */
  fixarEm?: number | null;
  /** Prévia: não roda sozinho. */
  parado?: boolean;
  style?: React.CSSProperties;
}

export function Rodizio({ painel, numeros, fixarEm = null, parado = false, style }: PropsRodizio) {
  const total = painel.telas.length;
  const [indice, setIndice] = useState(0);
  const [saindo, setSaindo] = useState<number | null>(null);

  // A prévia escolhe a tela que quer ver; na TV, quem manda é a tela fixa do painel.
  const indiceFixo = painel.tela_fixa ? painel.telas.findIndex(t => t.id === painel.tela_fixa) : -1;
  const fixo = fixarEm ?? (indiceFixo >= 0 ? indiceFixo : null);
  const atual = Math.min(fixo ?? indice, Math.max(0, total - 1));
  const segundos = painel.telas[atual] ? segundosDaTela(painel.telas[atual], painel.segundos_por_tela) : 20;

  // Soltou a tela fixa: o rodízio continua dela, e não de onde tinha parado antes.
  useEffect(() => {
    if (indiceFixo >= 0) setIndice(indiceFixo);
  }, [indiceFixo]);

  useEffect(() => {
    if (parado || fixo != null || total <= 1) return;
    const t = setTimeout(() => {
      setSaindo(atual);
      setIndice((atual + 1) % total);
    }, segundos * 1000);
    return () => clearTimeout(t);
  }, [atual, total, parado, fixo, segundos]);

  useEffect(() => {
    if (saindo == null) return;
    const t = setTimeout(() => setSaindo(null), FADE_MS);
    return () => clearTimeout(t);
  }, [saindo]);

  const visaoPorTela = useMemo(() => painel.telas.map(t => (
    numeros ? montarVisao(numeros, painel.unidade, t.template === 'hoje' ? opcao<number | null>(t, 'alvo_manual') : null) : null
  )), [painel.telas, painel.unidade, numeros]);

  if (!total) {
    return (
      <PalcoTv tema={painel.tema} style={style}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, opacity: .6 }}>
          Nenhuma tela no painel ainda.
        </div>
      </PalcoTv>
    );
  }

  const desenhar = (i: number, camada: 'entra' | 'sai') => {
    const tela = painel.telas[i];
    if (!tela) return null;
    return (
      <div
        key={`${camada}-${tela.id}`}
        style={{
          position: 'absolute', inset: 0,
          animation: `tv2-${camada} ${FADE_MS}ms ease forwards`,
          pointerEvents: 'none',
        }}
      >
        <TelaTv
          tela={tela}
          tema={painel.tema}
          visao={visaoPorTela[i]}
          midiaUrl={midiaSegura(opcao<string>(tela, 'url'), BASE_SUPABASE)}
          posicao={fixarEm == null && fixo != null ? undefined : { atual: i, total }}
          atualizadoEm={numeros?.calculado_em}
          mes={numeros?.mes}
        />
      </div>
    );
  };

  return (
    <PalcoTv tema={painel.tema} style={style}>
      {desenhar(atual, 'entra')}
      {saindo != null && saindo !== atual && desenhar(saindo, 'sai')}
      <style>{`
        @keyframes tv2-entra { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tv2-sai   { from { opacity: 1; } to { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes tv2-entra { from { opacity: 1; } to { opacity: 1; } }
        }
      `}</style>
    </PalcoTv>
  );
}
