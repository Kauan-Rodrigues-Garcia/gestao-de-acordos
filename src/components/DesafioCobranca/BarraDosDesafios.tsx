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
import { ArrowLeftRight, Check, Flag, Sun, Ticket, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useDesafioCobranca } from '@/hooks/useDesafioCobranca';
import { useDesafiosDoDiaNaBarra } from '@/hooks/useDesafioDoDia';
import { useDesafioVale } from '@/hooks/useDesafioVale';
import { PilulaVale } from '@/components/DesafioVale/PilulaVale';
import { ArteObrigatoria } from '@/components/DesafioVale/ArteObrigatoria';
import { useJaViArteVale } from '@/hooks/useDesafioVale';
import { BarraDesafioDoDia } from '@/components/DesafioDoDia/BarraDesafioDoDia';
import { marcarAbertura, type PlacarCobranca } from '@/services/desafioCobranca/desafioCobranca.service';
import { brl, brlCurto, desafioCobrancaNoAr, desafioEncerradoSemMeta, diaDoDesafio, hojeEmSaoPaulo, pct } from '@/services/desafioCobranca/regras';
import './desafio-cobranca.css';

const GavetaDesafioCobranca = lazy(() => import('./GavetaDesafioCobranca').then(m => ({ default: m.GavetaDesafioCobranca })));
const GavetaDesafioVale = lazy(() => import('@/components/DesafioVale/GavetaDesafioVale').then(m => ({ default: m.GavetaDesafioVale })));

/** 23/11/2026: entrou o Desafio do Vale (9 médias + cupons do Pix). */
type Qual = 'vale' | 'folga' | 'dia';

// Por pessoa, neste navegador: se já abriu o ingresso e qual pílula escolheu.
// Sem armazenamento (aba anônima), a folga só pisca de novo — nada quebra.
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ }
};

export function BarraDosDesafios({ ativoDia }: { ativoDia: boolean }) {
  const { perfil } = useAuth();
  const { data: placarDoBanco } = useDesafioCobranca(!!perfil?.id);
  // Acabou a janela (o dia da folga passou), sai da barra — também para o
  // super_admin, que o banco ainda atende. A operação já não recebia.
  const placar = placarDoBanco && desafioCobrancaNoAr(placarDoBanco, hojeEmSaoPaulo()) ? placarDoBanco : null;
  const { data: vale } = useDesafioVale(!!perfil?.id);
  // A arte obrigatória (23/11/2026): liberado o desafio, quem ainda não leu vê
  // a arte ao entrar e só fecha no «Bora pra cima!». O super_admin (prévia) não.
  const jaViArte = useJaViArteVale(vale && !vale.previa && !vale.super_admin ? vale.id : null);
  const [arteFechada, setArteFechada] = useState(false);
  const { desafios } = useDesafiosDoDiaNaBarra(ativoDia);
  const temDia = ativoDia && desafios.length > 0;

  const chaveAbriu = placar && perfil ? `desafio-cobranca:abriu:${placar.id}:${perfil.id}` : null;
  const chaveAbriuVale = vale && perfil ? `desafio-vale:abriu:${vale.id}:${perfil.id}` : null;
  const chaveBarra = perfil ? `desafio-cobranca:barra:${perfil.id}` : null;
  const [abriuAqui, setAbriuAqui] = useState(false);
  const [abriuVale, setAbriuVale] = useState(false);
  // Só o super_admin: rever a abertura para testar. Não apaga o registro.
  const [revendo, setRevendo] = useState(false);
  const [naBarra, setNaBarra] = useState<Qual | null>(null);
  const [aberta, setAberta] = useState(false);
  const [montou, setMontou] = useState(false);
  const [valeAberta, setValeAberta] = useState(false);
  const [valeMontou, setValeMontou] = useState(false);

  useEffect(() => { setAbriuAqui(!!chaveAbriu && ler(chaveAbriu) === '1'); }, [chaveAbriu]);
  useEffect(() => { setAbriuVale(!!chaveAbriuVale && ler(chaveAbriuVale) === '1'); }, [chaveAbriuVale]);
  const jaAbriu = !!placar?.ja_abriu || abriuAqui;
  useEffect(() => {
    if (!chaveBarra) return;
    const v = ler(chaveBarra);
    setNaBarra(v === 'dia' || v === 'folga' || v === 'vale' ? v : null);
  }, [chaveBarra]);

  if (!placar && !vale) return <BarraDesafioDoDia ativo={ativoDia} />;
  const mostrarArte = !!vale && jaViArte.data === false && !arteFechada;

  const hojeIso = hojeEmSaoPaulo();
  const hoje = placar ? diaDoDesafio(placar.dias, hojeIso).indice : 0;
  // Acabou sem a meta geral (19/11/2026): nada pisca, e a gaveta mostra o fim.
  const encerrado = placar ? desafioEncerradoSemMeta(placar, hojeIso) : false;
  const chama = !!placar && !jaAbriu && !encerrado;
  const chamaVale = !!vale && !abriuVale;
  // O que pode ir para a barra; o mais novo (o vale) primeiro.
  const disponiveis: Qual[] = [
    ...(vale ? ['vale' as const] : []), ...(placar ? ['folga' as const] : []), ...(temDia ? ['dia' as const] : []),
  ];
  const mostrar: Qual = naBarra && disponiveis.includes(naBarra) ? naBarra : disponiveis[0];
  const escolher = (q: Qual) => { setNaBarra(q); if (chaveBarra) gravar(chaveBarra, q); };
  const abrir = () => { setMontou(true); setAberta(true); };
  const abrirVale = () => {
    setValeMontou(true);
    setValeAberta(true);
    setAbriuVale(true);
    if (chaveAbriuVale) gravar(chaveAbriuVale, '1');
  };

  return (
    <div className="flex items-center gap-1.5">
      {mostrar === 'vale' && vale
        ? <PilulaVale d={vale} chamando={chamaVale} onAbrir={abrirVale} />
        : mostrar === 'folga' && placar
          ? <PilulaFolga placar={placar} chamando={chama} encerrado={encerrado} onAbrir={abrir} />
          : <BarraDesafioDoDia ativo={ativoDia} />}

      {disponiveis.length > 1 && (
        <TrocaDaBarra
          mostrar={mostrar} disponiveis={disponiveis} onEscolher={escolher}
          folgaFechada={chama} valeFechado={chamaVale} encerrado={encerrado} placar={placar ?? null}
          nomeDoDia={desafios[0]?.nome ?? 'Desafio do dia'} tituloVale={vale?.titulo ?? ''}
        />
      )}

      {montou && placar && (
        <Suspense fallback={null}>
          <GavetaDesafioCobranca
            placar={placar} hoje={hoje} aberta={aberta} onFechar={() => setAberta(false)}
            jaAbriu={jaAbriu && !revendo}
            encerrado={encerrado && !revendo}
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
      {mostrarArte && vale && (
        <ArteObrigatoria
          d={vale} chaveAbertura={perfil ? `desafio-vale:abertura:${vale.id}:${perfil.id}` : null}
          onConfirmou={() => { setArteFechada(true); setAbriuVale(true); if (chaveAbriuVale) gravar(chaveAbriuVale, '1'); }}
        />
      )}
      {valeMontou && vale && (
        <Suspense fallback={null}>
          <GavetaDesafioVale d={vale} aberta={valeAberta} onFechar={() => setValeAberta(false)} />
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
export function PilulaFolga({ placar, chamando, encerrado = false, onAbrir }: {
  placar: PlacarCobranca; chamando: boolean; encerrado?: boolean; onAbrir: () => void;
}) {
  if (encerrado) {
    return (
      <button
        type="button" onClick={onAbrir} title={`${placar.titulo} encerrado`}
        aria-label={`${placar.titulo} encerrado. Abrir para ver o resultado`}
        className={cn(
          'relative flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card pl-1 pr-3 shadow-sm transition-shadow hover:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          placar.previa && 'border-dashed',
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Flag className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-xs font-semibold text-muted-foreground">
          <span className="hidden sm:inline">Folga mais cedo · </span>desafio encerrado
        </span>
      </button>
    );
  }
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

function TrocaDaBarra({ mostrar, disponiveis, onEscolher, folgaFechada, valeFechado, encerrado, placar, nomeDoDia, tituloVale }: {
  mostrar: Qual; disponiveis: Qual[]; onEscolher: (q: Qual) => void; folgaFechada: boolean; valeFechado: boolean;
  encerrado: boolean; placar: PlacarCobranca | null; nomeDoDia: string; tituloVale: string;
}) {
  const [menu, setMenu] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const trocaChama = (folgaFechada && mostrar !== 'folga') || (valeFechado && mostrar !== 'vale');

  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const falta = placar ? faltaGeral(placar) : 0;
  const todas: { q: Qual; Icone: typeof Sun; titulo: string; sub: string; novo: boolean; cor: string }[] = [
    {
      q: 'vale', Icone: Ticket, titulo: tituloVale || 'Desafio do Vale', sub: valeFechado ? 'Novo — ainda não abriu' : 'médias e cupons do Pix',
      novo: valeFechado, cor: 'bg-orange-400/20 text-orange-600 dark:text-orange-300',
    },
    {
      q: 'folga', Icone: Sun, titulo: 'Folga mais cedo',
      sub: !placar ? '' : encerrado ? 'Desafio encerrado' : folgaFechada ? 'Novo — ainda não abriu'
        : falta > 0 ? `saída ${placar.premio_hora}: faltam ${brlCurto(falta)}` : `Saída às ${placar.premio_hora} garantida!`,
      novo: folgaFechada, cor: 'bg-warning/15 text-warning',
    },
    { q: 'dia', Icone: Zap, titulo: `Desafio do dia · ${nomeDoDia}`, sub: 'o placar de hoje', novo: false, cor: 'bg-primary/15 text-primary' },
  ];
  const opcoes = todas.filter(o => disponiveis.includes(o.q));

  return (
    <div ref={caixa} className="relative">
      <button
        type="button" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}
        title="Escolher o desafio da barra"
        aria-label={trocaChama ? 'Trocar o desafio da barra — tem desafio novo para abrir' : 'Escolher o desafio que aparece na barra'}
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
          {opcoes.map(({ q, Icone, titulo, sub, novo, cor }) => (
            <button
              key={q} type="button" role="menuitemradio" aria-checked={mostrar === q}
              onClick={() => { onEscolher(q); setMenu(false); }}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent', mostrar === q && 'bg-accent/60')}
            >
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', cor)}>
                <Icone className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{titulo}</span>
                  {novo && <span className="shrink-0 rounded-full bg-red-500 px-1.5 text-[9px] font-bold uppercase text-white">novo</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{sub}</span>
              </span>
              {mostrar === q && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
            </button>
          ))}
          <p className="px-2 pb-0.5 pt-1.5 text-[11px] text-muted-foreground">Todos continuam valendo — muda só o que fica à vista.</p>
        </div>
      )}
    </div>
  );
}
