/**
 * «Meu histórico» — as campanhas de que o operador participou (09/10/2026,
 * migration 20261009180000), separadas pelo voto que ele deu: bom retorno,
 * sem retorno ou ainda sem avaliação.
 *
 * As abertas mostram o andamento ao vivo; as encerradas, o placar congelado.
 * O voto de uma campanha aberta se dá na aba «Para enviar» — aqui é leitura.
 */
import { useEffect, useMemo, useState } from 'react';
import { History, Loader2, Minus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { minhasParticipacoes, type Participacao } from './campanhasWhatsapp.service';
import {
  casaVoto, nomeMes, porMes, resumirHistorico, situacaoDaParticipacao,
  type FiltroVoto, type SituacaoParticipacao,
} from './historico';

const n = (x: number) => x.toLocaleString('pt-BR');

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const SITUACAO: Record<SituacaoParticipacao, { rotulo: string; cls: string }> = {
  aberta: { rotulo: 'Aberta', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  pausada: { rotulo: 'Pausada pelo líder', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  encerrada: { rotulo: 'Encerrada', cls: 'bg-muted text-muted-foreground' },
};

export function HistoricoOperador({ votosAtuais, lotesAtuais, onAbrir }: {
  /** Os votos das campanhas da aba «Para enviar»: valem por cima do que veio do banco. */
  votosAtuais: Map<string, boolean>;
  lotesAtuais: ReadonlySet<string>;
  /** Abre a campanha na aba «Para enviar», se ela ainda estiver lá. */
  onAbrir: (loteId: string) => boolean;
}) {
  const [lista, setLista] = useState<Participacao[] | null>(null);
  const [erro, setErro] = useState(false);
  const [filtro, setFiltro] = useState<FiltroVoto>('todas');

  useEffect(() => {
    let vivo = true;
    minhasParticipacoes()
      .then((l) => { if (vivo) setLista(l); })
      .catch((err) => { console.error('[CampanhasWhatsapp] histórico:', err); if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, []);

  // As campanhas da aba «Para enviar» têm o voto mais novo na tela.
  const comVotos = useMemo(() => (lista ?? []).map((p) => (
    lotesAtuais.has(p.lote_id) ? { ...p, bom: votosAtuais.get(p.lote_id) ?? null } : p
  )), [lista, votosAtuais, lotesAtuais]);
  const resumo = useMemo(() => resumirHistorico(comVotos), [comVotos]);
  const meses = useMemo(() => porMes(comVotos.filter((p) => casaVoto(p, filtro))), [comVotos, filtro]);

  if (erro) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Não foi possível carregar o seu histórico. Tente de novo mais tarde.</p>;
  }
  if (!lista) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando o seu histórico…
      </div>
    );
  }
  if (lista.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="rounded-full bg-muted p-4"><History className="h-7 w-7 text-muted-foreground" /></div>
          <div>
            <p className="font-semibold">Nenhuma campanha no histórico</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">As campanhas que o líder liberar para você aparecem aqui, com a sua avaliação.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const filtros: { v: FiltroVoto; rotulo: string; qtd: number; icone?: JSX.Element }[] = [
    { v: 'todas', rotulo: 'Todas', qtd: resumo.campanhas },
    { v: 'positivas', rotulo: 'Bom retorno', qtd: resumo.positivas, icone: <ThumbsUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> },
    { v: 'negativas', rotulo: 'Sem retorno', qtd: resumo.negativas, icone: <ThumbsDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" /> },
    { v: 'sem_voto', rotulo: 'Sem avaliação', qtd: resumo.semVoto, icone: <Minus className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Resumo rotulo={resumo.campanhas === 1 ? 'campanha' : 'campanhas'} valor={resumo.campanhas} extra={`${n(resumo.enviadas)} de ${n(resumo.mensagens)} mensagens enviadas`} />
        <Resumo rotulo="bom retorno" valor={resumo.positivas} tom="bom" icone={<ThumbsUp className="h-4 w-4" />} />
        <Resumo rotulo="sem retorno" valor={resumo.negativas} tom="ruim" icone={<ThumbsDown className="h-4 w-4" />} />
        <Resumo rotulo="sem avaliação" valor={resumo.semVoto} icone={<Minus className="h-4 w-4" />} />
      </div>

      <div role="tablist" aria-label="Filtrar pela avaliação" className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
        {filtros.map((f) => (
          <button
            key={f.v} type="button" role="tab" aria-selected={filtro === f.v} onClick={() => setFiltro(f.v)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              filtro === f.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.icone}{f.rotulo}
            <span className={cn('rounded px-1 tabular-nums', filtro === f.v ? 'bg-muted' : '')}>{n(f.qtd)}</span>
          </button>
        ))}
      </div>

      {meses.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma campanha com essa avaliação.</p>
      ) : meses.map(([mes, itens]) => (
        <section key={mes} className="space-y-2">
          <h3 className="flex items-baseline gap-2 px-1 text-sm font-semibold">
            {nomeMes(mes)}
            <span className="text-xs font-normal text-muted-foreground">{n(itens.length)} {itens.length === 1 ? 'campanha' : 'campanhas'}</span>
          </h3>
          <ul className="space-y-2">
            {itens.map((p) => <LinhaParticipacao key={p.lote_id} p={p} onAbrir={onAbrir} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Resumo({ rotulo, valor, extra, tom, icone }: {
  rotulo: string; valor: number; extra?: string; tom?: 'bom' | 'ruim'; icone?: JSX.Element;
}) {
  return (
    <div className={cn(
      'rounded-xl border p-3.5',
      tom === 'bom' ? 'border-emerald-500/30 bg-emerald-500/5' : tom === 'ruim' ? 'border-red-500/30 bg-red-500/5' : 'border-border bg-card',
    )}>
      <div className={cn(
        'flex items-center gap-2',
        tom === 'bom' ? 'text-emerald-700 dark:text-emerald-400' : tom === 'ruim' ? 'text-red-700 dark:text-red-400' : 'text-foreground',
      )}>
        {icone}
        <span className="text-2xl font-bold tabular-nums leading-none">{n(valor)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{rotulo}</p>
      {extra && <p className="mt-0.5 text-[11px] text-muted-foreground">{extra}</p>}
    </div>
  );
}

function SeloVoto({ bom }: { bom: boolean | null }) {
  if (bom === true) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white" title="Você avaliou: bom retorno">
        <ThumbsUp className="h-5 w-5" />
      </span>
    );
  }
  if (bom === false) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white" title="Você avaliou: sem retorno">
        <ThumbsDown className="h-5 w-5" />
      </span>
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground" title="Sem avaliação">
      <Minus className="h-4 w-4" />
    </span>
  );
}

function LinhaParticipacao({ p, onAbrir }: { p: Participacao; onAbrir: (loteId: string) => boolean }) {
  const s = situacaoDaParticipacao(p);
  const pct = p.total > 0 ? Math.round((p.enviados / p.total) * 100) : 0;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3.5">
      <SeloVoto bom={p.bom} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium" title={p.titulo}>{p.titulo}</p>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', SITUACAO[s].cls)}>
            {SITUACAO[s].rotulo}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {p.liberada_por ? `Liberada por ${p.liberada_por} · ` : ''}{quando(p.lancada_em)}
          {p.setor_nome ? ` · ${p.setor_nome}` : ''}
          {p.bom === null && s === 'aberta' ? ' · ainda dá para avaliar' : ''}
        </p>
      </div>
      <div className="w-full space-y-1 sm:w-44">
        <div className="flex items-baseline justify-between text-xs">
          <span><strong className="tabular-nums">{n(p.enviados)}</strong><span className="text-muted-foreground">/{n(p.total)} enviadas</span></span>
          {p.nao_enviados > 0 && <span className="text-amber-700 dark:text-amber-400">{n(p.nao_enviados)} não deu</span>}
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
      {s === 'aberta' && (
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onAbrir(p.lote_id)}>Abrir</Button>
      )}
    </li>
  );
}
