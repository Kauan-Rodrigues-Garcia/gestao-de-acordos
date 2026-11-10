/**
 * SenhaInicialLiberacaoConfig.tsx — a campanha da senha inicial em
 * Configurações › Geral (Cleber, 10/11/2026). Só o super_admin (as funções do
 * banco conferem de novo).
 *
 * A auditoria de segurança achou 236 contas ativas com a senha inicial, igual
 * para todo mundo. Elas ficaram marcadas; este card decide a HORA em que a
 * troca passa a ser obrigatória para elas, e mostra quantas faltam.
 *
 *   - Liberar: quem está marcado e logado vê o card «Uma senha só sua» na
 *     hora; quem entrar depois, ao entrar. Só usa o sistema depois de criar a
 *     senha.
 *   - Recolher: o card some para quem ainda não trocou. Quem já trocou
 *     continua com a senha nova.
 *
 * Conta nova e senha resetada não dependem deste card: já nascem com a troca
 * obrigatória. Temporário — zerou a lista, o card pode sair.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEmpresa } from '@/hooks/useEmpresa';
import { cn } from '@/lib/utils';
import {
  lerPainelSenhaInicial, liberarSenhaInicial, useSenhaInicialLiberada,
} from '@/components/SenhaInicial/liberacao';

const FUSO = 'America/Sao_Paulo';
const quando = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: FUSO })
  : '—');
const RELER_MS = 60_000;

export default function SenhaInicialLiberacaoConfig() {
  const { empresa } = useEmpresa();
  const liberado = useSenhaInicialLiberada(empresa?.id);
  const cliente = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['senha-inicial-painel'],
    queryFn: lerPainelSenhaInicial,
    refetchInterval: aberto ? RELER_MS : false,
    staleTime: 30_000,
  });

  async function aplicar(liberar: boolean) {
    setSalvando(true);
    const { erro } = await liberarSenhaInicial(liberar);
    setSalvando(false);
    setConfirmar(null);
    if (erro) {
      toast.error(liberar ? 'Não foi possível liberar a troca' : 'Não foi possível recolher', { description: erro });
      return;
    }
    void cliente.invalidateQueries({ queryKey: ['senha-inicial-painel'] });
    toast.success(liberar ? 'Troca da senha inicial liberada' : 'Troca recolhida', {
      description: liberar
        ? 'Quem ainda está com a senha inicial vê o card agora; quem entrar depois, ao entrar.'
        : 'O card some para quem ainda não trocou. Quem já trocou fica com a senha nova.',
    });
  }

  const pendentes = data?.pendentes ?? 0;
  const trocaram = data?.trocaram ?? 0;
  const total = pendentes + trocaram;
  const expiradas = data?.expiradas ?? 0;
  const pct = total ? Math.round((trocaram / total) * 100) : 0;

  return (
    <Card className={cn('border-border', liberado && 'border-success/40')}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto}
            className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <KeyRound className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Senha inicial — troca obrigatória</span>
              <span className="block truncate text-xs text-muted-foreground">
                {error ? 'migration pendente' : isLoading ? 'carregando…'
                  : pendentes === 0 ? 'ninguém mais com a senha inicial'
                    : `${pendentes} ${pendentes === 1 ? 'pessoa ainda está' : 'pessoas ainda estão'} com a senha inicial · ${trocaram} já ${trocaram === 1 ? 'trocou' : 'trocaram'}`}
              </span>
            </span>
            <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs">
              <div className={cn('font-semibold', liberado ? 'text-success' : 'text-foreground')}>{liberado ? 'Liberada' : 'Ainda não liberada'}</div>
              <div className="text-muted-foreground">{liberado ? `desde ${quando(data?.liberado_em ?? null)}` : 'ninguém vê o card'}</div>
            </div>
            <Button size="sm" variant={liberado ? 'outline' : 'default'} disabled={salvando || !!error}
              onClick={() => setConfirmar(!liberado)} className="gap-1.5">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              {liberado ? 'Recolher' : 'Liberar a troca'}
            </Button>
          </div>
        </div>
      </CardHeader>

      {aberto && <CardContent className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
            Não deu para ler o andamento. Falta aplicar a migration
            {' '}<code className="font-mono">20261110160000_senha_inicial_troca_obrigatoria.sql</code> no banco.
          </p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              Estas contas foram criadas com a mesma senha inicial e nunca trocaram. Ao liberar,
              cada uma vê um card pedindo para criar uma senha só sua (6 caracteres ou mais, com
              letra e número) e só usa o sistema depois disso. O login não muda. Conta nova e
              senha resetada já pedem a troca sozinhas, sem depender daqui.
              {data?.liberado_por_nome ? ` Liberada por ${data.liberado_por_nome}.` : ''}
            </p>

            {data?.prazo_em && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-foreground">
                <strong>Prazo: {quando(data.prazo_em)}.</strong> Depois dele, quem não trocou tem a senha
                inicial anulada e a sessão encerrada. Para voltar, a liderança pede o reset em Usuários
                e você aprova no canal «Senhas» do chat. Administrador e diretoria você redefine direto.
                {expiradas > 0 ? ` ${expiradas} ${expiradas === 1 ? 'pessoa perdeu' : 'pessoas perderam'} o prazo e ainda ${expiradas === 1 ? 'não voltou' : 'não voltaram'}.` : ''}
              </p>
            )}

            <div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold">{trocaram} de {total} já criaram a senha</span>
                <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                  {pct}%
                  <button type="button" onClick={() => void refetch()} aria-label="Atualizar" title="Atualizar"
                    className="rounded p-1 hover:bg-accent">
                    <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
                  </button>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>

            {data && data.por_setor.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span>Setor</span><span>Faltam</span>
                </div>
                {data.por_setor.map(s => (
                  <div key={s.setor} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-border px-3 py-2 text-xs">
                    <span className="truncate">{s.setor}</span>
                    <span className="font-semibold tabular-nums">{s.pendentes}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>}

      <AlertDialog open={confirmar !== null} onOpenChange={o => { if (!o && !salvando) setConfirmar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmar ? 'Liberar a troca da senha inicial?' : 'Recolher a troca?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar
                ? `O card aparece agora para ${pendentes === 1 ? 'a pessoa que ainda está' : `as ${pendentes} pessoas que ainda estão`} com a senha inicial, inclusive quem estiver no meio de um atendimento, e o sistema só volta depois de criar a senha nova. Vale avisar a liderança antes. Dá para recolher depois.`
                : 'O card some para quem ainda não trocou, e essas contas continuam com a senha inicial. Quem já criou a senha nova não perde nada.'}
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
