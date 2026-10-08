/**
 * CacaAboboraConfig.tsx — liga e desliga a Caça aos Zumbis, e mostra o dia.
 * (Até 07/10/2026, Caça à Abóbora; o nome do arquivo e do banco ficou.)
 *
 * Só para o super_admin, em Configurações → Geral (as funções do banco
 * conferem de novo). Ligada, a caça vale SÓ PARA HOJE: na virada da
 * meia-noite desliga sozinha, e amanhã é preciso ligar de novo — decisão do
 * Cleber, 05/10/2026.
 *
 * O painel responde «e aí, o zumbi apareceu?»: a próxima hora marcada, o que
 * está na tela, qual zumbi saiu, quem matou cada um, em quanto tempo, com ou
 * sem headshot, e os dois recordes do dia. Ver as migrations 20261005120000 e
 * 20261007200000 e `CacaAbobora/caca.ts`.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Crosshair, Loader2, Skull, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEmpresa } from '@/hooks/useEmpresa';
import { SpriteZumbi } from '@/components/CacaAbobora/SpriteZumbi';
import { ZUMBIS, zumbiDaRodada } from '@/components/CacaAbobora/zumbis';
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

/** Releitura enquanto o cartão está aberto: o cron marca o próximo sozinho. */
const RELER_MS = 20_000;

const ETIQUETA = 'inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold';

function LinhaRodada({ r }: { r: RodadaAbobora }) {
  const zumbi = zumbiDaRodada(r);
  return (
    <li className="flex items-center gap-3 py-2 text-xs">
      <span className="w-11 shrink-0 font-mono tabular-nums text-muted-foreground">{hora(r.solta_em)}</span>
      <SpriteZumbi zumbi={zumbi} soCabeca morta={r.situacao === 'achada'} escala={1} titulo={zumbi.nome} className="shrink-0" />
      {r.situacao === 'solta' && (
        <span className="flex items-center gap-1.5 font-medium text-lime-700 dark:text-lime-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-500" />
          </span>
          Na tela agora — volta para a cova às {hora(r.expira_em)} se ninguém matar
        </span>
      )}
      {r.situacao === 'achada' && (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {r.achada_por_foto
            ? <img src={r.achada_por_foto} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
            : null}
          <span className="truncate font-medium text-foreground">{r.achada_por_nome}</span>
          <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{formatarTempo(r.ms)}</span>
          {r.headshot && (
            <span className={cn(ETIQUETA, 'bg-red-600 text-white')}>
              <Crosshair className="h-2.5 w-2.5" /> HEADSHOT
            </span>
          )}
          {r.mais_rapida_do_dia && (
            <span className={cn(ETIQUETA, 'bg-amber-500/15 text-amber-700 dark:text-amber-400')}>
              <Zap className="h-2.5 w-2.5" /> mais rápido
            </span>
          )}
          {r.headshot_mais_rapido_do_dia && (
            <span className={cn(ETIQUETA, 'bg-red-500/15 text-red-700 dark:text-red-400')}>
              <Crosshair className="h-2.5 w-2.5" /> headshot mais rápido
            </span>
          )}
        </span>
      )}
      {r.situacao === 'sumiu' && <span className="text-muted-foreground">Ninguém matou — voltou para a cova</span>}
      {r.origem === 'teste' && (
        <span className="ml-auto shrink-0 rounded border border-border px-1.5 text-[10px] text-muted-foreground">na mão</span>
      )}
    </li>
  );
}

function Recorde({ titulo, r, icone }: { titulo: string; r: RodadaAbobora | null; icone: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border px-2 py-2">
      <p className="truncate text-sm font-bold tabular-nums">{r ? formatarTempo(r.ms) : '—'}</p>
      <p className="flex items-center justify-center gap-1 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
        {icone}{r ? `${titulo} · ${r.achada_por_nome?.split(' ')[0] ?? ''}` : titulo}
      </p>
    </div>
  );
}

const maisRapido = (rs: RodadaAbobora[]) =>
  rs.reduce<RodadaAbobora | null>((m, r) => (!m || (r.ms ?? Infinity) < (m.ms ?? Infinity) ? r : m), null);

export default function CacaAboboraConfig() {
  const { empresa } = useEmpresa();
  // O mesmo estado da faixa: quando um zumbi sai ou alguém mata, o painel
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
  const mortos = doDia.filter(r => r.situacao === 'achada');
  const recorde = maisRapido(mortos);
  const recordeHs = maisRapido(mortos.filter(r => r.headshot));
  const ultimaAntes = doDia.length === 0 ? (painel?.rodadas ?? [])[0] ?? null : null;
  // O desenho do cartão: o que está na tela, ou o último que saiu.
  const zumbiDoCartao = naTela ? zumbiDaRodada(naTela) : doDia[0] ? zumbiDaRodada(doDia[0]) : ZUMBIS[0];

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
    toast.success(ligar ? 'Caça aos Zumbis ligada 🧟' : 'Caça aos Zumbis desligada', {
      description: ligar
        ? 'O primeiro zumbi sai entre 30 min e 1h10. Vale só para hoje.'
        : 'Se havia um zumbi na tela, ele voltou para a cova para todos.',
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
        description: erro.includes('JA_TEM_UMA') ? 'Já tem um zumbi na tela.' : erro,
      });
      return;
    }
    toast.success('Zumbi solto 🧟', { description: 'Está na tela de todo mundo agora.' });
  }

  let situacao: string;
  if (naTela) situacao = `Tem um zumbi na tela agora — ${zumbiDaRodada(naTela).nome}, desde as ${hora(naTela.solta_em)}.`;
  else if (ligadaHoje && painel?.config?.proxima_em) situacao = `Próximo zumbi por volta das ${hora(painel.config.proxima_em)}.`;
  else if (ligadaHoje) situacao = 'Sem próximo zumbi hoje — o sorteio passaria da meia-noite.';
  else situacao = 'Desligada. Ao ligar, vale só para hoje; amanhã é preciso ligar de novo.';

  return (
    <Card className={cn('overflow-hidden', ligadaHoje ? 'border-lime-500/50' : 'border-border')}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <SpriteZumbi zumbi={zumbiDoCartao} animado={ligadaHoje || !!naTela} escala={1} className="shrink-0" titulo={zumbiDoCartao.nome} />
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold">Caça aos Zumbis</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              Um zumbi sobe da terra na tela de todo mundo, num canto longe de botões, a cada 30 min a
              1h10 — um diferente a cada vez no dia. Quem acertar primeiro leva: tiro na cabeça é
              HEADSHOT. O nome (e a foto, se tiver) passa na faixa do topo por 10 minutos. Ninguém
              matou em 15 min, ele volta para a cova.
            </p>
          </div>
          {painel?.disponivel && (
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <Switch
                checked={ligadaHoje}
                disabled={salvando}
                onCheckedChange={v => { void virar(v); }}
                aria-label={ligadaHoje ? 'Desligar a Caça aos Zumbis' : 'Ligar a Caça aos Zumbis para hoje'}
                className="data-[state=checked]:bg-lime-600"
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
              ligadaHoje || naTela ? 'bg-lime-500/10 text-foreground' : 'bg-muted/60 text-muted-foreground',
            )}>
              {ligadaHoje && (
                <p className="mb-0.5 font-semibold text-lime-700 dark:text-lime-400">
                  Ligada hoje, {diaCurto(hoje)}, até 23h59
                  {painel.config?.ligada_por_nome ? ` · por ${painel.config.ligada_por_nome} às ${hora(painel.config.ligada_em)}` : ''}
                </p>
              )}
              <p>{situacao}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-lg border border-border px-2 py-2">
                <p className="text-lg font-bold tabular-nums">{doDia.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">soltos hoje</p>
              </div>
              <div className="rounded-lg border border-border px-2 py-2">
                <p className="text-lg font-bold tabular-nums">{mortos.length}</p>
                <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Skull className="h-2.5 w-2.5" /> mortos
                </p>
              </div>
              <Recorde titulo="mais rápido" r={recorde} icone={<Zap className="h-2.5 w-2.5 shrink-0" />} />
              <Recorde titulo="headshot" r={recordeHs} icone={<Crosshair className="h-2.5 w-2.5 shrink-0" />} />
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hoje</p>
              {doDia.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  Nenhum zumbi hoje ainda.
                  {ultimaAntes && (
                    <> O último foi em {diaCurto(ultimaAntes.dia)} às {hora(ultimaAntes.solta_em)}
                      {ultimaAntes.situacao === 'achada'
                        ? ` — ${ultimaAntes.achada_por_nome} matou em ${formatarTempo(ultimaAntes.ms)}${ultimaAntes.headshot ? ', com headshot' : ''}.`
                        : ' — ninguém matou.'}
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
                <Skull className="h-3.5 w-3.5" /> Soltar um zumbi agora
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmandoSoltar} onOpenChange={v => !soltando && setConfirmandoSoltar(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Soltar um zumbi agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele sobe agora na tela de todo mundo que está logado, nas duas empresas, e vale como
              qualquer outro: quem matar primeiro passa na faixa.
              {ligadaHoje ? ' O próximo do sorteio é remarcado para depois deste.' : ''}
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
