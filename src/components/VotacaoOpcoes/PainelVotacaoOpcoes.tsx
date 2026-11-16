/**
 * PainelVotacaoOpcoes — as votações de opções já liberadas (16/11/2026): a
 * contagem por opção, quantos votaram, quem falta (por setor) e encerrar,
 * reabrir ou cancelar. Só super_admin (o banco confere).
 *
 * Lê só ao abrir e no «Atualizar»: nada de leitura em ciclo aqui.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, RefreshCw, Users } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { faltaMigration, lerParticipacao, listar, mensagemDoErro, mudar, type Participacao, type VotacaoOpcoesNaLista } from './banco';
import { apurar } from './opcoes';

const ESTADO: Record<VotacaoOpcoesNaLista['estado'], { rotulo: string; classe: string }> = {
  aberta: { rotulo: 'Aberta', classe: 'border-success/40 bg-success/10 text-success' },
  encerrada: { rotulo: 'Encerrada', classe: 'border-border bg-muted text-muted-foreground' },
  cancelada: { rotulo: 'Cancelada', classe: 'border-destructive/40 bg-destructive/10 text-destructive' },
};
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const pctCortado = (n: number) => `${(Math.floor(n * 10) / 10).toLocaleString('pt-BR')}%`;

function QuemFalta({ id, ler }: { id: string; ler: (id: string) => Promise<Participacao[]> }) {
  const [linhas, setLinhas] = useState<Participacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    ler(id).then(setLinhas).catch(e => setErro(mensagemDoErro(e)));
  }, [id, ler]);
  const porSetor = useMemo(() => {
    const m = new Map<string, { faltam: Participacao[]; total: number }>();
    for (const l of linhas ?? []) {
      const k = l.setor ?? 'Sem setor';
      const b = m.get(k) ?? { faltam: [], total: 0 };
      b.total++;
      if (!l.votado_em) b.faltam.push(l);
      m.set(k, b);
    }
    return [...m.entries()].sort((a, b) => b[1].faltam.length - a[1].faltam.length || a[0].localeCompare(b[0], 'pt-BR'));
  }, [linhas]);

  if (erro) return <p className="text-xs text-destructive">{erro}</p>;
  if (!linhas) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo…</p>;
  const faltam = linhas.filter(l => !l.votado_em);
  if (!faltam.length) return <p className="text-xs text-success">Todo mundo já votou.</p>;
  const copiar = (nomes: string[]) => {
    void navigator.clipboard?.writeText(nomes.join('\n')).then(() => toast.success(`${nomes.length} nomes copiados`)).catch(() => toast.error('Não deu para copiar'));
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Faltam {faltam.length} de {linhas.length}</p>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => copiar(faltam.map(l => l.nome))}>
          <Copy className="h-3.5 w-3.5" /> Copiar quem falta
        </Button>
      </div>
      {porSetor.filter(([, b]) => b.faltam.length).map(([setor, b]) => (
        <div key={setor}>
          <p className="text-[11px] font-semibold text-muted-foreground">{setor} · faltam {b.faltam.length} de {b.total}</p>
          <p className="text-xs leading-relaxed">{b.faltam.map(l => l.nome).join(', ')}</p>
        </div>
      ))}
    </div>
  );
}

type Acao = 'encerrar' | 'reabrir' | 'cancelar';
const TEXTO_ACAO: Record<Acao, { botao: string; pergunta: string; explica: string }> = {
  encerrar: { botao: 'Encerrar', pergunta: 'Encerrar a votação?', explica: 'Ninguém mais vota e o aviso some das telas. Dá para reabrir depois.' },
  reabrir: { botao: 'Reabrir', pergunta: 'Reabrir a votação?', explica: 'Quem ainda não votou volta a ver o aviso. Os votos dados continuam.' },
  cancelar: { botao: 'Cancelar', pergunta: 'Cancelar a votação?', explica: 'O aviso some e a votação não volta. Os votos ficam guardados, mas ela não reabre.' },
};

/** O banco, trocável no laboratório (dados fictícios). */
export interface FonteDoPainel {
  listar: () => Promise<VotacaoOpcoesNaLista[]>;
  participacao: (id: string) => Promise<Participacao[]>;
  mudar: (id: string, acao: Acao) => Promise<void>;
}
const DO_BANCO: FonteDoPainel = { listar, participacao: lerParticipacao, mudar };

export function PainelVotacaoOpcoes({ versao, fonte = DO_BANCO }: { versao: number; fonte?: FonteDoPainel }) {
  const [lista, setLista] = useState<VotacaoOpcoesNaLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [pedido, setPedido] = useState<{ v: VotacaoOpcoesNaLista; acao: Acao } | null>(null);
  const [mudando, setMudando] = useState(false);

  const ler = useCallback(async () => {
    setLendo(true);
    try { setLista(await fonte.listar()); setErro(null); }
    catch (e) { setErro(faltaMigration(e) ? 'O banco ainda não tem a votação de opções (migration 20261116190000).' : mensagemDoErro(e)); }
    finally { setLendo(false); }
  }, [fonte]);
  useEffect(() => { void ler(); }, [ler, versao]);

  const fazer = async () => {
    if (!pedido) return;
    setMudando(true);
    try {
      await fonte.mudar(pedido.v.id, pedido.acao);
      toast.success(`Votação: ${TEXTO_ACAO[pedido.acao].botao.toLowerCase()} feito`);
      setPedido(null);
      void ler();
    } catch (e) {
      toast.error('Não deu certo', { description: mensagemDoErro(e) });
    } finally {
      setMudando(false);
    }
  };

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Votações liberadas</h3>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => { void ler(); }} disabled={lendo}>
          <RefreshCw className={cn('h-3.5 w-3.5', lendo && 'animate-spin')} /> Atualizar
        </Button>
      </div>
      {erro && <p className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs">{erro}</p>}
      {!erro && lista?.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Nenhuma votação liberada ainda.</p>}
      {lista?.map(v => {
        const e = ESTADO[v.estado];
        const res = apurar(v.opcoes, v.contagem);
        const lider = Math.max(0, ...res.map(x => x.votos));
        return (
          <article key={v.id} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {v.titulo}
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase', e.classe)}>{e.rotulo}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Liberada {dataHora(v.criada_em)} · {v.votaram} de {v.eleitores} votaram ({pctCortado(v.eleitores ? (v.votaram / v.eleitores) * 100 : 0)})
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {v.estado === 'aberta' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPedido({ v, acao: 'encerrar' })}>Encerrar</Button>}
                {v.estado === 'encerrada' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPedido({ v, acao: 'reabrir' })}>Reabrir</Button>}
                {v.estado !== 'cancelada' && <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={() => setPedido({ v, acao: 'cancelar' })}>Cancelar</Button>}
              </div>
            </div>

            <ul className="space-y-1.5">
              {res.map(({ opcao, votos, pct }) => (
                <li key={opcao.id}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className={cn('font-medium', votos === lider && lider > 0 && 'text-primary')}>{opcao.emoji} {opcao.titulo}</span>
                    <span className="tabular-nums text-muted-foreground">{votos} {votos === 1 ? 'voto' : 'votos'} · {pctCortado(pct)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', votos === lider && lider > 0 ? 'bg-primary' : 'bg-muted-foreground/40')} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t pt-2">
              <button type="button" className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                onClick={() => setAberto(a => (a === v.id ? null : v.id))} aria-expanded={aberto === v.id}>
                <Users className="h-3.5 w-3.5" /> {aberto === v.id ? 'Esconder quem falta' : 'Quem falta votar'}
              </button>
              {aberto === v.id && <div className="mt-2"><QuemFalta id={v.id} ler={fonte.participacao} /></div>}
            </div>
          </article>
        );
      })}

      <AlertDialog open={!!pedido} onOpenChange={o => { if (!o && !mudando) setPedido(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pedido ? TEXTO_ACAO[pedido.acao].pergunta : ''}</AlertDialogTitle>
            <AlertDialogDescription>{pedido ? `«${pedido.v.titulo}». ${TEXTO_ACAO[pedido.acao].explica}` : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mudando}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={mudando} onClick={e => { e.preventDefault(); void fazer(); }}>
              {mudando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {pedido ? TEXTO_ACAO[pedido.acao].botao : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
