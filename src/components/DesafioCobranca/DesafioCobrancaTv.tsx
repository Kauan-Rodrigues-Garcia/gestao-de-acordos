/**
 * O Desafio Cobrança no Modo TV: o template «desafio_cobranca» da vitrine.
 * Veio do modelo de teste de 16/11/2026 (`lab-desafio-cobranca-tv.tsx`).
 *
 * Regras do Modo TV 2: desenhado no palco de 1920×1080 que o `PalcoTv` escala,
 * e leve para o PC fraco da TV — nenhuma animação contínua; o número anda só
 * quando muda (3,2 s). Só o geral: o que já somamos, a meta, o relógio e o
 * prêmio. Nada da regra individual.
 *
 * Os números vêm do banco por conta própria (não do pacote do painel):
 *   • na TV, pelo token dela (`fn_desafio_cobranca_tv`) — só liberado, e só se
 *     o setor do painel «vê» o desafio;
 *   • na prévia do editor, pela pessoa logada (`fn_desafio_cobranca_atual`).
 *
 * As cores são as do tema do desafio (`temas.ts`, variáveis `--dc-*`); nos
 * temas de Natal entram os enfeites — parados, como pede o Modo TV.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Check, Clock3, Info, Snowflake, Sun } from 'lucide-react';
import { buscarDesafioCobranca, buscarDesafioCobrancaTv, type PlacarCobranca } from '@/services/desafioCobranca/desafioCobranca.service';
import { tokenDaTv } from './tokenDaTv';
import { Sincelos } from '@/components/Natal/Sincelos';
import { MontesDeNeve, PiscaPisca } from './Enfeites';
import { useTemaNatal } from '@/components/Natal/tema';
import { atributosDoTema, caminhoDaEstrela, temaDoDesafio } from './temas';
import './desafio-cobranca.css';
import { brl, dataCurta, diaDoDesafio, diasRestantes, hojeEmSaoPaulo, horaCurta, pct, semana, semanaCurta } from '@/services/desafioCobranca/regras';


// As cores vêm do tema do desafio (variáveis `--dc-*` no `.dc-tv`).
const C = {
  texto: 'var(--dc-texto)', suave: 'var(--dc-suave)', ouro: 'var(--dc-ouro)', coral: 'var(--dc-coral)', verde: 'var(--dc-verde)',
  trilho: 'var(--dc-trilho)',
};
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

const FUNDO = 'radial-gradient(1400px 700px at 85% 110%, var(--dc-brilho-1), transparent 60%),'
  + 'radial-gradient(1000px 600px at 0% 100%, var(--dc-brilho-2), transparent 60%),'
  + 'linear-gradient(180deg, var(--dc-noite) 0%, var(--dc-noite-2) 62%, var(--dc-noite-3) 100%)';

export function TelaDesafioCobrancaTv() {
  const token = tokenDaTv();
  const q = useQuery({
    queryKey: ['desafio-cobranca-tv', token],
    queryFn: () => (token ? buscarDesafioCobrancaTv(token) : buscarDesafioCobranca()),
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 1000,
  });

  if (!q.data) {
    return (
      <Ceu>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 120 }}>
          <div>
            <Sun size={96} color={C.ouro} />
            <div style={{ marginTop: 24, fontSize: 56, fontWeight: 900 }}>Desafio Cobrança</div>
            <div style={{ marginTop: 12, fontSize: 32, color: C.suave }}>
              {q.isLoading ? 'Carregando…' : 'Ainda não liberado para este setor.'}
            </div>
          </div>
        </div>
      </Ceu>
    );
  }
  return <Tela placar={q.data} />;
}

/**
 * A TV é sempre escura. Natal: na TV, o que o banco diz (`natal`); na prévia
 * do editor (logado), o Natal de quem está editando.
 */
function Ceu({ natal, children }: { natal?: boolean; children: ReactNode }) {
  const natalDaPessoa = useTemaNatal() !== null;
  const a = atributosDoTema(temaDoDesafio(natal ?? natalDaPessoa, true));
  return (
    <div
      className="dc-tv" data-natal={a['data-natal']}
      style={{ ...a.style, position: 'absolute', inset: 0, color: C.texto, fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif', background: FUNDO, overflow: 'hidden' }}
    >
      {Array.from({ length: 30 }, (_, i) => (
        <span key={i} style={{
          position: 'absolute', left: `${(i * 37 + 11) % 97}%`, top: `${(i * 23 + 7) % 45}%`,
          width: 4, height: 4, borderRadius: '50%', background: 'var(--dc-estrela)', opacity: 0.18 + ((i * 7) % 5) * 0.08,
        }} />
      ))}
      {/* Natal: o pisca-pisca no alto e os montes de neve no chão — parados. */}
      <PiscaPisca largura={1920} altura={46} luzes={42} parado className="dc-so-natal" style={{ position: 'absolute', top: -8, left: 0 }} />
      <MontesDeNeve className="dc-so-natal" altura={130} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%' }} />
      {children}
    </div>
  );
}

function Tela({ placar }: { placar: PlacarCobranca }) {
  const { indice: hoje } = diaDoDesafio(placar.dias, hojeEmSaoPaulo());
  const total = placar.total;
  const totalAnimado = useContador(total);
  const p = pct(total, placar.meta_geral);
  const tudo = total >= placar.meta_geral;

  return (
    <Ceu natal={placar.natal}>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: C.ouro, fontSize: 26, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' }}>
            <Sun size={32} className="dc-so-sol" /><Snowflake size={32} className="dc-so-natal" /> Desafio geral · todos os setores
          </div>
          <div style={{ marginTop: 12, fontSize: 64, fontWeight: 900, lineHeight: 1.02, letterSpacing: '-.02em' }}>
            {placar.titulo}
            <span style={{ display: 'block', background: `linear-gradient(90deg, ${C.ouro}, ${C.coral})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              {placar.subtitulo}
            </span>
          </div>
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <PremioTv placar={placar} hoje={hoje} />
          <Sincelos largura={300} comprimento={30} semente={41} gota={false} className="dc-so-natal" />
        </div>
      </div>

      <div style={{ position: 'absolute', left: 90, right: 90, top: 300, bottom: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 90 }}>
        <div style={{ width: 540, height: 540, flexShrink: 0 }}>
          <Relogio placar={placar} p={p} hoje={hoje} />
        </div>
        <div style={{ minWidth: 0 }}>
          <Rotulo cor={tudo ? C.verde : C.ouro}>{tudo ? 'Meta batida! Já somamos' : 'Já somamos'}</Rotulo>
          <div style={{ marginTop: 6, fontSize: 142, fontWeight: 900, lineHeight: 1, letterSpacing: '-.035em', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: tudo ? C.verde : C.texto }}>
            {brl(Math.round(totalAnimado))}
          </div>
          <div style={{ height: 4, width: 220, margin: '46px 0 34px', borderRadius: 999, background: `linear-gradient(90deg, ${C.ouro}, ${C.coral})` }} />
          <Rotulo cor={C.suave}>A meta</Rotulo>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 24, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 92, fontWeight: 900, lineHeight: 1, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: tudo ? C.verde : C.suave }}>
              {brl(placar.meta_geral)}
            </span>
            {tudo && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 36, fontWeight: 800, color: C.verde }}>
                <Check size={36} strokeWidth={3.2} /> batida!
              </span>
            )}
          </div>
        </div>
      </div>

      {placar.atualizado_em && (
        <div style={{ position: 'absolute', right: 90, bottom: 40, fontSize: 24, color: C.suave }}>
          Atualizado às {horaCurta(placar.atualizado_em)}
        </div>
      )}
    </Ceu>
  );
}

function Rotulo({ cor, children }: { cor: string; children: ReactNode }) {
  return <div style={{ fontSize: 34, fontWeight: 800, color: cor, letterSpacing: '.12em', textTransform: 'uppercase' }}>{children}</div>;
}

/** O prêmio na parede, como um ingresso. Só o geral. */
function PremioTv({ placar, hoje }: { placar: PlacarCobranca; hoje: number }) {
  const tudo = placar.total >= placar.meta_geral;
  const tinta = tudo ? 'var(--dc-tinta-ok)' : 'var(--dc-tinta)';
  const canhoto = tudo ? 'color-mix(in srgb, var(--dc-tinta-ok) 92%, transparent)' : 'var(--dc-canhoto)';
  const claro = tudo ? 'color-mix(in srgb, var(--dc-verde) 35%, white)' : 'var(--dc-canhoto-texto)';
  /** A cor do céu atrás do cartão, para os furos do picote. */
  const furo = 'var(--dc-noite)';
  return (
    <div style={{
      position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'stretch', height: 222, borderRadius: 30, overflow: 'hidden', color: tinta,
      background: tudo
        ? 'linear-gradient(115deg, color-mix(in srgb, var(--dc-verde) 55%, white) 0%, var(--dc-verde) 100%)'
        : 'linear-gradient(115deg, var(--dc-quente-1) 0%, var(--dc-quente-2) 55%, var(--dc-quente-3) 100%)',
      boxShadow: tudo ? '0 26px 70px color-mix(in srgb, var(--dc-verde) 30%, transparent)' : '0 26px 70px color-mix(in srgb, var(--dc-coral) 32%, transparent)',
    }}>
      <div style={{ width: 330, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: canhoto, color: claro }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 800, letterSpacing: '.22em', textTransform: 'uppercase', opacity: 0.9 }}>
          <Clock3 size={26} strokeWidth={2.6} /> Saída
        </div>
        <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 0.95, letterSpacing: '-.02em' }}>{placar.premio_hora}</div>
      </div>
      <div style={{ position: 'relative', width: 0, borderLeft: `4px dashed ${tudo ? 'color-mix(in srgb, var(--dc-tinta-ok) 35%, transparent)' : 'color-mix(in srgb, var(--dc-tinta) 32%, transparent)'}` }}>
        <span style={{ position: 'absolute', left: -22, top: -20, width: 40, height: 40, borderRadius: '50%', background: furo }} />
        <span style={{ position: 'absolute', left: -22, bottom: -20, width: 40, height: 40, borderRadius: '50%', background: furo }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 44px 0 40px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', opacity: 0.75 }}>
          {tudo ? 'Meta batida!' : 'Bateu a meta?'}
        </div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, fontSize: 44, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>
          {tudo && <Check size={42} strokeWidth={3.4} />} Todo mundo sai às {placar.premio_hora.replace(':00', 'h')}
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          {placar.premio_dia && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 28, fontWeight: 800, textTransform: 'capitalize' }}>
              <CalendarDays size={28} strokeWidth={2.6} /> {semana(placar.premio_dia)}, {dataCurta(placar.premio_dia)}
            </span>
          )}
          <span style={{ padding: '6px 18px', borderRadius: 999, fontSize: 24, fontWeight: 800, whiteSpace: 'nowrap', background: tudo ? 'color-mix(in srgb, var(--dc-tinta-ok) 14%, transparent)' : 'color-mix(in srgb, var(--dc-tinta) 14%, transparent)' }}>
            {diasRestantes(placar.dias.length, hoje)}
          </span>
        </div>
        <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 700, opacity: 0.8 }}>
          <Info size={20} strokeWidth={2.6} /> {placar.premio_requisito}
        </div>
      </div>
    </div>
  );
}

/** O anel dos dias, com o sol no ponto atual; a volta inteira é a meta geral. */
function Relogio({ placar, p, hoje }: { placar: PlacarCobranca; p: number; hoje: number }) {
  const r = 96;
  const volta = 2 * Math.PI * r;
  const ang = (p / 100) * 360;
  const pAnimado = useContador(p);
  const n = placar.dias.length;
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
        <circle cx="120" cy="120" r={r} fill="none" stroke="url(#dc-tv-anel)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={volta} strokeDashoffset={volta * (1 - p / 100)} transform="rotate(-90 120 120)"
          style={{ transition: `stroke-dashoffset ${DURACAO}ms ${CURVA}` }} />
        {placar.dias.map((d, i) => {
          const a = (i / n) * 2 * Math.PI;
          const meio = ((i + 0.5) / n) * 2 * Math.PI;
          return (
            <g key={d}>
              <line x1={120 + Math.sin(a) * 82} y1={120 - Math.cos(a) * 82} x2={120 + Math.sin(a) * 110} y2={120 - Math.cos(a) * 110}
                style={{ stroke: 'var(--dc-marca)' }} strokeWidth="3.5" strokeLinecap="round" />
              <text x={120 + Math.sin(meio) * 62} y={120 - Math.cos(meio) * 62 + 5} textAnchor="middle"
                style={{ fill: i === hoje ? C.ouro : C.suave, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {semanaCurta(d)}
              </text>
            </g>
          );
        })}
        <text x={134} y={4} textAnchor="start" style={{ fill: C.ouro, fontSize: 12, fontWeight: 900 }}>{placar.premio_hora.replace(':00', 'h')}</text>
        <g style={{ transformOrigin: '120px 120px', transform: `rotate(${ang}deg)`, transition: `transform ${DURACAO}ms ${CURVA}` }}>
          <circle cx="120" cy={120 - r} r="15" style={{ fill: 'color-mix(in srgb, var(--dc-ouro) 30%, transparent)' }} />
          <circle cx="120" cy={120 - r} r="9" className="dc-so-sol" style={{ fill: 'var(--dc-sol)', stroke: C.ouro }} strokeWidth="3" />
          <path d={caminhoDaEstrela(120, 120 - r, 13)} className="dc-so-natal dc-estrela-ponteiro" />
        </g>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ fontSize: 120, fontWeight: 900, lineHeight: 1 }}>{Math.floor(pAnimado)}%</div>
      </div>
    </div>
  );
}
