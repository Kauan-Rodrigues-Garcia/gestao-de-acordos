/**
 * BlocoDeGelo — escondido no pé do Analítico, perto do fim da linha do trem,
 * meio enterrado num monte de neve (`trem/Faixas.tsx`), só no Natal
 * (Cleber, 05/11/2026): um cantor congelado num CUBO de gelo em 3D, bem
 * transparente, que gira devagar para um lado e para o outro e derrete com os
 * dias (`degelo.ts`): o cubo vai baixando e o rosto sai por cima.
 *
 * SÓ O MOUSE PARADO EM CIMA faz alguma coisa (clique não faz nada): durante
 * um segundo uma rachadura pequena cresce aos poucos do meio da face da
 * frente (`rachaduras.ts`) e o cubo treme; aí estala — lascas voam e a música
 * dele entra, abafada e com um pouco de eco (`som.ts`), cada vez menos abafada
 * conforme os dias passam. Tocando, o cubo pulsa no grave e sobem notinhas e
 * vapor gelado. Tirou o mouse, a música some aos poucos.
 *
 * As animações valem também com a «redução de animações» do Windows ligada
 * (Cleber, 05/11/2026: no PC dele a rachadura aparecia de uma vez). Quem quer
 * menos movimento usa o modo leve do sistema: aí o cubo fica parado de lado,
 * e só a rachadura e a música continuam.
 *
 * Quem recebe o mouse é uma caixa FIXA (`.nt-gelo`); o que gira, pulsa e
 * balança fica dentro dela, sem receber mouse. Se a borda andasse sob o
 * ponteiro, o navegador veria «saiu e entrou» e a animação recomeçaria.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { useModoLeve } from '@/lib/modoLeve';
import { relogioNatal } from '../musica';
import { ALTURA_CHEIA, diasParaDescongelar, formaDoGelo, quantoDerreteu, somDoGelo } from './degelo';
import { fratura, QUADRO, texturaDoGelo } from './rachaduras';
import { graveAgora, pararDoGelo, tocarDoGelo } from './som';
import foto from './teteu.webp';
import './gelo.css';

/** Quanto tempo o mouse tem de ficar em cima. */
const ESPERA_MS = 1000;
/** O busto: 200 × 226 na imagem, desenhado com esta largura (no plano do meio do cubo). */
const LARG_FOTO = 46;
const ALT_FOTO = Math.round((LARG_FOTO * 226) / 200);
/** A foto encosta no fundo do cubo com essa folga. */
const BASE_FOTO = 3;
const NOTAS = ['♪', '♫', '♬', '♩'];
const CORES = ['#ff5a5f', '#ffd166', '#5ad17a', '#9ad8ff', '#ffffff'];

type Estado = 'parado' | 'rachando' | 'tocando' | 'bloqueado';

/** Os veios de sempre, numa face (o quadro é o do cubo cheio, preso ao fundo). */
function Veios({ textura, espelhar }: { textura: { finas: string; fortes: string }; espelhar?: boolean }) {
  return (
    <svg className="nt-gelo-veios" viewBox={`0 0 ${QUADRO} ${QUADRO}`} preserveAspectRatio="none" aria-hidden="true"
      style={espelhar ? { transform: 'scaleX(-1)' } : undefined}>
      <path className="fina" d={textura.finas} />
      <path className="forte" d={textura.fortes} />
    </svg>
  );
}

export default function BlocoDeGelo({ derreteuNoTeste }: {
  /** Só no laboratório: quanto derreteu, no lugar do relógio. */
  derreteuNoTeste?: number;
}) {
  const derreteu = derreteuNoTeste ?? quantoDerreteu(relogioNatal());
  const forma = formaDoGelo(derreteu);
  const descongelou = derreteu >= 1;
  const leve = useModoLeve();
  const [estado, setEstado] = useState<Estado>('parado');
  const [estalo, setEstalo] = useState(0);
  const [notas, setNotas] = useState<{ id: number; x: number; nota: string; cor: string; giro: number }[]>([]);
  const corpo = useRef<HTMLDivElement>(null);
  const espera = useRef(0);
  const dentroDoGelo = useRef(false);

  // Os veios de sempre e a fratura, que nasce no meio do que sobrou do gelo.
  const textura = useMemo(() => texturaDoGelo(), []);
  const texturaDoLado = useMemo(() => texturaDoGelo(19), []);
  // O quadro (80) cobre o cubo cheio (`ALTURA_CHEIA` px): o impacto fica no meio do que sobrou.
  const trincas = useMemo(() => fratura(QUADRO / 2, QUADRO * (1 - (forma.altura * 0.55) / ALTURA_CHEIA)), [forma.altura]);

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

  // Tocando: o cubo pulsa no grave, e os picos soltam notinhas.
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

  // A parte da foto que está DENTRO do gelo (de baixo até o topo do cubo).
  const dentro = Math.min(ALT_FOTO, Math.max(0, forma.altura - BASE_FOTO));
  const balao = estado === 'bloqueado' ? '🔇 O navegador ainda não liberou o som'
    : estado === 'tocando' ? (descongelou ? '🎄 Descongelou!' : '🎶 tá chegando…')
    : null;
  const estiloFoto = { width: LARG_FOTO, left: `calc(50% - ${LARG_FOTO / 2}px)`, bottom: BASE_FOTO };

  return (
    <div className="nt-gelo-lugar">
      <div
        className={cn('nt-gelo', `nt-gelo-${estado}`, descongelou && 'descongelou', leve && 'leve')}
        style={{ '--altura': `${forma.altura}px`, '--raio': `${Math.round(forma.raio * 0.45)}px`, '--poca': `${forma.poca}px` } as CSSProperties}
        role="img"
        aria-label={descongelou ? 'O cantor descongelou! Pare o mouse em cima para ouvir.' : `Tem alguém congelado aqui… faltam ${diasParaDescongelar(relogioNatal())} dias para descongelar.`}
        onPointerEnter={entrar}
        onPointerLeave={sair}
      >
        <div ref={corpo} className="nt-gelo-corpo">
          {/* No chão: a sombra do cubo, a poça (que cresce com os dias) e a gota que pinga nela. */}
          <div className="nt-gelo-sombra" />
          <div className="nt-gelo-poca"><span className="nt-gelo-ondinha" /></div>
          <span className="nt-gelo-pingo" />

          {/* O cubo: cena com perspectiva → flutua → treme/embala → gira → as seis faces e o busto no meio. */}
          <div className="nt-gelo-cena">
            <div className="nt-gelo-flutua">
              <div className="nt-gelo-treme">
                <div className="nt-gelo-cubo">
                  <div className="nt-gelo-face tras" />
                  <div className="nt-gelo-face esq"><Veios textura={texturaDoLado} espelhar /></div>
                  <div className="nt-gelo-face base" />

                  {/* O busto, no plano do meio: o que está dentro, embaçado e azulado; o que já saiu, nítido. */}
                  <img className="nt-gelo-foto dentro" src={foto} alt="" draggable={false}
                    style={{ ...estiloFoto, clipPath: `inset(${ALT_FOTO - dentro}px 0 0 0)`, filter: `blur(${forma.embacado * 0.7}px) saturate(.75) brightness(1.06) hue-rotate(-8deg)` }} />
                  <img className="nt-gelo-foto fora" src={foto} alt="" draggable={false}
                    style={{ ...estiloFoto, clipPath: `inset(0 0 ${dentro}px 0)` }} />

                  <div className="nt-gelo-face dir"><Veios textura={texturaDoLado} /></div>
                  <div className="nt-gelo-face topo" />
                  <div className="nt-gelo-face frente">
                    <Veios textura={textura} />
                    <div className="nt-gelo-bolhas">{[0, 1, 2, 3, 4].map(i => <span key={i} />)}</div>
                    {/* A rachadura do mouse parado em cima: cresce do meio, risco por risco. */}
                    <svg className="nt-gelo-trincas" viewBox={`0 0 ${QUADRO} ${QUADRO}`} preserveAspectRatio="none" aria-hidden="true">
                      {trincas.map((t, i) => (
                        <path key={i} className={cn('trinca', t.fina && 'fina')} d={t.d} pathLength={1}
                          style={{ '--atraso': `${t.atraso}s` } as CSSProperties} />
                      ))}
                    </svg>
                    {/* As gotas escorrendo: mais, conforme derrete. */}
                    {Array.from({ length: forma.gotas }, (_, i) => (
                      <span key={i} className="nt-gelo-gota" style={{ left: `${14 + ((i * 37) % 62)}%`, animationDelay: `${-i * 1.3}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
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
