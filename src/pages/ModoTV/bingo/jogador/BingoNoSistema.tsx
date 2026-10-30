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

/** A releitura de segurança, com a aba à vista. */
const RELER_MS = 90_000;
/** Foco e visibilidade disparam juntos: uma leitura basta. */
const RELER_MINIMO_MS = 15_000;

export function BingoNoSistema({ perfilId, somenteVer = false }: {
  perfilId: string | null | undefined;
  /** «Entrar como»: a cartela aparece, mas não marca nem grita pela pessoa. */
  somenteVer?: boolean;
}) {
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

  // A rede de segurança do convite: se o aviso se perder (canal caído, aba
  // dormindo), a cartela aparece quando a aba volta à vista ou na volta
  // seguinte do relógio. Aba escondida não pergunta.
  useEffect(() => {
    if (!perfilId) return;
    let ultima = Date.now();
    const talvez = () => {
      if (document.visibilityState !== 'visible' || Date.now() - ultima < RELER_MINIMO_MS) return;
      ultima = Date.now();
      ler();
    };
    const t = setInterval(talvez, RELER_MS);
    document.addEventListener('visibilitychange', talvez);
    window.addEventListener('focus', talvez);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', talvez);
      window.removeEventListener('focus', talvez);
    };
  }, [perfilId, ler]);

  const sumir = useCallback((id: string) => setPartidas(ps => ps.filter(p => p.partida.id !== id)), []);

  if (!perfilId || !partidas.length) return null;
  return (
    <Suspense fallback={null}>
      <CartelasDoJogador partidas={partidas} perfilId={perfilId} somenteVer={somenteVer} aoSumir={sumir} />
    </Suspense>
  );
}
