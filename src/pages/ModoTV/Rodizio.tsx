/**
 * Rodizio.tsx — passa as telas do painel, uma de cada vez, em tela cheia.
 *
 * O MESMO componente roda na TV e na prévia da montagem, e os dois chegam à
 * MESMA tela no mesmo instante: o rodízio é contado pelo relógio do banco a
 * partir da versão do painel (`relogio.ts`), e não de quando a página abriu.
 *
 * Só a tela da vez fica montada (mais a que está saindo, durante o fade). Um
 * vídeo fora da vez não fica tocando escondido.
 */
import { useEffect, useMemo, useState } from 'react';
import type { NumerosTv, Painel } from './tipos';
import { alvoDoDiaProprio, midiaSegura, opcao } from './templates';
import { montarVisao } from './numeros';
import { telaNoInstante } from './relogio';
import { PalcoTv, TelaTv } from './TelaTv';

const FADE_MS = 900;
const BASE_SUPABASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';

export interface PropsRodizio {
  painel: Painel;
  numeros: NumerosTv | null;
  /** Prévia da edição: fixa numa tela escolhida, ignorando a tela fixa e o relógio. */
  fixarEm?: number | null;
  /** Vitrine: não roda. */
  parado?: boolean;
  /** `Date.now()` + isto = hora do banco. Sem ela, o relógio local. */
  diferencaMs?: number;
  /** Avisa qual tela entrou — a montagem destaca a mesma. */
  aoTrocar?: (indice: number) => void;
  style?: React.CSSProperties;
}

export function Rodizio({ painel, numeros, fixarEm = null, parado = false, diferencaMs = 0, aoTrocar, style }: PropsRodizio) {
  const total = painel.telas.length;
  // Sem versão (demonstração, vitrine), o rodízio conta de quando montou.
  const [montouEm] = useState(() => Date.now());
  const inicioMs = painel.atualizado_em ? Date.parse(painel.atualizado_em) : montouEm;

  const indiceFixo = painel.tela_fixa ? painel.telas.findIndex(t => t.id === painel.tela_fixa) : -1;
  const fixo = fixarEm ?? (indiceFixo >= 0 ? indiceFixo : null);
  const rodando = fixo == null && !parado && total > 1;

  const calcular = () => telaNoInstante(painel.telas, painel.segundos_por_tela, inicioMs, Date.now() + diferencaMs);
  const [doRelogio, setDoRelogio] = useState(() => calcular().indice);
  const [saindo, setSaindo] = useState<number | null>(null);

  // A chave das durações: mudou o tempo de uma tela, o relógio recalcula.
  const duracoes = painel.telas.map(t => t.segundos ?? '').join(',');

  useEffect(() => {
    if (!rodando) return;
    let t: ReturnType<typeof setTimeout>;
    const agendar = () => {
      const { indice, restanteMs } = calcular();
      setDoRelogio(indice);
      t = setTimeout(agendar, Math.max(200, restanteMs + 30));
    };
    agendar();
    return () => clearTimeout(t);
    // `calcular` lê só o que está nas dependências abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rodando, inicioMs, diferencaMs, painel.segundos_por_tela, duracoes, total]);

  const atual = Math.min(fixo ?? (rodando ? doRelogio : 0), Math.max(0, total - 1));

  // Toda troca — relógio, fixar, soltar — sai com o fade.
  const [ultimo, setUltimo] = useState(atual);
  useEffect(() => {
    if (ultimo !== atual) { setSaindo(ultimo); setUltimo(atual); }
  }, [atual, ultimo]);

  useEffect(() => { aoTrocar?.(atual); }, [atual, aoTrocar]);

  useEffect(() => {
    if (saindo == null) return;
    const t = setTimeout(() => setSaindo(null), FADE_MS);
    return () => clearTimeout(t);
  }, [saindo]);

  const visaoPorTela = useMemo(() => painel.telas.map(t => (
    numeros ? montarVisao(numeros, painel.unidade, alvoDoDiaProprio(t)) : null
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
        @keyframes tv2-entra { from { opacity: 0; transform: scale(1.015); } to { opacity: 1; transform: none; } }
        @keyframes tv2-sai   { from { opacity: 1; } to { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes tv2-entra { from { opacity: 1; } to { opacity: 1; } }
        }
      `}</style>
    </PalcoTv>
  );
}
