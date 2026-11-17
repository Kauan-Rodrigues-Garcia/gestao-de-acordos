/**
 * PainelArtes — as artes já lançadas (17/11/2026): no ar, agendadas, que já
 * saíram; quantos já viram de quantos; ver como abre; encerrar antes da hora.
 * Só super_admin (o banco confere). Lê ao abrir e no «Atualizar».
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Eye, Loader2, RefreshCw, Square } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ArteEscalada } from './ArteCard';
import { TelaArte } from './TelaArte';
import { faltaMigration, mensagemDoErro, type ArteNaLista } from './banco';
import { modeloPorId, situacaoDaArte, type SituacaoDaArte } from './modelos';

export interface FonteDoPainelArtes {
  listar: () => Promise<ArteNaLista[]>;
  encerrar: (id: string) => Promise<void>;
}

const SITUACAO: Record<SituacaoDaArte, { rotulo: string; classe: string }> = {
  no_ar: { rotulo: 'No ar', classe: 'border-success/40 bg-success/10 text-success' },
  agendada: { rotulo: 'Agendada', classe: 'border-warning/40 bg-warning/10 text-warning' },
  terminou: { rotulo: 'Saiu do ar', classe: 'border-border bg-muted text-muted-foreground' },
  encerrada: { rotulo: 'Encerrada', classe: 'border-border bg-muted text-muted-foreground' },
};
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function PainelArtes({ fonte, versao }: { fonte: FonteDoPainelArtes; versao: number }) {
  const [lista, setLista] = useState<ArteNaLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [vendo, setVendo] = useState<ArteNaLista | null>(null);
  const [aEncerrar, setAEncerrar] = useState<ArteNaLista | null>(null);
  const [encerrando, setEncerrando] = useState(false);

  const ler = useCallback(async () => {
    setLendo(true);
    try { setLista(await fonte.listar()); setErro(null); }
    catch (e) { setErro(faltaMigration(e) ? 'Falta aplicar a migration das artes (20261117180000) no banco.' : mensagemDoErro(e)); }
    finally { setLendo(false); }
  }, [fonte]);
  useEffect(() => { void ler(); }, [ler, versao]);

  async function confirmarEncerrar() {
    if (!aEncerrar) return;
    setEncerrando(true);
    try {
      await fonte.encerrar(aEncerrar.id);
      toast.success('Arte encerrada. Ninguém mais vê.');
      setAEncerrar(null);
      await ler();
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setEncerrando(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Artes lançadas</h3>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { void ler(); }} disabled={lendo}>
          <RefreshCw className={cn('h-3.5 w-3.5', lendo && 'animate-spin')} /> Atualizar
        </Button>
      </div>
      {erro && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{erro}</p>}
      {!lista && !erro && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo…</p>}
      {lista && lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma arte lançada ainda.</p>}
      {lista && lista.length > 0 && (
        <ul className="space-y-2">
          {lista.map(a => {
            const s = situacaoDaArte(a);
            const pct = a.publico ? Math.min(100, Math.floor((a.viram / a.publico) * 100)) : 0;
            return (
              <li key={a.id} className="flex gap-3 rounded-lg border p-2.5">
                <button type="button" onClick={() => setVendo(a)} className="shrink-0 overflow-hidden rounded-md" aria-label={`Ver «${a.titulo}»`}>
                  <ArteEscalada modelo={a.modelo} conteudo={a.conteudo} tema={a.tema} largura={72} />
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">{a.titulo}</p>
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase', SITUACAO[s].classe)}>{SITUACAO[s].rotulo}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {modeloPorId(a.modelo)?.nome} · {a.setores ? a.setores_nomes.join(', ') : 'Todo mundo'} · de {dataHora(a.inicio)}
                    {a.fim ? ` até ${dataHora(a.fim)}` : ' até encerrar'}{a.encerrada_em ? ` · encerrada ${dataHora(a.encerrada_em)}` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    <span className="text-xs tabular-nums text-muted-foreground">viram {a.viram} de {a.publico}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setVendo(a)}><Eye className="h-3.5 w-3.5" /> Ver</Button>
                  {(s === 'no_ar' || s === 'agendada') && (
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => setAEncerrar(a)}>
                      <Square className="h-3.5 w-3.5" /> Encerrar
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {vendo && <TelaArte arte={{ modelo: vendo.modelo, conteudo: vendo.conteudo, tema: vendo.tema }} titulo={vendo.titulo} onFechar={() => setVendo(null)} />}

      <AlertDialog open={!!aEncerrar} onOpenChange={o => { if (!o) setAEncerrar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar «{aEncerrar?.titulo}»?</AlertDialogTitle>
            <AlertDialogDescription>A arte sai do ar agora: quem ainda não viu não vai ver. O registro de quem viu continua.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={encerrando}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={encerrando} onClick={e => { e.preventDefault(); void confirmarEncerrar(); }}>
              {encerrando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
