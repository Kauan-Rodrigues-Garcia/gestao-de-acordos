/**
 * Abertura.tsx — o zero da revelação: os balões estouram um atrás do outro e
 * a tela do Gestão desmancha como a Coisa (o pedido de 27/10): de onde cada
 * balão estourou para fora, a borda queima e cada pedacinho sobe em lasca até
 * virar cinza. Atrás dela está o palco de Derry, com a chuva: a Coisa vem
 * antes do mural.
 *
 * Desde 29/10/2026 os balões chegam ANTES, na contagem, para quem participou
 * (`BaloesDaRevelacao.tsx`): a abertura monta com eles já no lugar e cheios, o
 * «hello» já tocando e o retrato já tirado, e eles estouram no zero.
 *
 * Quem chega depois (a aba estava escondida no zero), do jeito de antes:
 *
 *   0,0 s   os balões sobem de baixo da tela, depressa, cada um no seu tempo,
 *           e boiam onde pararam; o «hello»; o retrato da tela
 *   2,0 s   enchem e tremem
 *   2,9 s   (ou quando o retrato fica pronto) estouram em sequência
 *   ~6 s    acabou: só o palco de Derry (`coisa/ACoisa.tsx`)
 *
 * O bueiro e os balões são desta camada e ficam fora do retrato
 * (`data-portal-fora`). Os tempos dividem pela velocidade do mural (o painel
 * de teste). Pular (o X ao lado do volume, ou o Esc, com a confirmação) vai
 * direto ao mural (`ControleDeSom.tsx`).
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useVelocidadeDoMural } from './estado';
import { TelaQueDesmancha } from './TelaQueDesmancha';
import { cortina, fotografar } from './fotografar';
import type { Pixels } from './desmanche';
import { Bueiro } from './Bueiro';
import { BalaoNaTela } from './BaloesDaRevelacao';
import { QUANTOS, QUANTOS_LEVE, SUBIDA_RAPIDA_S, chegaramAgora, fotoAntecipada, montarBaloes, type EtapaDoBalao } from './revelacao';
import { prepararSonsDaCoisa, tocarSomDaCoisa } from './coisa/trilha';
import { sorteador } from './acaso';

const SUBIDA_MS = 2000;
const ESTOURO_MS = 2900;
/** Quanto o estouro ainda espera o retrato da tela, depois da hora dele. */
const FOLGA_DO_RETRATO_MS = 600;

export function Abertura({ aoDesmanchar, aoTerminar, leve }: {
  /** O retrato está por cima: o palco da Coisa pode montar embaixo. */
  aoDesmanchar: () => void;
  aoTerminar: () => void;
  leve: boolean;
}) {
  const v = useVelocidadeDoMural();
  const [foto, setFoto] = useState<Pixels | null>(null);
  // Os balões já chegaram na contagem? Então já estão cheios, no lugar.
  const [chegaram] = useState(chegaramAgora);
  const [etapa, setEtapa] = useState<EtapaDoBalao>(chegaram ? 'cheio' : 'voando');
  const baloes = useMemo(() => montarBaloes(leve ? QUANTOS_LEVE : QUANTOS), [leve]);
  // Do jeito de antes, eles entram juntos (cada um com um tico de atraso).
  const entradas = useMemo(() => {
    const acaso = sorteador(31);
    return baloes.map(() => acaso() * 0.7);
  }, [baloes]);

  useEffect(() => {
    let vivo = true;
    prepararSonsDaCoisa();
    const ts: number[] = [];
    if (!chegaram) {
      // O «hello» no bueiro; o golpe da música (2,75 s do trecho) cai no estouro.
      tocarSomDaCoisa('ola', v);
      ts.push(window.setTimeout(() => setEtapa('enchendo'), SUBIDA_MS / v));
    }
    // O estouro não espera o retrato além da conta: no Gestão de verdade ele
    // pode levar segundos (ou falhar), e aí desmancha a cortina escura no lugar.
    const pedido = (chegaram && fotoAntecipada()) || fotografar(document.body);
    const esperaMs = chegaram ? 0 : ESTOURO_MS / v;
    const retrato = Promise.race([
      pedido,
      new Promise<Pixels>(ok => window.setTimeout(() => ok(cortina()), esperaMs + FOLGA_DO_RETRATO_MS)),
    ]);
    const espera = new Promise(ok => window.setTimeout(ok, esperaMs));
    Promise.all([retrato, espera]).then(([pixels]) => {
      if (!vivo) return;
      setFoto(pixels);
      setEtapa('estourou');
      // Três estouros bastam para a fileira inteira (14 juntos viram chiado).
      [0, 190, 400].forEach((ms, i) => ts.push(window.setTimeout(() => { if (vivo) tocarSomDaCoisa('balao', v, 0.75 - i * 0.15); }, ms / v)));
      aoDesmanchar();
    });
    return () => { vivo = false; ts.forEach(t => window.clearTimeout(t)); };
    // A abertura é uma só: mudar a velocidade no meio não recomeça.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tela desmancha a partir de cada balão.
  const origens = useMemo(() => baloes.map(b => b.para), [baloes]);
  const estilo = { ['--v' as string]: v } as CSSProperties;

  return (
    <div className={`portal-abertura${leve ? ' portal-leve' : ''}`} style={estilo} role="dialog" aria-label="O mural de outubro está abrindo" data-portal-fora data-portal-anima>
      {foto && (
        <TelaQueDesmancha foto={foto} origens={origens} duracaoS={3.4} leve={leve} semente={1958} aoTerminar={aoTerminar} />
      )}

      {etapa !== 'estourou' && <div className="portal-alto-bueiro"><Bueiro acesos seguir={false} tremendo={!leve} leve={leve} /></div>}

      {baloes.map((b, i) => (
        <BalaoNaTela key={i} b={b} etapa={etapa} chegaS={chegaram ? -60 : entradas[i]} sobeS={chegaram ? b.sobe : SUBIDA_RAPIDA_S} leve={leve} />
      ))}
      {etapa === 'estourou' && <div className="portal-clarao portal-clarao-vermelho" aria-hidden />}
    </div>
  );
}
