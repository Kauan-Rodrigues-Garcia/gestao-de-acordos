import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useRelogioDoTrem } from './comum';
import { ondeEsta } from './horario';
import { useAgendaDoTrem } from './agenda';
import { PISTAS_DA_ABA, ROTULO_ABA, type AbaDoTrem, type PistaDoTrem } from './rota';

/**
 * O mapa da linha, ao lado do ticket da estação (Cleber, 05/11/2026): «para o
 * pessoal saber em quais abas passa o trem» — e se ele passa no alto ou no pé
 * da página. Um mapinha de papel: cada aba da rota é uma telinha com o trilho
 * desenhado onde ele corre de verdade (`PISTAS_DA_ABA`), ligadas pela linha
 * vermelha com as estações. O trenzinho marca a aba onde o trem está agora.
 *
 * Passar o mouse numa telinha conta por onde o trem passa nela.
 */
const LARG = 236;
const CARD = { x: 44, w: 172, h: 74, passo: 92, topo: 46 };

const ONDE: Record<PistaDoTrem, string> = { topo: 'no alto da página', fim: 'no pé da página' };
const EXTRA: Partial<Record<AbaDoTrem, string>> = {
  dashboard: 'É lá a estação: o sorteio acontece e o trem sai.',
  analitico: 'No alto mora o iglu do urso; no pé fica o fim da linha.',
};

function descricao(aba: AbaDoTrem): string {
  const pistas = PISTAS_DA_ABA[aba];
  const onde = pistas.length > 1 ? `${ONDE[pistas[0]]} e volta ${ONDE[pistas[1]]}` : ONDE[pistas[0]];
  return `Passa ${onde}. ${EXTRA[aba] ?? ''}`.trim();
}

/** Um trilho pequeno: os dormentes e os dois trilhos. */
function Trilho({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      {Array.from({ length: Math.floor(w / 7) }, (_, i) => (
        <rect key={i} x={x + 2 + i * 7} y={y - 2.6} width={2.6} height={5.2} rx={0.6} fill="#9A6A43" />
      ))}
      <rect x={x} y={y - 1.9} width={w} height={1.1} fill="#5E4A3A" />
      <rect x={x} y={y + 0.8} width={w} height={1.1} fill="#5E4A3A" />
    </g>
  );
}

function Telinha({ aba, i, ativa, trem, aoEntrar }: { aba: AbaDoTrem; i: number; ativa: boolean; trem: boolean; aoEntrar: () => void }) {
  const y = CARD.topo + i * CARD.passo;
  const pistas = PISTAS_DA_ABA[aba];
  const yDa = (p: PistaDoTrem) => (p === 'topo' ? y + 25 : y + CARD.h - 9);
  return (
    <g className={cn('nt-mapat-telinha', ativa && 'ativa')} onPointerEnter={aoEntrar} style={{ transformOrigin: `${CARD.x + CARD.w / 2}px ${y + CARD.h / 2}px` }}>
      <rect x={CARD.x} y={y} width={CARD.w} height={CARD.h} rx={7} fill="#FFFDF7" stroke={trem ? '#D6403A' : '#C9B79A'} strokeWidth={trem ? 2 : 1.2} />
      {/* a barrinha da janela */}
      <rect x={CARD.x} y={y} width={CARD.w} height={14} rx={7} fill="#F3E6CC" />
      <rect x={CARD.x} y={y + 8} width={CARD.w} height={6} fill="#F3E6CC" />
      {['#E57373', '#FFD54F', '#81C784'].map((c, k) => <circle key={c} cx={CARD.x + 9 + k * 7} cy={y + 7} r={2.2} fill={c} />)}
      <text x={CARD.x + 34} y={y + 10.4} fontSize={8.5} fontWeight={800} fill="#5A3B26" fontFamily="system-ui, sans-serif">{ROTULO_ABA[aba]}</text>
      {/* o conteúdo de mentira */}
      <rect x={CARD.x + 10} y={y + (pistas.includes('topo') ? 33 : 22)} width={CARD.w * 0.55} height={4} rx={2} fill="#E9DDC6" />
      <rect x={CARD.x + 10} y={y + (pistas.includes('topo') ? 41 : 30)} width={CARD.w * 0.8} height={4} rx={2} fill="#EFE5D2" />
      {!pistas.includes('topo') && <rect x={CARD.x + 10} y={y + 38} width={CARD.w * 0.68} height={4} rx={2} fill="#EFE5D2" />}
      {/* os trilhos, onde o trem corre nesta aba */}
      {pistas.map(p => <Trilho key={p} x={CARD.x + 6} y={yDa(p)} w={CARD.w - 12} />)}
      {/* enfeites: a estação, o iglu, o fim da linha */}
      {aba === 'dashboard' && (
        <g transform={`translate(${CARD.x + 10} ${yDa('fim') - 15})`}>
          <rect x={0} y={5} width={16} height={10} fill="#F6F0E7" stroke="#A92F35" strokeWidth={0.8} />
          <path d="M-2 6 L8 -1 L18 6 Z" fill="#D6403A" />
          <rect x={6} y={9} width={4} height={6} fill="#3F9A5B" />
        </g>
      )}
      {aba === 'analitico' && (
        <>
          <g transform={`translate(${CARD.x + CARD.w - 26} ${yDa('topo') - 13})`}>
            <path d="M0 11 A9 9 0 0 1 18 11 Z" fill="#F4FAFF" stroke="#9CC3E0" strokeWidth={0.9} />
            <path d="M6.5 11 V8 A2.5 2.5 0 0 1 11.5 8 V11 Z" fill="#7FA9C9" />
          </g>
          <g transform={`translate(${CARD.x + 8} ${yDa('fim') - 10})`}>
            <rect x={0} y={4} width={12} height={4} rx={1} fill="#F6F0E7" stroke="#A92F35" strokeWidth={0.8} />
            <rect x={1.5} y={8} width={1.6} height={4} fill="#3A2F3B" /><rect x={8.9} y={8} width={1.6} height={4} fill="#3A2F3B" />
          </g>
        </>
      )}
      {/* o trem, nesta aba agora */}
      {trem && (
        <g className="nt-mapat-trem" transform={`translate(${CARD.x + CARD.w / 2 - 12} ${yDa(pistas[0]) - 9})`}>
          <rect x={0} y={1} width={14} height={7} rx={1.6} fill="#D6403A" />
          <rect x={12} y={-2} width={8} height={10} rx={1.6} fill="#D6403A" />
          <rect x={14} y={0} width={4} height={3.5} rx={0.8} fill="#FFD98A" />
          <rect x={2.5} y={-2} width={3} height={3.5} fill="#3A2F3B" />
          <circle cx={4} cy={9} r={2} fill="#3A2F3B" /><circle cx={15} cy={9} r={2} fill="#3A2F3B" />
        </g>
      )}
    </g>
  );
}

export function MapaDoTicket({ rota }: { rota: readonly AbaDoTrem[] }) {
  const agora = useRelogioDoTrem(1000);
  const agenda = useAgendaDoTrem();
  const pos = ondeEsta(agora, rota, agenda);
  const ondeEstaOTrem: AbaDoTrem | null = pos.fechado ? rota[0] : pos.aba;
  const [olhando, setOlhando] = useState<AbaDoTrem | null>(null);
  const altura = CARD.topo + rota.length * CARD.passo + 6;
  const yDaEstacao = (i: number) => CARD.topo + i * CARD.passo + CARD.h / 2;

  return (
    <div className="nt-mapat" onPointerLeave={() => setOlhando(null)}>
      <svg viewBox={`0 0 ${LARG} ${altura}`} width={LARG} height={altura} role="img" aria-label={`Mapa da linha: o trem passa por ${rota.map(a => ROTULO_ABA[a]).join(', ')}`}>
        <text x={LARG / 2} y={22} textAnchor="middle" className="nt-mapat-titulo">Mapa da linha</text>
        <path d={`M${LARG / 2 - 52} 29 Q${LARG / 2} 34 ${LARG / 2 + 52} 29`} fill="none" stroke="#C9A24A" strokeWidth={1} strokeDasharray="2 3" />
        {/* A linha vermelha, com as estações, na margem do mapa. */}
        <line x1={22} y1={yDaEstacao(0)} x2={22} y2={yDaEstacao(rota.length - 1)} stroke="#D6403A" strokeWidth={3.4} strokeLinecap="round" />
        {rota.map((aba, i) => {
          const ponta = i === 0 || i === rota.length - 1;
          const y = yDaEstacao(i);
          return (
            <g key={aba} className={cn('nt-mapat-estacao', ondeEstaOTrem === aba && 'aqui')}>
              <circle className="nt-mapat-pulso" cx={22} cy={y} r={8} />
              {ponta
                ? <rect x={16.8} y={y - 5.2} width={10.4} height={10.4} rx={2} fill="#FFFFFF" stroke="#D6403A" strokeWidth={2.6} />
                : <circle cx={22} cy={y} r={5} fill="#FFFFFF" stroke="#D6403A" strokeWidth={2.6} />}
              <line x1={30} y1={y} x2={CARD.x - 2} y2={y} stroke="#D6403A" strokeWidth={1.2} strokeDasharray="2 2.5" />
            </g>
          );
        })}
        {rota.map((aba, i) => (
          <Telinha key={aba} aba={aba} i={i} ativa={olhando === aba} trem={ondeEstaOTrem === aba} aoEntrar={() => setOlhando(aba)} />
        ))}
      </svg>
      <p className="nt-mapat-legenda" aria-live="polite">
        {olhando
          ? <><b>{ROTULO_ABA[olhando]}</b> · {descricao(olhando)}</>
          : <>Passe o mouse numa aba para ver por onde o trem passa. <span className="nt-mapat-agora">🚂 {pos.fechado ? 'parado na estação' : <>agora em <b>{ROTULO_ABA[pos.aba]}</b></>}</span></>}
      </p>
      <p className="nt-mapat-rodape">Ida e volta, no mesmo trilho, para todo mundo.</p>
    </div>
  );
}
