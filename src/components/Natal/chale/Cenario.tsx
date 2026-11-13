/**
 * O cenário do chalé, peça por peça (11/11/2026 — o chalé «mais aconchegante»
 * que o Cleber pediu). Cada função devolve peças do palco (`pecas.tsx`): o
 * que não mexe é um desenho só; o que mexe é uma caixa própria.
 *
 * Da esquerda para a direita: a mesinha com o chocolate quente, a janela com
 * a neve caindo, a poltrona de balanço, o relógio de parede, o gato no tapete,
 * a lareira (com o quebra-nozes e o porta-retrato na cornija), a prateleira, a
 * TV de tubo, os presentes e a árvore. Depois da árvore, se houver vão livre
 * embaixo dos botões da página, o chalé continua no ANEXO: lambri e coisas
 * baixas (a pilha de presentes, o cavalinho de balanço, os biscoitos do Papai
 * Noel, o trenó).
 *
 * A versão bagunçada de cada objeto é a classe `bag` (em `chale.css`); quem
 * liga e desliga é o roteiro do Grinch (`grinch/roteiro.ts`).
 */
import { memo, useEffect, useRef } from 'react';
import { agoraDoServidor } from '@/components/Sirene/sirene';
import { cn } from '@/lib/utils';
import { acasoDa, varsDaLampada } from '../piscaPisca';
import { Cx, D } from './pecas';
import { A, L, OURO, T_JANELA, VERDE, VERMELHO, VIDRO } from './medidas';
import type { Bagunca } from './grinch/roteiro';

const CORES_FESTAO = ['#FF3B3B', '#FFC531', '#2FD16B', '#8FD3FF'] as const;
const CORES_ARVORE = ['#FFF3B0', '#FF9AD0', '#9AD8FF', '#FFC531'] as const;

/**
 * As luzinhas: duas camadas, uma por fio (`pp-a` / `pp-b`). Nas funções em que
 * o fio inteiro pisca junto, anima a camada; nas outras, cada lâmpada
 * (`piscaPisca.css`). Cada lâmpada é uma caixa só: o miolo dentro do brilho.
 */
function Luzes({ pontos, cores, base = 0, raio = 6 }: { pontos: readonly (readonly [number, number])[]; cores: readonly string[]; base?: number; raio?: number }) {
  return (
    <>
      {(['pp-a', 'pp-b'] as const).map((canal, c) => (
        <div key={canal} className={cn('ch-luzes pp-camada', canal)}>
          {pontos.map(([x, y], i) => (i % 2 === c ? (
            <span key={i} className={cn('ch-lampada pp-luz', canal)}
              style={{ left: x - raio, top: y - raio, width: raio * 2, height: raio * 2, ['--cor' as string]: cores[i % cores.length], ...varsDaLampada(i + base) }} />
          ) : null))}
        </div>
      ))}
    </>
  );
}

// ── A parede ────────────────────────────────────────────────────────────────

/** Papel de parede listrado e lambri, nos tons do tema. O lambri segue pelo anexo. */
export const Parede = memo(function Parede({ topo, anexo }: { topo: number; anexo: number }) {
  const W = L + anexo;
  return (
    <D x={0} y={-topo} w={W} h={A + topo}>
      <defs>
        <mask id="nt-ch-mascara" maskUnits="userSpaceOnUse" x={0} y={-topo} width={L} height={A + topo}>
          <rect x={0} y={-topo} width={L} height={A + topo} fill="url(#nt-ch-some-lados)" />
        </mask>
        <linearGradient id="nt-ch-some-baixo" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={W} y2={0}>
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset={60 / W} stopColor="#fff" stopOpacity="1" />
          <stop offset={(W - (anexo ? 90 : 60)) / W} stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="nt-ch-mascara-baixo" maskUnits="userSpaceOnUse" x={0} y={100} width={W} height={80}>
          <rect x={0} y={100} width={W} height={80} fill="url(#nt-ch-some-baixo)" />
        </mask>
        <linearGradient id="nt-ch-teto" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".1" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g mask="url(#nt-ch-mascara)">
        <rect className="nt-ch-parede" x={0} y={-topo} width={L} height={118 + topo} />
        {Array.from({ length: 30 }, (_, i) => (
          <rect key={i} className="nt-ch-listra" x={10 + i * 20} y={-topo} width={6} height={118 + topo} />
        ))}
        {/* a sombra do teto, de leve */}
        <rect x={0} y={-topo} width={L} height={26} fill="url(#nt-ch-teto)" />
      </g>
      {/* o lambri: a moldura do meio, os painéis e o rodapé */}
      <g mask="url(#nt-ch-mascara-baixo)">
        <rect className="nt-ch-lambri" x={0} y={118} width={W} height={52} />
        {Array.from({ length: Math.ceil(W / 50) }, (_, i) => (
          <g key={i}>
            <rect className="nt-ch-painel" x={8 + i * 50} y={126} width={40} height={34} rx={2} />
            <rect className="nt-ch-painel-luz" x={9.5 + i * 50} y={127.5} width={37} height={1} />
          </g>
        ))}
        <rect className="nt-ch-moldura" x={0} y={115} width={W} height={4.5} rx={1} />
        <rect className="nt-ch-moldura-luz" x={0} y={115} width={W} height={1.2} />
        <rect className="nt-ch-rodape" x={0} y={164} width={W} height={6} />
        <rect x={0} y={170} width={W} height={6} fill="#000" opacity={0.05} />
      </g>
    </D>
  );
});

/** O clarão do fogo na parede, pulsando: uma camada só, de opacidade. */
export function LuzDoFogo({ topo }: { topo: number }) {
  return (
    <D x={120} y={-topo} w={360} h={A + topo} className="ch-luz-fogo">
      <rect x={120} y={-topo} width={360} height={A + topo} fill="url(#nt-ch-luz-fogo)" />
    </D>
  );
}

// ── A janela ────────────────────────────────────────────────────────────────

const ESTRELAS = [[86, 38], [98, 46], [130, 36], [152, 50], [108, 34], [140, 56], [92, 56], [122, 48]] as const;

const LaFora = memo(function LaFora() {
  return (
    <D {...VIDRO}>
      <g transform={T_JANELA}>
        <rect x={76} y={30} width={84} height={64} fill="url(#nt-ch-noite)" />
        <circle cx={144} cy={44} r={17} fill="url(#nt-ch-lua)" />
        <circle cx={144} cy={44} r={6.5} fill="#FFF3C4" />
        <circle cx={142} cy={42.6} r={1.3} fill="#EADBA2" />
        <circle cx={146.4} cy={46} r={0.9} fill="#EADBA2" />
        {/* a montanha ao longe (o Monte Crumpit, de onde ele vê tudo) */}
        <path d="M76 80 L92 58 L98 66 L104 60 L122 82 Z" fill="#5E84B4" opacity={0.55} />
        <path d="M92 58 L96 63.6 L98 61 L101 64 L104 60 L98 66 Z" fill="#EAF3FB" opacity={0.8} />
        {/* morros, pinheiros e o vilarejo */}
        <path d="M76 94 V74 Q92 66 108 72 Q124 64 140 70 Q152 66 160 70 V94 Z" fill="#C9DCEC" />
        <path d="M76 94 V80 Q98 72 120 79 Q142 73 160 78 V94 Z" fill="#E9F2F9" />
        {[[86, 76, 0.8], [93, 75, 1], [150, 74, 0.9]].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <path d="M0 -12 L5 -3 L3 -3 L7 3 L-7 3 L-3 -3 L-5 -3 Z" fill="#2C6B4A" />
            <path d="M0 -12 L5 -3 L3 -3 L7 3 L0 3 Z" fill="#1F5238" />
            <path d="M-3 -3 L0 -6 L3 -3 M-5 3 L0 -1 L5 3" stroke="#FFFFFF" strokeWidth={0.8} fill="none" opacity={0.85} />
          </g>
        ))}
        <g transform="translate(118 76)">
          <rect x={-6} y={-4} width={12} height={8} fill="#7A4A3A" />
          <path d="M-8 -4 L0 -10 L8 -4 Z" fill="#F4F8FB" />
          <rect x={2.6} y={-11} width={2.2} height={4} fill="#5E382B" />
          <rect x={-2} y={-2} width={4} height={3} fill="#FFD36B" />
        </g>
        <g transform="translate(132 78)">
          <rect x={-4} y={-3} width={8} height={6} fill="#6B4434" />
          <path d="M-5.6 -3 L0 -7.4 L5.6 -3 Z" fill="#F4F8FB" />
          <rect x={-1.4} y={-1.6} width={2.8} height={2.2} fill="#FFD36B" />
        </g>
      </g>
    </D>
  );
});

/** A neve lá fora: duas tiras de flocos que descem em laço (a de perto mais depressa). */
const NeveDaJanela = memo(function NeveDaJanela() {
  const tira = (n: number, base: number, raio: number) => Array.from({ length: n }, (_, i) => {
    const x = VIDRO.x + 2 + acasoDa(i + base) * (VIDRO.w - 4);
    const y = VIDRO.y + acasoDa(i + base + 40) * VIDRO.h;
    const r = raio + acasoDa(i + base + 80) * 0.5;
    return [x, y, r] as const;
  });
  return (
    <>
      {([['longe', tira(8, 3, 0.5)], ['perto', tira(7, 21, 0.85)]] as const).map(([classe, flocos]) => (
        <D key={classe} x={VIDRO.x} y={VIDRO.y - VIDRO.h} w={VIDRO.w} h={VIDRO.h * 2} className={cn('ch-neve-janela', classe)}>
          {flocos.map(([x, y, r], i) => (
            <g key={i} fill="#FFFFFF" opacity={classe === 'longe' ? 0.7 : 0.95}>
              <circle cx={x} cy={y} r={r} />
              <circle cx={x} cy={y - VIDRO.h} r={r} />
            </g>
          ))}
        </D>
      ))}
    </>
  );
});

const MolduraDaJanela = memo(function MolduraDaJanela() {
  return (
    <D x={56} y={-2} w={104} h={92}>
      <g transform={T_JANELA}>
        {/* a moldura branca com bisel, os caixilhos */}
        <path d="M70 24 H166 V100 H70 Z M76 30 V94 H160 V30 Z" fill="url(#nt-ch-moldura)" fillRule="evenodd" />
        <path d="M70 24 H166 V26 H70 Z" fill="#FFFFFF" opacity={0.8} />
        <path d="M76 30 H160 V31.4 H77.4 V94 H76 Z" fill="#000" opacity={0.14} />
        <rect x={116.5} y={30} width={3} height={64} fill="#EDE6DC" />
        <rect x={76} y={60.5} width={84} height={3} fill="#EDE6DC" />
        <rect x={119} y={30} width={0.6} height={64} fill="#000" opacity={0.12} />
        <rect x={76} y={63} width={84} height={0.6} fill="#000" opacity={0.12} />
        {/* o parapeito, com neve e um bico-de-papagaio */}
        <rect x={62} y={99} width={112} height={6} rx={1.5} fill="url(#nt-ch-moldura)" />
        <rect x={64} y={104.5} width={108} height={2.4} rx={1} fill="#000" opacity={0.1} />
        <path d="M96 99.5 Q104 95.6 114 97.4 Q126 94.6 138 97.2 Q150 94.6 160 97 Q167 95.8 170 99.5 Z" fill="#FFFFFF" />
        <g transform="translate(80 99)">
          <path d="M-5 -8 H5 L4 0 H-4 Z" fill="#B5553E" />
          <rect x={-5.6} y={-9.4} width={11.2} height={2.2} rx={1} fill="#C96A52" />
          <path d="M0 -10 L-7 -15 L-2 -16 Z M0 -10 L7 -15 L2 -16.4 Z M0 -10 L-4 -19 L1 -17 Z M0 -10 L5 -19.6 L-0.6 -18 Z" fill="#2F7D52" />
          <path d="M0 -15 L-5.4 -18.6 L-1.6 -19.6 Z M0 -15 L5.4 -18.6 L1.6 -19.8 Z M0 -15 L-3.2 -22.6 L0.6 -21.4 Z M0 -15 L3.6 -23 L-0.6 -21.6 Z M0 -15 L-6 -14 L-3.6 -11.6 Z M0 -15 L6 -14 L3.6 -11.6 Z" fill="#D5353A" />
          <circle cx={0} cy={-15.2} r={1.2} fill="#F3C74A" />
        </g>
        {/* as cortinas de veludo, o bandô e as amarras */}
        <path d="M50 18 Q66 16 74 18 Q70 50 64 70 Q60 86 66 108 L50 108 Q54 86 54 70 Q52 40 50 18 Z" fill="url(#nt-ch-veludo)" />
        <path d="M186 18 Q170 16 162 18 Q166 50 172 70 Q176 86 170 108 L186 108 Q182 86 182 70 Q184 40 186 18 Z" fill="url(#nt-ch-veludo)" />
        <path d="M58 22 Q59 48 57 68 M66 22 Q65 48 61 68 M178 22 Q177 48 179 68 M170 22 Q171 48 175 68" stroke="#6E141C" strokeWidth={0.8} fill="none" opacity={0.5} />
        <path d="M51 108 H66 M170 108 H185" stroke={OURO} strokeWidth={1.6} strokeLinecap="round" />
        <path d="M56 70 Q62 72 66 68 M180 70 Q174 72 170 68" stroke={OURO} strokeWidth={2.2} strokeLinecap="round" fill="none" />
        <circle cx={66} cy={68.5} r={2} fill={OURO} />
        <circle cx={170} cy={68.5} r={2} fill={OURO} />
        <rect x={44} y={12} width={148} height={4} rx={2} fill="#6E4529" />
        <rect x={44} y={12} width={148} height={1.2} rx={0.6} fill="#B98A62" opacity={0.7} />
        <circle cx={44} cy={14} r={3} fill="#8E5E3B" />
        <circle cx={192} cy={14} r={3} fill="#8E5E3B" />
        <path d="M48 16 H188 V22 Q176 30 164 22 Q152 30 140 22 Q128 30 118 22 Q108 30 96 22 Q84 30 72 22 Q60 30 48 22 Z" fill="#A9282F" />
        <path d="M48 16 H188 V18 H48 Z" fill="#C93A40" />
        <path d="M48 22 Q60 30 72 22 Q84 30 96 22 Q108 30 118 22 Q128 30 140 22 Q152 30 164 22 Q176 30 188 22" stroke={OURO} strokeWidth={0.9} fill="none" />
        {/* a guirlandinha no alto da janela */}
        <circle cx={118} cy={26} r={6.5} fill="none" stroke="#245F3D" strokeWidth={3.8} />
        <circle cx={118} cy={26} r={6.5} fill="none" stroke="#4DA373" strokeWidth={1.8} strokeDasharray="1.4 2.4" />
        <circle cx={113.4} cy={22.6} r={1.1} fill="#D6403A" />
        <circle cx={123} cy={28.6} r={1.1} fill="#D6403A" />
        <path d="M115 31 L118 28.5 L121 31" stroke={VERMELHO} strokeWidth={1.8} strokeLinecap="round" fill="none" />
      </g>
    </D>
  );
});

/**
 * A janela: o lado de fora, as estrelas piscando, a neve — e, entre uma coisa
 * e outra, o que o roteiro do Grinch manda (`espia`, o vidro quebrado).
 */
export function Janela({ espia, quebrada }: { espia: React.ReactNode; quebrada: React.ReactNode }) {
  return (
    <>
      <Cx {...VIDRO} className="ch-vidro">
        <LaFora />
        <D {...VIDRO} className="ch-estrelas">
          <g transform={T_JANELA}>{ESTRELAS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 ? 0.7 : 1} fill="#FFFFFF" />)}</g>
        </D>
        {espia}
        <NeveDaJanela />
        <D {...VIDRO}>
          <g transform={T_JANELA}>
            {/* geada nos cantos e o reflexo do vidro */}
            <path d="M76 30 H90 Q82 33 80 40 Q78 36 76 44 Z M160 30 H146 Q154 33 156 40 Q158 36 160 44 Z" fill="#FFFFFF" opacity={0.55} />
            <path d="M76 94 V84 Q79 90 86 90 Q82 92 84 94 Z M160 94 V84 Q157 90 150 90 Q154 92 152 94 Z" fill="#FFFFFF" opacity={0.5} />
            <path d="M84 94 L120 30 H130 L94 94 Z M100 94 L136 30 H139 L103 94 Z" fill="#FFFFFF" opacity={0.07} />
          </g>
        </D>
      </Cx>
      {quebrada}
      <MolduraDaJanela />
    </>
  );
}

// ── A mesinha, à esquerda da poltrona ───────────────────────────────────────

/** A mesinha redonda com o chocolate quente (o vapor sobe) e um livro. */
export const Mesinha = memo(function Mesinha() {
  return (
    <>
      <D x={36} y={132} w={40} h={46}>
        <ellipse cx={56} cy={175} rx={15} ry={2} fill="url(#nt-ch-contato)" />
        <path d="M56 150 V172 M56 166 L47 175 M56 166 L65 175 M56 168 V175.4" stroke="url(#nt-ch-madeira-h)" strokeWidth={2.6} strokeLinecap="round" />
        <ellipse cx={56} cy={150} rx={15} ry={3.4} fill="#6E4529" />
        <ellipse cx={56} cy={148.8} rx={15} ry={3.2} fill="url(#nt-ch-madeira)" />
        <ellipse cx={54} cy={148} rx={9} ry={1.2} fill="#D2A47C" opacity={0.5} />
        {/* o livro, com fita */}
        <path d="M43.6 147.4 L55 146 L55.6 148.6 L44.2 150 Z" fill="#2D5B8C" />
        <path d="M43.6 147.4 L55 146 L55.2 146.8 L43.8 148.2 Z" fill="#F6EFE3" />
        <path d="M51.6 146.6 L52.2 150.6 L53 149.6 L53.6 150.4 L53 146.4 Z" fill={VERMELHO} />
        {/* a caneca de chocolate, com marshmallow */}
        <path d="M58.4 139.6 H67.4 L66.6 148 Q62.9 149.4 59.2 148 Z" fill="#D5353A" />
        <path d="M58.4 139.6 H67.4 L67.2 141.4 H58.6 Z" fill="#F6EFE3" />
        <path d="M67.2 141.8 Q71 142 70.4 145 Q69.8 147 66.8 146.6" stroke="#D5353A" strokeWidth={1.3} fill="none" strokeLinecap="round" />
        <ellipse cx={62.9} cy={139.8} rx={4.4} ry={1.1} fill="#5A3420" />
        <rect x={60.8} y={138.6} width={2.4} height={1.6} rx={0.5} fill="#FFFFFF" />
        <rect x={63.6} y={139} width={2} height={1.4} rx={0.5} fill="#FBEFF0" />
        <path d="M60.4 142.6 L61 146.6" stroke="#FFFFFF" strokeWidth={0.9} opacity={0.5} strokeLinecap="round" />
      </D>
      <D x={57} y={122} w={12} h={17} className="ch-vapor">
        <path d="M61 138 Q59 134 61.4 131 Q63.6 128.4 61.6 125 M65 138 Q66.8 134.6 64.8 132 Q63.2 129.6 65 127" stroke="#FFFFFF" strokeWidth={1} fill="none" strokeLinecap="round" opacity={0.75} />
      </D>
    </>
  );
});

// ── O relógio de parede ─────────────────────────────────────────────────────

/** O cuco de madeira entre a janela e a lareira: o pêndulo balança. */
export function Relogio({ bag }: { bag: boolean }) {
  return (
    <Cx x={176} y={4} w={24} h={58} o={[188, 9]} className={cn('ch-bag relogio', bag && 'bag')}>
      <D x={176} y={4} w={24} h={44}>
        <path d="M188 6 L201 18 H175 Z" fill="#5A3420" />
        <path d="M188 6 L201 18 H196.6 L188 10 L179.4 18 H175 Z" fill="#8A5A38" />
        <path d="M177.6 15 Q180 12.6 182.6 14 Q185 11 188 12.6 Q191 11 193.4 14 Q196 12.6 198.4 15 L199.6 18 H176.4 Z" fill="#FFFFFF" />
        <rect x={178} y={18} width={20} height={25} rx={1.5} fill="url(#nt-ch-nogueira)" />
        <rect x={178} y={18} width={20} height={1.4} fill="#000" opacity={0.2} />
        <rect x={184.4} y={19.6} width={7.2} height={5.4} rx={3.4} fill="#3A2214" />
        <circle cx={188} cy={32.4} r={7.4} fill="#F6EFE3" stroke="#C9A36A" strokeWidth={1.2} />
        {[0, 90, 180, 270].map(g => <path key={g} d="M188 26.4 V28" stroke="#6E4529" strokeWidth={0.9} transform={`rotate(${g} 188 32.4)`} />)}
        <path d="M188 32.4 L188 27.6 M188 32.4 L191.6 34.2" stroke="#3A2214" strokeWidth={1} strokeLinecap="round" />
        <circle cx={188} cy={32.4} r={0.9} fill={VERMELHO} />
        <path d="M178 43 H198 L196 47 Q188 49.4 180 47 Z" fill="#5A3420" />
        <path d="M180.6 9.4 l2 -2 M195.4 9.4 l-2 -2" stroke="#2F7D52" strokeWidth={2} strokeLinecap="round" />
        <circle cx={188} cy={5.4} r={1.6} fill={VERMELHO} />
      </D>
      <D x={182} y={46} w={12} h={16} o={[188, 46]} className="ch-pendulo">
        <path d="M188 46 V57" stroke="#B8862B" strokeWidth={0.9} />
        <circle cx={188} cy={58} r={3} fill="url(#nt-ch-bola-ouro)" />
      </D>
    </Cx>
  );
}

// ── O tapete ────────────────────────────────────────────────────────────────

export function Tapete({ bag }: { bag: boolean }) {
  return (
    <Cx x={170} y={166} w={260} h={12} className={cn('ch-bag tapete', bag && 'bag')}>
      <D x={170} y={166} w={260} h={12}>
        <ellipse cx={300} cy={A - 3} rx={128} ry={6} fill="#7E1D24" />
        <ellipse cx={300} cy={A - 3.4} rx={127} ry={5.6} fill="#9A262E" />
        <ellipse cx={300} cy={A - 3.4} rx={120} ry={4.8} fill="#B1323A" />
        <ellipse cx={300} cy={A - 3.4} rx={110} ry={3.6} fill="none" stroke="#F1D9A8" strokeWidth={1.1} strokeDasharray="3 2.4" />
        <ellipse cx={300} cy={A - 3.4} rx={92} ry={2.6} fill="none" stroke={OURO} strokeWidth={0.7} />
        <ellipse cx={300} cy={A - 3.4} rx={70} ry={1.6} fill="#C8404A" opacity={0.6} />
        {/* a franja das pontas */}
        {[172, 428].map(x => (
          <path key={x} d={`M${x} 170.4 h${x < 300 ? -3.4 : 3.4} M${x} 172.4 h${x < 300 ? -4 : 4} M${x} 174.4 h${x < 300 ? -3.4 : 3.4}`} stroke="#F1D9A8" strokeWidth={0.8} strokeLinecap="round" />
        ))}
      </D>
      <D x={212} y={166} w={176} h={10} className="ch-reflexo">
        <ellipse cx={300} cy={A - 3.4} rx={88} ry={4.4} fill="#FFB347" />
      </D>
    </Cx>
  );
}

// ── A poltrona de balanço ───────────────────────────────────────────────────

const DesenhoDaPoltrona = memo(function DesenhoDaPoltrona() {
  return (
    <g transform="translate(24.8 35.2) scale(.8)">
      {/* os balanços */}
      <path d="M56 168 Q122 184 194 160" stroke="#5A3820" strokeWidth={6} strokeLinecap="round" fill="none" />
      <path d="M58 166 Q122 181 192 158" stroke="#9A6A45" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.8} />
      {/* pés */}
      <path d="M86 132 L82 171 M164 132 L170 166" stroke="url(#nt-ch-madeira-h)" strokeWidth={5} strokeLinecap="round" />
      {/* o encosto: as colunas torneadas, as travessas e o topo curvo */}
      <path d="M86 124 L80 56 M164 124 L170 56" stroke="url(#nt-ch-madeira-h)" strokeWidth={6.5} strokeLinecap="round" />
      {[80, 170].map(x => <g key={x}><circle cx={x} cy={52} r={4.6} fill="#9A6A45" /><circle cx={x - 1.2} cy={50.8} r={1.4} fill="#D2A47C" opacity={0.7} /></g>)}
      <path d="M78 58 Q125 38 172 58" stroke="url(#nt-ch-madeira)" strokeWidth={8} strokeLinecap="round" fill="none" />
      <path d="M80 56 Q125 37 170 56" stroke="#C3916A" strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.6} />
      {[100, 113, 126, 139, 152].map((x, i) => (
        <g key={x}>
          <path d={`M${x + (i - 2) * 0.6} 118 L${x + (i - 2) * 2.2} 60`} stroke="#8E5E3B" strokeWidth={3.4} strokeLinecap="round" />
          <ellipse cx={x + (i - 2) * 1.4} cy={88} rx={2.6} ry={3.6} fill="#8E5E3B" />
          <ellipse cx={x + (i - 2) * 1.4 - 0.8} cy={87} rx={0.9} ry={1.8} fill="#C3916A" opacity={0.6} />
        </g>
      ))}
      <path d="M84 96 Q125 90 166 96" stroke="#7A4E30" strokeWidth={3} fill="none" />
      {/* o assento e a almofada capitonê */}
      <rect x={70} y={124} width={110} height={11} rx={4} fill="url(#nt-ch-madeira)" />
      <rect x={76} y={111} width={98} height={15} rx={7.5} fill="#B8333A" />
      <rect x={76} y={111} width={98} height={5} rx={2.5} fill="#D24A50" opacity={0.7} />
      <rect x={78} y={122} width={94} height={3.4} rx={1.7} fill="#7E1F25" opacity={0.5} />
      {[92, 110, 128, 146, 160].map(x => <circle key={x} cx={x} cy={119} r={1.1} fill="#7E1F25" />)}
      {/* a almofadinha bordada, encostada */}
      <g transform="rotate(-10 104 100)">
        <rect x={90} y={88} width={28} height={24} rx={5} fill="#F6EFE3" />
        <rect x={90} y={88} width={28} height={24} rx={5} fill="none" stroke={VERMELHO} strokeWidth={1.2} strokeDasharray="2 1.6" />
        <path d="M104 93 L107 99 L113 99 L108.4 103 L110 109 L104 105.4 L98 109 L99.6 103 L95 99 L101 99 Z" fill={VERDE} />
      </g>
      {/* os braços */}
      <path d="M64 101 Q76 96 92 100" stroke="url(#nt-ch-madeira)" strokeWidth={6} strokeLinecap="round" fill="none" />
      <path d="M158 100 Q174 96 186 101" stroke="url(#nt-ch-madeira)" strokeWidth={6} strokeLinecap="round" fill="none" />
      <path d="M88 101 L86 124 M162 101 L164 124" stroke="#7A4E30" strokeWidth={3.4} strokeLinecap="round" />
      {/* a manta xadrez dobrada no encosto, com franja */}
      <path d="M132 54 Q158 48 173 58 L180 110 Q162 118 146 108 Q140 80 132 54 Z" fill="url(#nt-ch-xadrez)" />
      <path d="M132 54 Q158 48 173 58 L174 64 Q156 56 134 62 Z" fill="#000" opacity={0.14} />
      <path d="M150 62 Q156 84 160 110" stroke="#000" strokeWidth={1} opacity={0.12} fill="none" />
      <path d="M146 108 Q162 118 180 110" stroke="#1F5E3C" strokeWidth={1.6} fill="none" />
      {Array.from({ length: 8 }, (_, i) => {
        const x = 148 + i * 4.2, y = 109 + Math.sin((i / 7) * Math.PI) * 4.6;
        return <path key={i} d={`M${x} ${y} l-0.4 4.2`} stroke={OURO} strokeWidth={1} strokeLinecap="round" />;
      })}
    </g>
  );
});

export function Poltrona({ bag }: { bag: boolean }) {
  return (
    <Cx x={68} y={64} w={114} h={112} o={[174, 176]} className={cn('ch-bag poltrona', bag && 'bag')}>
      <D x={72} y={172} w={106} h={6}><ellipse cx={125} cy={175} rx={52} ry={2.4} fill="url(#nt-ch-contato)" /></D>
      <D x={68} y={64} w={114} h={112} o={[124, 176]} className="ch-balanca"><DesenhoDaPoltrona /></D>
    </Cx>
  );
}

// ── O gato ──────────────────────────────────────────────────────────────────

/** O gato cinza-azulado, enrolado no tapete: respira, mexe o rabo. Com o Grinch, leva um susto e some. */
export function Gato({ estado }: { estado: 'dorme' | 'susto' | 'fugiu' }) {
  const t = `translate(232 ${A - 6})`;
  return (
    <Cx x={206} y={144} w={56} h={34} o={[232, 176]} className={cn('ch-gato', estado)}>
      <D x={208} y={168} w={48} h={8}><ellipse cx={232} cy={A - 4.6} rx={22} ry={2.4} fill="url(#nt-ch-contato)" /></D>
      <D x={246} y={152} w={18} h={22} o={[248, 168]} className="ch-gato-rabo">
        <g transform={t}><path d="M16 -3 Q28 -1 24 -11 Q22 -15 18 -13" stroke="#7C8399" strokeWidth={4.4} strokeLinecap="round" fill="none" /><path d="M24.4 -10 Q22.6 -14.6 18.6 -13" stroke="#E8ECF4" strokeWidth={4.4} strokeLinecap="round" fill="none" /></g>
      </D>
      <D x={212} y={152} w={40} h={20} o={[232, 172]} className="ch-gato-respira">
        <g transform={t}>
          <ellipse cx={0} cy={-7} rx={19} ry={8.5} fill="#8C93A8" />
          <ellipse cx={-2} cy={-10.6} rx={14} ry={4} fill="#A3AABD" opacity={0.6} />
          <path d="M-6 -14 Q2 -16 10 -13 M-2 -10 Q5 -12 12 -9 M4 -6 Q10 -7 15 -5" stroke="#727A90" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        </g>
      </D>
      <D x={206} y={144} w={24} h={30}>
        <g transform={t}>
          <circle cx={-14} cy={-9} r={7.6} fill="#9AA1B5" />
          <path d="M-20.4 -13 L-21.6 -21.4 L-15 -16.4 Z M-12 -16.4 L-7.6 -22.4 L-6.8 -14.4 Z" fill="#9AA1B5" />
          <path d="M-19.8 -14.6 L-20.4 -18.8 L-17.2 -16.2 Z M-11 -16.2 L-8.4 -19.8 L-8 -15.2 Z" fill="#F2C4CF" />
          <ellipse cx={-14.6} cy={-6} rx={4.4} ry={3} fill="#C9CEDB" opacity={0.7} />
          <path className="ch-gato-olhos-fechados" d="M-19 -9 Q-17 -7.5 -15 -9 M-12.5 -9.5 Q-10.5 -8 -8.5 -9.5" stroke="#3A3E4D" strokeWidth={1} strokeLinecap="round" fill="none" />
          <g className="ch-gato-olhos-abertos">
            <ellipse cx={-17} cy={-9.4} rx={1.9} ry={2.3} fill="#F4E04A" /><ellipse cx={-10.6} cy={-9.8} rx={1.9} ry={2.3} fill="#F4E04A" />
            <ellipse cx={-17} cy={-9.4} rx={0.6} ry={1.8} fill="#1B1B1B" /><ellipse cx={-10.6} cy={-9.8} rx={0.6} ry={1.8} fill="#1B1B1B" />
          </g>
          <circle cx={-13.6} cy={-6} r={0.9} fill="#E58FA3" />
          <path d="M-18 -4.6 L-24 -5.6 M-18 -3.8 L-23.6 -3.2 M-9.6 -4.8 L-4.6 -6 M-9.6 -4 L-5 -3.6" stroke="#E4E7EF" strokeWidth={0.5} />
          {/* a coleira com guizo */}
          <path d="M-9 -3.6 Q-12 -1.4 -16 -2.4" stroke={VERMELHO} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <circle cx={-12.4} cy={-1.2} r={1.3} fill={OURO} />
        </g>
      </D>
      <span className="ch-zzz" style={{ left: 224, top: 138 }}>z</span>
      <span className="ch-gato-espanto" style={{ left: 213, top: 128 }}>!</span>
    </Cx>
  );
}

// ── A lareira ───────────────────────────────────────────────────────────────

const PONTOS_FESTAO = [214, 236, 258, 280, 302, 324, 346, 368, 388].map(x => [x, 68.5] as const);
const FESTAO = 'M202 63 Q217 72 232 63 Q247 72 262 63 Q277 72 292 63 Q307 72 322 63 Q337 72 352 63 Q367 72 382 63 Q392 69 398 63';

const FundoDaLareira = memo(function FundoDaLareira({ topo }: { topo: number }) {
  return (
    <D x={198} y={-topo} w={204} h={A + topo}>
      {/* a sombra da lareira na parede */}
      <rect x={214} y={58} width={172} height={A - 62} rx={3} fill="#000" opacity={0.08} />
      {/* a chaminé, subindo até a barra de cima */}
      <rect x={252} y={-topo} width={96} height={54 + topo} fill="url(#nt-ch-tijolo)" />
      <rect x={252} y={-topo} width={96} height={54 + topo} fill="url(#nt-ch-sombra-lados)" />
      <rect x={252} y={42} width={96} height={8} fill="#000" opacity={0.18} />
      {/* o corpo de tijolos */}
      <rect x={218} y={62} width={164} height={A - 68} fill="url(#nt-ch-tijolo)" />
      <rect x={218} y={62} width={164} height={A - 68} fill="url(#nt-ch-sombra-lados)" />
      <rect x={218} y={62} width={164} height={9} fill="#000" opacity={0.22} />
      {/* a cornija: a viga com mísulas */}
      <path d="M210 62 Q212 70 220 70 L222 62 Z M390 62 Q388 70 380 70 L378 62 Z" fill="#5A3820" />
      <rect x={200} y={50} width={200} height={12} rx={2.5} fill="url(#nt-ch-madeira)" />
      <rect x={200} y={50} width={200} height={2.6} rx={1.3} fill="#D2A47C" opacity={0.75} />
      <rect x={202} y={59.6} width={196} height={2.4} rx={1.2} fill="#000" opacity={0.2} />
      <path d="M214 56 H260 M290 57 H330 M352 55.5 H392" stroke="#5A3820" strokeWidth={0.6} opacity={0.6} />
      {/* o arco de pedra, com as juntas e a pedra-chave */}
      <path d="M236 170 V120 Q236 90 300 90 Q364 90 364 120 V170 H354 V122 Q354 100 300 100 Q246 100 246 122 V170 Z" fill="url(#nt-ch-pedra)" />
      <path d="M236 170 V120 Q236 90 300 90 Q364 90 364 120 V170" fill="none" stroke="#FFFFFF" strokeWidth={0.8} opacity={0.6} />
      {[[240, 128], [240, 146], [240, 162], [360, 128], [360, 146], [360, 162]].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x - 4} ${y} H${x + 4.6}`} stroke="#A99D8C" strokeWidth={0.8} />
      ))}
      <path d="M252 104 L247.6 98 M268 96.6 L266 90.6 M332 96.6 L334 90.6 M348 104 L352.4 98" stroke="#A99D8C" strokeWidth={0.8} />
      <path d="M292 87 H308 L306 101 H294 Z" fill="#E4DCD0" stroke="#A99D8C" strokeWidth={0.6} />
      <path d="M300 90.6 L302 94 L300 97.4 L298 94 Z" fill={VERMELHO} opacity={0.85} />
      {/* a boca, com a fuligem e os tijolos do fundo */}
      <path d="M246 170 V122 Q246 100 300 100 Q354 100 354 122 V170 Z" fill="url(#nt-ch-boca)" />
      <path d="M262 126 h14 M284 118 h14 M306 118 h14 M324 126 h14 M270 138 h12 M318 138 h12" stroke="#6A3320" strokeWidth={0.7} opacity={0.5} />
    </D>
  );
});

/** A lenha, a grade de ferro e a pedra da frente: ficam por cima do fogo. */
const FrenteDaLareira = memo(function FrenteDaLareira() {
  return (
    <D x={204} y={144} w={192} h={32}>
      <g transform="rotate(-7 300 164)">
        <rect x={266} y={159} width={68} height={9} rx={4.5} fill="#6B3F24" />
        <rect x={268} y={159.8} width={64} height={2} rx={1} fill="#8E5C3A" opacity={0.6} />
        <path d="M272 162.5 H300 M306 165.6 H328" stroke="#4E2C18" strokeWidth={0.8} />
      </g>
      <g transform="rotate(8 300 164)">
        <rect x={266} y={159} width={68} height={9} rx={4.5} fill="#7E4B2B" />
        <rect x={268} y={159.8} width={64} height={2} rx={1} fill="#A56C44" opacity={0.6} />
        <path d="M276 165.4 H298 M304 162.6 H326" stroke="#5A3420" strokeWidth={0.8} />
      </g>
      {[[268, 167], [332, 167]].map(([x, y]) => (
        <g key={x}><circle cx={x} cy={y} r={4} fill="#D9AE80" /><circle cx={x} cy={y} r={2.4} fill="none" stroke="#B88A5C" strokeWidth={0.6} /><circle cx={x} cy={y} r={0.8} fill="#B88A5C" /></g>
      ))}
      <ellipse cx={300} cy={169} rx={32} ry={2.6} fill="#FF7A1A" opacity={0.85} />
      <ellipse cx={300} cy={169} rx={18} ry={1.4} fill="#FFD24D" opacity={0.8} />
      {/* a grade de ferro na frente */}
      <path d="M256 170 V156 M266 170 V152 M276 170 V150 M324 170 V150 M334 170 V152 M344 170 V156 M254 158 Q300 144 346 158"
        stroke="#2A2422" strokeWidth={1.6} strokeLinecap="round" fill="none" />
      {[266, 276, 324, 334].map(x => <circle key={x} cx={x} cy={x === 276 || x === 324 ? 149 : 151} r={1.4} fill="#3A3230" />)}
      {/* a pedra da frente */}
      <rect x={206} y={A - 7} width={188} height={7} rx={2} fill="url(#nt-ch-pedra)" />
      <rect x={206} y={A - 7} width={188} height={1.6} rx={0.8} fill="#FFFFFF" opacity={0.7} />
      <path d="M250 169.6 V176 M300 169.6 V176 M350 169.6 V176" stroke="#A99D8C" strokeWidth={0.6} />
    </D>
  );
});

/** O fogo: o calor atrás, três chamas (cada uma no seu ritmo) e as brasas subindo. O mouse em cima atiça. */
function Fogo() {
  return (
    <Cx x={246} y={100} w={108} h={70} className="ch-fogo">
      <D x={250} y={100} w={100} h={100} className="ch-calor"><circle cx={300} cy={150} r={50} fill="url(#nt-ch-calor)" /></D>
      <Cx x={258} y={102} w={84} h={66} o={[300, 166]} className="ch-chamas">
        <D x={260} y={102} w={72} h={66} o={[300, 166]} className="ch-chama c1">
          <path d="M270 166 C262 150 274 142 272 126 C282 134 284 120 292 108 C296 122 302 112 304 104 C310 118 322 122 318 136 C328 132 332 150 328 166 Z" fill="url(#nt-ch-chama-fora)" />
        </D>
        <D x={274} y={116} w={48} h={52} o={[300, 166]} className="ch-chama c2">
          <path d="M280 166 C276 152 286 146 286 134 C294 140 296 128 302 118 C305 130 314 136 312 148 C318 146 320 158 318 166 Z" fill="url(#nt-ch-chama-meio)" />
        </D>
        <D x={286} y={134} w={28} h={34} o={[300, 166]} className="ch-chama c3">
          <path d="M290 166 C288 157 294 152 295 144 C299 149 301 141 305 136 C308 147 312 154 309 166 Z" fill="url(#nt-ch-chama-miolo)" />
        </D>
      </Cx>
      {[284, 296, 306, 318].map((x, i) => (
        <span key={x} className="ch-brasa" style={{ left: x, top: 150, animationDelay: `${-i * 0.62}s`, animationDuration: `${2.3 + (i % 3) * 0.5}s` }} />
      ))}
    </Cx>
  );
}

/** O quebra-nozes e o porta-retrato em cima da cornija. */
const EnfeitesDaCornija = memo(function EnfeitesDaCornija() {
  return (
    <D x={224} y={24} w={152} h={28}>
      {/* o quebra-nozes */}
      <g transform="translate(232 50)">
        <rect x={-4.4} y={-1.6} width={8.8} height={1.6} rx={0.6} fill="#3A2214" />
        <path d="M-2.6 -1.6 V-8 M2.6 -1.6 V-8" stroke="#1F3F7A" strokeWidth={2.6} />
        <rect x={-3.8} y={-3} width={2.6} height={1.6} fill="#1B1B1B" /><rect x={1.2} y={-3} width={2.6} height={1.6} fill="#1B1B1B" />
        <rect x={-4} y={-15} width={8} height={7.4} rx={1} fill="#C8353A" />
        <path d="M-4 -12 H4 M0 -15 V-7.6" stroke={OURO} strokeWidth={0.7} />
        <path d="M-4.8 -14.6 L-6.4 -9 M4.8 -14.6 L6.4 -9" stroke="#C8353A" strokeWidth={2} strokeLinecap="round" />
        <rect x={-3.2} y={-20.4} width={6.4} height={5.8} rx={1} fill="#F4C9A1" />
        <path d="M-3.2 -17 H3.2 V-14.6 Q0 -13.6 -3.2 -14.6 Z" fill="#FFFFFF" />
        <circle cx={-1.3} cy={-18.4} r={0.5} fill="#1B1B1B" /><circle cx={1.3} cy={-18.4} r={0.5} fill="#1B1B1B" />
        <rect x={-3.4} y={-25.4} width={6.8} height={5.4} rx={0.8} fill="#1B1B1B" />
        <rect x={-3.4} y={-21.6} width={6.8} height={1.4} fill={OURO} />
        <circle cx={0} cy={-26} r={1.1} fill={VERMELHO} />
      </g>
      {/* o porta-retrato: o boneco de neve do Dashboard */}
      <g transform="translate(336 50)">
        <path d="M-1 -1 L-5 -1" stroke="#5A3820" strokeWidth={1} />
        <rect x={-7.6} y={-17} width={15.2} height={16.4} rx={1.2} fill={OURO} />
        <rect x={-7.6} y={-17} width={15.2} height={2} rx={1} fill="#F5D68A" />
        <rect x={-5.6} y={-15} width={11.2} height={12.4} fill="#BFDDF5" />
        <path d="M-5.6 -5 Q0 -7.6 5.6 -5 V-2.6 H-5.6 Z" fill="#FFFFFF" />
        <circle cx={0} cy={-6.2} r={2.6} fill="#FFFFFF" /><circle cx={0} cy={-10} r={1.9} fill="#FFFFFF" />
        <path d="M-1.9 -11.4 H1.9 L1.3 -13.6 H-1.3 Z" fill="#1B1B1B" />
        <path d="M-1.6 -8.4 H1.8" stroke={VERMELHO} strokeWidth={0.8} />
        <path d="M0.2 -10 L1.8 -9.6" stroke="#FF8A1F" strokeWidth={0.7} strokeLinecap="round" />
      </g>
    </D>
  );
});

function Guirlanda({ bag }: { bag: boolean }) {
  return (
    <Cx x={280} y={4} w={40} h={42} o={[300, 26]} className={cn('ch-bag guirlanda', bag && 'bag')}>
      <D x={280} y={4} w={40} h={42}>
        <g transform="translate(300 26)">
          <circle r={13.5} cy={1.6} fill="none" stroke="#000" strokeWidth={7.5} opacity={0.16} />
          <circle r={13.5} fill="none" stroke="#1F5236" strokeWidth={7.8} />
          <circle r={13.5} fill="none" stroke="#3F8F60" strokeWidth={5.2} strokeDasharray="1.6 2.6" />
          <circle r={13.5} fill="none" stroke="#6CBF8D" strokeWidth={2.4} strokeDasharray="1 3.6" strokeDashoffset={1.4} />
          <circle r={16} fill="none" stroke="#2F7D52" strokeWidth={1.6} strokeDasharray=".8 4.2" />
          {[[-11, -6], [10, -8], [-6, 12], [9, 9], [13, 2], [-13, 4]].map(([x, y]) => (
            <g key={`${x}-${y}`}><circle cx={x} cy={y} r={2} fill="#D6403A" /><circle cx={x - 0.6} cy={y - 0.6} r={0.6} fill="#FFFFFF" opacity={0.75} /></g>
          ))}
          {[[2, 13.4], [-12, -1.6], [12, -3]].map(([x, y]) => <circle key={`${x}`} cx={x} cy={y} r={1.3} fill={OURO} />)}
          <path d="M-1 -13 C-9 -21 -15 -14 -7 -11.6 Z M1 -13 C9 -21 15 -14 7 -11.6 Z" fill={VERMELHO} />
          <path d="M-2 -13.6 C-7 -18 -11 -15.4 -8 -13 Z M2 -13.6 C7 -18 11 -15.4 8 -13 Z" fill="#E4575B" opacity={0.7} />
          <path d="M-1.4 -12 L-6 -2 L-3.4 -3 L-2 0 Z M1.4 -12 L6 -2 L3.4 -3 L2 0 Z" fill="#A9282F" />
          <circle cy={-12.6} r={2.6} fill="#A9282F" />
        </g>
      </D>
    </Cx>
  );
}

function Vela({ x, i, bag }: { x: number; i: number; bag: boolean }) {
  return (
    <Cx x={x - 9} y={14} w={18} h={36} o={[x, 50]} className={cn('ch-bag vela', i ? 'v2' : 'v1', bag && 'bag')}>
      <D x={x - 7} y={28} w={14} h={22}>
        <rect x={x - 6} y={46} width={12} height={4} rx={1.5} fill={OURO} />
        <rect x={x - 6} y={46} width={12} height={1.2} rx={0.6} fill="#F5D68A" />
        <rect x={x - 4} y={30} width={8} height={17} rx={1.6} fill="#F6EFE3" />
        <rect x={x - 4} y={30} width={2.6} height={17} fill="#FFFFFF" opacity={0.85} />
        <rect x={x + 2} y={30} width={2} height={17} fill="#D9CDB8" opacity={0.6} />
        <path d={`M${x + 1.5} 30 V35 Q${x + 2.6} 36 ${x + 2.4} 34 V30 Z`} fill="#EDE3D2" />
        <path d={`M${x} 30 V28.4`} stroke="#3A2A1A" strokeWidth={0.7} />
      </D>
      <D x={x - 9} y={14} w={18} h={18} o={[x, 28.6]} className="ch-vela-chama">
        <circle cx={x} cy={24} r={8} fill="#FFD98A" opacity={0.34} />
        <path d={`M${x} 19 C${x + 3.2} 23.4 ${x + 2.6} 28.6 ${x} 28.6 C${x - 2.6} 28.6 ${x - 3.2} 23.4 ${x} 19 Z`} fill="#FFB347" />
        <path d={`M${x} 23 C${x + 1.4} 25 ${x + 1.2} 28 ${x} 28 C${x - 1.2} 28 ${x - 1.4} 25 ${x} 23 Z`} fill="#FFF3C4" />
      </D>
    </Cx>
  );
}

function Meia({ x, i, bag }: { x: number; i: number; bag: boolean }) {
  const cor = i === 1 ? VERDE : VERMELHO;
  const escura = i === 1 ? '#1F5E3C' : '#8E2329';
  return (
    <Cx x={x - 20} y={60} w={30} h={38} o={[x, 62]} className={cn('ch-bag meia', `m${i + 1}`, bag && 'bag')}>
      <D x={x - 20} y={60} w={30} h={38}>
        <g transform={`translate(${x - 8} 62)`}>
          <path d="M8 -1 V5" stroke={OURO} strokeWidth={1.4} strokeLinecap="round" />
          <path d="M2 10 H14 V26 Q14 33 7 33 H-5 Q-11 33 -11 27.5 Q-11 22 -3 22 H2 Z" fill={cor} />
          <path d="M11 10 H14 V26 Q14 33 7 33 H-5 Q-8 33 -9.6 31.6 Q-4 32 6 31 Q11 30 11 25 Z" fill={escura} opacity={0.5} />
          {/* o tricô: as fileiras, o calcanhar e a ponta */}
          <path d="M2 14 H14 M2 18 H14 M-8 26 H12" stroke="#000" strokeWidth={0.5} opacity={0.16} />
          <path d="M3 12 l1.6 1.6 l1.6 -1.6 l1.6 1.6 l1.6 -1.6 l1.6 1.6 l1.6 -1.6" stroke="#FFFFFF" strokeWidth={0.7} fill="none" opacity={0.75} />
          <path d="M-11 27.5 Q-11 22 -5.6 22 Q-7 27 -9.4 30.6 Q-11 29.6 -11 27.5 Z" fill="#F6EFE3" opacity={0.9} />
          <path d="M14 22 Q14 27 11 30.4 Q9 26 10 22 Z" fill="#F6EFE3" opacity={0.6} />
          <rect x={-0.5} y={4} width={17} height={7.5} rx={3.6} fill="#F6EFE3" />
          <rect x={-0.5} y={8.6} width={17} height={2.9} rx={1.4} fill="#D9CDB8" opacity={0.6} />
          <path d="M1 5.6 Q4 4.4 7 5.6 Q10 4.4 13 5.6" stroke="#FFFFFF" strokeWidth={1} fill="none" />
          {i === 1 ? <path d="M5 17 L8 14 L11 17 L8 20 Z" fill={OURO} /> : <path d="M8 14.6 L8.9 16.8 L11.2 16.9 L9.4 18.3 L10 20.6 L8 19.3 L6 20.6 L6.6 18.3 L4.8 16.9 L7.1 16.8 Z" fill="#FFFFFF" opacity={0.9} />}
        </g>
      </D>
    </Cx>
  );
}

/** A lareira inteira: fundo, fogo, lenha e grade, a cornija enfeitada, as velas, as meias e a guirlanda. */
export function Lareira({ topo, b }: { topo: number; b: Bagunca }) {
  return (
    <>
      <FundoDaLareira topo={topo} />
      <Fogo />
      <FrenteDaLareira />
      <Guirlanda bag={!!b.guirlanda} />
      <EnfeitesDaCornija />
      {[212, 390].map((x, i) => <Vela key={x} x={x} i={i} bag={!!b.velas} />)}
      {/* o festão de pinheiro na cornija, com as luzinhas do pisca-pisca */}
      <D x={198} y={58} w={204} h={18}>
        <path d={FESTAO} stroke="#000" strokeWidth={6.5} strokeLinecap="round" fill="none" opacity={0.18} transform="translate(0 1.6)" />
        <path d={FESTAO} stroke="#1F5236" strokeWidth={6.5} strokeLinecap="round" fill="none" />
        <path d={FESTAO} stroke="#4DA373" strokeWidth={4.4} strokeLinecap="round" fill="none" strokeDasharray="1.2 2.4" />
        <path d={FESTAO} stroke="#7CC79A" strokeWidth={1.6} strokeLinecap="round" fill="none" strokeDasharray=".8 3.8" strokeDashoffset={1} transform="translate(0 -1)" />
      </D>
      <Luzes pontos={PONTOS_FESTAO} cores={CORES_FESTAO} raio={6.6} />
      {[238, 300, 362].map((x, i) => <Meia key={x} x={x} i={i} bag={!!b.meias} />)}
    </>
  );
}

// ── A prateleira e a TV de tubo ─────────────────────────────────────────────

/** A prateleira em cima da TV: livros, o globo de neve e um pinheirinho. */
export const Prateleira = memo(function Prateleira() {
  return (
    <D x={404} y={42} w={62} h={30}>
      <rect x={406} y={64} width={58} height={3.4} rx={1} fill="url(#nt-ch-madeira)" />
      <rect x={406} y={64} width={58} height={1} fill="#D2A47C" opacity={0.7} />
      <rect x={407} y={67.4} width={56} height={1.6} fill="#000" opacity={0.14} />
      <path d="M411 67.4 V71.4 L415 67.4 Z M459 67.4 V71.4 L455 67.4 Z" fill="#5A3820" />
      {/* os livros */}
      <rect x={409} y={50} width={4.4} height={14} rx={0.6} fill="#2D5B8C" /><rect x={409} y={53} width={4.4} height={1.2} fill={OURO} />
      <rect x={413.6} y={48} width={3.8} height={16} rx={0.6} fill={VERMELHO} /><rect x={413.6} y={58} width={3.8} height={1.2} fill="#F6EFE3" />
      <rect x={417.6} y={51} width={4.8} height={13} rx={0.6} fill={VERDE} /><rect x={417.6} y={54} width={4.8} height={1} fill="#F6EFE3" />
      <rect x={422.6} y={49.4} width={3.4} height={14.6} rx={0.6} fill="#8A5A38" transform="rotate(9 424 64)" />
      {/* o globo de neve */}
      <rect x={433.4} y={60.4} width={11.2} height={3.6} rx={1} fill="#8A5A38" />
      <circle cx={439} cy={55} r={6.2} fill="#CFE6F8" opacity={0.75} />
      <path d="M433.8 58.4 Q439 55 444.2 58.4 Q442 61 439 61 Q436 61 433.8 58.4 Z" fill="#FFFFFF" />
      <path d="M439 50.4 L441.6 55 L440.4 55 L442.4 58.4 H435.6 L437.6 55 L436.4 55 Z" fill={VERDE} />
      <path d="M435.4 51.6 Q436.6 49.6 439 49.6" stroke="#FFFFFF" strokeWidth={0.9} fill="none" strokeLinecap="round" opacity={0.9} />
      {/* o pinheirinho no vaso */}
      <path d="M452.6 60 H459.4 L458.6 64 H453.4 Z" fill="#B5553E" />
      <path d="M456 46 L460 53 L458.4 53 L461.4 60 H450.6 L453.6 53 L452 53 Z" fill="url(#nt-ch-pinho)" />
      <circle cx={456} cy={45.6} r={1.2} fill="#FFD54F" />
      <circle cx={454.4} cy={55} r={0.9} fill={VERMELHO} /><circle cx={458} cy={57.4} r={0.9} fill={OURO} />
    </D>
  );
});

// A tela da TV, no quadro: 16:9, do formato do vídeo (160 × 90, o «Mini filme.bat»).
const TELA = { x: 398, y: 96, w: 72, h: 40.5 } as const;

/** O vídeo que passa na TV (pedido do Cleber, 13/11/2026): Esqueceram de Mim (1990), 160 × 90 a 10 fps. */
const VIDEO_DA_TV = '/video/natal/tv-chale-esqueceram.mp4';
/** O nome do filme, para o balão que abre ao clicar na TV. Trocou o vídeo, troque aqui. */
const FILME_DA_TV = { nome: 'Esqueceram de Mim', ano: 1990 } as const;
/** A duração do vídeo, em segundos — vale até os metadados chegarem. */
const DURACAO_DA_TV = 6174.1;
/** Fora do ponto mais do que isto (em s), pula para o ponto certo. */
const TOLERANCIA_DA_TV = 1.5;

/** Onde o vídeo deve estar agora: o mesmo ponto para todo mundo, pela hora do banco. */
function pontoDaTv(agoraMs: number, duracao: number): number {
  const d = duracao > 0 && Number.isFinite(duracao) ? duracao : DURACAO_DA_TV;
  return ((agoraMs / 1000) % d + d) % d;
}

/**
 * O que passa na TV: um filme de 160 × 90 que dá a volta quando acaba,
 * no MESMO ponto para todo mundo — ninguém conversa com ninguém: a posição é a
 * hora do banco (`agoraDoServidor`, a mesma da sirene) dividida pela duração.
 * A cada 30 s confere se escorregou. Pausa só no modo leve ou com a TV fora do
 * ar (o Grinch a derrubou); na volta, pula para o ponto certo.
 *
 * NÃO segue o «ninguém olhando» (`lib/atencao.ts`), de propósito (Cleber,
 * 11/11/2026): quem quiser assiste com a janela em outra tela. Se o navegador
 * pausar sozinho com a aba escondida, ao voltar ela (`visibilitychange`) o
 * vídeo pula para o ponto de todo mundo.
 */
const VideoDaTv = memo(function VideoDaTv({ parado }: { parado: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const acertar = () => {
      if (v.readyState < 1) return;
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : DURACAO_DA_TV;
      const alvo = pontoDaTv(agoraDoServidor(), d);
      const dif = Math.abs(v.currentTime - alvo);
      if (Math.min(dif, d - dif) > TOLERANCIA_DA_TV) v.currentTime = alvo;
    };
    const conferir = () => {
      if (parado) { v.pause(); return; }
      acertar();
      v.play().catch(() => { /* sem permissão para tocar: fica no quadro parado */ });
    };
    v.addEventListener('loadedmetadata', conferir);
    document.addEventListener('visibilitychange', conferir);
    const id = window.setInterval(() => { if (!v.paused) acertar(); }, 30_000);
    conferir();
    return () => { v.removeEventListener('loadedmetadata', conferir); document.removeEventListener('visibilitychange', conferir); window.clearInterval(id); v.pause(); };
  }, [parado]);
  return (
    <video ref={ref} className="ch-tv-video" src={VIDEO_DA_TV} muted loop playsInline preload="metadata"
      disablePictureInPicture aria-hidden="true"
      style={{ left: TELA.x, top: TELA.y, width: TELA.w, height: TELA.h }} />
  );
});

/** O chuvisco da TV fora do ar (só aparece na bagunça): pontos fixos, deslocados em degraus. */
const Chuvisco = memo(function Chuvisco() {
  const x = TELA.x - 2, y = TELA.y - 2, w = TELA.w + 4, h = TELA.h + 4;
  const pontos = Array.from({ length: 300 },(_, i) => [x + acasoDa(i) * w, y + acasoDa(i + 300) * h, acasoDa(i + 600)] as const);
  return (
    <D x={x} y={y} w={w} h={h} className="ch-tv-chuvisco">
      <rect x={x} y={y} width={w} height={h} fill="#8E949C" />
      {pontos.map(([px, py, c], i) => <rect key={i} x={px} y={py} width={2.2} height={1.1} fill={c > 0.5 ? '#F2F4F6' : '#2A2E34'} />)}
    </D>
  );
});

/**
 * A TV de tubo (pedido do Cleber, 11/11/2026): gabinete de madeira, antena de
 * coelho, e embaixo da tela o alto-falante, a luzinha e os dois botões, em cima
 * de um rack com o videocassete. A tela é 16:9, do formato do vídeo que passa
 * nela (`VideoDaTv`); a faixa clara descendo, as linhas e o tremor são o tubo.
 */
export function Tv({ bag, leve, onClicar }: { bag: boolean; leve: boolean; onClicar?: () => void }) {
  const { x: tx, y: ty, w: tw, h: th } = TELA;
  return (
    <>
      {/* o rack, com o videocassete */}
      <D x={391} y={148} w={92} h={30}>
        <ellipse cx={437} cy={175.4} rx={43} ry={2.2} fill="url(#nt-ch-contato)" />
        <path d="M399 150 L397 176 M475 150 L477 176" stroke="url(#nt-ch-madeira-h)" strokeWidth={3} strokeLinecap="round" />
        <rect x={394} y={148.6} width={86} height={4.6} rx={1.4} fill="url(#nt-ch-madeira)" />
        <rect x={394} y={148.6} width={86} height={1.2} rx={0.6} fill="#D2A47C" opacity={0.75} />
        <rect x={398} y={164.6} width={78} height={3.2} rx={1} fill="#7A4E30" />
        <rect x={408} y={157} width={30} height={7.6} rx={1} fill="#2B2E35" />
        <rect x={408} y={157} width={30} height={1.4} rx={0.7} fill="#4A4E58" />
        <rect x={411} y={159.6} width={13} height={2.4} rx={0.6} fill="#14161A" />
        <rect x={427} y={159.6} width={6} height={2.4} rx={0.5} fill="#0E2A16" />
        <path d="M428 161.4 h1 M430 161.4 h1 M431.6 161.4 h.8" stroke="#39E07A" strokeWidth={0.9} />
        {/* umas fitas ao lado */}
        <rect x={444} y={159} width={12} height={2.6} rx={0.5} fill="#3A3E48" /><rect x={445} y={156.4} width={11} height={2.6} rx={0.5} fill="#55303A" />
        <rect x={447} y={160} width={6} height={0.8} fill="#F6EFE3" opacity={0.7} />
      </D>
      <Cx x={393} y={74} w={86} h={76} o={[436, 149]} className={cn('ch-bag tv', bag && 'bag', onClicar && 'ch-tv-clique')} onClick={onClicar}>
        {/* a antena */}
        <D x={416} y={74} w={40} h={22} o={[436, 94]} className="ch-tv-antena">
          <path d="M436 93 L423 77 M436 93 L450 79" stroke="#8E949C" strokeWidth={1.1} strokeLinecap="round" />
          <circle cx={423} cy={77} r={1.2} fill="#C9CED6" /><circle cx={450} cy={79} r={1.2} fill="#C9CED6" />
          <path d="M431 95 Q436 88 441 95 Z" fill="#3A3E48" />
        </D>
        {/* o gabinete */}
        <D x={393} y={92} w={86} h={58}>
          <rect x={394} y={94} width={84} height={54} rx={5} fill="#3A2214" />
          <rect x={394} y={93} width={84} height={54} rx={5} fill="url(#nt-ch-nogueira)" />
          <rect x={395.4} y={94} width={81.2} height={2} rx={1} fill="#C3916A" opacity={0.6} />
          {/* a moldura escura da tela */}
          <rect x={tx - 1.8} y={ty - 1.8} width={tw + 3.6} height={th + 3.6} rx={4.6} fill="#191B20" />
          <rect x={tx} y={ty} width={tw} height={th} rx={3.4} fill="url(#nt-ch-tela)" />
          {/* o painel embaixo da tela: o alto-falante, a luzinha e os dois botões */}
          <path d="M401 139.6 v4.6 M403.6 139.6 v4.6 M406.2 139.6 v4.6 M408.8 139.6 v4.6 M411.4 139.6 v4.6 M414 139.6 v4.6 M416.6 139.6 v4.6 M419.2 139.6 v4.6 M421.8 139.6 v4.6" stroke="#2A1810" strokeWidth={0.9} strokeLinecap="round" />
          <circle cx={446} cy={142} r={0.8} fill="#FF4D4D" />
          <circle cx={456} cy={142} r={2.8} fill="#191B20" /><circle cx={456} cy={142} r={2.1} fill="#C9CED6" /><path d="M456 142 V140.3" stroke="#191B20" strokeWidth={0.8} strokeLinecap="round" />
          <circle cx={465} cy={142} r={2.8} fill="#191B20" /><circle cx={465} cy={142} r={2.1} fill="#C9CED6" /><path d="M465 142 L466.3 140.8" stroke="#191B20" strokeWidth={0.8} strokeLinecap="round" />
          {/* os pezinhos */}
          <rect x={399} y={146.6} width={6} height={2.4} rx={0.8} fill="#2A1810" /><rect x={467} y={146.6} width={6} height={2.4} rx={0.8} fill="#2A1810" />
        </D>
        {/* a tela: o vídeo, a faixa do tubo, o chuvisco (na bagunça) e o reflexo do vidro */}
        <Cx x={tx} y={ty} w={tw} h={th} className="ch-tv-tela" data-nao-pausa="">
          <VideoDaTv parado={bag || leve} />
          <D x={tx} y={ty - 8} w={tw} h={8} className="ch-tv-faixa"><rect x={tx} y={ty - 8} width={tw} height={8} fill="#FFFFFF" opacity={0.12} /></D>
          {bag && <Chuvisco />}
          <D x={tx} y={ty} w={tw} h={th}>
            {Array.from({ length: Math.ceil(th / 3.1) }, (_, i) => <rect key={i} x={tx} y={ty + 0.6 + i * 3.1} width={tw} height={0.8} fill="#000" opacity={0.14} />)}
            <rect x={tx} y={ty} width={tw} height={th} fill="url(#nt-ch-vidro-tv)" />
            <path d={`M${tx + 3} ${ty + 4} Q${tx + 6} ${ty + 1.6} ${tx + 12} ${ty + 1.6}`} stroke="#FFFFFF" strokeWidth={1.1} fill="none" strokeLinecap="round" opacity={0.5} />
          </D>
        </Cx>
      </Cx>
    </>
  );
}

/** «faltam 32 min» — quanto falta para o filme acabar (e recomeçar), no ponto de todo mundo. */
function quantoFalta(): string {
  const falta = DURACAO_DA_TV - pontoDaTv(agoraDoServidor(), DURACAO_DA_TV);
  const min = Math.ceil(falta / 60);
  if (min <= 1) return 'acabando agora!';
  if (min < 60) return `faltam ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `faltam ${h} h ${m} min` : `faltam ${h} h`;
}

/**
 * O balão de «Passando agora», em cima da TV (pedido do Cleber, 11/11/2026):
 * abre com um clique na TV e fecha sozinho (`Chale`). Fica fora da TV, no fim
 * do palco, para passar por cima da árvore e dos presentes. Com a TV fora do
 * ar (o Grinch a derrubou), conta isso em vez do filme.
 */
export function BalaoDaTv({ foraDoAr }: { foraDoAr: boolean }) {
  return (
    <div className="ch-tv-balao" style={{ left: TELA.x + TELA.w / 2, top: TELA.y - 7 }}>
      {foraDoAr ? (
        <>
          <span className="ch-tv-balao-rotulo fora">Fora do ar!</span>
          <strong>O Grinch derrubou a TV</strong>
          <span className="ch-tv-balao-tempo">os duendes já vêm consertar</span>
        </>
      ) : (
        <>
          <span className="ch-tv-balao-rotulo"><i />Passando agora</span>
          <strong>{FILME_DA_TV.nome} <span className="ch-tv-balao-ano">({FILME_DA_TV.ano})</span></strong>
          <span className="ch-tv-balao-tempo">{quantoFalta()}</span>
        </>
      )}
    </div>
  );
}

// ── Os presentes e a árvore ─────────────────────────────────────────────────

/** Uma caixa de presente em 3D: frente, lado, tampa, fita e laço. */
function Caixa({ x, y, w, h, cor, sombra, fita, giro = 0, classe }: {
  x: number; y: number; w: number; h: number; cor: string; sombra: string; fita: string; giro?: number; classe?: string;
}) {
  const p = 6;
  return (
    <g transform={`rotate(${giro} ${x + w / 2} ${y + h})`} className={classe}>
      <path d={`M${x + w} ${y} l${p} -${p * 0.6} V${y + h - p * 0.6} l-${p} ${p * 0.6} Z`} fill={sombra} className="lado" />
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill={cor} className="frente" />
      <rect x={x} y={y + h * 0.62} width={w} height={h * 0.38} rx={1.5} fill="#000" opacity={0.1} />
      <path d={`M${x} ${y} l${p} -${p * 0.6} H${x + w + p} l-${p} ${p * 0.6} Z`} fill={cor} className="tampa" />
      <path d={`M${x} ${y} l${p} -${p * 0.6} H${x + w + p} l-${p} ${p * 0.6} Z`} fill="#FFFFFF" opacity={0.22} />
      <rect x={x + w / 2 - 2.6} y={y} width={5.2} height={h} fill={fita} />
      <rect x={x + w / 2 - 2.6} y={y} width={1.6} height={h} fill="#FFFFFF" opacity={0.35} />
      <path d={`M${x + w / 2 - 2.6} ${y} l${p} -${p * 0.6} h5.2 l-${p} ${p * 0.6} Z`} fill={fita} />
      <path d={`M${x + w} ${y + h / 2 - 2} l${p} -${p * 0.6} v4.4 l-${p} ${p * 0.6} Z`} fill={fita} opacity={0.85} />
      <path d={`M${x + w / 2} ${y - 1} C${x + w / 2 - 10} ${y - 12} ${x + w / 2 - 16} ${y - 3} ${x + w / 2 - 3} ${y - 0.4} Z M${x + w / 2} ${y - 1} C${x + w / 2 + 10} ${y - 12} ${x + w / 2 + 16} ${y - 3} ${x + w / 2 + 3} ${y - 0.4} Z`} fill={fita} />
      <path d={`M${x + w / 2 - 1} ${y - 2} C${x + w / 2 - 7} ${y - 9} ${x + w / 2 - 11} ${y - 5} ${x + w / 2 - 5} ${y - 2} Z`} fill="#FFFFFF" opacity={0.3} />
      <circle cx={x + w / 2} cy={y - 1} r={2.2} fill={fita} />
    </g>
  );
}

/** Os presentes ao pé da árvore — um deles na cor do Gestão. O Grinch chuta os três. */
export function Presentes({ bag }: { bag: boolean }) {
  return (
    <>
      <Cx x={462} y={140} w={40} h={38} o={[478, 176]} className={cn('ch-bag presente p1', bag && 'bag')}>
        <D x={462} y={140} w={40} h={38}>
          <ellipse cx={480} cy={175.4} rx={18} ry={1.8} fill="url(#nt-ch-contato)" />
          <Caixa x={466} y={152} w={26} h={24} cor="#2F7D52" sombra="#1F5E3C" fita="#C8353A" />
        </D>
      </Cx>
      <Cx x={466} y={124} w={30} h={30} o={[480, 142]} className={cn('ch-bag presente p2', bag && 'bag')}>
        <D x={466} y={124} w={30} h={30}>
          <Caixa x={470} y={136} w={17} h={16} cor="#C8353A" sombra="#8E2329" fita={OURO} giro={-5} />
        </D>
      </Cx>
      <Cx x={546} y={136} w={46} h={42} o={[566, 176]} className={cn('ch-bag presente p3', bag && 'bag')}>
        <D x={546} y={136} w={46} h={42}>
          <ellipse cx={568} cy={175.4} rx={20} ry={1.8} fill="url(#nt-ch-contato)" />
          <Caixa x={552} y={150} w={28} h={26} cor="#E2B04A" sombra="#B98A2C" fita="#C8353A" classe="nt-ch-presente-gestao" />
          <path d="M574 147 L581 144.6 L582.6 150 L575.6 152.4 Z" fill="#F6EFE3" stroke="#C9B79A" strokeWidth={0.6} />
          <path d="M576.6 148 L580.4 146.8 M577.2 150 L581 148.8" stroke="#9AA3AD" strokeWidth={0.5} />
        </D>
      </Cx>
    </>
  );
}

const LUZES_ARVORE = [[506, 58], [534, 64], [520, 50], [496, 92], [520, 98], [548, 100], [486, 132], [512, 140], [540, 136], [562, 144], [500, 116], [530, 120]] as const;
const BOLAS_ARVORE: readonly [number, number, string][] = [[512, 44, 'vermelha'], [528, 80, 'ouro'], [500, 108, 'azul'], [546, 118, 'vermelha'], [520, 128, 'ouro'], [482, 146, 'vermelha'], [556, 150, 'azul'], [536, 96, 'azul'], [506, 76, 'ouro']];

const DesenhoDaArvore = memo(function DesenhoDaArvore() {
  // uma camada de galhos com a borda de baixo recortada
  const camada = (topo: number, base: number, meia: number) => {
    const n = 5, passo = (meia * 2) / n;
    let d = `M520 ${topo} L${520 + meia} ${base}`;
    for (let i = n; i > 0; i--) d += ` Q${520 - meia + passo * (i - 0.5)} ${base + 5} ${520 - meia + passo * (i - 1)} ${base}`;
    return d + ' Z';
  };
  const camadas: [number, number, number][] = [[78, 152, 56], [44, 114, 44], [14, 76, 32]];
  return (
    <D x={458} y={0} w={124} h={178}>
      <ellipse cx={520} cy={A - 1} rx={38} ry={2.6} fill="url(#nt-ch-contato)" />
      {/* o vaso: caixote de madeira com faixa dourada */}
      <path d="M504 154 H536 L533 172 H507 Z" fill="url(#nt-ch-madeira)" />
      <path d="M504 154 H536 L535.4 158 H504.6 Z" fill="#000" opacity={0.25} />
      <rect x={503} y={154} width={34} height={4} rx={1} fill="#A6744C" />
      <rect x={505.6} y={161} width={29} height={2.6} fill={OURO} />
      <rect x={505.6} y={161} width={29} height={0.9} fill="#F5D68A" />
      <rect x={515} y={148} width={10} height={8} fill="#5A3820" />
      {camadas.map(([t, base, meia]) => (
        <g key={t}>
          <path d={camada(t, base, meia)} fill="url(#nt-ch-pinho)" />
          {/* o lado da sombra e a sombra da camada de cima */}
          <path d={`M520 ${t} L${520 + meia} ${base} L520 ${base + 4} Z`} fill="#000" opacity={0.1} />
          {/* a luz do fogo, do lado de cá */}
          <path d={`M520 ${t} L${520 - meia} ${base} L${520 - meia * 0.45} ${base + 3} Z`} fill="#8AD3A6" opacity={0.16} />
        </g>
      ))}
      {/* neve nas pontas */}
      <path d="M466 152 Q472 148 478 152 M562 152 Q568 148 574 152 M478 114 Q484 110 490 114 M550 114 Q556 110 562 114 M490 76 Q495 72 500 76 M540 76 Q545 72 550 76"
        stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.95} />
      {/* o festão dourado em espiral */}
      <path d="M500 64 Q522 74 544 62 M486 100 Q520 114 556 100 M472 140 Q520 156 568 138" stroke={OURO} strokeWidth={1.8} fill="none" />
      <path d="M500 64 Q522 74 544 62 M486 100 Q520 114 556 100 M472 140 Q520 156 568 138" stroke="#FFF0B8" strokeWidth={0.7} fill="none" strokeDasharray="1 3" />
      {/* as bengalinhas doces */}
      {[[494, 124, -14], [548, 86, 12]].map(([x, y, g]) => (
        <g key={x} transform={`translate(${x} ${y}) rotate(${g})`}>
          <path d="M0 9 V1 Q0 -3 3 -3 Q6 -3 6 0.6" stroke="#FFFFFF" strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <path d="M0 9 V1 Q0 -3 3 -3 Q6 -3 6 0.6" stroke="#D5353A" strokeWidth={2.2} fill="none" strokeDasharray="1.6 1.8" />
        </g>
      ))}
      {BOLAS_ARVORE.map(([x, y, cor]) => (
        <g key={`${x}-${y}`}>
          <rect x={x - 1.4} y={y - 6.2} width={2.8} height={1.8} rx={0.5} fill={OURO} />
          <circle cx={x} cy={y} r={4.4} fill={`url(#nt-ch-bola-${cor})`} />
          <ellipse cx={x - 1.4} cy={y - 1.6} rx={1.2} ry={0.8} fill="#FFFFFF" opacity={0.7} transform={`rotate(-30 ${x - 1.4} ${y - 1.6})`} />
        </g>
      ))}
    </D>
  );
});

/** A árvore em camadas, com festão, bolas, bengalinhas, as luzinhas do pisca-pisca e a estrela. */
export function Arvore({ bag }: { bag: boolean }) {
  return (
    <Cx x={458} y={0} w={124} h={176} o={[536, 176]} className={cn('ch-bag arvore', bag && 'bag')}>
      <DesenhoDaArvore />
      <Luzes pontos={LUZES_ARVORE} cores={CORES_ARVORE} base={20} />
      <D x={506} y={-2} w={28} h={28} o={[520, 12]} className="ch-estrela">
        <circle cx={520} cy={12} r={12} fill="#FFE07A" opacity={0.26} />
        <path d="M520 2 L522.9 8.9 L530 8.9 L524.4 13.4 L526.4 20.4 L520 16.4 L513.6 20.4 L515.6 13.4 L510 8.9 L517.1 8.9 Z" fill="#FFD54F" stroke="#D99A00" strokeWidth={0.8} strokeLinejoin="round" />
        <path d="M520 5 L521.6 10 L520 12 L516 9.6 Z" fill="#FFFFFF" opacity={0.75} />
      </D>
    </Cx>
  );
}

// ── Do teto ─────────────────────────────────────────────────────────────────

/** Do teto: uma bola, uma estrela e outra bola penduradas, balançando de leve. */
export function Pendurados({ topo }: { topo: number }) {
  const h = (ate: number) => ate + topo;
  return (
    <>
      <D x={228} y={-topo} w={12} h={h(18)} o={[234, -topo]} className="ch-pendurado">
        <path d={`M234 ${-topo} V5`} stroke="#B8862B" strokeWidth={0.9} />
        <rect x={231.4} y={4} width={5.2} height={3} rx={1} fill={OURO} />
        <circle cx={234} cy={12} r={5.6} fill="url(#nt-ch-bola-azul)" />
        <ellipse cx={232} cy={10} rx={1.5} ry={1} fill="#FFFFFF" opacity={0.7} />
      </D>
      <D x={420} y={-topo} w={20} h={h(40)} o={[430, -topo]} className="ch-pendurado p2">
        <path d={`M430 ${-topo} V26`} stroke="#B8862B" strokeWidth={0.9} />
        <path d="M430 24 L432.4 29.6 L438.4 29.6 L433.6 33.2 L435.4 39 L430 35.6 L424.6 39 L426.4 33.2 L421.6 29.6 L427.6 29.6 Z" fill="#FFD54F" stroke="#D99A00" strokeWidth={0.6} strokeLinejoin="round" />
        <path d="M430 26.6 L431 30.4 L430 32 L427.6 30.6 Z" fill="#FFFFFF" opacity={0.7} />
      </D>
      <D x={582} y={-topo} w={12} h={h(23)} o={[588, -topo]} className="ch-pendurado p3">
        <path d={`M588 ${-topo} V12`} stroke="#B8862B" strokeWidth={0.9} />
        <rect x={585.8} y={10.6} width={4.4} height={2.8} rx={1} fill={OURO} />
        <circle cx={588} cy={17} r={5} fill="url(#nt-ch-bola-ouro)" />
        <ellipse cx={586.4} cy={15.4} rx={1.3} ry={0.9} fill="#FFFFFF" opacity={0.7} />
      </D>
    </>
  );
}

/** A bola vermelha pendurada entre a chaminé e a prateleira. Na bagunça, cai e rola para o chão. */
const BOLA = { x: 367, y: 42, r: 7 };
export function BolaDoGrinch({ topo, caida }: { topo: number; caida: boolean }) {
  return (
    <div className={cn('ch-bag-bola', caida && 'bag')}>
      <D x={BOLA.x - 2} y={-topo} w={4} h={BOLA.y - BOLA.r - 2.4 + topo} className="fio">
        <path d={`M${BOLA.x} ${-topo} V${BOLA.y - BOLA.r - 2.4}`} stroke="#B8862B" strokeWidth={0.9} />
      </D>
      <D x={BOLA.x - 8} y={BOLA.y - 11} w={16} h={19} o={[BOLA.x, BOLA.y]} className="bola">
        <rect x={BOLA.x - 2.4} y={BOLA.y - BOLA.r - 3} width={4.8} height={3.2} rx={1} fill={OURO} />
        <circle cx={BOLA.x} cy={BOLA.y} r={BOLA.r} fill="url(#nt-ch-bola-vermelha)" />
        <ellipse cx={BOLA.x - 2.4} cy={BOLA.y - 2.8} rx={1.9} ry={1.2} fill="#FFFFFF" opacity={0.7} transform={`rotate(-30 ${BOLA.x - 2.4} ${BOLA.y - 2.8})`} />
        <path d={`M${BOLA.x - 6.6} ${BOLA.y + 1} Q${BOLA.x} ${BOLA.y + 4} ${BOLA.x + 6.6} ${BOLA.y + 1}`} stroke={OURO} strokeWidth={0.9} fill="none" opacity={0.85} />
      </D>
    </div>
  );
}

// ── O que sobra no chão ─────────────────────────────────────────────────────

/**
 * O que fica espalhado pelo chão enquanto a bagunça não é arrumada: a estrela
 * e bolas da árvore, papel de presente rasgado, e a neve e os cacos que
 * entraram pela janela quebrada.
 */
export function RestosDaBagunca({ b, compacto }: { b: Bagunca; compacto: boolean }) {
  if (compacto) return null;
  return (
    <>
      {b.arvore && (
        <D x={440} y={150} w={160} h={28} className="ch-resto">
          <path d="M592 168 L594.6 162.4 L600.6 162.4 L595.8 158.8 L597.6 153 L592 156.4 L586.4 153 L588.2 158.8 L583.4 162.4 L589.4 162.4 Z" transform="rotate(150 592 160)" fill="#FFD54F" stroke="#D99A00" strokeWidth={0.6} />
          <circle cx={452} cy={171} r={4} fill="url(#nt-ch-bola-ouro)" />
          <circle cx={510} cy={171.4} r={3.6} fill="url(#nt-ch-bola-azul)" />
        </D>
      )}
      {b.presentes && (
        <D x={440} y={160} w={110} h={18} className="ch-resto">
          <path d="M446 172 l6 -4 l4 3 l-5 3 Z M496 174 l5 -3 l2 4 Z M524 173 l4 -5 l5 2 l-4 4 Z" fill="#C8353A" />
          <path d="M458 171 q6 -6 12 0 M506 172 q4 -5 9 -1" stroke={OURO} strokeWidth={1.2} fill="none" />
        </D>
      )}
      {b.janela && (
        <D x={96} y={162} w={60} h={16} className="ch-resto">
          <path d="M100 174 Q114 167 128 174 Z" fill="#FFFFFF" opacity={0.9} />
          <path d="M108 175 l3 -3 l2 3 Z M122 175 l2 -2.6 l3 2.6 Z M136 175 l2.4 -3.4 l2.2 3.4 Z" fill="#CFE3F7" stroke="#8FB3D9" strokeWidth={0.4} />
        </D>
      )}
    </>
  );
}

// ── O anexo: o chalé continua, baixo, embaixo dos botões da página ──────────

/**
 * O que cabe no anexo, da esquerda para a direita. Cada coisa só aparece se o
 * anexo for largo o bastante para ela inteira (`ate`, contado do fim do
 * quadro). Tudo baixo: o vão ali é a faixa entre os botões e a linha das abas.
 */
export const Anexo = memo(function Anexo({ largura }: { largura: number }) {
  const cabe = (ate: number) => largura >= ate;
  return (
    <>
      {cabe(78) && (
        <D x={604} y={112} w={74} h={66}>
          <ellipse cx={640} cy={175.4} rx={34} ry={2.2} fill="url(#nt-ch-contato)" />
          <Caixa x={610} y={144} w={34} h={32} cor="#2D5B8C" sombra="#1B3F66" fita="#F6EFE3" />
          <Caixa x={648} y={154} w={22} h={22} cor="#C8353A" sombra="#8E2329" fita={OURO} />
          <Caixa x={616} y={124} w={22} h={20} cor="#E2B04A" sombra="#B98A2C" fita="#2F7D52" giro={4} />
        </D>
      )}
      {cabe(146) && (
        <>
          <D x={686} y={170} w={56} h={8}><ellipse cx={714} cy={175.4} rx={26} ry={2.2} fill="url(#nt-ch-contato)" /></D>
          {/* o cavalinho de balanço: embala devagar */}
          <D x={686} y={122} w={56} h={56} o={[714, 176]} className="ch-cavalinho">
            <path d="M690 168 Q714 182 738 168" stroke="#8E2329" strokeWidth={3.6} strokeLinecap="round" fill="none" />
            <path d="M691 167 Q714 180 737 167" stroke="#E4575B" strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.7} />
            <path d="M702 152 L698 171 M724 152 L730 171" stroke="url(#nt-ch-madeira-h)" strokeWidth={3.4} strokeLinecap="round" />
            <path d="M698 146 Q698 138 708 138 H722 Q730 138 730 146 Q730 154 722 154 H706 Q698 154 698 146 Z" fill="url(#nt-ch-madeira)" />
            <path d="M700 142 Q700 139 708 139 H722 Q728 139 729 143" stroke="#D2A47C" strokeWidth={1} fill="none" opacity={0.6} />
            <path d="M724 141 L731 126 Q733 122 737 124 L741 130 Q742 133 739 133.6 L735 134 L731 147 Z" fill="url(#nt-ch-madeira)" />
            <path d="M731 126 L729.6 121 L733.4 123.4 Z" fill="#8A5A38" />
            <circle cx={736} cy={127.6} r={0.9} fill="#1B1B1B" />
            <path d="M727 134 Q723 128 727.6 124 Q725 131 729 134.6" fill="#5A3420" />
            <path d="M698 144 Q691 146 692 156" stroke="#5A3420" strokeWidth={2.6} strokeLinecap="round" fill="none" />
            <path d="M706 138 H720 V146 Q713 149 706 146 Z" fill={VERMELHO} />
            <path d="M706 138 H720 V140 H706 Z" fill={OURO} />
            <path d="M733 130.4 L739 131.6 M731.6 133.4 L724 141" stroke={VERMELHO} strokeWidth={0.9} strokeLinecap="round" />
          </D>
        </>
      )}
      {cabe(196) && (
        <D x={750} y={126} w={44} h={52}>
          <ellipse cx={772} cy={175.4} rx={16} ry={2} fill="url(#nt-ch-contato)" />
          {/* o banquinho com o leite e os biscoitos do Papai Noel */}
          <path d="M762 154 L758 176 M782 154 L786 176 M772 154 V174" stroke="url(#nt-ch-madeira-h)" strokeWidth={2.8} strokeLinecap="round" />
          <ellipse cx={772} cy={153} rx={15} ry={3.4} fill="#6E4529" />
          <ellipse cx={772} cy={151.8} rx={15} ry={3.2} fill="url(#nt-ch-madeira)" />
          <path d="M762 139 H769 L768.4 150 Q765.5 151 762.6 150 Z" fill="#EAF3FB" opacity={0.85} />
          <path d="M762.4 142.6 H768.8 L768.4 150 Q765.5 151 762.6 150 Z" fill="#FFFFFF" />
          <path d="M763.4 141 V148.6" stroke="#FFFFFF" strokeWidth={0.8} opacity={0.8} />
          <ellipse cx={777.4} cy={150.6} rx={7.4} ry={1.7} fill="#F6EFE3" />
          <ellipse cx={777.4} cy={150.2} rx={5.4} ry={1} fill="#E4DCD0" />
          <ellipse cx={775.4} cy={148.8} rx={3.2} ry={1.5} fill="#C68A4E" /><ellipse cx={779.6} cy={148.2} rx={3.2} ry={1.5} fill="#D69A5C" />
          <circle cx={774.6} cy={148.6} r={0.5} fill="#5A3420" /><circle cx={776.4} cy={149} r={0.5} fill="#5A3420" /><circle cx={779} cy={148} r={0.5} fill="#5A3420" /><circle cx={780.8} cy={148.6} r={0.5} fill="#5A3420" />
          {/* o bilhete */}
          <path d="M766 130.6 L780 128.6 L781 136.4 L767 138.4 Z" fill="#FFFDF4" stroke="#D9CDB8" strokeWidth={0.5} />
          <path d="M768.6 132.4 L778.4 131 M769 134.4 L776 133.4" stroke={VERMELHO} strokeWidth={0.7} strokeLinecap="round" />
        </D>
      )}
      {cabe(252) && (
        <D x={800} y={130} w={52} h={48}>
          <ellipse cx={822} cy={175.4} rx={24} ry={2.2} fill="url(#nt-ch-contato)" />
          {/* a cesta de lenha */}
          <g>
            <rect x={808} y={143} width={22} height={8} rx={4} fill="#7E4B2B" /><circle cx={829} cy={147} r={3.8} fill="#D9AE80" /><circle cx={829} cy={147} r={2} fill="none" stroke="#B88A5C" strokeWidth={0.6} />
            <rect x={804} y={149} width={24} height={8} rx={4} fill="#6B3F24" /><circle cx={805.6} cy={153} r={3.8} fill="#D9AE80" /><circle cx={805.6} cy={153} r={2} fill="none" stroke="#B88A5C" strokeWidth={0.6} />
            <rect x={812} y={150} width={22} height={8} rx={4} fill="#8A5A38" /><circle cx={833} cy={154} r={3.8} fill="#E2BC92" /><circle cx={833} cy={154} r={2} fill="none" stroke="#B88A5C" strokeWidth={0.6} />
          </g>
          <path d="M801 156 H839 L835 175 H805 Z" fill="#B98A4E" />
          <path d="M801 156 H839 L838.2 160 H801.8 Z" fill="#D2A66A" />
          <path d="M803 164 H837 M804 170 H836 M811 157 V175 M820 157 V175 M829 157 V175" stroke="#8A6232" strokeWidth={0.8} opacity={0.7} />
          <path d="M806 156 Q820 134 834 156" stroke="#8A6232" strokeWidth={1.6} fill="none" />
          {/* a bota do Papai Noel, esquecida */}
          <g transform="translate(846 176)">
            <path d="M-5 0 V-13 H2 V-5.4 Q8 -5.4 8 0 Z" fill="#2A1810" /><rect x={-5.8} y={-15.4} width={8.6} height={3.6} rx={1.6} fill="#F6EFE3" />
            <path d="M-5 -1.4 H8" stroke="#1B1B1B" strokeWidth={1.2} />
          </g>
        </D>
      )}
    </>
  );
});
