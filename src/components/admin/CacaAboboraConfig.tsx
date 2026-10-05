/**
 * CacaAboboraConfig.tsx — liga e desliga a Caça à Abóbora, e mostra o dia.
 *
 * Só para o super_admin, em Configurações → Geral (as funções do banco
 * conferem de novo). Ligada, a caça vale SÓ PARA HOJE: na virada da
 * meia-noite desliga sozinha, e amanhã é preciso ligar de novo — decisão do
 * Cleber, 05/10/2026.
 *
 * O painel responde «e aí, a abóbora apareceu?»: a próxima hora marcada, a que
 * está na tela, quem achou cada uma, em quanto tempo e a mais rápida do dia.
 * Ver a migration 20261005120000 e `CacaAbobora/caca.ts`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEmpresa } from '@/hooks/useEmpresa';
import { DesenhoAbobora } from '@/components/CacaAbobora/DesenhoAbobora';
import {
  formatarTempo, lerPainelCaca, ligarCaca, soltarAboboraAgora, useCacaAbobora,
  type PainelCaca, type RodadaAbobora,
} from '@/components/CacaAbobora/caca';
import { cn } from '@/lib/utils';

const FUSO = 'America/Sao_Paulo';
const hora = (iso: string | null | undefined) => (iso
  ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO })
  : '—');
const diaCurto = (isoDia: string | null | undefined) => (isoDia ? `${isoDia.slice(8, 10)}/${isoDia.slice(5, 7)}` : '—');

/** Releitura enquanto o cartão está aberto: o cron marca a próxima sozinho. */
const RELER_MS = 20_000;

function LinhaRodada({ r }: { r: RodadaAbobora }) {
  return (
    <li className="flex items-center gap-3 py-2 text-xs">
      <span className="w-11 shrink-0 font-mono tabular-nums text-muted-foreground">{hora(r.solta_em)}</span>
      {r.situacao === 'solta' && (
        <span className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          Na tela agora — some às {hora(r.expira_em)} se ninguém achar
        </span>
      )}
      {r.situacao === 'achada' && (
        <span className="flex min-w-0 items-center gap-2">
          {r.achada_por_foto
            ? <img src={r.achada_por_foto} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
            : null}
          <span className="truncate font-medium text-foreground">{r.achada_por_nome}</span>
          <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{formatarTempo(r.ms)}</span>
          {r.mais_rapida_do_dia && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              <Zap className="h-2.5 w-2.5" /> mais rápida
            </span>
          )}
        </span>
      )}
      {r.situacao === 'sumiu' && <span className="text-muted-foreground">Ninguém achou — sumiu</span>}
      {r.origem === 'teste' && (
        <span className="ml-auto shrink-0 rounded border border-border px-1.5 text-[10px] text-muted-foreground">na mão</span>
      )}
    </li>
  );
}

export default function CacaAboboraConfig() {
  const { empresa } = useEmpresa();
  // O mesmo estado da faixa: quando uma abóbora sai ou alguém acha, o painel
  // relê na hora.
  const caca = useCacaAbobora(empresa?.id);
  const [painel, setPainel] = useState<PainelCaca | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoSoltar, setConfirmandoSoltar] = useState(false);
  const [soltando, setSoltando] = useState(false);

  const reler = useCallback(async () => {
    try { setPainel(await lerPainelCaca()); } catch { /* rede: a próxima releitura tenta */ }
  }, []);

  const marcaDaRodada = `${caca.rodada?.id ?? 0}:${caca.rodada?.situacao ?? ''}`;
  useEffect(() => { void reler(); }, [reler, marcaDaRodada]);

  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void reler(); }, RELER_MS);
    return () => clearInterval(t);
  }, [reler]);

  const hoje = painel?.hoje ?? null;
  const ligadaHoje = !!hoje && painel?.config?.dia === hoje;
  const doDia = useMemo(() => (painel?.rodadas ?? []).filter(r => r.dia === hoje), [painel, hoje]);
  const naTela = (painel?.rodadas ?? []).find(r => r.situacao === 'solta') ?? null;
  const achadas = doDia.filter(r => r.situacao === 'achada');
  const maisRapida = achadas.reduce<RodadaAbobora | null>((m, r) => (!m || (r.ms ?? Infinity) < (m.ms ?? Infinity) ? r : m), null);
  const ultimaAntes = doDia.length === 0 ? (painel?.rodadas ?? [])[0] ?? null : null;

  async function virar(ligar: boolean) {
    if (salvando) return;
    setSalvando(true);
    const { erro } = await ligarCaca(ligar);
    await reler();
    setSalvando(false);
    if (erro) {
      toast.error('Não foi possível salvar', { description: erro });
      return;
    }
    toast.success(ligar ? 'Caça à Abóbora ligada 🎃' : 'Caça à Abóbora desligada', {
      description: ligar
        ? 'A primeira abóbora sai entre 30 min e 1h10. Vale só para hoje.'
        : 'Se havia uma abóbora na tela, ela sumiu para todos.',
    });
  }

  async function soltar() {
    setSoltando(true);
    const { erro } = await soltarAboboraAgora();
    await reler();
    setSoltando(false);
    setConfirmandoSoltar(false);
    if (erro) {
      toast.error('Não deu para soltar', {
        description: erro.includes('JA_TEM_UMA') ? 'Já tem uma abóbora na tela.' : erro,
      });
      return;
    }
    toast.success('Abóbora solta 🎃', { description: 'Está na tela de todo mundo agora.' });
  }

  let situacao: string;
  if (naTela) situacao = `Tem uma abóbora na tela agora — saiu às ${hora(naTela.solta_em)}.`;
  else if (ligadaHoje && painel?.config?.proxima_em) situacao = `Próxima abóbora por volta das ${hora(painel.config.proxima_em)}.`;
  else if (ligadaHoje) situacao = 'Sem próxima abóbora hoje — o sorteio passaria da meia-noite.';
  else situacao = 'Desligada. Ao ligar, vale só para hoje; amanhã é preciso ligar de novo.';

  return (
    <Card className={cn('overflow-hidden', ligadaHoje ? 'border-amber-500/50' : 'border-border')}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <DesenhoAbobora className="h-10 w-10 shrink-0" acesa={ligadaHoje} />
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold">Caça à Abóbora</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              Uma abóbora aparece escondida na tela de todo mundo, num canto longe de botões, a cada
              30 min a 1h10. Quem clica primeiro leva: o nome (e a foto, se tiver) passa na faixa do
              topo por 4 minutos. Ninguém achou em 15 min, ela some.
            </p>
          </div>
          {painel?.disponivel && (
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <Switch
                checked={ligadaHoje}
                disabled={salvando}
                onCheckedChange={v => { void virar(v); }}
                aria-label={ligadaHoje ? 'Desligar a Caça à Abóbora' : 'Ligar a Caça à Abóbora para hoje'}
                className="data-[state=checked]:bg-amber-500"
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {!painel && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {painel && !painel.disponivel && (
          <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            O banco ainda não tem a caça (migration <span className="font-mono">20261005120000_caca_abobora</span>).
            O cartão funciona assim que ela for aplicada.
          </p>
        )}

        {painel?.disponivel && (
          <>
            <div className={cn(
              'rounded-lg px-3 py-2.5 text-xs',
              ligadaHoje || naTela ? 'bg-amber-500/10 text-foreground' : 'bg-muted/60 text-muted-foreground',
            )}>
              {ligadaHoje && (
                <p className="mb-0.5 font-semibold text-amber-700 dark:text-amber-400">
                  Ligada hoje, {diaCurto(hoje)}, até 23h59
                  {painel.config?.ligada_por_nome ? ` · por ${painel.config.ligada_por_nome} às ${hora(painel.config.ligada_em)}` : ''}
                </p>
              )}
              <p>{situacao}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-border px-2 py-2">
                <p className="text-lg font-bold tabular-nums">{doDia.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">soltas hoje</p>
              </div>
              <div className="rounded-lg border border-border px-2 py-2">
                <p className="text-lg font-bold tabular-nums">{achadas.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">achadas</p>
              </div>
              <div className="min-w-0 rounded-lg border border-border px-2 py-2">
                <p className="truncate text-sm font-bold tabular-nums">{maisRapida ? formatarTempo(maisRapida.ms) : '—'}</p>
                <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                  {maisRapida ? `mais rápida · ${maisRapida.achada_por_nome?.split(' ')[0] ?? ''}` : 'mais rápida'}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hoje</p>
              {doDia.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  Nenhuma abóbora hoje ainda.
                  {ultimaAntes && (
                    <> A última foi em {diaCurto(ultimaAntes.dia)} às {hora(ultimaAntes.solta_em)}
                      {ultimaAntes.situacao === 'achada'
                        ? ` — ${ultimaAntes.achada_por_nome} achou em ${formatarTempo(ultimaAntes.ms)}.`
                        : ' — ninguém achou.'}
                    </>
                  )}
                </p>
              ) : (
                <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                  {doDia.map(r => <LinhaRodada key={r.id} r={r} />)}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-[11px] text-muted-foreground">Quer testar ou animar o time agora?</p>
              <Button
                size="sm" variant="outline" className="gap-1.5"
                disabled={!!naTela || soltando}
                onClick={() => setConfirmandoSoltar(true)}
              >
                <Sparkles className="h-3.5 w-3.5" /> Soltar uma agora
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmandoSoltar} onOpenChange={v => !soltando && setConfirmandoSoltar(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Soltar uma abóbora agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela aparece agora na tela de todo mundo que está logado, nas duas empresas, e vale como
              qualquer outra: quem achar primeiro passa na faixa.
              {ligadaHoje ? ' A próxima do sorteio é remarcada para depois desta.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={soltando}>Agora não</AlertDialogCancel>
            <AlertDialogAction disabled={soltando} onClick={e => { e.preventDefault(); void soltar(); }}>
              {soltando ? 'Soltando…' : 'Soltar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
