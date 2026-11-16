/**
 * A barra de cima com os desafios: o Desafio Cobrança (a folga, pílula do sol)
 * e o Desafio do Dia. Com os dois no mesmo dia, a barra mostra UMA pílula e o
 * botão ⇄ escolhe qual — os dois continuam valendo.
 *
 * Quem vê a folga: o banco decide (`fn_desafio_cobranca_atual`): setor marcado
 * «vê» e desafio liberado. O super_admin vê sempre (prévia antes de liberar).
 *
 * Enquanto a pessoa não abriu a folga, a pílula pisca forte («ABRA!»); se ela
 * deixou o Desafio do Dia na barra, quem pisca é o ⇄.
 *
 * A abertura (o ingresso) é vista UMA vez por pessoa por desafio: o registro
 * é no banco (`fn_desafio_cobranca_abri` → `ja_abriu`), não só no navegador —
 * outro PC ou cache limpo não mostram de novo. O navegador guarda também,
 * para valer na hora, antes de o placar ser relido.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Check, Sun, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useDesafioCobranca } from '@/hooks/useDesafioCobranca';
import { useDesafiosDoDiaNaBarra } from '@/hooks/useDesafioDoDia';
import { BarraDesafioDoDia } from '@/components/DesafioDoDia/BarraDesafioDoDia';
import { marcarAbertura, type PlacarCobranca } from '@/services/desafioCobranca/desafioCobranca.service';
import { brl, brlCurto, diaDoDesafio, hojeEmSaoPaulo, pct } from '@/services/desafioCobranca/regras';
import './desafio-cobranca.css';

const GavetaDesafioCobranca = lazy(() => import('./GavetaDesafioCobranca').then(m => ({ default: m.GavetaDesafioCobranca })));

type Qual = 'folga' | 'dia';

// Por pessoa, neste navegador: se já abriu o ingresso e qual pílula escolheu.
// Sem armazenamento (aba anônima), a folga só pisca de novo — nada quebra.
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ }
};

export function BarraDosDesafios({ ativoDia }: { ativoDia: boolean }) {
  const { perfil } = useAuth();
  const { data: placar } = useDesafioCobranca(!!perfil?.id);
  const { desafios } = useDesafiosDoDiaNaBarra(ativoDia);
  const temDia = ativoDia && desafios.length > 0;

  const chaveAbriu = placar && perfil ? `desafio-cobranca:abriu:${placar.id}:${perfil.id}` : null;
  const chaveBarra = perfil ? `desafio-cobranca:barra:${perfil.id}` : null;
  const [abriuAqui, setAbriuAqui] = useState(false);
  // Só o super_admin: rever a abertura para testar. Não apaga o registro.
  const [revendo, setRevendo] = useState(false);
  const [naBarra, setNaBarra] = useState<Qual>('folga');
  const [aberta, setAberta] = useState(false);
  const [montou, setMontou] = useState(false);

  useEffect(() => { setAbriuAqui(!!chaveAbriu && ler(chaveAbriu) === '1'); }, [chaveAbriu]);
  const jaAbriu = !!placar?.ja_abriu || abriuAqui;
  useEffect(() => { if (chaveBarra) setNaBarra(ler(chaveBarra) === 'dia' ? 'dia' : 'folga'); }, [chaveBarra]);

  if (!placar) return <BarraDesafioDoDia ativo={ativoDia} />;

  const { indice: hoje } = diaDoDesafio(placar.dias, hojeEmSaoPaulo());
  const mostrar: Qual = temDia ? naBarra : 'folga';
  const escolher = (q: Qual) => { setNaBarra(q); if (chaveBarra) gravar(chaveBarra, q); };
  const abrir = () => { setMontou(true); setAberta(true); };

  return (
    <div className="flex items-center gap-1.5">
      {mostrar === 'folga'
        ? <PilulaFolga placar={placar} chamando={!jaAbriu} onAbrir={abrir} />
        : <BarraDesafioDoDia ativo={ativoDia} />}

      {temDia && (
        <TrocaDaBarra
          mostrar={mostrar} onEscolher={escolher} folgaFechada={!jaAbriu} placar={placar}
          nomeDoDia={desafios[0]?.nome ?? 'Desafio do dia'}
        />
      )}

      {montou && (
        <Suspense fallback={null}>
          <GavetaDesafioCobranca
            placar={placar} hoje={hoje} aberta={aberta} onFechar={() => setAberta(false)}
            jaAbriu={jaAbriu && !revendo}
            onAbriu={() => {
              setRevendo(false);
              setAbriuAqui(true);
              if (chaveAbriu) gravar(chaveAbriu, '1');
              // Falhar aqui não pode reabrir o ingresso: o navegador já lembra.
              marcarAbertura(placar.id).catch(() => { /* tenta de novo na próxima abertura */ });
            }}
            onVerAbertura={placar.super_admin ? () => setRevendo(true) : undefined}
          />
        </Suspense>
      )}
    </div>
  );
}

const faltaGeral = (p: PlacarCobranca) => Math.max(p.meta_geral - p.total, 0);

/**
 * Mesmo molde da pílula do Desafio do Dia: h-9, uma linha só (nunca quebra),
 * cores do tema (warning = a folga, success = batida). Sem animação parada —
 * só pisca enquanto a pessoa não abriu. A prévia do super_admin é a borda
 * tracejada (e o título), não um selo a mais.
 */
export function PilulaFolga({ placar, chamando, onAbrir }: { placar: PlacarCobranca; chamando: boolean; onAbrir: () => void }) {
  const p = pct(placar.total, placar.meta_geral);
  const falta = faltaGeral(placar);
  const hora = placar.premio_hora.replace(':00', 'h');
  const batida = falta <= 0;
  const titulo = `${placar.titulo}${placar.previa ? ' (prévia: só você vê)' : ''}`;
  return (
    <button
      type="button" onClick={onAbrir}
      title={titulo}
      aria-label={chamando
        ? `Novo desafio para você: abra o ${placar.titulo} ${placar.subtitulo}`
        : !batida
          ? `Abrir o ${placar.titulo}: saída às ${placar.premio_hora}, faltam ${brl(falta)}, ${p}% da meta`
          : `Abrir o ${placar.titulo}: saída às ${placar.premio_hora} garantida`}
      className={cn(
        'relative flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border bg-card pl-1 pr-3 shadow-sm transition-shadow hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        batida ? 'border-success/40' : 'border-warning/40',
        placar.previa && 'border-dashed',
        chamando && 'dc-chamando',
      )}
    >
      <span className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        batida ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
      )}>
        <Sun className="h-4 w-4" aria-hidden />
      </span>
      {chamando ? (
        <span className="text-xs font-semibold text-foreground">
          <span className="hidden sm:inline">Novo desafio · </span>abra a folga
        </span>
      ) : batida ? (
        <span className="text-xs font-semibold text-success">Saída às {hora} garantida</span>
      ) : (
        <>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Saída {hora}<span className="hidden lg:inline"> · faltam</span>
          </span>
          <span className="text-sm font-bold leading-none tabular-nums text-foreground">{brlCurto(falta)}</span>
          <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
            <span className="block h-full rounded-full bg-warning transition-[width] duration-700" style={{ width: `${p}%` }} />
          </span>
          <span className="hidden text-[11px] font-semibold tabular-nums text-muted-foreground sm:inline">{p}%</span>
        </>
      )}
      {chamando && <span className="dc-abra" aria-hidden>ABRA!</span>}
    </button>
  );
}

function TrocaDaBarra({ mostrar, onEscolher, folgaFechada, placar, nomeDoDia }: {
  mostrar: Qual; onEscolher: (q: Qual) => void; folgaFechada: boolean; placar: PlacarCobranca; nomeDoDia: string;
}) {
  const [menu, setMenu] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const trocaChama = folgaFechada && mostrar === 'dia';

  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const falta = faltaGeral(placar);
  const opcoes: { q: Qual; Icone: typeof Sun; titulo: string; sub: string }[] = [
    {
      q: 'folga', Icone: Sun, titulo: 'Folga mais cedo',
      sub: folgaFechada ? 'Novo — ainda não abriu' : falta > 0 ? `saída ${placar.premio_hora}: faltam ${brlCurto(falta)}` : `Saída às ${placar.premio_hora} garantida!`,
    },
    { q: 'dia', Icone: Zap, titulo: `Desafio do dia · ${nomeDoDia}`, sub: 'o placar de hoje' },
  ];

  return (
    <div ref={caixa} className="relative">
      <button
        type="button" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}
        title="Escolher o desafio da barra"
        aria-label={trocaChama ? 'Trocar o desafio da barra — tem a folga para abrir' : 'Escolher o desafio que aparece na barra'}
        className={cn(
          'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          trocaChama && 'dc-chamando',
        )}
      >
        <ArrowLeftRight className="h-4 w-4" aria-hidden />
        {trocaChama && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-card" aria-hidden />}
      </button>

      {menu && (
        <div role="menu" aria-label="Qual desafio fica na barra" className="absolute right-0 top-11 z-40 w-72 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mostrar na barra</p>
          {opcoes.map(({ q, Icone, titulo, sub }) => (
            <button
              key={q} type="button" role="menuitemradio" aria-checked={mostrar === q}
              onClick={() => { onEscolher(q); setMenu(false); }}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent', mostrar === q && 'bg-accent/60')}
            >
              <span className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                q === 'folga' ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary',
              )}>
                <Icone className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{titulo}</span>
                  {q === 'folga' && folgaFechada && (
                    <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[9px] font-bold uppercase text-white">novo</span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{sub}</span>
              </span>
              {mostrar === q && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
            </button>
          ))}
          <p className="px-2 pb-0.5 pt-1.5 text-[11px] text-muted-foreground">Os dois continuam valendo — muda só o que fica à vista.</p>
        </div>
      )}
    </div>
  );
}
