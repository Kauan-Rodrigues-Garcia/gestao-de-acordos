import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuthOpcional } from '@/hooks/useAuth';
import { useModoLeve } from '@/lib/modoLeve';
import { useRelogioDoTrem } from '../trem/comum';
import { ondeEsta } from '../trem/horario';
import { agendaAgora } from '../trem/agenda';
import { ROTA_DO_TREM } from '../trem/rota';
import { relogioNatal } from '../musica';
import { ENTRANDO_S, SAINDO_S, beliscada, chamarUrsoParaTeste, oUrsoAgora, tremPassaPeloIglu } from './urso';
import { criarRodada, type MomentoDoUrso } from './falas';
import './iglu.css';

/** O balão escreve uma letra a cada tanto (ms), como quem está falando. */
const MS_POR_LETRA = 26;
/** Depois de escrita, a fala fica o tempo de ler: mais longa, mais tempo. */
const tempoDeLer = (letras: number) => Math.min(5500, Math.max(2000, 1400 + 45 * letras));
const primeiroNome = (nome: string | null | undefined) => (nome ?? '').trim().split(/\s+/)[0] || null;

/**
 * O relógio quadro a quadro, só com o urso fora do iglu (Cleber, 05/11/2026:
 * «como se ele tivesse no mesmo frame a cada segundo»). Antes a posição vinha
 * de um relógio de 200 ms alisado por CSS — e com a redução de animações do
 * Windows a transição sumia e ele andava aos pulos. Aqui são ~30 quadros por
 * segundo, e só enquanto ele está fora.
 */
function useRelogioFino(ativo: boolean): number {
  const [agora, setAgora] = useState(relogioNatal);
  useEffect(() => {
    if (!ativo) return;
    let quadro = 0, antes = 0;
    const passo = (t: number) => {
      if (t - antes >= 33) { antes = t; setAgora(relogioNatal()); }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [ativo]);
  return agora;
}

/*
 * O iglu do urso, no alto do Analítico (pedido do Cleber, 04/11/2026).
 *
 * Estilo das referências de ilustração plana (urso polar fofo, pescando no
 * gelo): formas redondas e amigáveis, paleta fria — branco, azul-gelo — com o
 * vermelho e o verde do Natal no cachecol e no gorro; sem contorno, como o
 * trem e o boneco de neve.
 *
 * Quando o urso sai é o relógio que diz (`urso.ts`): raramente, e para todo
 * mundo ao mesmo tempo. Fora das visitas ele está lá dentro — porta fechada,
 * janelinha acesa. Clicar nele (ou no iglu) puxa conversa: o que ele fala, e
 * em que ordem, é `falas.ts` (sorteado por rodada, sem repetir). O balão
 * escreve letra por letra e, numa conversa de mais de uma fala, ele continua
 * sozinho; um clique adianta.
 *
 * O iglu é bem mais alto que o urso (Cleber, 04/11/2026: «para fazer sentido o
 * tamanho da porta»): a porta tem a altura dele de gorro, e a cúpula passa
 * dele com folga.
 *
 * Desenho em px da tela, `LARGURA` × `ALTURA`, com o chão em y = `CHAO`.
 */

export const LARGURA = 300;
export const ALTURA = 132;
const CHAO = 126;
/** O lago e a plaquinha foram desenhados com o chão em 92 e descem até o chão de agora. */
const DESCE = CHAO - 92;
/** Onde o urso senta (na beira do lago) e onde fica a porta. */
const X_SENTADO = 104;
const X_PORTA = 163;
/** O buraco no gelo, onde vai a boia. */
const BURACO = { x: 76, y: 89.6 + DESCE };

/** Um brilhinho de quatro pontas. */
const ESTRELINHA = 'M0 -3.2 L0.8 -0.8 L3.2 0 L0.8 0.8 L0 3.2 L-0.8 0.8 L-3.2 0 L-0.8 -0.8 Z';

const limitar = (v: number) => Math.max(0, Math.min(1, v));
const suave = (t: number) => t * t * (3 - 2 * t);

const Urso = memo(function Urso({ feliz, vara, peixe, fisgando, atento, acenando, pulando }: {
  feliz: boolean; vara: boolean; peixe: 'nao' | 'pulando' | 'na-pata'; fisgando: boolean;
  /** Uma beliscada na isca (0 a 1 dela), ou `null`: a boia afunda, a vara verga, ele se inclina. */
  atento: number | null;
  /** O trem passando: o braço livre acena. */
  acenando: boolean;
  /** Fisgou: dá dois pulinhos de alegria. */
  pulando: boolean;
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
        <ellipse className="nt-urso-pe tras" cx={4} cy={-2.8} rx={5.6} ry={3.2} fill="#ECEFF2" />
        <g className="nt-urso-respira">
        <ellipse cx={1} cy={-19} rx={13} ry={14} fill="#F7F5F0" />
        <path d="M6 -32 Q15 -24 13 -12 Q11 -5 4 -5 Q10 -16 6 -32 Z" fill="#E3E9EF" />
        <ellipse cx={-4} cy={-15.5} rx={7} ry={9} fill="#FFFFFF" />
        </g>
        {/* o pé da frente, com a almofadinha */}
        <g className="nt-urso-pe frente">
          <ellipse cx={-8} cy={-3.2} rx={6.2} ry={3.5} fill="#F7F5F0" />
          <ellipse cx={-12.4} cy={-3.2} rx={1.7} ry={2.2} fill="#CDB9A8" />
        </g>
        {/* o braço livre, acenando para o trem */}
        {acenando && (
          <g transform="translate(7 -27)">
            <g className="nt-urso-tchau">
              <ellipse cx={3.4} cy={-7} rx={3.6} ry={7.4} fill="#F7F5F0" transform="rotate(24 3.4 -7)" />
              <circle cx={6.6} cy={-13.4} r={3.6} fill="#FFFFFF" />
              <ellipse cx={6.4} cy={-12.6} rx={1.5} ry={1.2} fill="#CDB9A8" />
            </g>
          </g>
        )}
        {/* o cachecol, com a ponta voando */}
        <path d="M-10 -29.5 Q0 -25.5 9 -29.5 L9 -25 Q0 -21 -10 -25 Z" fill="#D6403A" />
        <path d="M-6 -28 L-6 -23.5 M0 -27 L0 -22.5 M6 -28 L6 -23.5" stroke="#FFFFFF" strokeWidth={1.2} opacity={0.85} />
        <g className="nt-urso-cachecol">
          <path d="M5 -27 L13 -15 L9.2 -14 L2.4 -25 Z" fill="#D6403A" />
          <path d="M8.4 -21.6 L11 -17.6" stroke="#FFFFFF" strokeWidth={1.3} />
        </g>
        {/* o braço que segura a vara (ou o peixe) */}
        <ellipse cx={-9} cy={-21.5} rx={4.4} ry={6.4} fill="#F7F5F0" transform="rotate(-48 -9 -21.5)" />
        <circle cx={-13.2} cy={-25.2} r={3.3} fill="#FFFFFF" />
        {vara && (
          <g transform={`rotate(${(-verga).toFixed(2)} -11 -23)`}>
            <g className={cn('nt-urso-vara', fisgando && 'puxando')}>
              <path d={`M-11 -23 Q-30 ${(-40 + verga * 0.8).toFixed(1)} -46 ${(-50 + verga).toFixed(1)}`} stroke="#7A5236" strokeWidth={1.8} strokeLinecap="round" fill="none" />
              <circle cx={-14} cy={-25.6} r={2.1} fill="#3A2F3B" />
            </g>
          </g>
        )}
        {/* a cabeça: orelhas, gorro com pompom, focinho, olho e bochecha */}
        <g className="nt-urso-cabeca">
          <circle cx={1.6} cy={-44.4} r={3.3} fill="#E3E9EF" />
          <circle cx={-5} cy={-37} r={10.2} fill="#F7F5F0" />
          <path d="M2 -44 Q6.4 -38 3.6 -30 Q1 -28 -1 -28.4 Q4 -36 2 -44 Z" fill="#E3E9EF" />
          <circle cx={-6.6} cy={-46.4} r={3.4} fill="#F7F5F0" />
          <circle cx={-6.6} cy={-46.4} r={1.6} fill="#F3C4CF" />
          <path d="M-14.6 -41.6 Q-13.6 -52 -4.4 -52.4 Q4.8 -52 6 -42.4 Z" fill="#3F9A5B" />
          <rect x={-15.6} y={-44} width={22.4} height={4.4} rx={2.2} fill="#2E7A47" />
          <path d="M-12 -44 V-40 M-7.5 -44 V-40 M-3 -44 V-40 M1.5 -44 V-40" stroke="#3F9A5B" strokeWidth={1} />
          <circle className="nt-urso-pompom" cx={-3.4} cy={-53.6} r={3.1} fill="#FFFFFF" />
          <ellipse cx={-13} cy={-34.4} rx={6.4} ry={4.7} fill="#FFFFFF" />
          <ellipse cx={-18.3} cy={-36} rx={2.4} ry={1.75} fill="#2A2530" />
          <path d="M-16.2 -32.4 Q-14 -30.6 -11.8 -32.4" stroke="#2A2530" strokeWidth={0.9} strokeLinecap="round" fill="none" />
          {feliz
            ? <path d="M-10.6 -38.4 Q-8.6 -41 -6.6 -38.4" stroke="#2A2530" strokeWidth={1.3} strokeLinecap="round" fill="none" />
            : (
              <g className="nt-urso-olho">
                <circle cx={-8.6} cy={-39.2} r={1.55} fill="#2A2530" />
                <circle cx={-8.1} cy={-39.8} r={0.5} fill="#FFFFFF" />
              </g>
            )}
          <ellipse cx={-8.8} cy={-34.4} rx={2.1} ry={1.25} fill="#FF94AA" opacity={0.6} />
          {/* boquinha aberta: comemorando ou falando com o trem */}
          {(feliz || acenando) && <ellipse cx={-14.4} cy={-31.2} rx={1.5} ry={1.1} fill="#7A2E3A" />}
        </g>
        {/* a beliscada: um «!» em cima da cabeça */}
        {atento !== null && <text className="nt-urso-alerta" x={-4} y={-60} textAnchor="middle">!</text>}
      </g>
      </g>
      {peixe !== 'nao' && (
        <g className={cn('nt-urso-peixe', peixe === 'pulando' ? 'pulando' : 'na-pata')}
          style={{ ['--bx' as string]: `${boia.x}px`, ['--by' as string]: `${boia.y}px` }}>
          <ellipse cx={0} cy={0} rx={5.4} ry={2.7} fill="#F28C3A" />
          <path d="M4.6 0 L9 -3 L8.2 0 L9 3 Z" fill="#E06E1F" />
          <circle cx={-2.8} cy={-0.6} r={0.7} fill="#2A2530" />
          <path d="M-0.4 -2.4 Q1.6 -3.6 3 -2.2" stroke="#FFD0A6" strokeWidth={0.8} fill="none" />
        </g>
      )}
    </g>
  );
});

const CenaDoIglu = memo(function CenaDoIglu({ porta, acesa, ondinha }: { porta: boolean; acesa: boolean; ondinha: boolean }) {
  // As fileiras de blocos da cúpula (de baixo para cima) e as do túnel.
  const fileiras = [126, 114, 101, 88, 75, 63, 53, 44];
  const fileirasTunel = [126, 114, 102, 90, 78, 66];
  return (
    <>
      <defs>
        <clipPath id="nt-iglu-cupula"><path d="M150 126 A64 80 0 0 1 278 126 Z" /></clipPath>
        <clipPath id="nt-iglu-tunel"><path d="M136 126 V91 A27 30 0 0 1 190 91 V126 Z" /></clipPath>
        <clipPath id="nt-iglu-porta-forma"><path d="M147 126 V94.5 A16 23 0 0 1 179 94.5 V126 Z" /></clipPath>
        {/* o gelo com volume: luz no alto à esquerda, sombra embaixo à direita */}
        <radialGradient id="nt-iglu-gelo" cx="0.32" cy="0.22" r="0.95">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#EEF4F9" />
          <stop offset="1" stopColor="#CFDDE9" />
        </radialGradient>
        <radialGradient id="nt-iglu-luz" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFD98A" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFD98A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nt-iglu-boca" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1C2532" />
          <stop offset="1" stopColor="#334257" />
        </linearGradient>
      </defs>

      {/* À esquerda: a plaquinha, o laguinho com o buraco e o bloco onde o urso senta */}
      <g transform={`translate(0 ${DESCE})`}>
        <rect x={13.5} y={66} width={3} height={26} rx={1.2} fill="#7A5236" />
        <rect x={2} y={57} width={32} height={12} rx={2.5} fill="#A0724F" />
        <text x={18} y={65.4} textAnchor="middle" fontSize={6.6} fontWeight={800} letterSpacing={0.6} fill="#FFF8EC" fontFamily="system-ui, sans-serif">PESCA</text>
        <path d="M2.5 58.5 Q10 55 18 57.4 Q26 55 33.5 58.5 L33.5 57 L2.5 57 Z" fill="#FFFFFF" />
        <ellipse cx={70} cy={90} rx={48} ry={7.6} fill="#CDEBF7" />
        <ellipse cx={66} cy={89.4} rx={38} ry={5} fill="#E3F4FB" />
        <path d="M38 90 L48 88.6 L54 90.4 M92 88.4 L100 89.6 M58 92.6 L66 91.4" stroke="#B3D8EA" strokeWidth={0.8} fill="none" />
        <ellipse cx={BURACO.x} cy={BURACO.y - DESCE} rx={8.4} ry={3} fill="#FFFFFF" />
        <ellipse cx={BURACO.x} cy={BURACO.y - DESCE + 0.3} rx={7} ry={2.4} fill="#2F6F9F" />
        {ondinha && <ellipse className="nt-urso-ondinha" cx={BURACO.x} cy={BURACO.y - DESCE + 0.3} rx={7} ry={2.4} fill="none" stroke="#FFFFFF" strokeWidth={0.8} />}
        <rect x={X_SENTADO - 9} y={85} width={18} height={7} rx={2} fill="#D3E6F2" />
        <rect x={X_SENTADO - 9} y={85} width={18} height={2} rx={1} fill="#EAF4FA" />
      </g>

      {/* A sombra do iglu na neve */}
      <ellipse cx={212} cy={126} rx={82} ry={5} fill="#B4C7D7" opacity={0.45} />

      {/* A cúpula: gelo com volume, blocos desencontrados com brilho na borda de cima, sombra à direita */}
      <path d="M150 126 A64 80 0 0 1 278 126 Z" fill="url(#nt-iglu-gelo)" />
      <g clipPath="url(#nt-iglu-cupula)">
        {fileiras.slice(1).map(y => (
          <g key={y}>
            <line x1={150} y1={y} x2={278} y2={y} stroke="#BFD0DE" strokeWidth={1.1} />
            <line x1={150} y1={y + 1.3} x2={278} y2={y + 1.3} stroke="#FFFFFF" strokeWidth={0.9} opacity={0.75} />
          </g>
        ))}
        {fileiras.slice(0, -1).map((baixo, i) => {
          const alto = fileiras[i + 1];
          return Array.from({ length: 7 }, (_, k) => 150 + (i % 2 ? 11 : 0) + k * 22).map(x => (
            <line key={`${baixo}-${x}`} x1={x} y1={alto} x2={x} y2={baixo} stroke="#BFD0DE" strokeWidth={1.1} />
          ));
        })}
      </g>
      <path d="M278 126 A64 80 0 0 0 236 50 Q270 80 262 126 Z" fill="#B9CCDC" opacity={0.45} />
      <path d="M180 120 Q176 84 196 60" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.55} />
      <path d="M186 52 Q196 41 210 43.6 Q222 39.6 234 46.6 Q241 50.4 243 55.6 Q233 51.4 224 53.2 Q214 49.2 204 53 Q194 50.6 186 52 Z" fill="#FFFFFF" />

      {/* A janela redonda: acesa com o urso em casa, com o reflexo na neve */}
      <ellipse className={cn('nt-iglu-reflexo', acesa && 'acesa')} cx={240} cy={124.6} rx={24} ry={3.6} fill="#FFD98A" />
      <circle className={cn('nt-iglu-brilho', acesa && 'acesa')} cx={242} cy={86} r={24} fill="url(#nt-iglu-luz)" />
      <circle cx={242} cy={86} r={11} fill="#BFD0DE" />
      <circle className={cn('nt-iglu-vidro', acesa && 'acesa')} cx={242} cy={86} r={8.2} />
      <path d="M242 77.8 V94.2 M233.8 86 H250.2" stroke="#BFD0DE" strokeWidth={1.6} />
      <path d="M236 82.6 A7 7 0 0 1 240 79.4" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.7} />
      <path d="M230 97.6 Q242 94 254 97.6 Q242 100 230 97.6 Z" fill="#FFFFFF" />

      {/* O túnel da entrada, em blocos */}
      <path d="M136 126 V91 A27 30 0 0 1 190 91 V126 Z" fill="url(#nt-iglu-gelo)" />
      <g clipPath="url(#nt-iglu-tunel)">
        {fileirasTunel.slice(1).map(y => (
          <g key={y}>
            <line x1={136} y1={y} x2={190} y2={y} stroke="#BFD0DE" strokeWidth={1.1} />
            <line x1={136} y1={y + 1.3} x2={190} y2={y + 1.3} stroke="#FFFFFF" strokeWidth={0.9} opacity={0.75} />
          </g>
        ))}
        {fileirasTunel.slice(0, -1).map((baixo, i) => {
          const alto = fileirasTunel[i + 1];
          return Array.from({ length: 4 }, (_, k) => 136 + (i % 2 ? 9 : 0) + k * 18).map(x => (
            <line key={`${baixo}-${x}`} x1={x} y1={alto} x2={x} y2={baixo} stroke="#BFD0DE" strokeWidth={1.1} />
          ));
        })}
      </g>

      {/* A boca escura, a luz pelas frestas (com o urso em casa) e a porta de madeira */}
      <path d="M146 126 V94 A17 24 0 0 1 180 94 V126 Z" fill="url(#nt-iglu-boca)" />
      <path className={cn('nt-iglu-fresta', acesa && 'acesa')} d="M146.6 126 V94 A16.4 23.4 0 0 1 179.4 94 V126" stroke="#FFD98A" strokeWidth={2} fill="none" />
      <g className={cn('nt-iglu-porta', porta && 'aberta')}>
        <path d="M147 126 V94.5 A16 23 0 0 1 179 94.5 V126 Z" fill="#8A5E3F" />
        <g clipPath="url(#nt-iglu-porta-forma)">
          <path d="M155 126 V70 M163 126 V70 M171 126 V70" stroke="#6E4A30" strokeWidth={1.1} />
          <rect x={146} y={102} width={34} height={2.4} fill="#4A3F44" opacity={0.75} />
          <rect x={146} y={117} width={34} height={2.4} fill="#4A3F44" opacity={0.75} />
          <path d="M147 94.5 A16 23 0 0 1 179 94.5" stroke="#A97B55" strokeWidth={1.6} fill="none" />
        </g>
        <circle cx={174} cy={111} r={1.7} fill="#F2B544" />
        {/* a guirlandinha da porta */}
        <circle cx={163} cy={86} r={4.6} fill="none" stroke="#3F9A5B" strokeWidth={2.4} />
        <circle cx={160.4} cy={83.6} r={0.9} fill="#D6403A" />
        <circle cx={166} cy={88} r={0.9} fill="#D6403A" />
        <path d="M161.4 91.2 L163 89.6 L164.6 91.2" stroke="#D6403A" strokeWidth={1.4} strokeLinecap="round" fill="none" />
      </g>

      {/* A neve no alto do túnel e os pingentes de gelo */}
      <path d="M133 93 Q138 78 150 68.6 Q163 61.4 176 68.6 Q188 78 193 93 Q186 82 176 74.4 Q163 67.6 150 74.4 Q140 82 133 93 Z" fill="#FFFFFF" />
      <path d="M136.4 90 l1.6 6.6 l1.6 -6.6 Z M140.6 84 l1.3 5.2 l1.3 -5.2 Z M184.6 84 l1.3 5.2 l1.3 -5.2 Z M188.2 90 l1.6 6.6 l1.6 -6.6 Z" fill="#D9ECF7" />

      {/* Os montes de neve na base */}
      <path d="M126 126 Q131 119 138 121 Q143 118 146 126 Z" fill="#FFFFFF" />
      <path d="M192 126 Q200 118.4 212 121.6 Q224 116.6 238 126 Z" fill="#FFFFFF" />
      <path d="M262 126 Q272 116 284 119.4 Q293 121.6 296 126 Z" fill="#FFFFFF" />

      {/* Brilhinhos no gelo */}
      {([[198, 72, 0], [226, 106, 1.1], [262, 94, 2.2], [214, 58, 0.6], [186, 106, 1.7]] as const).map(([x, y, atraso]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
          <path className="nt-iglu-brilhinho" d={ESTRELINHA} fill="#FFFFFF" style={{ animationDelay: `${atraso}s` }} />
        </g>
      ))}
    </>
  );
});

export function IgluDoUrso() {
  // Com o urso lá dentro nada se mexe: o relógio anda de segundo em segundo. Com ele fora, quadro a quadro.
  const leve = useModoLeve();
  const lento = useRelogioDoTrem(1000);
  const fora = oUrsoAgora(lento).fase !== 'dentro';
  const fino = useRelogioFino(fora);
  const agora = fora ? Math.max(fino, lento) : lento;
  const { fase, t } = oUrsoAgora(agora);
  // O trem passando pelo iglu, com ele pescando: tchauzinho (e uma fala, uma vez por passagem).
  const posDoTrem = ondeEsta(lento, ROTA_DO_TREM, agendaAgora());
  const acenando = fase === 'pescando' && tremPassaPeloIglu(posDoTrem);
  const atento = fase === 'pescando' && !acenando ? beliscada(t) : null;
  const nome = primeiroNome(useAuthOpcional()?.perfil?.nome);
  /** A conversa em andamento: as falas dela, qual está no balão, e quem fala. */
  const [fala, setFala] = useState<{ linhas: string[]; i: number; doUrso: boolean; id: number } | null>(null);
  /** Quantas letras da fala de agora já foram escritas. */
  const [letras, setLetras] = useState(0);
  /** A rodada de conversa (baralhos embaralhados); recomeça quando ele aparece ou entra. */
  const rodada = useRef<ReturnType<typeof criarRodada> | null>(null);

  // Escreve a fala letra por letra; lida, passa para a próxima da conversa (ou fecha o balão).
  useEffect(() => {
    if (!fala) return;
    const total = Array.from(fala.linhas[fala.i]).length;
    const instantaneo = leve;
    let n = instantaneo ? total : 0;
    setLetras(n);
    const escreve = instantaneo ? 0 : window.setInterval(() => {
      n = Math.min(total, n + 1);
      setLetras(n);
      if (n >= total) window.clearInterval(escreve);
    }, MS_POR_LETRA);
    const fim = window.setTimeout(() => {
      setFala(f => (f && f.id === fala.id && f.i === fala.i ? (f.i + 1 < f.linhas.length ? { ...f, i: f.i + 1 } : null) : f));
    }, (instantaneo ? 0 : total * MS_POR_LETRA) + tempoDeLer(total));
    return () => { window.clearInterval(escreve); window.clearTimeout(fim); };
  }, [fala, leve]);

  // Onde o urso está, se aparece, e a porta.
  let x = X_SENTADO, opacidade = 1, andando = false, porta = false;
  if (fase === 'dentro') opacidade = 0;
  if (fase === 'saindo') {
    porta = t < SAINDO_S - 0.5;
    x = X_PORTA + (X_SENTADO - X_PORTA) * suave(limitar((t - 0.5) / (SAINDO_S - 1.1)));
    opacidade = limitar((t - 0.35) / 0.4);
    andando = t > 0.5 && t < SAINDO_S - 0.6;
  }
  if (fase === 'entrando') {
    porta = t > 0.2 && t < ENTRANDO_S - 0.3;
    x = X_SENTADO + (X_PORTA - X_SENTADO) * suave(limitar((t - 0.3) / (ENTRANDO_S - 1.2)));
    opacidade = 1 - limitar((t - (ENTRANDO_S - 0.95)) / 0.45);
    andando = t > 0.3 && t < ENTRANDO_S - 0.9;
  }
  const acesa = fase === 'dentro' || (fase === 'entrando' && t > ENTRANDO_S - 0.25);
  const visivel = opacidade > 0.05;

  // Uma rodada nova cada vez que ele aparece (e cada vez que ele entra, para o iglu).
  useEffect(() => { rodada.current = null; }, [visivel]);

  // O tchauzinho para o trem: uma fala por passagem (a viagem e o sentido dizem qual).
  const passagem = acenando ? `${posDoTrem.partidaMs}-${posDoTrem.fase}` : null;
  const ultimaPassagem = useRef<string | null>(null);
  useEffect(() => {
    if (!passagem || ultimaPassagem.current === passagem) return;
    ultimaPassagem.current = passagem;
    rodada.current ??= criarRodada(nome, new Date().getHours());
    setFala({ linhas: rodada.current.proxima('trem'), i: 0, doUrso: true, id: Date.now() });
  }, [passagem, nome]);

  const clicar = () => {
    const doUrso = visivel;
    // No meio de uma conversa: adianta para a próxima fala dela.
    if (fala && fala.doUrso === doUrso && fala.i + 1 < fala.linhas.length) {
      setFala({ ...fala, i: fala.i + 1 });
      return;
    }
    rodada.current ??= criarRodada(nome, new Date().getHours());
    const momento: MomentoDoUrso = !doUrso ? 'iglu' : fase === 'fisgou' || fase === 'entrando' ? 'fisgou' : 'pescando';
    setFala({ linhas: rodada.current.proxima(momento), i: 0, doUrso, id: Date.now() });
  };
  const texto = fala ? Array.from(fala.linhas[fala.i]) : [];

  return (
    <div className={cn('nt-iglu', leve && 'leve')} onClick={clicar} role="button" tabIndex={0} aria-label="O iglu do urso"
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clicar(); } }}>
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} width={LARGURA} height={ALTURA} overflow="visible">
        <CenaDoIglu porta={porta} acesa={acesa} ondinha={fase === 'pescando' || fase === 'fisgou'} />
        {/* Voltando para casa, ele vira para a porta (o desenho olha para a esquerda). */}
        <g className={cn('nt-urso', andando && 'andando')}
          style={{ transform: `translate(${x.toFixed(2)}px, ${CHAO}px)${fase === 'entrando' ? ' scaleX(-1)' : ''}`, opacity: opacidade }}>
          <Urso
            feliz={fase === 'fisgou' || fase === 'entrando'}
            vara={fase === 'pescando' || fase === 'fisgou'}
            fisgando={fase === 'fisgou' && t < 1.6}
            peixe={fase === 'fisgou' ? (t < 1.4 ? 'pulando' : 'na-pata') : fase === 'entrando' ? 'na-pata' : 'nao'}
            atento={atento}
            acenando={acenando}
            pulando={fase === 'fisgou' && t > 1.4 && t < 3.2}
          />
        </g>
      </svg>
      {fala && (
        <div key={`${fala.id}-${fala.i}`} className="nt-iglu-fala" role="status" aria-label={texto.join('')}
          // À esquerda de quem fala, na altura da cabeça: em cima seria cortado pelo alto da página.
          style={{ right: LARGURA - (fala.doUrso ? x - 16 : 140), bottom: fala.doUrso ? 46 : 40 }}>
          {/* O resto da frase já ocupa o lugar (invisível): o balão nasce do tamanho certo e não pula. */}
          <span aria-hidden="true">{texto.slice(0, letras).join('')}</span>
          <span aria-hidden="true" className="nt-iglu-fala-resto">{texto.slice(letras).join('')}</span>
        </div>
      )}
      {import.meta.env.DEV && (
        <button type="button" className="nt-trem-botao-teste nt-iglu-teste" title="Só no npm run dev"
          onClick={e => { e.stopPropagation(); chamarUrsoParaTeste(relogioNatal()); }}>
          Chamar o urso
        </button>
      )}
    </div>
  );
}
