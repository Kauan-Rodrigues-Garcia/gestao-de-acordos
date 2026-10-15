/**
 * Palco — a prévia ao vivo, em tamanho grande, com arrasto.
 *
 * É o mesmo `CardV2` que aparece na tela de todo mundo, em `modo="editor"`.
 * Clicar num elemento seleciona; arrastar move; a barra de baixo muda o tamanho
 * do que está selecionado. "Ver animação" toca a entrada aqui mesmo, sem
 * disparar nada para ninguém.
 */
import { useEffect, useState } from 'react';
import { AlignCenterHorizontal, Clapperboard, Move, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { CardV2 } from '@/components/comemoracao2/CardV2';
import {
  ELEMENTOS_CARD, ESCALA_MAX, ESCALA_MIN, MODELOS, MODELO_PADRAO, aplicarModelo, escalar,
  limitarPosicao, modeloDoDesign, type ElementoCard,
} from '@/components/comemoracao2/design';
import type { Rascunho } from './rascunho';
import type { MudarRascunho } from './tipos';

export function Palco({ r, mudar }: { r: Rascunho; mudar: MudarRascunho }) {
  const [selecionado, setSelecionado] = useState<ElementoCard | null>(null);
  const [animacao, setAnimacao] = useState(0);
  const modelo = modeloDoDesign(r.design);

  // A entrada toca por alguns segundos e o palco volta a ficar parado para editar.
  useEffect(() => {
    if (!animacao) return;
    const id = setTimeout(() => setAnimacao(0), 4500);
    return () => clearTimeout(id);
  }, [animacao]);

  const posSel = selecionado ? r.design.posicoes[selecionado] : null;
  const nomeSel = ELEMENTOS_CARD.find((e) => e.id === selecionado)?.nome;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Move className="h-3.5 w-3.5" />
          {modelo
            ? <>Arranjo <strong className="text-foreground">{MODELOS.find((m) => m.id === modelo)?.nome}</strong> · arraste para ajustar</>
            : <>Arranjo <strong className="text-foreground">personalizado</strong></>}
        </p>
        <div className="flex gap-1.5">
          {!modelo && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"
              onClick={() => { mudar((a) => ({ design: aplicarModelo(a.design, MODELO_PADRAO) })); setSelecionado(null); }}>
              <RotateCcw className="h-3 w-3" /> Restaurar
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs"
            onClick={() => { setSelecionado(null); setAnimacao((n) => n + 1); }}>
            <Clapperboard className="h-3 w-3" /> Ver animação
          </Button>
        </div>
      </div>

      {/* A "mesa de luz": pontilhado e um foco por trás do card. */}
      <div className="relative overflow-hidden rounded-3xl border border-border p-4 sm:p-8"
        style={{
          backgroundColor: 'color-mix(in oklch, var(--muted) 55%, transparent)',
          backgroundImage:
            'radial-gradient(ellipse at 50% 40%, color-mix(in oklch, var(--background) 90%, transparent) 0%, transparent 70%),'
            + 'radial-gradient(circle, color-mix(in oklch, var(--muted-foreground) 22%, transparent) 1px, transparent 1.5px)',
          backgroundSize: '100% 100%, 16px 16px',
        }}>
        <div className="mx-auto max-w-[640px] rounded-[28px] shadow-[0_24px_60px_-18px_rgba(0,0,0,.5)]">
          <CardV2
            key={animacao}
            titulo={r.titulo.trim() || 'META BATIDA!'}
            mensagem={r.mensagem || null}
            homenageados={r.alvoTipo === 'operadores' ? r.escolhidos : []}
            design={r.design}
            modo="editor"
            animar={animacao > 0}
            selecionado={selecionado}
            onSelecionar={setSelecionado}
            onMudarDesign={(design) => mudar({ design })}
          />
        </div>
      </div>

      <div className="flex min-h-[44px] flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
        {selecionado && posSel ? (
          <>
            <span className="text-xs font-semibold">{nomeSel}</span>
            <span className="text-[11px] text-muted-foreground">Tamanho</span>
            <Slider className="w-40" value={[Math.round(posSel.escala * 100)]}
              min={ESCALA_MIN * 100} max={ESCALA_MAX * 100} step={5}
              onValueChange={([v]) => mudar((a) => ({ design: escalar(a.design, selecionado, v / 100) }))}
              aria-label={`Tamanho de ${nomeSel}`} />
            <span className="w-10 text-xs tabular-nums">{Math.round(posSel.escala * 100)}%</span>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"
              onClick={() => mudar((a) => ({
                design: {
                  ...a.design,
                  posicoes: { ...a.design.posicoes, [selecionado]: limitarPosicao({ ...posSel, x: 50 }) },
                },
              }))}>
              <AlignCenterHorizontal className="h-3.5 w-3.5" /> Centralizar
            </Button>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Clique num elemento do card para mudar o tamanho. Arraste para mover.
          </p>
        )}
      </div>
    </div>
  );
}
