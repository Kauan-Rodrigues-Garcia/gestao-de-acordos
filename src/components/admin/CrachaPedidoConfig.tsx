/**
 * CrachaPedidoConfig.tsx — o card do crachá pendente em Configurações → Geral
 * (26/10/2026; no molde do card da pesquisa de experiência).
 *
 * Liga e desliga o cartão que pede o número do crachá (só o super_admin; a
 * função do banco confere de novo), abre a prévia e mostra quem já respondeu,
 * quem já tinha crachá pelo RH e quem falta — por setor e pessoa a pessoa. O
 * número do crachá não vem para cá: quem confere é o RH, nas telas dele.
 *
 * Regras e banco: `CrachaPendente/cracha.ts` e a migration 20261026180000.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, IdCard, Loader2 } from 'lucide-react';
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
import {
  ROTULO_SITUACAO, SEM_SETOR, abrirPreviaCracha, lerPainelCracha, ligarPedidoCracha, resumirCracha,
  type SituacaoCracha,
} from '@/components/CrachaPendente/cracha';

const FUSO = 'America/Sao_Paulo';
const quando = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: FUSO })
  : '—');

/** Na ordem em que se lê o andamento: o que falta primeiro. */
const ORDEM: readonly SituacaoCracha[] = ['pendente', 'respondeu', 'ja_tinha'];
const COR_BARRA: Record<SituacaoCracha, string> = {
  respondeu: 'bg-success', ja_tinha: 'bg-primary/40', pendente: 'bg-warning',
};
const COR_PILULA: Record<SituacaoCracha, string> = {
  respondeu: 'bg-success/10 text-success',
  ja_tinha: 'bg-muted text-muted-foreground',
  pendente: 'bg-warning/15 text-warning',
};
const RELER_MS = 60_000;
const LISTA_INICIAL = 100;

function Barra({ porSituacao, total, className }: {
  porSituacao: Record<SituacaoCracha, number>; total: number; className?: string;
}) {
  return (
    <div className={cn('flex h-2.5 overflow-hidden rounded-full bg-muted', className)}>
      {total > 0 && (['respondeu', 'ja_tinha', 'pendente'] as const).map(s => (
        <div key={s} className={cn('h-full transition-[width] duration-500', COR_BARRA[s])}
             style={{ width: `${(porSituacao[s] / total) * 100}%` }}
             title={`${ROTULO_SITUACAO[s]}: ${porSituacao[s]}`} />
      ))}
    </div>
  );
}

export default function CrachaPedidoConfig() {
  const { perfil } = useAuth();
  const podeLigar = ehSuperAdmin(perfil?.perfil);
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['cracha-pedido', 'painel'],
    queryFn: lerPainelCracha,
    refetchInterval: RELER_MS,
    retry: false,
  });

  const [confirmar, setConfirmar] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState<SituacaoCracha | 'todas'>('respondeu');
  const [filtroSetor, setFiltroSetor] = useState('todos');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(LISTA_INICIAL);

  const pessoas = useMemo(() => data?.pessoas ?? [], [data]);
  const resumo = useMemo(() => resumirCracha(pessoas), [pessoas]);
  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return pessoas
      .filter(p => (filtro === 'todas' || p.situacao === filtro)
        && (filtroSetor === 'todos' || (p.setor_nome?.trim() || SEM_SETOR) === filtroSetor)
        && (!b || (p.nome ?? '').toLowerCase().includes(b)))
      // Quem respondeu, do mais recente para o mais antigo; o resto, por nome.
      .sort((a, b) => (b.respondida_em ?? '').localeCompare(a.respondida_em ?? ''));
  }, [pessoas, filtro, filtroSetor, busca]);

  const ligado = data?.config?.ligado ?? true;
  const total = pessoas.length;
  const precisam = resumo.porSituacao.respondeu + resumo.porSituacao.pendente;

  const aplicar = async (ligar: boolean) => {
    setSalvando(true);
    try {
      await ligarPedidoCracha(ligar);
      toast.success(ligar ? 'Pedido do crachá ligado' : 'Pedido do crachá desligado');
      await queryClient.invalidateQueries({ queryKey: ['cracha-pedido'] });
    } catch (e) {
      toast.error('Não deu para mudar o pedido do crachá', { description: (e as Error).message });
    } finally {
      setSalvando(false);
      setConfirmar(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <IdCard className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-[200px] flex-1">
            <CardTitle className="text-sm font-semibold">Pedido do crachá</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Cartão no canto da tela que pede o número do crachá a quem ainda não tem um
              cadastrado. O número vai para o RH (o mesmo que Premiações e Comissões leem).
              Desligado, ninguém vê o cartão; quem já respondeu continua aqui.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={abrirPreviaCracha}>
              <Eye className="h-3.5 w-3.5" /> Ver o cartão
            </Button>
            <div className="text-right text-xs">
              <div className="font-semibold">{ligado ? 'Ligado' : 'Desligado'}</div>
              <div className="text-muted-foreground">{ligado ? 'aparece para quem falta' : 'ninguém vê o cartão'}</div>
            </div>
            <Switch
              checked={ligado}
              disabled={!podeLigar || salvando || isLoading || !!error}
              onCheckedChange={v => setConfirmar(v)}
              aria-label="Ligar o pedido do crachá"
              title={podeLigar ? undefined : 'Só o super admin liga e desliga o pedido'}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
            Não deu para ler o pedido do crachá. Se ele acabou de chegar, falta aplicar a migration
            {' '}<code className="font-mono">20261026180000_cracha_pedido_liga_e_painel.sql</code> no banco.
          </p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            {data?.config?.mudado_em && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                {ligado ? 'Ligado' : 'Desligado'} em {quando(data.config.mudado_em)}
                {data.config.mudado_por_nome ? ` por ${data.config.mudado_por_nome}` : ''}.
                {ligado ? ' Quem está on-line recebe em até 5 minutos, depois de 1 minuto de uso.' : ''}
              </p>
            )}

            {/* Resumo */}
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <div className="rounded-xl border border-border p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Responderam</div>
                <div className="text-2xl font-bold tabular-nums">{resumo.porSituacao.respondeu}</div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  de {precisam} que precisavam
                </div>
              </div>
              {ORDEM.filter(s => s !== 'respondeu').map(s => (
                <div key={s} className="rounded-xl border border-border p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{ROTULO_SITUACAO[s]}</div>
                  <div className="text-2xl font-bold tabular-nums">{resumo.porSituacao[s]}</div>
                  <div className="text-xs text-muted-foreground">
                    {s === 'pendente' ? 'ainda sem crachá' : 'o cartão não aparece'}
                  </div>
                </div>
              ))}
              <div className="rounded-xl border border-border p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pessoas</div>
                <div className="text-2xl font-bold tabular-nums">{total}</div>
                <div className="text-xs text-muted-foreground">ativas, sem o super admin</div>
              </div>
            </div>
            <Barra porSituacao={resumo.porSituacao} total={total} className="h-3" />

            {/* Por setor */}
            {resumo.porSetor.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  Por setor <span className="font-normal text-muted-foreground">quem mais falta primeiro</span>
                </div>
                <div className="space-y-1.5">
                  {resumo.porSetor.map(s => (
                    <button key={s.setor} type="button"
                      onClick={() => { setFiltroSetor(s.setor); setLimite(LISTA_INICIAL); }}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-1 py-0.5 text-left text-xs hover:bg-accent/40 sm:grid-cols-[170px_minmax(0,1fr)_150px]">
                      <span className="truncate font-medium">{s.setor}</span>
                      <Barra porSituacao={s.porSituacao} total={s.total} className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" />
                      <span className="text-right tabular-nums text-muted-foreground">
                        {s.porSituacao.respondeu} resp. · {s.porSituacao.pendente} faltam
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pessoas */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                Pessoas <span className="font-normal text-muted-foreground">{filtradas.length} de {total}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex flex-wrap rounded-lg bg-muted p-0.5" role="group" aria-label="Filtrar por situação">
                  {(['respondeu', 'pendente', 'ja_tinha', 'todas'] as const).map(v => (
                    <button key={v} type="button" aria-pressed={filtro === v}
                      onClick={() => { setFiltro(v); setLimite(LISTA_INICIAL); }}
                      className={cn('rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors',
                        filtro === v && 'bg-background text-foreground shadow-sm')}>
                      {v === 'todas' ? 'Todas' : ROTULO_SITUACAO[v]}
                    </button>
                  ))}
                </div>
                <select value={filtroSetor} onChange={e => { setFiltroSetor(e.target.value); setLimite(LISTA_INICIAL); }}
                  aria-label="Filtrar por setor"
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                  <option value="todos">Todos os setores</option>
                  {resumo.porSetor.map(s => <option key={s.setor} value={s.setor}>{s.setor}</option>)}
                </select>
                <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa"
                  aria-label="Buscar pessoa" className="h-8 min-w-[160px] flex-1 text-xs" />
              </div>

              <div className="overflow-hidden rounded-xl border border-border">
                <div className="hidden grid-cols-[minmax(160px,1.4fr)_minmax(120px,1fr)_130px_100px] gap-3 bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:grid">
                  <span>Pessoa</span><span>Setor</span><span>Situação</span><span>Quando</span>
                </div>
                {filtradas.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {filtro === 'respondeu' && resumo.porSituacao.respondeu === 0
                      ? 'Ninguém respondeu ainda.'
                      : 'Ninguém com esses filtros.'}
                  </p>
                ) : filtradas.slice(0, limite).map(p => (
                  <div key={p.usuario_id}
                       className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-border px-3 py-2.5 text-xs first:border-t-0 md:grid-cols-[minmax(160px,1.4fr)_minmax(120px,1fr)_130px_100px] md:items-center">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.nome ?? '—'}</div>
                      <div className="truncate text-muted-foreground">{[p.cargo, p.empresa_nome].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="order-3 col-span-2 text-muted-foreground md:order-none md:col-span-1">{p.setor_nome ?? SEM_SETOR}</div>
                    <div>
                      <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 font-medium', COR_PILULA[p.situacao])}>
                        {ROTULO_SITUACAO[p.situacao]}
                      </span>
                    </div>
                    <div className="order-4 col-span-2 tabular-nums text-muted-foreground md:order-none md:col-span-1">{quando(p.respondida_em)}</div>
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
            <AlertDialogTitle>{confirmar ? 'Ligar o pedido do crachá?' : 'Desligar o pedido do crachá?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar
                ? 'Quem ainda não tem crachá recebe o cartão em até 5 minutos, e quem entrar depois recebe ao entrar. O cartão não tem «agora não»: fica até a pessoa preencher.'
                : 'O cartão sai da tela de quem ainda não respondeu, em até 5 minutos. Quem já respondeu continua na lista, e quem falta só vê de novo se você ligar outra vez.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={salvando} onClick={e => { e.preventDefault(); void aplicar(!!confirmar); }}>
              {salvando ? 'Salvando…' : confirmar ? 'Ligar' : 'Desligar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
