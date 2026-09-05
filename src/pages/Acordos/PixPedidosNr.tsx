/**
 * PixPedidosNr — a fila de NRs duplicados esperando decisão.
 *
 * ## Por que existe
 *
 * Um Pix cai para o operador do Play 3, que registra o NR 2222. Depois o
 * Receptivo lança o mesmo recebimento. Até 02/09/2026 o segundo registro era
 * simplesmente recusado, com a mensagem «exclua o registro existente para
 * liberá-lo» — o que punha a decisão no pior lugar possível: quem apagaria
 * seria o operador do OUTRO setor, que não sabe do caso e não deveria poder
 * desfazer registro alheio.
 *
 * Agora o segundo vira pedido, e a decisão fica com quem já decide Pix.
 *
 * ## A fila é do SETOR
 *
 * Até 05/09/2026 ela era da empresa: quem podia aprovar Pix recebia a
 * duplicidade de qualquer setor. Na prática o líder do Play 3 abria a aba e
 * encontrava um NR do Receptivo para autorizar — um caso que ele não
 * acompanhou, entre duas pessoas que ele não gerencia. Decidir aquilo era
 * decidir no escuro; não decidir deixava a fila suja para todo mundo.
 *
 * Agora o recorte segue o setor em foco da aba (ver `pedidosDoSetor`). Em
 * «Todos os setores» a fila volta a ser inteira, e aí cada cartão carimba de
 * qual setor é — sem isso, a lista misturada mentiria por omissão.
 *
 * ## O cartão mostra os DOIS lados
 *
 * Quem registrou primeiro e quem está pedindo, com valor e data de cada um.
 * Sem isso a decisão seria no escuro: «autorizar NR 2222» não diz se os valores
 * batem, se é a mesma pessoa tentando de novo, ou se são dois recebimentos de
 * verdade no mesmo contrato.
 *
 * A etiqueta EXTRA aparece aqui em destaque, e é justamente o caso em que ela
 * serve: ela não muda regra nenhuma — o pedido veio para cá do mesmo jeito —,
 * mas diz que quem lançou já sabia que podia haver duplicidade.
 *
 * ## Aprovar não é aprovar a comissão
 *
 * O acordo nasce PENDENTE. Autorizar a duplicidade responde «este segundo
 * lançamento pode existir»; se ele merece comissão é a avaliação de sempre, na
 * lista. Duas perguntas, duas decisões — juntá-las faria o líder aprovar
 * comissão sem olhar o valor.
 */
import { useState } from 'react';
import {
  ShieldQuestion, Check, X, ArrowRight, Loader2, Sparkles, ChevronDown, Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/index';
import { decidirPedidoNr, cancelarPedidoNr, type PixNrPedido } from '@/services/pix_automatico.service';

interface Props {
  pedidos: PixNrPedido[];
  /** Quem pode aprovar ou recusar. Sem isto, o cartão é só informativo. */
  podeDecidir: boolean;
  /** Para o dono poder desistir do próprio pedido. */
  meuId: string | null;
  /**
   * Nome de cada setor, por id — só preenchido em «Todos os setores».
   *
   * Com um setor em foco a fila já é daquele setor, e carimbar o nome em toda
   * linha seria repetir o óbvio. Em «Todos» ele é o que separa dois casos que
   * só por acaso estão na mesma lista.
   */
  nomePorSetor?: Record<string, string>;
  /** Mostra o setor em cada cartão. Ligado apenas em «Todos os setores». */
  mostrarSetor?: boolean;
  onMudou: () => void;
}

/** '2026-09-02T13:40:00Z' → '02/09 13:40'. */
function quando(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** Um lado do conflito: quem, quanto, quando. */
function Lado({
  titulo, nome, valor, em, destaque, extra,
}: {
  titulo: string;
  nome: string | null;
  valor: number | null;
  em: string | null;
  destaque?: boolean;
  extra?: boolean;
}) {
  return (
    <div className={cn(
      'min-w-0 rounded-lg border px-2.5 py-2',
      destaque ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30',
    )}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
        {titulo}
      </p>
      <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-medium leading-tight">
        <span className="truncate">{nome ?? '—'}</span>
        {extra && (
          <Badge
            variant="outline"
            className="h-4 shrink-0 gap-0.5 border-fuchsia-500/40 px-1 text-[9px] font-bold uppercase text-fuchsia-600 dark:text-fuchsia-400"
            title="Marcado como Extra por quem lançou — confira duas vezes"
          >
            <Sparkles className="h-2.5 w-2.5" /> extra
          </Badge>
        )}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
        <span className="tabular-nums">{valor != null ? formatCurrency(valor) : '—'}</span>
        <span className="mx-1">·</span>
        <span className="tabular-nums">{quando(em)}</span>
      </p>
    </div>
  );
}

function CartaoPedido({ p, podeDecidir, meuId, nomeSetor, onMudou }: {
  p: PixNrPedido; podeDecidir: boolean; meuId: string | null;
  nomeSetor: string | null; onMudou: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [recusando, setRecusando] = useState(false);

  const meu = meuId != null && (p.operador_id === meuId || p.criado_por === meuId);

  async function decidir(aprovar: boolean) {
    setOcupado(true);
    try {
      const { ok, error } = await decidirPedidoNr(p.id, aprovar, motivo || null);
      if (!ok) { toast.error(error ?? 'Não foi possível decidir.'); return; }
      toast.success(aprovar
        ? `NR ${p.nr_cliente} autorizado — o registro entrou como pendente de avaliação.`
        : `NR ${p.nr_cliente} recusado.`);
      onMudou();
    } finally { setOcupado(false); }
  }

  async function desistir() {
    setOcupado(true);
    try {
      const { ok, error } = await cancelarPedidoNr(p.id);
      if (!ok) { toast.error(error ?? 'Não foi possível cancelar.'); return; }
      toast.success('Pedido cancelado.');
      onMudou();
    } finally { setOcupado(false); }
  }

  return (
    <div className="border-t border-border/60 px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
          NR {p.nr_cliente}
        </span>
        {nomeSetor && (
          <Badge
            variant="outline"
            className="h-5 shrink-0 gap-1 border-violet-500/40 px-1.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400"
          >
            <Building2 className="h-2.5 w-2.5" /> {nomeSetor}
          </Badge>
        )}
        <span className="text-[11px] text-muted-foreground">
          pedido em {quando(p.criado_em)}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <Lado
          titulo="Já registrado por"
          nome={p.conflito_operador}
          valor={p.conflito_valor}
          em={p.conflito_em}
        />
        <ArrowRight className="mx-auto hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
        <Lado
          titulo="Quer registrar"
          nome={p.operador_nome}
          valor={p.valor}
          em={p.criado_em}
          destaque
          extra={p.extra}
        />
      </div>

      {p.motivo && (
        <p className="mt-2 rounded-lg border-l-2 border-primary/40 bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed">
          <span className="text-muted-foreground">Justificativa: </span>{p.motivo}
        </p>
      )}

      {p.conflito_acordo_id == null && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
          O registro em conflito foi excluído depois deste pedido. Os dados acima
          são a cópia guardada no momento do pedido.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {podeDecidir ? (
          <>
            {recusando && (
              <input
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                autoFocus
                placeholder="Por que está recusando? (opcional)"
                className="min-w-[180px] flex-1 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            )}
            <Button
              size="sm" className="h-7 gap-1.5 text-xs"
              disabled={ocupado}
              onClick={() => void decidir(true)}
            >
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Autorizar
            </Button>
            <Button
              size="sm" variant="outline"
              className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
              disabled={ocupado}
              onClick={() => (recusando ? void decidir(false) : setRecusando(true))}
            >
              <X className="h-3.5 w-3.5" />
              {recusando ? 'Confirmar recusa' : 'Recusar'}
            </Button>
            {recusando && (
              <Button size="sm" variant="ghost" className="h-7 text-xs"
                      disabled={ocupado} onClick={() => { setRecusando(false); setMotivo(''); }}>
                Cancelar
              </Button>
            )}
          </>
        ) : meu ? (
          <>
            <span className="text-[11px] text-muted-foreground">
              Aguardando a decisão do líder.
            </span>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
                    disabled={ocupado} onClick={() => void desistir()}>
              Desistir
            </Button>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Aguardando decisão.
          </span>
        )}
      </div>
    </div>
  );
}

export function PixPedidosNr({
  pedidos, podeDecidir, meuId, nomePorSetor, mostrarSetor = false, onMudou,
}: Props) {
  const [aberto, setAberto] = useState(true);
  if (pedidos.length === 0) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.03]">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setAberto(a => !a)}
          aria-expanded={aberto}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-amber-500/5"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
            <ShieldQuestion className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">
              {pedidos.length} {pedidos.length === 1 ? 'NR duplicado' : 'NRs duplicados'} aguardando
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">
              {podeDecidir
                ? 'Alguém tentou registrar um NR que já existe. Veja os dois lados e decida.'
                : 'Seu pedido está na fila do líder.'}
            </p>
          </div>
          <ChevronDown className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            aberto && 'rotate-180',
          )} />
        </button>

        {aberto && pedidos.map(p => (
          <CartaoPedido
            key={p.id} p={p} podeDecidir={podeDecidir} meuId={meuId}
            /* Pedido sem setor só chega aqui em «Todos» (ver `pedidosDoSetor`), e
               ali ele precisa dizer que é sem setor — calado, pareceria do setor
               do cartão de cima. */
            nomeSetor={mostrarSetor
              ? (p.setor_id ? (nomePorSetor?.[p.setor_id] ?? 'Setor desconhecido') : 'Sem setor')
              : null}
            onMudou={onMudou}
          />
        ))}
      </CardContent>
    </Card>
  );
}
