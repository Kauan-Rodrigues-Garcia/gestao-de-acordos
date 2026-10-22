/**
 * Painel da Cantina — a fila do dia de quem atende (22/10/2026).
 *
 * É a tela inicial da empresa Cantina. Quadro por status (Novos, Preparando,
 * Prontos, Encerrados), agrupado por faixa de retirada; um botão grande por
 * etapa; o que a cozinha precisa adiantar nos próximos 30 minutos no topo.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChefHat, Download, Flame, Inbox, Loader2, PackageCheck, Receipt, RefreshCw, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  agruparPorFaixa, atrasado, colunaDoStatus, formatarPreco, relogioSP, resumoDeProducao, totalDoDia,
  type ColunaFila, type PedidoCantina,
} from '@/lib/cantina';
import { useFilaCantina } from './useFilaCantina';
import { CardFila } from './CardFila';
import { DetalheFila } from './DetalheFila';
import { baixarRelatorioDoMes } from './exportar';

const COLUNAS: { id: ColunaFila; rotulo: string; icone: typeof Inbox; cor: string }[] = [
  { id: 'novo',       rotulo: 'Novos',      icone: Inbox,        cor: 'text-sky-600 dark:text-sky-400' },
  { id: 'preparando', rotulo: 'Preparando', icone: ChefHat,      cor: 'text-amber-600 dark:text-amber-400' },
  { id: 'pronto',     rotulo: 'Prontos',    icone: PackageCheck, cor: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'encerrado',  rotulo: 'Encerrados', icone: Receipt,      cor: 'text-muted-foreground' },
];

export default function PainelCantina() {
  const f = useFilaCantina();
  const [aberto, setAberto] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [colunaCelular, setColunaCelular] = useState<ColunaFila>('novo');

  const porColuna = useMemo(() => {
    const m: Record<ColunaFila, PedidoCantina[]> = { novo: [], preparando: [], pronto: [], encerrado: [] };
    for (const p of f.pedidos) m[colunaDoStatus(p.status)].push(p);
    return m;
  }, [f.pedidos]);

  const producao = useMemo(() => resumoDeProducao(f.pedidos, f.agoraMs), [f.pedidos, f.agoraMs]);
  const total = useMemo(() => totalDoDia(f.pedidos), [f.pedidos]);
  const atrasados = useMemo(() => f.pedidos.filter(p => atrasado(p, f.agoraMs)).length, [f.pedidos, f.agoraMs]);
  const selecionado = f.pedidos.find(p => p.id === aberto) ?? null;
  const relogio = relogioSP(f.agoraMs);

  async function exportar() {
    setBaixando(true);
    try {
      const n = await baixarRelatorioDoMes(relogio.dia.slice(0, 7));
      toast.success(`Planilha do mês baixada (${n} pedidos).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível exportar.');
    } finally {
      setBaixando(false);
    }
  }

  if (f.carregando) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (f.erro) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-sm text-muted-foreground">
        <p>{f.erro}</p>
        <Button variant="outline" onClick={() => { void f.recarregar(); }}>Tentar de novo</Button>
      </div>
    );
  }

  const abrir = (id: string) => { f.visto(id); setAberto(id); };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-5 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <ChefHat className="w-7 h-7 text-orange-500" /> Painel da Cantina
          </h1>
          <p className="text-sm text-muted-foreground">
            Hoje · {total.pedidos} {total.pedidos === 1 ? 'pedido' : 'pedidos'} · {formatarPreco(total.valor)}
            {atrasados > 0 && <span className="ml-2 font-semibold text-orange-600 dark:text-orange-400">· {atrasados} atrasado{atrasados > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { void f.recarregar(); }} title="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="outline" onClick={() => { void exportar(); }} disabled={baixando}>
            {baixando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Exportar mês
          </Button>
        </div>
      </header>

      {/* O que adiantar */}
      <section className="rounded-2xl border bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-transparent p-3.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Flame className="w-4 h-4 text-orange-500" /> Para preparar nos próximos 30 minutos
        </h2>
        {producao.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Nada na boca do fogão agora.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {producao.map(p => (
              <span key={p.nome} className="inline-flex items-center gap-1.5 rounded-xl bg-card border px-3 py-1.5 text-sm shadow-sm">
                <strong className="text-lg leading-none tabular-nums text-orange-600 dark:text-orange-400">{p.quantidade}×</strong> {p.nome}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Abas no celular */}
      <div className="flex gap-1.5 lg:hidden overflow-x-auto">
        {COLUNAS.map(col => (
          <button key={col.id} type="button" onClick={() => setColunaCelular(col.id)}
            className={cn('shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium',
              colunaCelular === col.id ? 'bg-foreground text-background' : 'bg-card')}>
            {col.rotulo} ({porColuna[col.id].length})
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUNAS.map(col => {
          const grupos = agruparPorFaixa(porColuna[col.id]);
          return (
            <section
              key={col.id}
              className={cn('min-w-0 rounded-2xl bg-muted/40 p-2.5', colunaCelular !== col.id && 'hidden lg:block')}
            >
              <h2 className={cn('flex items-center justify-between px-1 pb-2 text-sm font-bold', col.cor)}>
                <span className="flex items-center gap-1.5"><col.icone className="w-4 h-4" /> {col.rotulo}</span>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-foreground tabular-nums">{porColuna[col.id].length}</span>
              </h2>
              {grupos.length === 0 ? (
                <p className="px-1 py-8 text-center text-xs text-muted-foreground">Nenhum pedido.</p>
              ) : (
                <div className="space-y-3 lg:max-h-[calc(100vh-290px)] lg:overflow-y-auto pr-0.5">
                  {grupos.map(g => (
                    <div key={g.faixa} className="space-y-2">
                      <p className="flex items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Timer className="w-3 h-3" /> {g.faixa} · {g.pedidos.length}
                      </p>
                      <AnimatePresence initial={false}>
                        {g.pedidos.map(p => (
                          <CardFila
                            key={p.id}
                            pedido={p}
                            agoraMs={f.agoraMs}
                            recente={f.recentes.has(p.id)}
                            mudando={f.mudando === p.id}
                            onAbrir={abrir}
                            onTrocar={(id, s) => { void f.trocar(id, s); }}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <DetalheFila
        pedido={selecionado}
        onFechar={() => setAberto(null)}
        agoraMs={f.agoraMs}
        versaoConversa={f.versaoConversa}
        mudando={!!selecionado && f.mudando === selecionado.id}
        onTrocar={(id, s) => { void f.trocar(id, s); }}
        onCancelar={f.cancelar}
      />
    </div>
  );
}
