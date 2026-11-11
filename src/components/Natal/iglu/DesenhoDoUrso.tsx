/**
 * O urso polar do iglu — o desenho, sem cena (06/11/2026: saiu de
 * `IgluDoUrso.tsx` para o lado de dentro do iglu, `DentroDoIglu.tsx`, usar o
 * mesmo urso). As medidas do chão e do lugar dele no lago estão em `medidas.ts`.
 *
 * Acabamento de 11/11/2026 (o «Atual+» do estudo de arte): as mesmas formas,
 * com volume no pelo (degradê), sombra de contato, tricô no cachecol e no
 * gorro, azevinho, tufos e as almofadinhas das patas. Só preenchimento e
 * detalhe parado: nenhuma animação nova, nenhum filtro.
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';

import { BURACO, CHAO, X_SENTADO } from './medidas';

export const Urso = memo(function Urso({ feliz, vara, peixe, fisgando, atento, acenando, pulando, bravo = false }: {
  feliz: boolean; vara: boolean; peixe: 'nao' | 'pulando' | 'na-pata'; fisgando: boolean;
  /** Uma beliscada na isca (0 a 1 dela), ou `null`: a boia afunda, a vara verga, ele se inclina. */
  atento: number | null;
  /** O trem passando: o braço livre acena. */
  acenando: boolean;
  /** Fisgou: dá dois pulinhos de alegria. */
  pulando: boolean;
  /** Bravo (pegou alguém espiando pela janela, 06/11/2026): sobrancelha franzida, boca de birra e a veia saltando. */
  bravo?: boolean;
}) {
  // Coordenadas do urso: (0, 0) é o chão embaixo do bloco onde ele senta.
  const boia = { x: BURACO.x - X_SENTADO, y: BURACO.y - CHAO };
  // A beliscada: um puxão que vai e volta (seno), com uma tremidinha no meio.
  const puxao = atento === null ? 0 : Math.sin(Math.PI * atento) * (0.85 + 0.15 * Math.sin(atento * 40));
  const afunda = puxao * 2.6;
  const verga = puxao * 7;
  const inclina = atento === null ? 0 : -5 * Math.sin(Math.PI * Math.min(1, atento * 1.4));
  return (
    <g>
      <defs>
        <radialGradient id="nt-urso-pelo" cx=".34" cy=".3" r=".85">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".6" stopColor="#F5F3EE" />
          <stop offset="1" stopColor="#D9E1E9" />
        </radialGradient>
        <linearGradient id="nt-urso-la" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E9544C" />
          <stop offset="1" stopColor="#BC2E30" />
        </linearGradient>
        <linearGradient id="nt-urso-gorro" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#58B576" />
          <stop offset="1" stopColor="#2C7A47" />
        </linearGradient>
        <radialGradient id="nt-urso-chao" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#3B5B7A" stopOpacity=".28" />
          <stop offset="1" stopColor="#3B5B7A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nt-urso-peixe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB067" />
          <stop offset="1" stopColor="#E9742A" />
        </linearGradient>
      </defs>
      {/* a sombra de contato, no gelo */}
      <ellipse cx={-1} cy={-0.4} rx={17} ry={2.6} fill="url(#nt-urso-chao)" />
      {vara && (
        <>
          {/* a linha, da ponta da vara até a boia no buraco */}
          <path className={cn('nt-urso-linha', (fisgando || atento !== null) && 'esticada')}
            d={`M-46 ${-50 + verga * 0.6} Q-40 -26 ${boia.x} ${boia.y - 1.5 + afunda}`} />
          <g transform={`translate(${boia.x} ${(boia.y - 1.5 + afunda).toFixed(2)})`}>
            <g className="nt-urso-boia">
              <circle r={1.9} fill="#FFFFFF" />
              <path d="M-1.9 0 A1.9 1.9 0 0 1 1.9 0 Z" fill="#D6403A" />
            </g>
          </g>
        </>
      )}
      <g transform={`rotate(${inclina.toFixed(2)} 0 0)`}>
      <g className={cn('nt-urso-corpo', pulando && 'pulando')}>
        {/* o pé de trás, o corpo (que respira), a sombra e a barriga */}
        <ellipse className="nt-urso-pe tras" cx={4} cy={-2.8} rx={5.6} ry={3.2} fill="#E4E9EE" />
        <g className="nt-urso-respira">
        <ellipse cx={1} cy={-19} rx={13} ry={14} fill="url(#nt-urso-pelo)" />
        <path d="M6 -32 Q15 -24 13 -12 Q11 -5 4 -5 Q10 -16 6 -32 Z" fill="#D5DEE7" opacity={0.75} />
        <ellipse cx={-4} cy={-15.5} rx={7} ry={9} fill="#FFFFFF" />
        {/* tufos de pelo no peito e nas costas */}
        <path d="M-6.4 -19 l1.4 1.6 l1.4 -1.6 M-3.4 -14.6 l1.3 1.5 l1.3 -1.5 M-7.4 -11 l1.2 1.4 l1.2 -1.4" stroke="#DCE3EA" strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M13.2 -22 l1.6 .8 M13.6 -17.6 l1.6 .6 M12.6 -13 l1.5 .9" stroke="#C6D1DC" strokeWidth={0.8} strokeLinecap="round" />
        </g>
        {/* o pé da frente, com a almofadinha */}
        <g className="nt-urso-pe frente">
          <ellipse cx={-8} cy={-3.2} rx={6.2} ry={3.5} fill="url(#nt-urso-pelo)" />
          <ellipse cx={-12.4} cy={-3.2} rx={1.7} ry={2.2} fill="#CDB9A8" />
          <circle cx={-10.2} cy={-5} r={0.7} fill="#CDB9A8" />
          <circle cx={-10} cy={-3.2} r={0.7} fill="#CDB9A8" />
          <circle cx={-10.2} cy={-1.4} r={0.7} fill="#CDB9A8" />
        </g>
        {/* o braço livre, acenando para o trem */}
        {acenando && (
          <g transform="translate(7 -27)">
            <g className="nt-urso-tchau">
              <ellipse cx={3.4} cy={-7} rx={3.6} ry={7.4} fill="url(#nt-urso-pelo)" transform="rotate(24 3.4 -7)" />
              <circle cx={6.6} cy={-13.4} r={3.6} fill="#FFFFFF" />
              <ellipse cx={6.4} cy={-12.6} rx={1.5} ry={1.2} fill="#CDB9A8" />
            </g>
          </g>
        )}
        {/* o cachecol, com a ponta voando */}
        <path d="M-10 -29.5 Q0 -25.5 9 -29.5 L9 -25 Q0 -21 -10 -25 Z" fill="url(#nt-urso-la)" />
        <path d="M-10 -26.2 Q0 -22.2 9 -26.2 L9 -25 Q0 -21 -10 -25 Z" fill="#8E1F25" opacity={0.45} />
        <path d="M-6 -28 L-6 -23.5 M0 -27 L0 -22.5 M6 -28 L6 -23.5" stroke="#FFFFFF" strokeWidth={1.2} opacity={0.85} />
        {/* o tricô: os pontinhos em «v» entre as listras */}
        <path d="M-9 -27.6 l.9 .9 l.9 -.9 M-3.9 -26.4 l.9 .9 l.9 -.9 M2.1 -26.4 l.9 .9 l.9 -.9" stroke="#F7A9A2" strokeWidth={0.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <g className="nt-urso-cachecol">
          <path d="M5 -27 L13 -15 L9.2 -14 L2.4 -25 Z" fill="url(#nt-urso-la)" />
          <path d="M8.4 -21.6 L11 -17.6" stroke="#FFFFFF" strokeWidth={1.3} />
          <path d="M9.6 -14 l-.4 2.2 M11 -14.4 l.2 2.2 M12.4 -14.8 l.8 2" stroke="#D6403A" strokeWidth={0.9} strokeLinecap="round" />
        </g>
        {/* o braço que segura a vara (ou o peixe) */}
        <ellipse cx={-9} cy={-21.5} rx={4.4} ry={6.4} fill="url(#nt-urso-pelo)" transform="rotate(-48 -9 -21.5)" />
        <circle cx={-13.2} cy={-25.2} r={3.3} fill="#FFFFFF" />
        {vara && (
          <g transform={`rotate(${(-verga).toFixed(2)} -11 -23)`}>
            <g className={cn('nt-urso-vara', fisgando && 'puxando')}>
              <path d={`M-11 -23 Q-30 ${(-40 + verga * 0.8).toFixed(1)} -46 ${(-50 + verga).toFixed(1)}`} stroke="#7A5236" strokeWidth={1.8} strokeLinecap="round" fill="none" />
              <circle cx={-14} cy={-25.6} r={2.1} fill="#3A2F3B" />
              <circle cx={-14.5} cy={-26.1} r={0.7} fill="#8C8291" />
            </g>
          </g>
        )}
        {/* a cabeça: orelhas, gorro com pompom, focinho, olho e bochecha */}
        <g className="nt-urso-cabeca">
          <circle cx={1.6} cy={-44.4} r={3.3} fill="#E3E9EF" />
          <circle cx={-5} cy={-37} r={10.2} fill="url(#nt-urso-pelo)" />
          <path d="M2 -44 Q6.4 -38 3.6 -30 Q1 -28 -1 -28.4 Q4 -36 2 -44 Z" fill="#D5DEE7" opacity={0.8} />
          {/* o pelo da bochecha, espetadinho */}
          <path d="M3.4 -35.6 l1.8 .4 M2.8 -32.6 l1.7 .9 M1 -30 l1.4 1.2" stroke="#C6D1DC" strokeWidth={0.8} strokeLinecap="round" />
          <circle cx={-6.6} cy={-46.4} r={3.4} fill="#F7F5F0" />
          <circle cx={-6.6} cy={-46.4} r={1.6} fill="#F3C4CF" />
          <path d="M-14.6 -41.6 Q-13.6 -52 -4.4 -52.4 Q4.8 -52 6 -42.4 Z" fill="url(#nt-urso-gorro)" />
          <path d="M-11.6 -45 Q-10.6 -50 -5.6 -51" stroke="#8FD6A6" strokeWidth={1.1} strokeLinecap="round" fill="none" opacity={0.7} />
          <path d="M-8 -45 l1.2 -1.6 l1.2 1.6 M-3.6 -45.4 l1.2 -1.6 l1.2 1.6 M.8 -45 l1.2 -1.6 l1.2 1.6" stroke="#FFFFFF" strokeWidth={0.7} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.75} />
          <rect x={-15.6} y={-44} width={22.4} height={4.4} rx={2.2} fill="#2E7A47" />
          <rect x={-15.6} y={-44} width={22.4} height={1.5} rx={0.75} fill="#4FA56B" />
          <path d="M-12 -44 V-40 M-7.5 -44 V-40 M-3 -44 V-40 M1.5 -44 V-40" stroke="#3F9A5B" strokeWidth={1} />
          {/* o azevinho na barra */}
          <path d="M2.4 -42.6 Q4.6 -45.8 7.4 -44.4 Q5.4 -41.6 2.4 -42.6 Z" fill="#2F8F57" />
          <path d="M2.4 -42.6 Q1.4 -46 4 -47.4 Q4.8 -44.2 2.4 -42.6 Z" fill="#3DA367" />
          <circle cx={2.2} cy={-42.2} r={1.05} fill="#D62828" />
          <circle cx={3.6} cy={-41.4} r={0.9} fill="#E03A3A" />
          <circle className="nt-urso-pompom" cx={-3.4} cy={-53.6} r={3.1} fill="#FFFFFF" />
          <ellipse cx={-13} cy={-34.4} rx={6.4} ry={4.7} fill="#FFFFFF" />
          <path d="M-18.6 -31.8 Q-13 -28.8 -7.4 -32 Q-9 -29.6 -13 -29.6 Q-16.6 -29.6 -18.6 -31.8 Z" fill="#DCE3EA" opacity={0.8} />
          <ellipse cx={-18.3} cy={-36} rx={2.4} ry={1.75} fill="#2A2530" />
          <ellipse cx={-18.9} cy={-36.6} rx={0.9} ry={0.5} fill="#FFFFFF" opacity={0.5} />
          <path d="M-16.2 -32.4 Q-14 -30.6 -11.8 -32.4" stroke="#2A2530" strokeWidth={0.9} strokeLinecap="round" fill="none" />
          {feliz
            ? <path d="M-10.6 -38.4 Q-8.6 -41 -6.6 -38.4" stroke="#2A2530" strokeWidth={1.3} strokeLinecap="round" fill="none" />
            : (
              <g className="nt-urso-olho">
                <circle cx={-8.6} cy={-39.2} r={1.55} fill="#2A2530" />
                <circle cx={-8.1} cy={-39.8} r={0.5} fill="#FFFFFF" />
              </g>
            )}
          <ellipse cx={-8.8} cy={-34.4} rx={2.1} ry={1.25} fill={bravo ? '#F05A6E' : '#FF94AA'} opacity={bravo ? 0.9 : 0.6} />
          {bravo && (
            <g className="nt-urso-bravo">
              <path d="M-12.4 -43.2 L-5.4 -40.8" stroke="#2A2530" strokeWidth={1.4} strokeLinecap="round" />
              <path d="M-16.6 -30.6 Q-14.4 -32.6 -12 -30.6" stroke="#2A2530" strokeWidth={1} strokeLinecap="round" fill="none" />
              <path className="nt-urso-veia" d="M4 -49 q1.6 1.6 0 3.2 M6.2 -51 q1.6 1.6 0 3.2 M3.4 -52.4 q-1.6 -1.6 0 -3.2 M7 -46.6 q1.6 -1.6 3.2 0" stroke="#E53945" strokeWidth={1.2} strokeLinecap="round" fill="none" />
            </g>
          )}
          {/* boquinha aberta: comemorando ou falando com o trem */}
          {(feliz || acenando) && !bravo && <ellipse cx={-14.4} cy={-31.2} rx={1.5} ry={1.1} fill="#7A2E3A" />}
        </g>
        {/* a beliscada: um «!» em cima da cabeça */}
        {atento !== null && <text className="nt-urso-alerta" x={-4} y={-60} textAnchor="middle">!</text>}
      </g>
      </g>
      {peixe !== 'nao' && (
        <g className={cn('nt-urso-peixe', peixe === 'pulando' ? 'pulando' : 'na-pata')}
          style={{ ['--bx' as string]: `${boia.x}px`, ['--by' as string]: `${boia.y}px` }}>
          <ellipse cx={0} cy={0} rx={5.4} ry={2.7} fill="url(#nt-urso-peixe)" />
          <path d="M4.6 0 L9 -3 L8.2 0 L9 3 Z" fill="#E06E1F" />
          <path d="M-.6 .2 q.9 .9 1.8 0 M1.6 -.6 q.9 .9 1.8 0 M1.4 1 q.9 .9 1.8 0" stroke="#C85C14" strokeWidth={0.5} fill="none" strokeLinecap="round" />
          <circle cx={-2.8} cy={-0.6} r={0.7} fill="#2A2530" />
          <path d="M-0.4 -2.4 Q1.6 -3.6 3 -2.2" stroke="#FFD0A6" strokeWidth={0.8} fill="none" />
        </g>
      )}
    </g>
  );
});
