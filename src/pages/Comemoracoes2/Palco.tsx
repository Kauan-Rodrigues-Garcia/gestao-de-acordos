/**
 * Palco — a prévia ao vivo, em tamanho grande, com arrasto.
 *
 * É o mesmo `CardV2` que aparece na tela de todo mundo, em `modo="editor"`.
 * Clicar num elemento seleciona; arrastar move; as alças nos cantos do
 * selecionado mudam o tamanho. "Ver animação" toca a entrada e o efeito aqui
 * mesmo, sem disparar nada para ninguém — e trocar a entrada ou o efeito na
 * etapa de estilo toca sozinho, para a escolha ser vista na hora.
 */
import { useEffect, useRef, useState } from 'react';
import { AlignCenterHorizontal, Clapperboard, Move, RotateCcw, Scaling } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardV2 } from '@/components/comemoracao2/CardV2';
import { EfeitoV2 } from '@/components/comemoracao2/EfeitoV2';
import {
  ELEMENTOS_CARD, MODELOS, MODELO_PADRAO, aplicarModelo, escalar,
  limitarPosicao, modeloDoDesign, type ElementoCard,
} from '@/components/comemoracao2/design';
import { OpcoesFotos } from './SecaoVisual';
import type { Rascunho } from './rascunho';
import type { MudarRascunho } from './tipos';

/** Quanto a prévia fica tocando antes de o palco voltar a ser editável. */
const DURACAO_PREVIA_MS = 4500;

export function Palco({ r, mudar }: { r: Rascunho; mudar: MudarRascunho }) {
  const [selecionado, setSelecionado] = useState<ElementoCard | null>(null);
  const [animacao, setAnimacao] = useState(0);
  const mesaRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const modelo = modeloDoDesign(r.design);

  // A entrada toca por alguns segundos e o palco volta a ficar parado para editar.
  useEffect(() => {
    if (!animacao) return;
    const id = setTimeout(() => setAnimacao(0), DURACAO_PREVIA_MS);
    return () => clearTimeout(id);
  }, [animacao]);

  // Escolheu outra entrada ou outro efeito: mostra como fica, sem precisar
  // achar o botão. Compara com a escolha anterior em vez de pular a primeira
  // passada: o StrictMode roda o efeito duas vezes na montagem.
  const { entrada, efeito } = r.design;
  const escolhaRef = useRef({ entrada, efeito });
  useEffect(() => {
    const antes = escolhaRef.current;
    if (antes.entrada === entrada && antes.efeito === efeito) return;
    escolhaRef.current = { entrada, efeito };
    setSelecionado(null);
    setAnimacao((n) => n + 1);
  }, [entrada, efeito]);

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
      <div ref={mesaRef} className="relative overflow-hidden rounded-3xl border border-border p-4 sm:p-8"
        style={{
          backgroundColor: 'color-mix(in oklch, var(--muted) 55%, transparent)',
          backgroundImage:
            'radial-gradient(ellipse at 50% 40%, color-mix(in oklch, var(--background) 90%, transparent) 0%, transparent 70%),'
            + 'radial-gradient(circle, color-mix(in oklch, var(--muted-foreground) 22%, transparent) 1px, transparent 1.5px)',
          backgroundSize: '100% 100%, 16px 16px',
        }}>
        {/* Na festa o efeito sai de TRÁS do card; aqui a mesa é pouco maior que
            ele e o efeito sumiria atrás. Na prévia ele passa por cima. */}
        {animacao > 0 && (
          <div className="pointer-events-none absolute inset-0 z-20">
            <EfeitoV2 key={`efeito-${animacao}`} efeito={r.design.efeito} alvoRef={cardRef} conteinerRef={mesaRef} />
          </div>
        )}
        <div ref={cardRef} className="relative z-10 mx-auto max-w-[640px] rounded-[28px] shadow-[0_24px_60px_-18px_rgba(0,0,0,.5)]">
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

      <div className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-3 py-2">
        {selecionado && posSel ? (
          <>
            <span className="text-xs font-semibold">{nomeSel}</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Scaling className="h-3.5 w-3.5" />
              <span className="tabular-nums text-foreground">{Math.round(posSel.escala * 100)}%</span>
              · puxe um canto para mudar o tamanho
            </span>
            <div className="ml-auto flex gap-1">
              {Math.round(posSel.escala * 100) !== 100 && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                  onClick={() => mudar((a) => ({ design: escalar(a.design, selecionado, 1) }))}>
                  100%
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"
                onClick={() => mudar((a) => ({
                  design: {
                    ...a.design,
                    posicoes: { ...a.design.posicoes, [selecionado]: limitarPosicao({ ...a.design.posicoes[selecionado], x: 50 }) },
                  },
                }))}>
                <AlignCenterHorizontal className="h-3.5 w-3.5" /> Centralizar
              </Button>
            </div>
            {selecionado === 'pessoas' && (
              <div className="w-full border-t border-border pt-2">
                <OpcoesFotos r={r} mudar={mudar} compacto />
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Clique num elemento do card para selecionar. Arraste para mover e puxe os cantos para mudar o tamanho.
          </p>
        )}
      </div>
    </div>
  );
}
