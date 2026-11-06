/**
 * O lado de dentro do iglu, visto pela janela (06/11/2026, pedido do Kauan).
 * As regras (atividades, quanto tempo até ele perceber, quanto a cortina fica
 * fechada) estão em `espiar.ts`.
 *
 * A janelinha redonda do iglu cresce num zoom até virar um cartão redondo — a
 * mesma janela, de perto —, com o interior: paredes de blocos de gelo, o
 * lampião, a arvorezinha, a cama, a prateleira com o retrato da mãe dele. O
 * urso está fazendo alguma coisa: dormindo, comendo, tomando chocolate,
 * lendo, tricotando ou conferindo a planilha de peixes.
 *
 * Olhou demais (`PERCEBE_EM_MS`): ele percebe — «!», cara de bravo, uma
 * bronca no balão —, a cortina fecha de um lado e do outro e o cartão
 * encolhe de volta para a janela. Quem fecha antes (fora do cartão, no «×» ou
 * Esc) sai sem ser pego.
 *
 * O cartão vai num portal no `<body>`, em posição fixa: a faixa do trem, onde
 * o iglu mora, corta o que passa da borda dela. Tudo anda por `transform` e
 * `opacity`.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Urso } from './DesenhoDoUrso';
import { BRONCAS, LEGENDAS, PERCEBE_EM_MS, type AtividadeDoUrso } from './espiar';

/** O diâmetro do cartão, em px (encolhe em tela pequena). */
const DIAMETRO = 270;
const ABRE_MS = 480;
const BRAVO_MS = 2600;
const CORTINA_MS = 900;

type Fase = 'abrindo' | 'olhando' | 'percebeu' | 'cortina' | 'saindo';

// ── O cenário (quadro de 240 × 240; o chão em 204) ──────────────────────────

function Cenario({ camaVazia }: { camaVazia: boolean }) {
  return (
    <g>
      <defs>
        <radialGradient id="nt-dentro-parede" cx=".5" cy=".18" r=".95">
          <stop offset="0" stopColor="#FFF3DD" />
          <stop offset=".45" stopColor="#E3EEF7" />
          <stop offset="1" stopColor="#A9C3D9" />
        </radialGradient>
        <radialGradient id="nt-dentro-luz" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#FFD98A" stopOpacity=".7" />
          <stop offset="1" stopColor="#FFD98A" stopOpacity="0" />
        </radialGradient>
        <pattern id="nt-dentro-xadrez" width={9} height={9} patternUnits="userSpaceOnUse" patternTransform="rotate(-6)">
          <rect width={9} height={9} fill="#2F7D52" />
          <rect y={3.2} width={9} height={2.6} fill="#C8353A" opacity=".8" />
          <rect x={3.2} width={2.6} height={9} fill="#C8353A" opacity=".6" />
        </pattern>
      </defs>
      {/* as paredes de blocos de gelo, curvas como a cúpula */}
      <rect width={240} height={240} fill="url(#nt-dentro-parede)" />
      {[58, 92, 126, 160].map((y, i) => (
        <g key={y}>
          <path d={`M-10 ${y} Q120 ${y - 22} 250 ${y}`} stroke="#B9CEE0" strokeWidth={1.4} fill="none" />
          <path d={`M-10 ${y + 1.6} Q120 ${y - 20.4} 250 ${y + 1.6}`} stroke="#FFFFFF" strokeWidth={1} fill="none" opacity={0.6} />
          {/* as juntas entre um bloco e outro, desencontradas de fileira em fileira */}
          {Array.from({ length: 6 }, (_, k) => {
            const x = 18 + k * 42 + (i % 2 ? 21 : 0);
            const naCurva = (base: number) => { const t = (x + 10) / 260; return base - 44 * t * (1 - t); };
            return <path key={k} d={`M${x} ${naCurva(y)} L${x} ${naCurva(y - 34)}`} stroke="#B9CEE0" strokeWidth={1.2} opacity={0.8} />;
          })}
        </g>
      ))}
      {/* o chão de gelo e o tapete de pelo */}
      <path d="M-10 196 Q120 184 250 196 V250 H-10 Z" fill="#E6F0F8" />
      <ellipse cx={112} cy={210} rx={78} ry={13} fill="#A8323A" />
      <ellipse cx={112} cy={210} rx={70} ry={10} fill="none" stroke="#F1D9A8" strokeWidth={1.4} strokeDasharray="4 3" />

      {/* a prateleira: o retrato da mãe e o pote do peixinho */}
      <rect x={14} y={98} width={62} height={4.5} rx={1.5} fill="#8E5E3B" />
      <rect x={22} y={74} width={20} height={24} rx={1.5} fill="#E2B04A" />
      <rect x={25} y={77} width={14} height={18} fill="#F7F5F0" />
      <circle cx={32} cy={84} r={4.6} fill="#FFFFFF" stroke="#D7DCE3" strokeWidth={0.6} />
      <circle cx={29} cy={80.6} r={1.6} fill="#FFFFFF" stroke="#D7DCE3" strokeWidth={0.5} />
      <circle cx={35} cy={80.6} r={1.6} fill="#FFFFFF" stroke="#D7DCE3" strokeWidth={0.5} />
      <circle cx={30.6} cy={84} r={0.6} fill="#2A2530" />
      <path d="M29.6 91.6 C28 90 29 88.4 30.4 89.4 C31.8 88.4 32.8 90 31.2 91.6 L30.4 92.4 Z" fill="#E5566B" />
      <circle cx={60} cy={88} r={9.6} fill="#CFEAF7" opacity={0.75} stroke="#9CC7E0" strokeWidth={0.8} />
      <g className="nt-dentro-peixinho"><ellipse cx={60} cy={89} rx={3.6} ry={1.9} fill="#F28C3A" /><path d="M63 89 l2.6 -2 v4 Z" fill="#E06E1F" /></g>

      {/* a arvorezinha de Natal, com luzinhas */}
      <g>
        <rect x={34} y={190} width={8} height={10} fill="#7A4E30" />
        <path d="M38 140 L58 192 L18 192 Z" fill="#2F7D52" />
        <path d="M38 140 L52 172 L24 172 Z" fill="#3F9C66" />
        <path d="M38 140 L46 158 L30 158 Z" fill="#4DA373" />
        {[[30, 182, '#FF5A5A'], [46, 184, '#FFC531'], [38, 168, '#8FD3FF'], [32, 164, '#FFC531'], [44, 156, '#FF5A5A']].map(([x, y, c], i) => (
          <circle key={i} className="nt-dentro-luzinha" cx={x as number} cy={y as number} r={1.8} fill={c as string} style={{ animationDelay: `${i * 0.37}s` }} />
        ))}
        <path d="M38 133 l2 4.2 4.6 .4 -3.6 3 1.2 4.6 -4.2 -2.6 -4.2 2.6 1.2 -4.6 -3.6 -3 4.6 -.4 Z" fill="#FFD54F" />
      </g>

      {/* a cama, com travesseiro e a manta xadrez */}
      <g>
        <rect x={222} y={146} width={8} height={58} rx={2} fill="#8E5E3B" />
        <rect x={146} y={182} width={84} height={14} rx={3} fill="#9A6A45" />
        <rect x={150} y={196} width={5} height={10} fill="#6E4529" />
        <rect x={220} y={196} width={5} height={10} fill="#6E4529" />
        <rect x={150} y={174} width={74} height={10} rx={4} fill="#F4F0E8" />
        <ellipse cx={206} cy={170} rx={15} ry={6.4} fill="#FFFFFF" stroke="#E2DDD2" strokeWidth={0.6} />
        {camaVazia && <path d="M150 184 V177 Q176 172 196 176 Q212 179 224 177 V184 Z" fill="url(#nt-dentro-xadrez)" />}
      </g>

      {/* o lampião pendurado, e a luz quente dele */}
      <circle className="nt-dentro-lampiao-luz" cx={120} cy={44} r={56} fill="url(#nt-dentro-luz)" />
      <path d="M120 -4 V26" stroke="#6E5A48" strokeWidth={1.2} />
      <path d="M112 30 H128 L126 26 H114 Z" fill="#4A3F44" />
      <rect x={113} y={30} width={14} height={18} rx={2} fill="#FFE7A8" stroke="#4A3F44" strokeWidth={1.4} />
      <path className="nt-dentro-chama" d="M120 33 C122.6 37 122 42 120 42 C118 42 117.4 37 120 33 Z" fill="#FFB347" />
      <path d="M111 48 H129 L127 52 H113 Z" fill="#4A3F44" />
    </g>
  );
}

/** O urso deitado na cama, de gorro de dormir. `acordou`: abriu o olho, bravo. */
function UrsoNaCama({ acordou }: { acordou: boolean }) {
  return (
    <g className={cn('nt-dentro-dormindo', acordou && 'acordou')}>
      <g className="nt-dentro-cabeca-cama">
        <circle cx={209} cy={152} r={4.4} fill="#E3E9EF" />
        <circle cx={200} cy={162} r={13.4} fill="#F7F5F0" />
        <ellipse cx={188} cy={167} rx={8} ry={5.6} fill="#FFFFFF" />
        <ellipse cx={181.6} cy={165} rx={2.6} ry={1.9} fill="#2A2530" />
        {acordou ? (
          <g>
            <circle cx={195} cy={159} r={1.9} fill="#2A2530" />
            <path d="M190.6 154.4 L198 156.6" stroke="#2A2530" strokeWidth={1.6} strokeLinecap="round" />
            <ellipse cx={194} cy={166} rx={2.6} ry={1.4} fill="#F05A6E" opacity={0.9} />
          </g>
        ) : (
          <g>
            <path d="M191.6 159.6 q3 2.6 6 0" stroke="#2A2530" strokeWidth={1.2} fill="none" strokeLinecap="round" />
            <ellipse cx={194} cy={166} rx={2.4} ry={1.3} fill="#FF94AA" opacity={0.6} />
          </g>
        )}
        {/* o gorro de dormir, caído para o lado */}
        <path d="M187 153 Q194 139 211 143 Q225 147 230 161 Q220 152 210 154 Q198 150 187 153 Z" fill="#3F9A5B" />
        <rect x={186} y={150.6} width={26} height={4.4} rx={2.2} fill="#2E7A47" transform="rotate(-8 199 152.8)" />
        <circle cx={230.6} cy={162.6} r={3.2} fill="#FFFFFF" />
      </g>
      {/* a manta por cima do corpo: sobe e desce com a respiração */}
      <g className="nt-dentro-respira">
        <path d="M150 184 V176 Q160 162 176 166 Q188 170 196 172 Q214 174 224 172 V184 Z" fill="url(#nt-dentro-xadrez)" />
        <path d="M150 176 Q160 162 176 166 Q188 170 196 172 Q214 174 224 172" stroke="#1F5E3C" strokeWidth={1} fill="none" />
      </g>
      {!acordou && (
        <g className="nt-dentro-zzz">
          <text x={178} y={146}>z</text>
          <text x={172} y={136} style={{ animationDelay: '.9s' }}>z</text>
          <text x={166} y={126} style={{ animationDelay: '1.8s' }}>Z</text>
        </g>
      )}
    </g>
  );
}

/** O que o urso sentado tem na pata, no desenho dele (a pata fica perto de -13, -25). */
function NaPata({ atividade }: { atividade: AtividadeDoUrso }) {
  if (atividade === 'chocolate') {
    return (
      <g transform="translate(-18 -31)">
        <g className="nt-dentro-vapor">
          <path d="M-2 -6 q-2 -3 0 -6 q2 -3 0 -6" /><path d="M2 -6 q-2 -3 0 -6 q2 -3 0 -6" style={{ animationDelay: '.6s' }} />
        </g>
        <rect x={-4.6} y={-5} width={9.2} height={9} rx={1.8} fill="#D6403A" />
        <path d="M4.4 -2.6 q4 0 4 3 t-4 3" stroke="#D6403A" strokeWidth={1.6} fill="none" />
        <ellipse cx={0} cy={-5} rx={4.6} ry={1.4} fill="#6B3F24" />
        <path d="M-2 -1 h4" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" opacity={0.85} />
      </g>
    );
  }
  if (atividade === 'lendo') {
    return (
      <g transform="translate(-21 -30) rotate(-12)">
        <path d="M0 -8 L-12 -10 L-12 6 L0 8 Z" fill="#F6EFE3" stroke="#B49D7E" strokeWidth={0.5} />
        <path d="M0 -8 L12 -10 L12 6 L0 8 Z" fill="#FFFFFF" stroke="#B49D7E" strokeWidth={0.5} />
        <path d="M-10 -5 L-2 -4 M-10 -2 L-2 -1 M-10 1 L-2 2 M2 -4 L10 -5 M2 -1 L10 -2 M2 2 L10 1" stroke="#C9BFAE" strokeWidth={0.6} />
        <g className="nt-dentro-pagina"><path d="M0 -8 L10 -9.6 L10 6.4 L0 8 Z" fill="#FBF7EF" stroke="#B49D7E" strokeWidth={0.5} /></g>
        <path d="M-13 -11 L0 -9 L13 -11 L13 8 L0 10 L-13 8 Z" fill="none" stroke="#C8353A" strokeWidth={1.4} strokeLinejoin="round" />
      </g>
    );
  }
  if (atividade === 'tricotando') {
    return (
      <g transform="translate(-18 -28)">
        <g className="nt-dentro-agulhas">
          <path d="M-9 -9 L7 5" stroke="#B98A2C" strokeWidth={1.2} strokeLinecap="round" />
          <path d="M-9 5 L7 -9" stroke="#B98A2C" strokeWidth={1.2} strokeLinecap="round" />
        </g>
        <g className="nt-dentro-cachecol">
          <rect x={-4} y={-1} width={8} height={18} rx={1.5} fill="#D6403A" />
          <path d="M-4 4 H4 M-4 10 H4" stroke="#FFFFFF" strokeWidth={1.4} />
        </g>
      </g>
    );
  }
  return null;
}

/** O que fica no chão, na frente dele (no quadro do cartão). */
function NoChao({ atividade }: { atividade: AtividadeDoUrso }) {
  if (atividade === 'comendo') {
    return (
      <g>
        <ellipse cx={56} cy={210} rx={15} ry={4.4} fill="#FFFFFF" stroke="#D7DCE3" strokeWidth={0.8} />
        <ellipse cx={56} cy={209} rx={10} ry={2.6} fill="#F2F4F7" />
        <path d="M48 208.4 H62 M51 206.6 V210.2 M54 206.4 V210.4 M57 206.6 V210.2 M60 207 V209.8" stroke="#B8BEC8" strokeWidth={0.8} strokeLinecap="round" />
        <path d="M46 208.4 l-3 -2.4 v4.8 Z" fill="#B8BEC8" />
        <circle cx={66} cy={208.6} r={1.6} fill="#B8BEC8" />
      </g>
    );
  }
  if (atividade === 'tricotando') {
    return (
      <g>
        <path d="M54 206 Q66 186 78 170" stroke="#D6403A" strokeWidth={0.8} fill="none" />
        <circle className="nt-dentro-novelo" cx={52} cy={206} r={6.4} fill="#D6403A" />
        <path d="M47 204 q5 -4 10 0 M47.6 208 q5 -3 9 1" stroke="#A9282F" strokeWidth={0.8} fill="none" />
      </g>
    );
  }
  if (atividade === 'planilha') {
    // o notebook no tapete: a planilha de peixes, célula por célula
    return (
      <g transform="translate(40 178)">
        <path d="M-2 26 L40 26 L44 30 L-6 30 Z" fill="#9AA3AE" />
        <rect x={0} y={0} width={38} height={26} rx={2} fill="#2A2F3A" />
        <rect x={2.4} y={2.4} width={33.2} height={21.2} fill="#FFFFFF" />
        <rect x={2.4} y={2.4} width={33.2} height={4} fill="#2F7D52" />
        <text x={4} y={5.6} fontSize={3} fontWeight={700} fill="#FFFFFF" fontFamily="system-ui, sans-serif">peixes.xlsx</text>
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} className="nt-dentro-celula" x={4 + (i % 3) * 10.6} y={8.4 + Math.floor(i / 3) * 3.7} width={9.4} height={2.6}
            fill={i % 3 === 2 ? '#F28C3A' : '#DCE6EF'} style={{ animationDelay: `${i * 0.25}s` }} />
        ))}
      </g>
    );
  }
  return null;
}

// ── O cartão ────────────────────────────────────────────────────────────────

export function DentroDoIglu({ origem, atividade, emCasa, onFechar }: {
  /** Onde está a janelinha na tela: o zoom nasce e morre nela. */
  origem: DOMRect;
  atividade: AtividadeDoUrso;
  /** O urso continua em casa? Se ele sair, a espiada termina. */
  emCasa: boolean;
  /** `pego`: o urso percebeu e fechou a cortina. */
  onFechar: (pego: boolean) => void;
}) {
  const [fase, setFase] = useState<Fase>('abrindo');
  const [bronca] = useState(() => BRONCAS[Math.floor(Math.random() * BRONCAS.length)]);
  const fechou = useRef(false);
  const timers = useRef<number[]>([]);
  const depois = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, ms)); };

  // O roteiro: abre, olha, e — se a pessoa ficar — o urso percebe, fecha a cortina e o cartão.
  useEffect(() => {
    depois(ABRE_MS, () => setFase('olhando'));
    depois(ABRE_MS + PERCEBE_EM_MS, () => setFase('percebeu'));
    depois(ABRE_MS + PERCEBE_EM_MS + BRAVO_MS, () => setFase('cortina'));
    depois(ABRE_MS + PERCEBE_EM_MS + BRAVO_MS + CORTINA_MS, () => sair(true));
    const lista = timers.current;
    return () => lista.forEach(t => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o roteiro roda uma vez por espiada
  }, []);

  function sair(pego: boolean) {
    if (fechou.current) return;
    fechou.current = true;
    timers.current.forEach(t => window.clearTimeout(t));
    timers.current = [];
    setFase('saindo');
    window.setTimeout(() => onFechar(pego), ABRE_MS);
  }

  // Esc fecha; o urso saiu de casa, a espiada acaba.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') sair(false); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!emCasa) sair(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sair` só lê refs; o que importa é o urso sair de casa
  }, [emCasa]);

  // Onde o cartão fica: perto da janela, dentro da tela (embaixo dela, ou em cima se não couber).
  const vw = window.innerWidth, vh = window.innerHeight;
  const d = Math.min(DIAMETRO, vw - 32, vh - 32);
  const wx = origem.left + origem.width / 2, wy = origem.top + origem.height / 2;
  const left = Math.min(Math.max(wx - d / 2, 16), vw - d - 16);
  const abaixo = wy + 22 + d + 40 <= vh;
  const top = Math.min(Math.max(abaixo ? wy + 22 : wy - 22 - d, 16), vh - d - 16);
  const zoom = {
    ['--dx' as string]: `${wx - (left + d / 2)}px`,
    ['--dy' as string]: `${wy - (top + d / 2)}px`,
    ['--s0' as string]: String(Math.max(0.04, origem.width / d)),
  };

  const bravo = fase === 'percebeu' || fase === 'cortina';
  const fechando = fase === 'cortina' || (fase === 'saindo' && fechou.current && bravo);
  const dormindo = atividade === 'dormindo';

  return createPortal(
    <div className={cn('nt-espiada-raiz', fase === 'saindo' && 'saindo')}>
      <div className="nt-espiada-fundo" onClick={() => sair(false)} />
      <div className={cn('nt-espiada', `fase-${fase}`, `faz-${atividade}`)} role="dialog" aria-label="Espiando o urso pela janela do iglu"
        style={{ left, top, width: d, height: d, ...zoom }}>
        <svg viewBox="0 0 240 240" width={d} height={d}>
          <Cenario camaVazia={!dormindo} />
          {dormindo ? (
            <UrsoNaCama acordou={bravo} />
          ) : (
            <>
              <NoChao atividade={atividade} />
              <g transform="translate(100 206) scale(1.6)">
                <g className="nt-dentro-urso">
                  <Urso feliz={atividade === 'chocolate' && !bravo} vara={false} fisgando={false} pulando={false} acenando={false}
                    peixe={atividade === 'comendo' && !bravo ? 'na-pata' : 'nao'} atento={bravo ? 0.5 : null} bravo={bravo} />
                  {!bravo && <NaPata atividade={atividade} />}
                </g>
              </g>
            </>
          )}
          {/* a cortina: as duas metades correm até o meio */}
          <g className={cn('nt-espiada-cortina', fechando && 'fechada')}>
            <g className="esq">
              <rect x={-4} y={-4} width={126} height={250} fill="#A9282F" />
              {[14, 40, 66, 92, 114].map(x => <path key={x} d={`M${x} -4 V246`} stroke="#7E1F25" strokeWidth={5} opacity={0.5} />)}
            </g>
            <g className="dir">
              <rect x={118} y={-4} width={126} height={250} fill="#A9282F" />
              {[126, 148, 174, 200, 226].map(x => <path key={x} d={`M${x} -4 V246`} stroke="#7E1F25" strokeWidth={5} opacity={0.5} />)}
            </g>
          </g>
        </svg>
        {/* o vidro: o reflexo e a moldura de gelo da janela */}
        <div className="nt-espiada-vidro" />
        {bravo && <div className="nt-espiada-bronca" role="status">{bronca}</div>}
        {!bravo && fase !== 'saindo' && <p className="nt-espiada-legenda">{LEGENDAS[atividade]}</p>}
        <button type="button" className="nt-espiada-fechar" aria-label="Parar de espiar" onClick={() => sair(false)}>×</button>
      </div>
    </div>,
    document.body,
  );
}
