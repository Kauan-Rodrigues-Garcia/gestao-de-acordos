/**
 * BaloesDaRevelacao.tsx — os balões vermelhos da revelação, os mesmos do fim
 * da contagem à abertura (pedido de 29/10/2026: «em vez dos balões aparecerem
 * todos de uma vez quando encerrar a contagem, assim que for acabando a
 * contagem os balões já vão aparecendo na tela e se juntando no local certo
 * deles»):
 *
 *   T − 30 s … T − 6 s   (só para quem participou) um a um, cada balão sobe de
 *                        baixo da tela, como os outros, e para no lugar dele, boiando:
 *                        sobe e desce e balança com o fio junto
 *   T − 8 s              o retrato da tela já é tirado (`anteciparFoto`):
 *                        no zero a tela desmancha sem esperar
 *   T − 2,75 s           o «hello» (`ola`): o golpe da música dele cai no zero
 *   T − 0,9 s            enchem aos trancos, tremendo
 *   T                    a abertura monta com eles já cheios (`chegaram`) e
 *                        estouram em sequência: amassa, o clarão, o anel, os
 *                        pedaços de borracha voando e caindo, o fio caindo
 *
 * Quem chega depois (a aba estava escondida) ganha a abertura do jeito de
 * antes: os balões entram juntos, o «hello», e estouram em 2,9 s.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { BALAO, PALETA_DO_BALAO } from './coisa/arte';
import { Pixel } from './Bueiro';
import { tocarSomDaCoisa } from './coisa/trilha';
import { useVelocidadeDoMural } from './estado';
import {
  CACOS, CHEGADA_S, ENCHE_ANTES_MS, ENTRE_ESTOUROS_MS, FOTO_ANTES_MS, OLA_ANTES_MS, QUANTOS, QUANTOS_LEVE,
  anteciparFoto, marcarChegada, montarBaloes, type BalaoDaRevelacao, type EtapaDoBalao,
} from './revelacao';

/** As faíscas do estouro: pontinhos que saem rápido do meio (no lugar do clarão branco, até 30/10). */
const FAISCAS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  const r = i % 2 ? 26 : 38;
  return [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)] as const;
});

/**
 * Um balão: sobe de baixo da tela até o lugar dele, boiando com o fio, enche
 * e estoura. `chegaS`: quando começa a subir (negativo: já está subindo, ou já
 * chegou); `sobeS`: quanto leva subindo (o dele, se não vier).
 */
export function BalaoNaTela({ b, etapa, chegaS, sobeS = b.sobe, leve }: {
  b: BalaoDaRevelacao; etapa: EtapaDoBalao; chegaS: number; sobeS?: number; leve: boolean;
}) {
  // Onde fica o nó do balão, em relação ao lugar dele (o corpo sobe 30% da altura).
  const alto = 15 * b.tam, fio = 54;
  const no = alto - 0.3 * (alto + fio);
  return (
    <div
      className={`portal-rev-balao portal-rev-${etapa}`}
      style={{
        left: `${b.para[0] * 100}vw`,
        top: `${b.para[1] * 100}vh`,
        // De baixo da tela (com o fio inteiro escondido) até o lugar.
        ['--de-baixo' as string]: `calc(${(1 - b.para[1]) * 100}vh + ${alto + fio + 40}px)`,
        ['--deriva' as string]: `${b.deriva}px`,
        ['--sobe' as string]: `${sobeS}s`,
        ['--chega' as string]: `${chegaS}s`,
        ['--fase' as string]: `${-b.fase}s`,
        ['--ritmo' as string]: b.ritmo,
        ['--estoura' as string]: `${(b.vez * ENTRE_ESTOUROS_MS) / 1000}s`,
      } as CSSProperties}
      aria-hidden
    >
      <div className="portal-rev-corpo">
        <div className="portal-rev-flutua">
          <Pixel linhas={BALAO} paleta={PALETA_DO_BALAO} tam={b.tam} />
          <span className="portal-balao-fio" />
        </div>
      </div>
      {etapa === 'estourou' && (
        <div className="portal-rev-estouro">
          {FAISCAS.map(([x, y], k) => (
            <span key={`f${k}`} className="portal-rev-faisca" style={{ ['--fx' as string]: `${x}px`, ['--fy' as string]: `${y}px` } as CSSProperties} />
          ))}
          <span className="portal-rev-anel" />
          {(leve ? CACOS.slice(0, 6) : CACOS).map((c, k) => (
            <span
              key={k}
              className="portal-rev-caco"
              style={{ width: c.l, height: Math.max(4, c.l - 3), ['--cx' as string]: `${c.x}px`, ['--cy' as string]: `${c.y}px`, ['--gira' as string]: `${c.gira}deg` } as CSSProperties}
            />
          ))}
          <span className="portal-rev-fio-cai" style={{ top: no }} />
        </div>
      )}
    </div>
  );
}

/**
 * Os balões chegando no fim da contagem (só para quem participou), com o
 * retrato, o «hello» e o encher nos tempos de `revelacao.ts`. `faltaMs`: quanto
 * falta para o zero quando monta.
 */
export function BaloesChegando({ faltaMs, leve }: { faltaMs: number; leve: boolean }) {
  const v = useVelocidadeDoMural();
  const baloes = useMemo(() => montarBaloes(leve ? QUANTOS_LEVE : QUANTOS), [leve]);
  // A hora do zero, fixada na montagem (o `faltaMs` de fora anda de segundo em segundo).
  const [zero] = useState(() => performance.now() + faltaMs);
  const [montou] = useState(() => performance.now());
  const [etapa, setEtapa] = useState<EtapaDoBalao>(() => (faltaMs <= ENCHE_ANTES_MS ? 'cheio' : 'voando'));

  useEffect(() => {
    const falta = zero - performance.now();
    const ts: number[] = [];
    const quando = (antes: number, fazer: () => void) => {
      if (falta > antes) ts.push(window.setTimeout(fazer, falta - antes));
    };
    quando(FOTO_ANTES_MS, anteciparFoto);
    quando(OLA_ANTES_MS, () => tocarSomDaCoisa('ola', v));
    quando(ENCHE_ANTES_MS, () => { setEtapa('enchendo'); marcarChegada(); });
    // Montou depois do «hello» (recarregou a página no fim): a abertura entra do jeito de antes.
    return () => ts.forEach(t => window.clearTimeout(t));
    // Uma vez só: o zero é fixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // O atraso do voo de cada um, contado da montagem.
  const desde = (montou - (zero - CHEGADA_S * 1000)) / 1000;
  return (
    <div className="portal-baloes-chegando" style={{ ['--v' as string]: v } as CSSProperties} data-portal-fora data-portal-anima aria-hidden>
      {baloes.map((b, i) => (
        <BalaoNaTela key={i} b={b} etapa={etapa} chegaS={CHEGADA_S - b.chega - b.sobe - desde} leve={leve} />
      ))}
    </div>
  );
}
