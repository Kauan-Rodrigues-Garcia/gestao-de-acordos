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
import { ninguemOlhando, ouvirVolta } from '@/lib/atencao';
import { ESCUTAS_CANAL_PESSOAL, topicoPessoal } from '@/lib/canalPessoal';
import { minhasPartidas } from '../servico';
import type { MinhaPartida } from '../tipos';

const CartelasDoJogador = lazy(() => import('./CartelasDoJogador'));

/**
 * A releitura de segurança, com alguém olhando. O convite chega pelo sinal
 * `bingo` do canal pessoal e a reconexão relê; isto só cobre o aviso perdido.
 * Era 90 s e qualquer aba à vista (40 mil leituras por dia na auditoria de RAM
 * de 09/11/2026); agora 3 min, e janela atrás do ERP não conta.
 */
const RELER_MS = 3 * 60_000;
/** A volta (foco, aba, revisita de 5 min) e o relógio podem cair juntos: uma leitura basta. */
const RELER_MINIMO_MS = 60_000;

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
  // dormindo), a cartela aparece quando a pessoa volta a olhar ou na volta
  // seguinte do relógio. Ninguém olhando (aba escondida, janela de lado), não pergunta.
  useEffect(() => {
    if (!perfilId) return;
    let ultima = Date.now();
    const talvez = () => {
      if (Date.now() - ultima < RELER_MINIMO_MS) return;
      ultima = Date.now();
      ler();
    };
    const t = setInterval(() => { if (!ninguemOlhando()) talvez(); }, RELER_MS);
    // A volta paga sem perguntar pela atenção: de lado, a revisita de 5 min
    // chega com ninguém olhando (`lib/atencao.ts`).
    const pararVolta = ouvirVolta(talvez);
    return () => {
      clearInterval(t);
      pararVolta();
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
