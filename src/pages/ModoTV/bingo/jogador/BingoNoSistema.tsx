/**
 * BingoNoSistema.tsx — a porta do Bingo na tela de todo mundo (no `Layout`).
 *
 * Leve de propósito: uma leitura ao abrir o sistema (`fn_bingo_minhas`) e o
 * convite pelo canal pessoal `chat:<pessoa>`, que já está aberto para o chat.
 * A cartela — com os temas, as animações e o canal da partida — só é baixada
 * quando a pessoa está numa partida aberta.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { assinarTabela } from '@/lib/realtime';
import { ESCUTAS_CANAL_PESSOAL, topicoPessoal } from '@/lib/canalPessoal';
import { minhasPartidas } from '../servico';
import type { MinhaPartida } from '../tipos';

const CartelasDoJogador = lazy(() => import('./CartelasDoJogador'));

export function BingoNoSistema({ perfilId }: { perfilId: string | null | undefined }) {
  const [partidas, setPartidas] = useState<MinhaPartida[]>([]);

  const ler = useCallback(() => {
    // Sem a migration (ou sem rede), fica quieto: o sistema segue sem bingo.
    minhasPartidas().then(setPartidas, () => {});
  }, []);

  useEffect(() => {
    if (!perfilId) { setPartidas([]); return; }
    ler();
    return assinarTabela(
      { topico: topicoPessoal(perfilId), escutas: ESCUTAS_CANAL_PESSOAL },
      {
        onSinal: (_payload, sinal) => { if (sinal === 'bingo') ler(); },
        onReconectado: ler,
      },
    );
  }, [perfilId, ler]);

  const sumir = useCallback((id: string) => setPartidas(ps => ps.filter(p => p.partida.id !== id)), []);

  if (!perfilId || !partidas.length) return null;
  return (
    <Suspense fallback={null}>
      <CartelasDoJogador partidas={partidas} perfilId={perfilId} aoSumir={sumir} />
    </Suspense>
  );
}
