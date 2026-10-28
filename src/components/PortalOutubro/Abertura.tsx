/**
 * Abertura.tsx — 16h de sexta: a Coisa sorri no bueiro, os balões entram de
 * todos os cantos da tela (pedido de 28/10/2026: «vários balões saindo de
 * todos os cantos, porém limitados»), param espalhados, enchem tremendo e
 * estouram um atrás do outro — e a tela do Gestão desmancha como a Coisa (o
 * pedido de 27/10): de onde cada balão estourou para fora, a borda queima e
 * cada pedacinho sobe em lasca até virar cinza. Atrás dela está o palco de
 * Derry, com a chuva: a Coisa vem antes do mural.
 *
 *   0,0 s   a Coisa no bueiro sorri; os balões (`QUANTOS`) saem dos cantos e
 *           das beiradas, cada um no seu tempo, e boiam onde pararam; o
 *           retrato da tela é tirado (`fotografar.ts`)
 *   2,0 s   enchem e tremem
 *   2,9 s   (ou quando o retrato fica pronto) estouram, em sequência, cada
 *           um com os cacos e o anel; o retrato toma o lugar da tela e
 *           desmancha a partir de todos eles
 *   ~6 s    acabou: só o palco de Derry (`coisa/ACoisa.tsx`)
 *
 * O bueiro e os balões são desta camada (o da semana já saiu quando a
 * abertura entra) e ficam fora do retrato (`data-portal-fora`). Os tempos
 * dividem pela velocidade do mural (o painel de teste). «Pular» e Esc vão
 * direto à Coisa. Os lugares saem de uma semente: todo mundo vê os mesmos.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useVelocidadeDoMural } from './estado';
import { TelaQueDesmancha } from './TelaQueDesmancha';
import { fotografar } from './fotografar';
import type { Pixels } from './desmanche';
import { Bueiro, Pixel } from './Bueiro';
import { BALAO, PALETA_DO_BALAO } from './coisa/arte';
import { sorteador } from './acaso';

const SUBIDA_MS = 2000;
const ESTOURO_MS = 2900;
/** Quantos balões (no modo leve, menos), e o tempo entre um estouro e o outro. */
const QUANTOS = 14, QUANTOS_LEVE = 6, ENTRE_ESTOUROS_MS = 70;

type Etapa = 'subindo' | 'enchendo' | 'estourou';

interface BalaoDaAbertura {
  /** De onde sai e onde para, em fração da tela. */
  de: readonly [number, number];
  para: readonly [number, number];
  tam: number;
  atraso: number;
  /** A vez do estouro (0 = o primeiro). */
  vez: number;
}

/** Os cantos e as beiradas de onde eles saem (um pouco para fora da tela). */
const SAIDAS: readonly (readonly [number, number])[] = [
  [-0.08, -0.1], [0.5, -0.14], [1.08, -0.1], [1.1, 0.5], [1.08, 1.12], [0.5, 1.16], [-0.08, 1.12], [-0.1, 0.5],
];

function montarBaloes(n: number): BalaoDaAbertura[] {
  const acaso = sorteador(1958);
  const ordem = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(acaso() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
  return Array.from({ length: n }, (_, i) => {
    const de = SAIDAS[i % SAIDAS.length];
    // Para no caminho para o meio, espalhado (sem empilhar no centro).
    const ang = (i / n) * Math.PI * 2 + acaso() * 0.4;
    const raio = 0.16 + acaso() * 0.2;
    const para = [0.5 + Math.cos(ang) * raio * 1.25, 0.5 + Math.sin(ang) * raio] as const;
    return { de, para, tam: 5 + Math.floor(acaso() * 4), atraso: acaso() * 0.7, vez: ordem[i] };
  });
}

/** Os cacos do estouro: oito pixels que voam para fora. */
const CACOS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + 0.3;
  return [Math.round(Math.cos(a) * 90), Math.round(Math.sin(a) * 90)] as const;
});

export function Abertura({ aoDesmanchar, aoTerminar, leve }: {
  /** O retrato está por cima: o palco da Coisa pode montar embaixo. */
  aoDesmanchar: () => void;
  aoTerminar: () => void;
  leve: boolean;
}) {
  const v = useVelocidadeDoMural();
  const [foto, setFoto] = useState<Pixels | null>(null);
  const [etapa, setEtapa] = useState<Etapa>('subindo');
  const baloes = useMemo(() => montarBaloes(leve ? QUANTOS_LEVE : QUANTOS), [leve]);

  useEffect(() => {
    let vivo = true;
    const enche = window.setTimeout(() => setEtapa('enchendo'), SUBIDA_MS / v);
    const espera = new Promise(ok => window.setTimeout(ok, ESTOURO_MS / v));
    Promise.all([fotografar(document.body), espera]).then(([retrato]) => {
      if (!vivo) return;
      setFoto(retrato);
      setEtapa('estourou');
      aoDesmanchar();
    });
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoTerminar(); };
    window.addEventListener('keydown', tecla);
    return () => { vivo = false; window.clearTimeout(enche); window.removeEventListener('keydown', tecla); };
    // A abertura é uma só: mudar a velocidade no meio não recomeça.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tela desmancha a partir de cada balão.
  const origens = useMemo(() => baloes.map(b => b.para), [baloes]);
  const estilo = { ['--v' as string]: v } as CSSProperties;

  return (
    <div className={`portal-abertura${leve ? ' portal-leve' : ''}`} style={estilo} role="dialog" aria-label="O mural de outubro está abrindo" data-portal-fora>
      {foto && (
        <TelaQueDesmancha foto={foto} origens={origens} duracaoS={3.4} leve={leve} semente={1958} aoTerminar={aoTerminar} />
      )}

      {etapa !== 'estourou' && <div className="portal-alto-bueiro"><Bueiro acesos seguir={false} tremendo={!leve} /></div>}

      {baloes.map((b, i) => (
        <div
          key={i}
          className={`portal-abertura-balao portal-abertura-${etapa}`}
          style={{
            left: `${b.para[0] * 100}vw`,
            top: `${b.para[1] * 100}vh`,
            ['--de-x' as string]: `${(b.de[0] - b.para[0]) * 100}vw`,
            ['--de-y' as string]: `${(b.de[1] - b.para[1]) * 100}vh`,
            ['--atraso' as string]: `${b.atraso}s`,
            ['--estoura' as string]: `${(b.vez * ENTRE_ESTOUROS_MS) / 1000}s`,
          } as CSSProperties}
          aria-hidden
        >
          <div className="portal-abertura-balao-corpo">
            <Pixel linhas={BALAO} paleta={PALETA_DO_BALAO} tam={b.tam} />
            <span className="portal-balao-fio" />
          </div>
          {etapa === 'estourou' && (
            <div className="portal-abertura-estouro">
              <span className="portal-abertura-anel" />
              {!leve && CACOS.map(([x, y], k) => (
                <span key={k} className="portal-abertura-caco" style={{ ['--cx' as string]: `${x}px`, ['--cy' as string]: `${y}px` } as CSSProperties} />
              ))}
            </div>
          )}
        </div>
      ))}
      {etapa === 'estourou' && <div className="portal-clarao portal-clarao-vermelho" aria-hidden />}

      <button type="button" className="portal-pular" onClick={aoTerminar}>Pular</button>
    </div>
  );
}
