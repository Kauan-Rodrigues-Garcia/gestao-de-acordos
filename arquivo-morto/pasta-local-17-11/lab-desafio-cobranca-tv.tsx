// MODELO DE TESTE: o Desafio Cobrança no MODO TV (16/11/2026). Fictício, sem
// banco, fora da vitrine de templates.
//
// Segue as regras do Modo TV 2 (`src/pages/ModoTV/TelaTv.tsx`):
//   • desenhado num palco de 1920×1080 que o `PalcoTv` do sistema escala —
//     a prévia é a parede, só menor;
//   • leve para o PC fraco da TV: nenhuma animação contínua. O número anda só
//     quando MUDA (3,2 s, a mesma curva dos outros templates), e o anel anda
//     no mesmo compasso;
//   • lê do fundo da sala: só o geral — o que já somamos e a meta em reais,
//     com o relógio e o prêmio (14h). A regra do operador, médias, ponto de
//     hoje, o dia e os 3 dias ficam na gaveta do Gestão.
// O visual é o do desafio (céu de fim de tarde, sol no anel), não o tema do
// painel: é o desafio que aparece na parede.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CalendarDays, Check, Clock3, Info, Sun } from 'lucide-react';
import { PalcoTv } from '@/pages/ModoTV/TelaTv';
import {
  DESAFIO, PREMIO, brl, dataCurta, diasRestantes, pct, semana, semanaCurta, type Estado,
} from './lab-desafio-cobranca-dados';

// As cores vêm do tema escolhido (variáveis `--dc-*`, ver lab-desafio-cobranca-temas.ts).
const C = {
  texto: 'var(--dc-texto)', suave: 'var(--dc-suave)', ouro: 'var(--dc-ouro)', coral: 'var(--dc-coral)', verde: 'var(--dc-verde)',
  trilho: 'var(--dc-trilho)',
};
/** A mesma do Modo TV: começa devagar, acelera e assenta devagar. */
const DURACAO = 3200;
const CURVA = 'cubic-bezier(.65, 0, .35, 1)';
const entraESai = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** O número sobe quando chega relatório novo — e só aí. */
function useContador(alvo: number): number {
  const [valor, setValor] = useState(alvo);
  const atual = useRef(alvo);
  useEffect(() => {
    const de = atual.current;
    if (de === alvo) return;
    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO);
      const v = de + (alvo - de) * entraESai(t);
      atual.current = v;
      setValor(v);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo]);
  return valor;
}

export function TelaDesafioTv({ estado, style }: { estado: Estado; style?: CSSProperties }) {
  return (
    <PalcoTv tema="noite" style={style}>
      <Tela estado={estado} />
    </PalcoTv>
  );
}

/**
 * Na parede, só o que se lê do fundo da sala: quanto já somamos e as duas
 * metas (1 hora mais cedo e 14h), com o relógio e os prêmios. O detalhe fica
 * na gaveta do Gestão.
 */
function Tela({ estado }: { estado: Estado }) {
  const { hoje, total } = estado;
  const totalAnimado = useContador(total);
  const p = pct(total, DESAFIO.metaGeral);
  const tudo = total >= DESAFIO.metaGeral;

  return (
    <div className="dc-tv" style={{
      position: 'absolute', inset: 0, color: C.texto, fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
      background: 'radial-gradient(1400px 700px at 85% 110%, var(--dc-brilho-1), transparent 60%),'
        + 'radial-gradient(1000px 600px at 0% 100%, var(--dc-brilho-2), transparent 60%),'
        + 'linear-gradient(180deg, var(--dc-noite) 0%, var(--dc-noite-2) 62%, var(--dc-noite-3) 100%)',
    }}>
      {/* Estrelas paradas: brilho sem custo. */}
      {Array.from({ length: 30 }, (_, i) => (
        <span key={i} style={{
          position: 'absolute', left: `${(i * 37 + 11) % 97}%`, top: `${(i * 23 + 7) % 45}%`,
          width: 4, height: 4, borderRadius: '50%', background: 'var(--dc-estrela)', opacity: 0.18 + ((i * 7) % 5) * 0.08,
        }} />
      ))}

      {/* Topo: o título e, à direita, o prêmio — o motivo de tudo. */}
      <div style={{ position: 'absolute', left: 90, right: 90, top: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: C.ouro, fontSize: 26, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' }}>
            <Sun size={32} /> Desafio geral · todos os setores
          </div>
          <div style={{ marginTop: 12, fontSize: 64, fontWeight: 900, lineHeight: 1.02, letterSpacing: '-.02em' }}>
            {DESAFIO.titulo}
            <span style={{ display: 'block', background: `linear-gradient(90deg, ${C.ouro}, ${C.coral})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              {DESAFIO.subtitulo}
            </span>
          </div>
        </div>
        <PremioTv hoje={hoje} total={total} />
      </div>

      {/* O centro: o relógio, o que já somamos e a meta. */}
      <div style={{
        position: 'absolute', left: 90, right: 90, top: 300, bottom: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 90,
      }}>
        <div style={{ width: 540, height: 540, flexShrink: 0 }}>
          <Relogio p={p} hoje={hoje} />
        </div>

        <div style={{ minWidth: 0 }}>
          <Rotulo cor={tudo ? C.verde : C.ouro}>{tudo ? 'Meta batida! Já somamos' : 'Já somamos'}</Rotulo>
          <div style={{
            marginTop: 6, fontSize: 142, fontWeight: 900, lineHeight: 1, letterSpacing: '-.035em', whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums', color: tudo ? C.verde : C.texto,
          }}>
            {brl(Math.round(totalAnimado))}
          </div>
          <div style={{ height: 4, width: 220, margin: '46px 0 34px', borderRadius: 999, background: `linear-gradient(90deg, ${C.ouro}, ${C.coral})` }} />

          <Rotulo cor={C.suave}>A meta</Rotulo>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 24, whiteSpace: 'nowrap' }}>
            <span style={{
              fontSize: 92, fontWeight: 900, lineHeight: 1, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums',
              color: tudo ? C.verde : C.suave,
            }}>
              {brl(DESAFIO.metaGeral)}
            </span>
            {tudo && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 36, fontWeight: 800, color: C.verde }}>
                <Check size={36} strokeWidth={3.2} /> batida!
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Rotulo({ cor, children }: { cor: string; children: ReactNode }) {
  return (
    <div style={{ fontSize: 34, fontWeight: 800, color: cor, letterSpacing: '.12em', textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

/**
 * O prêmio na parede, como um ingresso: o canhoto escuro com a hora da saída
 * e, do outro lado, o que é e quando. Só o geral: a regra individual do
 * operador (1 hora mais cedo) não vai para a TV (16/11/2026).
 */
function PremioTv({ hoje, total }: { hoje: number; total: number }) {
  const tudo = total >= DESAFIO.metaGeral;
  const tinta = tudo ? 'var(--dc-tinta-ok)' : 'var(--dc-tinta)';
  const canhoto = tudo ? 'color-mix(in srgb, var(--dc-tinta-ok) 92%, transparent)' : 'var(--dc-canhoto)';
  const claro = tudo ? 'color-mix(in srgb, var(--dc-verde) 35%, white)' : 'var(--dc-canhoto-texto)';
  /** A cor do céu atrás do cartão, para os furos do picote. */
  const furo = 'var(--dc-noite)';

  return (
    <div style={{
      position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'stretch', height: 222,
      borderRadius: 30, overflow: 'hidden', color: tinta,
      background: tudo
        ? 'linear-gradient(115deg, color-mix(in srgb, var(--dc-verde) 55%, white) 0%, var(--dc-verde) 100%)'
        : 'linear-gradient(115deg, var(--dc-quente-1) 0%, var(--dc-quente-2) 55%, var(--dc-quente-3) 100%)',
      boxShadow: tudo ? '0 26px 70px color-mix(in srgb, var(--dc-verde) 30%, transparent)' : '0 26px 70px color-mix(in srgb, var(--dc-coral) 32%, transparent)',
    }}>
      {/* O canhoto: a hora da saída */}
      <div style={{
        width: 330, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        background: canhoto, color: claro,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 800, letterSpacing: '.22em', textTransform: 'uppercase', opacity: 0.9 }}>
          <Clock3 size={26} strokeWidth={2.6} /> Saída
        </div>
        <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 0.95, letterSpacing: '-.02em' }}>{PREMIO.hora}</div>
      </div>

      {/* O picote, com os furos de cima e de baixo */}
      <div style={{ position: 'relative', width: 0, borderLeft: `4px dashed ${tudo ? 'color-mix(in srgb, var(--dc-tinta-ok) 35%, transparent)' : 'color-mix(in srgb, var(--dc-tinta) 32%, transparent)'}` }}>
        <span style={{ position: 'absolute', left: -22, top: -20, width: 40, height: 40, borderRadius: '50%', background: furo }} />
        <span style={{ position: 'absolute', left: -22, bottom: -20, width: 40, height: 40, borderRadius: '50%', background: furo }} />
      </div>

      {/* O que é e quando */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 44px 0 40px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', opacity: 0.75 }}>
          {tudo ? 'Meta batida!' : 'Bateu a meta?'}
        </div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, fontSize: 44, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>
          {tudo && <Check size={42} strokeWidth={3.4} />} Todo mundo sai às 14h
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 28, fontWeight: 800, textTransform: 'capitalize' }}>
            <CalendarDays size={28} strokeWidth={2.6} /> {semana(PREMIO.dia)}, {dataCurta(PREMIO.dia)}
          </span>
          <span style={{
            padding: '6px 18px', borderRadius: 999, fontSize: 24, fontWeight: 800, whiteSpace: 'nowrap',
            background: tudo ? 'color-mix(in srgb, var(--dc-tinta-ok) 14%, transparent)' : 'color-mix(in srgb, var(--dc-tinta) 14%, transparent)',
          }}>
            {diasRestantes(hoje)}
          </span>
        </div>
        <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 700, opacity: 0.8 }}>
          <Info size={20} strokeWidth={2.6} /> {PREMIO.requisito}
        </div>
      </div>
    </div>
  );
}

/** O anel dos 3 dias, com o sol no ponto atual; a volta inteira é a meta geral. */
function Relogio({ p, hoje }: { p: number; hoje: number }) {
  const r = 96;
  const volta = 2 * Math.PI * r;
  const ang = (p / 100) * 360;
  const pAnimado = useContador(p);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox="0 0 240 240" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id="dc-tv-anel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: C.ouro }} />
            <stop offset="100%" style={{ stopColor: C.coral }} />
          </linearGradient>
        </defs>
        <circle cx="120" cy="120" r={r} style={{ fill: 'color-mix(in srgb, var(--dc-veu) 4%, transparent)', stroke: C.trilho }} strokeWidth="14" />
        <circle
          cx="120" cy="120" r={r} fill="none" stroke="url(#dc-tv-anel)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={volta} strokeDashoffset={volta * (1 - p / 100)} transform="rotate(-90 120 120)"
          style={{ transition: `stroke-dashoffset ${DURACAO}ms ${CURVA}` }}
        />
        {DESAFIO.dias.map((d, i) => {
          const a = (i / DESAFIO.dias.length) * 2 * Math.PI;
          const meio = ((i + 0.5) / DESAFIO.dias.length) * 2 * Math.PI;
          return (
            <g key={d}>
              <line
                x1={120 + Math.sin(a) * 82} y1={120 - Math.cos(a) * 82}
                x2={120 + Math.sin(a) * 110} y2={120 - Math.cos(a) * 110}
                style={{ stroke: 'var(--dc-marca)' }} strokeWidth="3.5" strokeLinecap="round"
              />
              <text
                x={120 + Math.sin(meio) * 62} y={120 - Math.cos(meio) * 62 + 5} textAnchor="middle"
                style={{ fill: i === hoje ? C.ouro : C.suave, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}
              >
                {semanaCurta(d)}
              </text>
            </g>
          );
        })}
        {/* A volta inteira é a meta geral: a saída às 14h. */}
        <text x={134} y={4} textAnchor="start" style={{ fill: C.ouro, fontSize: 12, fontWeight: 900 }}>14h</text>
        <g style={{ transformOrigin: '120px 120px', transform: `rotate(${ang}deg)`, transition: `transform ${DURACAO}ms ${CURVA}` }}>
          <circle cx="120" cy={120 - r} r="15" style={{ fill: 'color-mix(in srgb, var(--dc-ouro) 30%, transparent)' }} />
          <circle cx="120" cy={120 - r} r="9" style={{ fill: 'var(--dc-sol)', stroke: C.ouro }} strokeWidth="3" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ fontSize: 120, fontWeight: 900, lineHeight: 1 }}>{Math.floor(pAnimado)}%</div>
      </div>
    </div>
  );
}
