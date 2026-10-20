/**
 * A placa de cada insígnia: o que aparece com o mouse em cima da medalha.
 * Cada gincana na roupa dela, com o desenho dela:
 *
 *   zumbi     o letreiro da Caça aos Zumbis (noite, sangue escorrendo, musgo,
 *             letra de fliperama) e o zumbi cambaleando
 *   reiDoPop  a jaqueta vermelha com os V pretos, o título em letra de filme
 *             de terror e o Rei parado na pose
 *   bruxas    o letreiro das bruxas (bandeirinhas, noite roxa, nome dourado)
 *             e a bruxa voando
 *   pantano   a MESMA placa de conquista do Minecraft que sobe quando a
 *             chefona cai (`conquista.ts`): «Quem Mandou Jogar Poção?»
 *
 * Sem a insígnia, a placa aparece apagada, com o desenho em silhueta e o que
 * falta fazer.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { carregarFonte, carregarFontesPixel } from '@/components/Halloween/fonte';
import { SpriteZumbi } from './desenhos/SpriteZumbi';
import { ZUMBIS } from './desenhos/zumbis';
import { CHEFAO } from './desenhos/chefaoArte';
import { SpriteBruxa } from './desenhos/bruxas/SpriteBruxa';
import { BRUXAS } from './desenhos/bruxas/arte';
import { miniatura } from './desenhos/bruxas/pixels';
import { DROPS, comContorno } from './desenhos/bruxas/chefona/arte';
import { CONQUISTA, desenharPlaca, type TextosDaPlaca } from './desenhos/bruxas/chefona/conquista';
import type { Conquista, IdInsignia, Insignia } from './insignias';
import { nomeDoDesenho } from './arte';

carregarFontesPixel();
carregarFonte();

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

function tempo(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

function vezes(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

// ── As três de letreiro ─────────────────────────────────────────────────────

interface Letreiro {
  selo: string;
  nome: string;
  linhas: string[];
  arte: ReactNode;
}

function oLetreiro(id: Exclude<IdInsignia, 'pantano'>, ins: Insignia, c: Conquista | undefined): Letreiro {
  const desenho = nomeDoDesenho(id, c?.desenho ?? null);
  const desde = c ? `desde ${dataCurta(c.primeiraEm)}` : null;
  switch (id) {
    case 'zumbi':
      return {
        selo: c ? (c.headshots > 0 ? 'HEADSHOT!' : 'ZUMBI ABATIDO') : 'BLOQUEADA',
        nome: ins.nome,
        linhas: c
          ? [
              [vezes(c.vezes, 'zumbi pego', 'zumbis pegos'), c.headshots ? vezes(c.headshots, 'na cabeça', 'na cabeça') : null].filter(Boolean).join(' · '),
              c.melhorMs != null ? `Mais rápido: ${tempo(c.melhorMs)}` : '',
              [desenho ? `Último: ${desenho}` : null, desde].filter(Boolean).join(' · '),
            ].filter(Boolean)
          : [ins.como],
        arte: <SpriteZumbi zumbi={ZUMBIS[c?.desenho ?? 0] ?? ZUMBIS[0]} escala={2} animado={!!c} />,
      };
    case 'bruxas':
      return {
        selo: c ? 'BRUXA DERRUBADA' : 'BLOQUEADA',
        nome: ins.nome,
        linhas: c
          ? [
              [vezes(c.vezes, 'bruxa derrubada', 'bruxas derrubadas'), c.headshots ? vezes(c.headshots, 'na cabeça', 'na cabeça') : null].filter(Boolean).join(' · '),
              c.melhorMs != null ? `Mais rápida: ${tempo(c.melhorMs)}` : '',
              [desenho ? `Última: ${desenho}` : null, desde].filter(Boolean).join(' · '),
            ].filter(Boolean)
          : [ins.como],
        arte: <SpriteBruxa bruxa={BRUXAS[c?.desenho ?? 0] ?? BRUXAS[0]} escala={1.5} animado={!!c} />,
      };
    case 'reiDoPop':
      return {
        selo: c ? 'O Rei caiu' : 'Bloqueada',
        nome: ins.nome,
        linhas: c
          ? [
              `Ajudou a derrubar ${c.vezes === 1 ? '1 vez' : `${c.vezes} vezes`}`,
              `Maior dano: ${c.maiorDano.toLocaleString('pt-BR')}`,
              [c.golpeFinal ? '★ Golpe final' : null, desde].filter(Boolean).join(' · '),
            ]
          : [ins.como],
        arte: <SpriteZumbi zumbi={CHEFAO} escala={2} animado={!!c} />,
      };
  }
}

// ── A do Minecraft ──────────────────────────────────────────────────────────

/** A escala da placa do jogo no hover (na tela da chefona é 3). */
const ESCALA_MC = 2;

function PlacaMinecraft({ conquista: c, como }: { conquista: Conquista | undefined; como: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const textos: TextosDaPlaca = useMemo(() => c
    ? {
        titulo: CONQUISTA.titulo,
        nome: CONQUISTA.nome,
        // A letra do jogo não tem «·» (vira «?»): o separador é o traço.
        descricao: `Derrubou a chefona ${c.vezes === 1 ? '1 vez' : `${c.vezes} vezes`} - dano ${c.maiorDano.toLocaleString('pt-BR')}`,
        raridade: c.golpeFinal ? '★ Golpe final! Raridade épica ★' : CONQUISTA.raridade,
      }
    : { titulo: 'Desafio bloqueado', nome: '???', descricao: como, raridade: CONQUISTA.raridade },
  [c, como]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      const cv = desenharPlaca(textos, miniatura(comContorno(DROPS[0]))[0]);
      cv.style.width = `${cv.width * ESCALA_MC}px`;
      cv.style.height = `${cv.height * ESCALA_MC}px`;
      cv.className = 'ins-mc-cv';
      el.replaceChildren(cv);
    } catch {
      el.replaceChildren(); // sem canvas: fica vazia
    }
  }, [textos]);

  return (
    <div className={cn('ins-mc', !c && 'ins-placa-trancada')}>
      <div ref={ref} />
      {c && <div className="ins-mc-reflexo" />}
    </div>
  );
}

// ── A placa ─────────────────────────────────────────────────────────────────

export function PlacaDaInsignia({ insignia, conquista }: { insignia: Insignia; conquista: Conquista | undefined }) {
  if (insignia.id === 'pantano') return <PlacaMinecraft conquista={conquista} como={insignia.como} />;
  const l = oLetreiro(insignia.id, insignia, conquista);
  return (
    <div className={cn('ins-placa', `ins-placa-${insignia.id}`, !conquista && 'ins-placa-trancada')}>
      <div className="ins-placa-arte">{l.arte}</div>
      <div className="ins-placa-texto">
        <p className="ins-placa-selo">{l.selo}</p>
        <p className="ins-placa-nome">{l.nome}</p>
        {l.linhas.map(t => <p key={t} className="ins-placa-linha">{t}</p>)}
      </div>
    </div>
  );
}

// ── A da próxima gincana ────────────────────────────────────────────────────

const PISTAS = [
  ['Uma nova gincana está a caminho.', 'Quem será o próximo a cair?'],
  ['Ninguém sabe o que vem por aí.', 'Fique de olho no Gestão.'],
] as const;

/** A placa das medalhas «?»: o mistério da próxima gincana. */
export function PlacaMisteriosa({ ordem }: { ordem: number }) {
  const [a, b] = PISTAS[ordem % PISTAS.length];
  return (
    <div className="ins-placa ins-placa-misterio">
      <div className="ins-placa-arte"><span className="ins-misterio-grande">?</span></div>
      <div className="ins-placa-texto">
        {/* A letra de fliperama não tem «Ó» maiúsculo. */}
        <p className="ins-placa-selo">EM BREVE</p>
        <p className="ins-placa-nome">Próxima gincana</p>
        <p className="ins-placa-linha">{a}</p>
        <p className="ins-placa-linha">{b}</p>
      </div>
    </div>
  );
}
