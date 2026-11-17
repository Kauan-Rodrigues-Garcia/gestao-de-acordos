/**
 * Galeria.tsx — a prateleira de templates do Modo TV.
 *
 * ## Por que uma galeria, e não mais botões
 *
 * A lista de fontes crescia por acréscimo: cada ideia nova virava mais um botão
 * ao lado dos outros, todos do mesmo tamanho, todos dizendo só o nome do tipo.
 * "Meta" não diz se vai sair uma barra, uma rosca ou uma projeção — e a pessoa
 * descobria clicando, desfazendo e clicando de novo.
 *
 * Aqui cada item tem NOME, uma frase do que vai aparecer na parede e um exemplo
 * visual. Escolher passa a ser reconhecer, não adivinhar.
 *
 * ## As miniaturas são desenho, não prévia
 *
 * Elas são SVG/CSS pequenos, escritos à mão. Montar vinte `<Palco>` de verdade
 * dentro de um modal custaria vinte medições de `ResizeObserver` e vinte
 * consultas de dados para caber num cartão de 150px — e o cartão não precisa
 * dos números certos, precisa da FORMA certa.
 */
import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CATEGORIAS, templatesDaCategoria, type CategoriaId, type Template,
} from './templates';

const CIANO = '#7fd8e8';
const VERDE = '#5fbe7e';

export function Galeria({
  aberta, onFechar, onEscolher,
}: {
  aberta: boolean;
  onFechar: () => void;
  onEscolher: (t: Template) => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaId>('metas');
  if (!aberta) return null;

  const itens = templatesDaCategoria(categoria);
  const prateleira = CATEGORIAS.find(c => c.id === categoria)!;

  return (
    /*
     * `fixed inset-0` com o fundo escurecido, e não um `<Dialog>` do design
     * system: a galeria precisa ficar larga e alta em telas grandes, e os
     * diálogos do projeto são estreitos por padrão.
     */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Galeria de templates"
      onClick={onFechar}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
        // Clicar DENTRO não fecha; só o fundo fecha.
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b px-5 py-3">
          <Sparkles className="h-4 w-4 text-sky-500" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold">Coisas interessantes</h2>
            <p className="truncate text-xs text-muted-foreground">{prateleira.descricao}</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="ml-auto rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
            title="Fechar (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Prateleiras */}
          <nav className="w-44 shrink-0 space-y-0.5 border-r p-2">
            {CATEGORIAS.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoria(c.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                  categoria === c.id
                    ? 'bg-primary/10 font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {c.nome}
                <span className="ml-1.5 text-[11px] opacity-60">
                  {templatesDaCategoria(c.id).length}
                </span>
              </button>
            ))}
          </nav>

          {/* Itens */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {itens.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { onEscolher(t); onFechar(); }}
                  className="group flex flex-col overflow-hidden rounded-lg border bg-background text-left
                             transition-colors hover:border-sky-500
                             focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
                >
                  <div
                    className="relative flex h-28 items-center justify-center overflow-hidden px-4"
                    style={{ background: 'linear-gradient(160deg,#0d1b24,#08323d)' }}
                  >
                    <Miniatura amostra={t.amostra} />
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="text-sm font-semibold leading-tight">{t.nome}</p>
                    <p className="text-[11.5px] leading-snug text-muted-foreground">{t.descricao}</p>
                  </div>
                  <span className="border-t px-3 py-1.5 text-[11px] font-medium text-sky-600 opacity-0
                                   transition-opacity group-hover:opacity-100 dark:text-sky-400">
                    Adicionar à cena
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-4 text-[11px] text-muted-foreground">
              Os números vêm do relatório analítico do setor desta tela e se atualizam
              sozinhos — o gráfico anda até o valor novo em vez de piscar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** O desenho de cada cartão. Forma, não número. */
function Miniatura({ amostra }: { amostra: Template['amostra'] }) {
  const caixa = 'w-full';

  switch (amostra) {
    case 'barra':
      return (
        <div className={caixa}>
          <div className="mb-1.5 h-2 w-10 rounded-full" style={{ background: CIANO, opacity: .55 }} />
          <div className="mb-2 h-4 w-24 rounded" style={{ background: '#ffffff', opacity: .92 }} />
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: '68%', background: CIANO }} />
          </div>
        </div>
      );

    case 'rosca':
      return (
        <svg viewBox="0 0 100 100" className="h-20 w-20">
          <g transform="rotate(-90 50 50)">
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="12" />
            <circle cx="50" cy="50" r="40" fill="none" stroke={CIANO} strokeWidth="12"
                    strokeLinecap="round" strokeDasharray={2 * Math.PI * 40}
                    strokeDashoffset={2 * Math.PI * 40 * 0.32} />
          </g>
          <text x="50" y="57" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="800">68%</text>
        </svg>
      );

    case 'projecao':
      return (
        <svg viewBox="0 0 120 60" className="h-20 w-full">
          <polyline points="4,50 24,42 44,36 64,24 84,18 116,6" fill="none"
                    stroke={CIANO} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="4" y1="14" x2="116" y2="14" stroke={VERDE} strokeWidth="2" strokeDasharray="5 4" />
          <circle cx="116" cy="6" r="4" fill={CIANO} />
        </svg>
      );

    case 'diaria':
      return (
        <div className={caixa}>
          <div className="mb-1.5 h-2 w-14 rounded-full" style={{ background: CIANO, opacity: .55 }} />
          <div className="mb-1 flex items-end gap-1.5">
            <div className="h-5 w-16 rounded" style={{ background: VERDE }} />
            <div className="h-3 w-10 rounded bg-white/25" />
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: '100%', background: VERDE }} />
          </div>
        </div>
      );

    case 'termometro':
      return (
        <div className="flex h-20 w-7 flex-col justify-end overflow-hidden rounded-full border-2 border-white/15 bg-white/10">
          <div style={{ height: '62%', background: `linear-gradient(0deg,${CIANO},#b6ecf7)` }} />
        </div>
      );

    case 'placar':
      return (
        <div className="flex w-full gap-2">
          {[['#fff', '70%'], [CIANO, '52%'], ['#e8a33d', '40%']].map(([cor, larg], i) => (
            <div key={i} className="flex-1">
              <div className="mb-1 h-1.5 w-8 rounded-full bg-white/25" />
              <div className="h-3.5 rounded" style={{ background: cor as string, width: larg as string }} />
            </div>
          ))}
        </div>
      );

    case 'ranking':
      return (
        <div className={`${caixa} space-y-1.5`}>
          {[100, 78, 60, 44].map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: i === 0 ? CIANO : 'rgba(255,255,255,.22)' }} />
              <div className="h-2.5 rounded bg-white/25" style={{ width: `${w * 0.6}%` }} />
            </div>
          ))}
        </div>
      );

    case 'podio':
      return (
        <div className="flex h-20 items-end gap-1.5">
          {[[36, 'rgba(255,255,255,.3)'], [56, CIANO], [26, 'rgba(255,255,255,.22)']].map(([h, c], i) => (
            <div key={i} className="w-7 rounded-t" style={{ height: h as number, background: c as string }} />
          ))}
        </div>
      );

    case 'roleta':
      return (
        <svg viewBox="0 0 100 100" className="h-20 w-20">
          {Array.from({ length: 8 }).map((_, i) => (
            <path
              key={i}
              d={`M50 50 L${50 + 42 * Math.cos((i * 45 - 90) * Math.PI / 180)} ${50 + 42 * Math.sin((i * 45 - 90) * Math.PI / 180)} A42 42 0 0 1 ${50 + 42 * Math.cos(((i + 1) * 45 - 90) * Math.PI / 180)} ${50 + 42 * Math.sin(((i + 1) * 45 - 90) * Math.PI / 180)} Z`}
              fill={i % 2 ? 'rgba(127,216,232,.75)' : 'rgba(255,255,255,.18)'}
            />
          ))}
          <polygon points="50,2 45,14 55,14" fill="#e8a33d" />
        </svg>
      );

    case 'bingo':
      return (
        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="h-3.5 w-3.5 rounded-sm"
                 style={{ background: [2, 6, 9, 13].includes(i) ? CIANO : 'rgba(255,255,255,.16)' }} />
          ))}
        </div>
      );

    case 'sorteio':
      return (
        <div className="flex items-center gap-2.5">
          <div className="h-11 w-11 rounded-full border-2" style={{ borderColor: CIANO, background: 'rgba(255,255,255,.12)' }} />
          <div className="space-y-1.5">
            <div className="h-3 w-20 rounded bg-white/80" />
            <div className="h-2 w-12 rounded bg-white/25" />
          </div>
        </div>
      );

    case 'desafio':
      return (
        <div className={`${caixa} space-y-1.5`}>
          <div className="h-2 w-12 rounded-full" style={{ background: '#e8a33d' }} />
          <div className="h-4 w-28 rounded bg-white/85" />
          <div className="h-2 w-20 rounded bg-white/25" />
        </div>
      );

    case 'texto':
      return <div className="h-6 w-32 rounded bg-white/85" />;

    case 'imagem':
      return (
        <div className="grid h-16 w-24 place-items-center rounded border-2 border-white/20 bg-white/10">
          <div className="h-6 w-6 rounded-full bg-white/35" />
        </div>
      );

    case 'video':
      return (
        <div className="grid h-16 w-24 place-items-center rounded border-2 border-white/20 bg-white/10">
          <div className="ml-1 h-0 w-0"
               style={{ borderTop: '9px solid transparent', borderBottom: '9px solid transparent',
                        borderLeft: `14px solid ${CIANO}` }} />
        </div>
      );

    case 'relogio':
      return <div className="text-3xl font-extrabold tabular-nums text-white/90">14:32</div>;

    case 'fundo':
      return (
        <div className="h-14 w-28 rounded"
             style={{ background: 'linear-gradient(160deg,#0d1b24,#08323d)', border: '1px solid rgba(255,255,255,.14)' }} />
      );

    default:
      return null;
  }
}

/** O botão que abre a loja. Fica onde a lista de fontes ficava. */
export function BotaoGaleria({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="default"
      size="sm"
      className="w-full justify-start"
      onClick={onClick}
    >
      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
      Coisas interessantes
    </Button>
  );
}
