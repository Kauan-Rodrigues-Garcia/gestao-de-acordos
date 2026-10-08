/**
 * PesquisaExperienciaConfig.tsx — o card TEMPORÁRIO da pesquisa de
 * experiência, em Configurações → Geral (Cleber, 08/10/2026).
 *
 * Liga e desliga a pergunta (só o super_admin; a função do banco confere de
 * novo), abre a prévia e mostra o que chegou: quantos responderam, como, por
 * setor, e cada resposta com quem foi, cargo, setor e comentário. As
 * respostas guardam o retrato da pessoa na hora em que ela respondeu.
 *
 * Quem lê as respostas é quem abre a aba Geral (`config_sub_geral`) — a policy
 * de `pesquisa_experiencia_respostas` cobra a mesma chave. Regras e banco:
 * `PesquisaExperiencia/pesquisa.ts` e a migration 20261008150000.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { ehSuperAdmin } from '@/lib/mobile/preferencia';
import { cn } from '@/lib/utils';
import { Caneca, Rosto } from '@/components/PesquisaExperiencia/CartaoPesquisa';
import {
  ROTULO_NOTA, abrirPreviaPesquisa, lerPainelPesquisa, ligarPesquisa, resumirPesquisa,
  type NotaPesquisa, type RespostaPesquisa,
} from '@/components/PesquisaExperiencia/pesquisa';

const FUSO = 'America/Sao_Paulo';
const quando = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: FUSO })
  : '—');

/** Da melhor para a pior, como se lê um resultado. */
const ORDEM_RESUMO: readonly NotaPesquisa[] = ['boa', 'media', 'ruim'];
const COR_BARRA: Record<NotaPesquisa, string> = { boa: 'bg-emerald-500', media: 'bg-amber-400', ruim: 'bg-red-500' };
const COR_PILULA: Record<NotaPesquisa, string> = {
  boa: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  media: 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
  ruim: 'bg-red-500/12 text-red-700 dark:text-red-400',
};
const RELER_MS = 60_000;
const LISTA_INICIAL = 100;

function BarraNotas({ porNota, total, className }: { porNota: Record<NotaPesquisa, number>; total: number; className?: string }) {
  return (
    <div className={cn('flex h-2.5 overflow-hidden rounded-full bg-muted', className)}>
      {total > 0 && ORDEM_RESUMO.map(n => (
        <div key={n} className={cn('h-full transition-[width] duration-500', COR_BARRA[n])}
             style={{ width: `${(porNota[n] / total) * 100}%` }} title={`${ROTULO_NOTA[n]}: ${porNota[n]}`} />
      ))}
    </div>
  );
}

function PilulaNota({ nota }: { nota: NotaPesquisa }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-0.5 pr-2 text-xs font-medium', COR_PILULA[nota])}>
      <Rosto nota={nota} className="h-5 w-5" />
      {ROTULO_NOTA[nota]}
    </span>
  );
}

export default function PesquisaExperienciaConfig() {
  const { perfil } = useAuth();
  const podeLigar = ehSuperAdmin(perfil?.perfil);
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['pesquisa-experiencia', 'painel'],
    queryFn: lerPainelPesquisa,
    refetchInterval: RELER_MS,
    retry: false,
  });

  const [confirmar, setConfirmar] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [filtroNota, setFiltroNota] = useState<NotaPesquisa | 'todas'>('todas');
  const [filtroSetor, setFiltroSetor] = useState('todos');
  const [soComentario, setSoComentario] = useState(false);
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(LISTA_INICIAL);

  const respostas = useMemo(() => data?.respostas ?? [], [data]);
  const resumo = useMemo(() => resumirPesquisa(respostas), [respostas]);
  const setores = useMemo(() => resumo.porSetor.map(s => s.setor), [resumo]);
  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return respostas.filter((r: RespostaPesquisa) =>
      (filtroNota === 'todas' || r.nota === filtroNota)
      && (filtroSetor === 'todos' || (r.setor_nome?.trim() || 'Sem setor') === filtroSetor)
      && (!soComentario || !!r.comentario?.trim())
      && (!b || `${r.nome ?? ''} ${r.comentario ?? ''}`.toLowerCase().includes(b)));
  }, [respostas, filtroNota, filtroSetor, soComentario, busca]);

  const ligada = !!data?.config?.ligada;
  const publico = data?.publico ?? null;
  const pct = (n: number, de: number) => (de > 0 ? Math.round((n / de) * 100) : 0);

  const aplicar = async (ligar: boolean) => {
    setSalvando(true);
    try {
      await ligarPesquisa(ligar);
      toast.success(ligar ? 'Pesquisa liberada para todo mundo' : 'Pesquisa desligada');
      await queryClient.invalidateQueries({ queryKey: ['pesquisa-experiencia'] });
    } catch (e) {
      toast.error('Não deu para mudar a pesquisa', { description: (e as Error).message });
    } finally {
      setSalvando(false);
      setConfirmar(null);
    }
  };

  return (
    <Card className="border-orange-300/70 dark:border-orange-400/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-500/15">
            <Caneca className="h-8 w-8" />
          </span>
          <div className="min-w-[200px] flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              Pesquisa de experiência
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-400">
                Temporário
              </span>
            </CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Pergunta para cada pessoa, uma vez só, como está sendo usar o sistema. Desligada, ninguém vê a
              pergunta; as respostas que já chegaram continuam aqui.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={abrirPreviaPesquisa}>
              <Eye className="h-3.5 w-3.5" /> Ver a pergunta
            </Button>
            <div className="text-right text-xs">
              <div className="font-semibold">{ligada ? 'Liberada' : 'Desligada'}</div>
              <div className="text-muted-foreground">{ligada ? 'aparece para todo mundo' : 'ninguém vê a pergunta'}</div>
            </div>
            <Switch
              checked={ligada}
              disabled={!podeLigar || salvando || isLoading || !!error}
              onCheckedChange={v => setConfirmar(v)}
              aria-label="Liberar a pesquisa para todos"
              title={podeLigar ? undefined : 'Só o super admin liga e desliga a pesquisa'}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-300">
            Não deu para ler a pesquisa. Se ela acabou de chegar, falta aplicar a migration
            {' '}<code className="font-mono">20261008150000_pesquisa_experiencia.sql</code> no banco.
          </p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</div>
        ) : (
          <>
            <p className={cn('rounded-lg px-3 py-2 text-xs',
              ligada ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
              {ligada
                ? `Liberada em ${quando(data?.config?.ligada_em ?? null)}${data?.config?.ligada_por_nome ? ` por ${data.config.ligada_por_nome}` : ''}. Quem está on-line recebe em até 5 minutos, depois de 3 minutos de uso; quem entrar depois recebe ao entrar.`
                : data?.config?.desligada_em
                  ? `Desligada em ${quando(data.config.desligada_em)}${data.config.desligada_por_nome ? ` por ${data.config.desligada_por_nome}` : ''}.`
                  : 'A pesquisa começa desligada. Use «Ver a pergunta» para conferir antes de liberar.'}
            </p>

            {/* Resumo */}
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <div className="rounded-xl border border-border p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Responderam</div>
                <div className="text-2xl font-bold tabular-nums">{resumo.total}</div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  {publico != null ? `de ${publico} pessoas · ${pct(resumo.total, publico)}%` : 'pessoas'}
                </div>
              </div>
              {ORDEM_RESUMO.map(n => (
                <div key={n} className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    <Rosto nota={n} className="h-4 w-4" /> {ROTULO_NOTA[n]}
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{resumo.porNota[n]}</div>
                  <div className="text-xs tabular-nums text-muted-foreground">{pct(resumo.porNota[n], resumo.total)}% das respostas</div>
                </div>
              ))}
            </div>
            <div>
              <BarraNotas porNota={resumo.porNota} total={resumo.total} className="h-3" />
              <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>{ORDEM_RESUMO.map(n => `${ROTULO_NOTA[n]} ${pct(resumo.porNota[n], resumo.total)}%`).join(' · ')}</span>
                <span>{resumo.comComentario} com comentário</span>
              </div>
            </div>

            {/* Por setor */}
            {resumo.porSetor.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  Por setor <span className="font-normal text-muted-foreground">quantos responderam e como</span>
                </div>
                <div className="space-y-1.5">
                  {resumo.porSetor.map(s => (
                    <div key={s.setor} className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-x-3 gap-y-1 text-xs sm:grid-cols-[170px_minmax(0,1fr)_64px]">
                      <span className="truncate font-medium">{s.setor}</span>
                      <BarraNotas porNota={s.porNota} total={s.total} className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" />
                      <span className="text-right tabular-nums text-muted-foreground">{s.total} resp.</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Respostas */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                Respostas <span className="font-normal text-muted-foreground">{filtradas.length} de {respostas.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex flex-wrap rounded-lg bg-muted p-0.5" role="group" aria-label="Filtrar por nota">
                  {(['todas', ...ORDEM_RESUMO] as const).map(v => (
                    <button key={v} type="button" aria-pressed={filtroNota === v}
                      onClick={() => { setFiltroNota(v); setLimite(LISTA_INICIAL); }}
                      className={cn('rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors',
                        filtroNota === v && 'bg-background text-foreground shadow-sm')}>
                      {v === 'todas' ? 'Todas' : ROTULO_NOTA[v]}
                    </button>
                  ))}
                </div>
                <select value={filtroSetor} onChange={e => { setFiltroSetor(e.target.value); setLimite(LISTA_INICIAL); }}
                  aria-label="Filtrar por setor"
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                  <option value="todos">Todos os setores</option>
                  {setores.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <label className="inline-flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={soComentario} onChange={e => setSoComentario(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                  Só com comentário
                </label>
                <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa ou comentário"
                  aria-label="Buscar pessoa ou comentário" className="h-8 min-w-[160px] flex-1 text-xs" />
              </div>

              <div className="overflow-hidden rounded-xl border border-border">
                <div className="hidden grid-cols-[minmax(140px,1.1fr)_minmax(110px,.8fr)_120px_minmax(0,2fr)_90px] gap-3 bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:grid">
                  <span>Pessoa</span><span>Setor</span><span>Nota</span><span>Comentário</span><span>Quando</span>
                </div>
                {filtradas.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {respostas.length === 0 ? 'Ninguém respondeu ainda.' : 'Nenhuma resposta com esses filtros.'}
                  </p>
                ) : filtradas.slice(0, limite).map(r => (
                  <div key={r.usuario_id}
                       className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-border px-3 py-2.5 text-xs first:border-t-0 md:grid-cols-[minmax(140px,1.1fr)_minmax(110px,.8fr)_120px_minmax(0,2fr)_90px] md:items-start">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.nome ?? '—'}</div>
                      <div className="truncate text-muted-foreground">{[r.cargo, r.empresa_nome].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="order-3 col-span-2 text-muted-foreground md:order-none md:col-span-1">{r.setor_nome ?? 'Sem setor'}</div>
                    <div className="md:order-none"><PilulaNota nota={r.nota} /></div>
                    <div className={cn('order-4 col-span-2 leading-relaxed md:order-none md:col-span-1',
                      r.comentario ? 'text-foreground' : 'italic text-muted-foreground/70')}>
                      {r.comentario ? `«${r.comentario}»` : 'sem comentário'}
                    </div>
                    <div className="order-5 col-span-2 tabular-nums text-muted-foreground md:order-none md:col-span-1">{quando(r.respondida_em)}</div>
                  </div>
                ))}
              </div>
              {filtradas.length > limite && (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setLimite(l => l + LISTA_INICIAL)}>
                  Mostrar mais {Math.min(LISTA_INICIAL, filtradas.length - limite)}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmar !== null} onOpenChange={o => { if (!o) setConfirmar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmar ? 'Liberar a pesquisa para todo mundo?' : 'Desligar a pesquisa?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar
                ? 'Quem está on-line recebe a pergunta em até 5 minutos, e quem entrar depois recebe ao entrar. Cada pessoa responde uma vez só; não tem «agora não».'
                : 'A pergunta para de aparecer. Quem já respondeu continua na lista, e quem ainda não respondeu só vê de novo se você ligar outra vez.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={salvando} onClick={e => { e.preventDefault(); void aplicar(!!confirmar); }}>
              {salvando ? 'Salvando…' : confirmar ? 'Liberar' : 'Desligar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
