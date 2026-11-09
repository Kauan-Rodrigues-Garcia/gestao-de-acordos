/**
 * NatalLiberacaoConfig.tsx — o tema de Natal em Configurações › Geral
 * (Cleber, 09/11/2026). Só o super_admin (as funções do banco conferem de novo).
 *
 *   - Liberar para todos, ou recolher (`Natal/liberacao.ts`). Antes de liberar,
 *     só o super_admin vê o tema. Ao liberar, quem está logado recebe o
 *     presente na hora; quem entrar depois, ao entrar.
 *   - O acompanhamento por cidade — Birigui, Marília e quem está sem cidade
 *     (vê o vídeo de Birigui): quem já entrou no Natal (vendo o vídeo inteiro
 *     ou pulando), quem deixou para depois e quem ainda não abriu o presente.
 *
 * Nasce recolhido, como o card do crachá: o cabeçalho mostra o andamento numa
 * linha. Regras e banco: `Natal/acompanhamento.ts` e a migration 20261109150000.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Gift, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEmpresa } from '@/hooks/useEmpresa';
import { cn } from '@/lib/utils';
import { liberarNatal, useNatalLiberado } from '@/components/Natal/liberacao';
import {
  ROTULO_GRUPO, ROTULO_SITUACAO, comoEntrou, lerPainelDoNatal, resumirGrupo, separarPorGrupo, situacaoDoNatal,
  type GrupoDaCidade, type SituacaoDoNatal,
} from '@/components/Natal/acompanhamento';

const FUSO = 'America/Sao_Paulo';
const quando = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: FUSO })
  : '—');

const GRUPOS: readonly GrupoDaCidade[] = ['birigui', 'marilia', 'sem'];
const COR_PILULA: Record<SituacaoDoNatal, string> = {
  entrou: 'bg-success/10 text-success',
  adiou: 'bg-warning/15 text-warning',
  pendente: 'bg-muted text-muted-foreground',
};
const RELER_MS = 60_000;
const LISTA_INICIAL = 100;

type Filtro = SituacaoDoNatal | 'todas';

export default function NatalLiberacaoConfig() {
  const { empresa } = useEmpresa();
  const liberado = useNatalLiberado(empresa?.id);
  const cliente = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [grupo, setGrupo] = useState<GrupoDaCidade>('birigui');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(LISTA_INICIAL);
  const [confirmar, setConfirmar] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['natal-acompanhamento'],
    queryFn: lerPainelDoNatal,
    refetchInterval: aberto ? RELER_MS : false,
    staleTime: 30_000,
  });

  const porGrupo = useMemo(() => separarPorGrupo(data?.pessoas ?? []), [data]);
  const resumos = useMemo(() => ({
    birigui: resumirGrupo(porGrupo.birigui),
    marilia: resumirGrupo(porGrupo.marilia),
    sem: resumirGrupo(porGrupo.sem),
  }), [porGrupo]);
  const geral = useMemo(() => resumirGrupo(data?.pessoas ?? []), [data]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return porGrupo[grupo].filter(p =>
      (filtro === 'todas' || situacaoDoNatal(p) === filtro)
      && (!termo || `${p.nome ?? ''} ${p.setor_nome ?? ''}`.toLowerCase().includes(termo)));
  }, [porGrupo, grupo, filtro, busca]);

  async function aplicar(liberar: boolean) {
    setSalvando(true);
    const { erro } = await liberarNatal(liberar);
    setSalvando(false);
    setConfirmar(null);
    if (erro) {
      toast.error(liberar ? 'Não foi possível liberar o Natal' : 'Não foi possível recolher o Natal', { description: erro });
      return;
    }
    void cliente.invalidateQueries({ queryKey: ['natal-acompanhamento'] });
    toast.success(liberar ? 'Natal liberado 🎄' : 'Natal recolhido', {
      description: liberar
        ? 'Quem está logado recebe o presente agora; quem entrar depois, ao entrar.'
        : 'O tema volta a ser só dos super admins. Quem já entrou fica com o presente aberto para quando liberar de novo.',
    });
  }

  const r = resumos[grupo];
  const liberadoEm = data?.liberacao?.liberado_em ?? null;

  return (
    <Card className={cn('border-border', liberado && 'border-success/40')}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto}
            className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Gift className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Tema de Natal — liberação e presente</span>
              <span className="block truncate text-xs text-muted-foreground">
                {error ? 'migration pendente' : isLoading ? 'carregando…'
                  : `${geral.entrou} de ${geral.total} já entraram no Natal · ${geral.pendente} ainda não abriram`}
              </span>
            </span>
            <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs">
              <div className={cn('font-semibold', liberado ? 'text-success' : 'text-foreground')}>{liberado ? 'Liberado' : 'Só super admin'}</div>
              <div className="text-muted-foreground">{liberado ? `desde ${quando(liberadoEm)}` : 'ninguém mais vê o tema'}</div>
            </div>
            <Button size="sm" variant={liberado ? 'outline' : 'default'} disabled={salvando}
              onClick={() => setConfirmar(!liberado)} className="gap-1.5">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span aria-hidden>{liberado ? '↩' : '🎄'}</span>}
              {liberado ? 'Recolher' : 'Liberar para todos'}
            </Button>
          </div>
        </div>
      </CardHeader>

      {aberto && <CardContent className="space-y-5">
        {error ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
            Não deu para ler o acompanhamento. Falta aplicar a migration
            {' '}<code className="font-mono">20261109150000_natal_liberacao_e_abertura.sql</code> no banco.
          </p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Cada pessoa vê o vídeo da cidade do setor: Marília vê o de Marília; Birigui, outra cidade
              ou setor sem cidade, o de Birigui. Fechar o vídeo no meio pergunta se quer continuar,
              deixar para depois (o vídeo recomeça do início) ou pular e entrar no Natal.
              {data?.liberacao?.liberado_por_nome ? ` Liberado por ${data.liberacao.liberado_por_nome}.` : ''}
            </p>

            {/* As cidades */}
            <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Cidade">
              {GRUPOS.map(g => {
                const x = resumos[g];
                const pct = x.total ? Math.round((x.entrou / x.total) * 100) : 0;
                return (
                  <button key={g} type="button" role="tab" aria-selected={grupo === g}
                    onClick={() => { setGrupo(g); setLimite(LISTA_INICIAL); }}
                    className={cn('rounded-xl border p-3 text-left transition-colors',
                      grupo === g ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/40')}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">{ROTULO_GRUPO[g]}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold tabular-nums">{x.entrou}<span className="text-sm font-medium text-muted-foreground"> / {x.total}</span></div>
                    <div className="text-xs text-muted-foreground">{g === 'sem' ? 'entraram · veem o vídeo de Birigui' : 'entraram no Natal'}</div>
                    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
                      <div className="h-full bg-warning transition-[width] duration-500" style={{ width: `${x.total ? (x.adiou / x.total) * 100 : 0}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* O resumo da cidade escolhida */}
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {([
                ['Assistiram inteiro', r.assistiu, 'e entraram no Natal'],
                ['Pularam o vídeo', r.pulou, 'e entraram no Natal'],
                ['Deixaram para depois', r.adiou, 'o presente está esperando'],
                ['Ainda não abriram', r.pendente, 'o presente está esperando'],
              ] as const).map(([rotulo, n, sub]) => (
                <div key={rotulo} className="rounded-xl border border-border p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{rotulo}</div>
                  <div className="text-2xl font-bold tabular-nums">{n}</div>
                  <div className="text-xs text-muted-foreground">{sub}</div>
                </div>
              ))}
            </div>

            {/* As pessoas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Pessoas de {ROTULO_GRUPO[grupo]}</span>
                <span className="flex items-center gap-2 font-normal text-muted-foreground">
                  {filtradas.length} de {porGrupo[grupo].length}
                  <button type="button" onClick={() => void refetch()} aria-label="Atualizar" title="Atualizar"
                    className="rounded p-1 hover:bg-accent">
                    <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
                  </button>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex flex-wrap rounded-lg bg-muted p-0.5" role="group" aria-label="Filtrar por situação">
                  {(['todas', 'entrou', 'adiou', 'pendente'] as const).map(v => (
                    <button key={v} type="button" aria-pressed={filtro === v}
                      onClick={() => { setFiltro(v); setLimite(LISTA_INICIAL); }}
                      className={cn('rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors',
                        filtro === v && 'bg-background text-foreground shadow-sm')}>
                      {v === 'todas' ? 'Todas' : ROTULO_SITUACAO[v]}
                    </button>
                  ))}
                </div>
                <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa ou setor"
                  aria-label="Buscar pessoa ou setor" className="h-8 min-w-[160px] flex-1 text-xs" />
              </div>

              <div className="overflow-hidden rounded-xl border border-border">
                <div className="hidden grid-cols-[minmax(160px,1.4fr)_minmax(120px,1fr)_150px_110px] gap-3 bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground md:grid">
                  <span>Pessoa</span><span>Setor</span><span>Situação</span><span>Quando</span>
                </div>
                {filtradas.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">Ninguém com esses filtros.</p>
                ) : filtradas.slice(0, limite).map(p => {
                  const s = situacaoDoNatal(p);
                  const como = comoEntrou(p);
                  return (
                    <div key={p.usuario_id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-border px-3 py-2.5 text-xs first:border-t-0 md:grid-cols-[minmax(160px,1.4fr)_minmax(120px,1fr)_150px_110px] md:items-center">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.nome ?? '—'}</div>
                        <div className="truncate text-muted-foreground">{[p.cargo, p.empresa_nome].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div className="order-3 col-span-2 truncate text-muted-foreground md:order-none md:col-span-1">{p.setor_nome ?? 'Sem setor'}</div>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 font-medium', COR_PILULA[s])}>
                          {ROTULO_SITUACAO[s]}
                        </span>
                        {como && <span className="text-[11px] text-muted-foreground">{como === 'assistiu' ? 'vídeo inteiro' : 'pulou'}</span>}
                        {s !== 'entrou' && p.adiou_vezes > 1 && <span className="text-[11px] text-muted-foreground">{p.adiou_vezes}×</span>}
                      </div>
                      <div className="order-4 col-span-2 tabular-nums text-muted-foreground md:order-none md:col-span-1">{quando(p.liberou_em)}</div>
                    </div>
                  );
                })}
              </div>
              {filtradas.length > limite && (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setLimite(l => l + LISTA_INICIAL)}>
                  Mostrar mais {Math.min(LISTA_INICIAL, filtradas.length - limite)}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>}

      <AlertDialog open={confirmar !== null} onOpenChange={o => { if (!o && !salvando) setConfirmar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmar ? 'Liberar o Natal para todos?' : 'Recolher o Natal?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar
                ? 'O presente aparece agora para todo mundo que está logado, nas duas cidades, e para quem entrar depois. Cada um vê o vídeo da sua cidade e entra no Natal ao terminar ou pular. Dá para recolher depois.'
                : 'O tema sai da tela de todo mundo e volta a ser só dos super admins. Quem já entrou no Natal não perde nada: ao liberar de novo, entra direto.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={salvando} onClick={e => { e.preventDefault(); void aplicar(!!confirmar); }}>
              {salvando ? 'Salvando…' : confirmar ? 'Liberar agora' : 'Recolher'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
