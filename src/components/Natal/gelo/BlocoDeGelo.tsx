/**
 * BlocoDeGelo — no cabeçalho do Analítico, ao lado do título, só no Natal
 * (Cleber, 05/11/2026): um cantor congelado num bloco de gelo que derrete com
 * os dias (`degelo.ts`). O rosto vai saindo por cima do gelo; o que ainda está
 * dentro aparece através do gelo, azulado, entre os veios das rachaduras.
 *
 * SÓ O MOUSE PARADO EM CIMA faz alguma coisa (Cleber, 05/11/2026: «clique não
 * faz nada»): por um segundo o gelo racha a partir do centro (`rachaduras.ts`)
 * e estala — lascas voam e a música dele entra, abafada e com eco (`som.ts`),
 * cada vez menos abafada conforme os dias passam. Tocando, o bloco pulsa no
 * grave, sobem notinhas e vapor gelado. Tirou o mouse, a música some aos poucos.
 *
 * Quem recebe o mouse é uma caixa FIXA (`.nt-gelo`); o que pulsa e balança
 * fica dentro dela, sem receber mouse (`.nt-gelo-corpo`). Antes a própria
 * caixa pulsava: a borda andava sob o ponteiro, o navegador via «saiu e
 * entrou» e a animação recomeçava.
 *
 * O componente não ocupa lugar no cabeçalho além de uma caixa da altura do
 * título: o bloco sobe por cima do espaço vazio (`gelo.css`).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { relogioNatal } from '../musica';
import { diasParaDescongelar, formaDoGelo, quantoDerreteu, somDoGelo } from './degelo';
import { fratura, QUADRO, texturaDoGelo } from './rachaduras';
import { graveAgora, pararDoGelo, tocarDoGelo } from './som';
import foto from './teteu.webp';
import './gelo.css';

/** Quanto tempo o mouse tem de ficar em cima. */
const ESPERA_MS = 1000;
/** O busto: 200 × 226 na imagem, desenhado com esta largura. */
const LARG_FOTO = 58;
const ALT_FOTO = Math.round((LARG_FOTO * 226) / 200);
/** A foto encosta no fundo do gelo com essa folga. */
const BASE_FOTO = 4;
const BASE_GELO = 2;
const NOTAS = ['♪', '♫', '♬', '♩'];
const CORES = ['#ff5a5f', '#ffd166', '#5ad17a', '#9ad8ff', '#ffffff'];

type Estado = 'parado' | 'rachando' | 'tocando' | 'bloqueado';

export default function BlocoDeGelo({ derreteuNoTeste }: {
  /** Só no laboratório: quanto derreteu, no lugar do relógio. */
  derreteuNoTeste?: number;
}) {
  const derreteu = derreteuNoTeste ?? quantoDerreteu(relogioNatal());
  const forma = formaDoGelo(derreteu);
  const descongelou = derreteu >= 1;
  const [estado, setEstado] = useState<Estado>('parado');
  const [estalo, setEstalo] = useState(0);
  const [notas, setNotas] = useState<{ id: number; x: number; nota: string; cor: string; giro: number }[]>([]);
  const corpo = useRef<HTMLDivElement>(null);
  const espera = useRef(0);
  const dentroDoGelo = useRef(false);

  // Os veios de sempre e a fratura, que nasce no meio do que sobrou do gelo.
  const textura = useMemo(() => texturaDoGelo(), []);
  const trincas = useMemo(() => fratura(QUADRO / 2, QUADRO - forma.altura * 0.55), [forma.altura]);

  const entrar = () => {
    dentroDoGelo.current = true;
    window.clearTimeout(espera.current);
    setEstado('rachando');
    espera.current = window.setTimeout(() => {
      void tocarDoGelo(somDoGelo(derreteu), () => setEstado('parado')).then(r => {
        // Saiu de cima enquanto o som carregava: não começa.
        if (!dentroDoGelo.current) { if (r === 'tocando') pararDoGelo(); return; }
        if (r === 'tocando') { setEstado('tocando'); setEstalo(v => v + 1); }
        else setEstado(r === 'bloqueado' ? 'bloqueado' : 'parado');
      });
    }, ESPERA_MS);
  };
  const sair = () => {
    dentroDoGelo.current = false;
    window.clearTimeout(espera.current);
    pararDoGelo();
    setEstado('parado');
  };

  // Saiu da aba tocando: para a música.
  useEffect(() => () => { window.clearTimeout(espera.current); pararDoGelo(); }, []);

  // Tocando: o bloco pulsa no grave, e os picos soltam notinhas.
  useEffect(() => {
    if (estado !== 'tocando') {
      corpo.current?.style.setProperty('--batida', '0');
      return;
    }
    let quadro = 0, suave = 0, ultimaNota = 0, antes = 0;
    const passo = (t: number) => {
      const g = graveAgora();
      suave += (g - suave) * 0.35;
      corpo.current?.style.setProperty('--batida', Math.max(0, (suave - 0.35) / 0.65).toFixed(3));
      if (g > 0.62 && g > antes + 0.04 && t - ultimaNota > 380) {
        ultimaNota = t;
        const id = t;
        setNotas(n => [...n.slice(-7), {
          id, x: Math.round((Math.random() - 0.5) * 60), giro: Math.round((Math.random() - 0.5) * 50),
          nota: NOTAS[Math.floor(Math.random() * NOTAS.length)], cor: CORES[Math.floor(Math.random() * CORES.length)],
        }]);
        window.setTimeout(() => setNotas(n => n.filter(x => x.id !== id)), 2300);
      }
      antes = g;
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [estado]);

  // A parte da foto que está DENTRO do gelo (de baixo até a linha do gelo).
  const dentro = Math.min(ALT_FOTO, Math.max(0, BASE_GELO + forma.altura - BASE_FOTO));
  const balao = estado === 'bloqueado' ? '🔇 O navegador ainda não liberou o som'
    : estado === 'tocando' ? (descongelou ? '🎄 Descongelou!' : '🎶 tá chegando…')
    : null;

  return (
    <div className="nt-gelo-lugar">
      <div
        className={cn('nt-gelo', `nt-gelo-${estado}`, descongelou && 'descongelou')}
        style={{ '--altura': `${forma.altura}px`, '--raio': `${forma.raio}px`, '--poca': `${forma.poca}px` } as CSSProperties}
        role="img"
        aria-label={descongelou ? 'O cantor descongelou! Pare o mouse em cima para ouvir.' : `Tem alguém congelado aqui… faltam ${diasParaDescongelar(relogioNatal())} dias para descongelar.`}
        onPointerEnter={entrar}
        onPointerLeave={sair}
      >
        <div ref={corpo} className="nt-gelo-corpo">
          {/* A poça, que cresce com os dias, e a gota que pinga nela. */}
          <div className="nt-gelo-poca"><span className="nt-gelo-ondinha" /></div>
          <span className="nt-gelo-pingo" />

          {/* O rosto fora do gelo: nítido, molhadinho. */}
          <img className="nt-gelo-foto nt-gelo-fora" src={foto} alt="" draggable={false}
            style={{ width: LARG_FOTO, bottom: BASE_FOTO, clipPath: `inset(0 0 ${dentro}px 0)` }} />

          {/* O bloco: a foto dentro, através do gelo, e o gelo por cima. */}
          <div className="nt-gelo-bloco" style={{ bottom: BASE_GELO }}>
            <img className="nt-gelo-foto nt-gelo-dentro" src={foto} alt="" draggable={false}
              style={{ width: LARG_FOTO, bottom: BASE_FOTO - BASE_GELO, filter: `blur(${forma.embacado}px) saturate(.8) brightness(1.04)` }} />
            <div className="nt-gelo-tinta" />
            <div className="nt-gelo-geada" style={{ opacity: forma.geada }} />
            <div className="nt-gelo-reflexo" />
            <div className="nt-gelo-bolhas">{[0, 1, 2, 3, 4].map(i => <span key={i} />)}</div>
            {/* Os veios do gelo e a fratura, presos ao fundo: derretendo, o alto some e eles ficam. */}
            <svg className="nt-gelo-veios" viewBox={`0 0 ${QUADRO} ${QUADRO}`} preserveAspectRatio="none" aria-hidden="true">
              <path className="fina" d={textura.finas} />
              <path className="forte" d={textura.fortes} />
              {trincas.map((t, i) => (
                <path key={i} className={cn('trinca', t.fina && 'fina')} d={t.d} pathLength={1}
                  style={{ '--atraso': `${t.atraso}s` } as CSSProperties} />
              ))}
            </svg>
            {/* As gotas escorrendo pelos lados: mais, conforme derrete. */}
            {Array.from({ length: forma.gotas }, (_, i) => (
              <span key={i} className="nt-gelo-gota" style={{ left: `${12 + ((i * 37) % 60)}%`, animationDelay: `${-i * 1.3}s` }} />
            ))}
          </div>
          <span className="nt-gelo-brilho um" />
          <span className="nt-gelo-brilho dois" />

          {/* O estalo: lascas voando. */}
          {estalo > 0 && (
            <div key={estalo} className="nt-gelo-lascas" aria-hidden="true">
              {[-60, -25, 10, 40, 75, 130, 160, 200].map((a, i) => (
                <span key={i} style={{ '--a': `${a}deg`, '--d': `${26 + (i % 3) * 10}px` } as CSSProperties} />
              ))}
            </div>
          )}

          {/* Tocando: vapor gelado e notinhas subindo. */}
          {estado === 'tocando' && (
            <div className="nt-gelo-vapor" aria-hidden="true"><span /><span /><span /></div>
          )}
          {notas.map(n => (
            <span key={n.id} className="nt-gelo-nota"
              style={{ '--x': `${n.x}px`, '--g': `${n.giro}deg`, color: n.cor } as CSSProperties}>{n.nota}</span>
          ))}

          {balao && <div key={balao} className="nt-gelo-balao" role="status">{balao}</div>}
        </div>
      </div>
    </div>
  );
}
