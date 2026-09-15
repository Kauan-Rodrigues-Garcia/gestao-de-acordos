/**
 * Vendas — a aba do Comercial.
 *
 * ## O dia é a unidade, e ele fica salvo
 *
 * «O dia 07 tem 5 vendas anotadas, fica salvo nesse dia, e para o próximo dia
 * assim que o dia virar, ficando limpo.» Não é uma planilha corrida: é uma
 * pilha de dias, o de hoje aberto em cima e os anteriores logo abaixo, cada um
 * com o próprio total.
 *
 * ## As duas populações da tela
 *
 * O placar mostra só o que está **confirmado E assinado**. O que fica de fora
 * não some — aparece ao lado, em gavetas com nome, porque cada uma é uma
 * conversa diferente: pendente de assinatura é cobrança do líder, devolvida e
 * cancelada são perda medida, aberta é trabalho em andamento.
 *
 * A régua mora em `@/lib/vendas` e, no banco, em duas colunas geradas. Esta
 * tela nunca a reimplementa.
 *
 * ## O eixo declarado
 *
 * A tela diz qual eixo está no ar, sempre. Pela confirmação, uma venda de junho
 * confirmada em setembro aparece em setembro — e a venda ainda aberta não
 * aparece, porque não tem data de confirmação. Pela data da venda, o contrário.
 * As duas leituras estão certas; o que seria errado é não dizer qual está
 * valendo.
 */
import { useMemo, useState } from 'react';
import {
  ShoppingBag, Plus, RefreshCw, TriangleAlert, Info, PenLine, Trash2,
  CheckCircle2, Clock, Target, Wallet, Percent,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { KpiTile } from '@/components/KpiTile';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { useVendas } from '@/hooks/useVendas';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/index';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { cn } from '@/lib/utils';
import {
  classificarVenda, resumirVendas, agruparPorDia,
  GAVETA_LABELS, GAVETA_COLORS, GAVETAS_EM_ORDEM,
  type EixoDaVenda, type GavetaVenda,
} from '@/lib/vendas';
import type { Venda } from '@/services/vendas/vendas.service';
import { FormularioVenda } from './FormularioVenda';
import { FilaDoLider } from './FilaDoLider';

/** O `Select` do shadcn recusa `value=""`; o «todos» precisa de um valor. */
const TODOS_OPERADORES = '__todos__';

function Aviso({ tom, children }: { tom: 'alerta' | 'info'; children: React.ReactNode }) {
  const Icone = tom === 'alerta' ? TriangleAlert : Info;
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px]',
      tom === 'alerta'
        ? 'border-amber-500/40 bg-amber-500/5 text-foreground'
        : 'border-border bg-muted/30 text-muted-foreground',
    )}>
      <Icone className={cn('mt-0.5 h-4 w-4 shrink-0',
        tom === 'alerta' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function EtiquetaGaveta({ gaveta }: { gaveta: GavetaVenda }) {
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', GAVETA_COLORS[gaveta])}>
      {GAVETA_LABELS[gaveta]}
    </Badge>
  );
}

function LinhaVenda({
  venda, podeEditar, podeExcluir, onEditar, onExcluir,
}: {
  venda: Venda;
  podeEditar: boolean;
  podeExcluir: boolean;
  onEditar: (v: Venda) => void;
  onExcluir: (v: Venda) => void;
}) {
  const gaveta = classificarVenda(venda);
  // A linha que veio do relatório geral é o retrato oficial: editá-la à mão
  // seria desfeito pela próxima importação, em silêncio. O banco recusa, e a
  // tela não oferece.
  const doGeral = venda.origem === 'geral';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-accent/30">
      <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
        {venda.nr_documento}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {venda.cliente || <span className="text-muted-foreground">sem cliente</span>}
      </span>
      {venda.uf?.trim() && (
        <span className="text-[11px] font-medium text-muted-foreground">{venda.uf.trim()}</span>
      )}
      <EtiquetaGaveta gaveta={gaveta} />
      <span className={cn(
        'w-28 text-right text-[13px] font-semibold tabular-nums',
        gaveta === 'na_meta' ? 'text-foreground' : 'text-muted-foreground line-through',
      )}>
        {formatBRL(venda.valor_total)}
      </span>
      <div className="flex items-center gap-0.5">
        {podeEditar && !doGeral && (
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => onEditar(venda)} aria-label={`Corrigir a venda ${venda.nr_documento}`}>
            <PenLine className="h-3.5 w-3.5" />
          </Button>
        )}
        {podeExcluir && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onExcluir(venda)} aria-label={`Excluir a venda ${venda.nr_documento}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Vendas() {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();

  const [eixo, setEixo] = useState<EixoDaVenda>('confirmacao');
  const [formAberto, setFormAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Venda | null>(null);
  const [filtroOperador, setFiltroOperador] = useState<string>(TODOS_OPERADORES);

  const empresaId = empresa?.id ?? null;
  const {
    vendas, resumo: resumoTudo, pendentes, carregando, disponivel, erro,
    recarregar, salvar, confirmar, excluir,
  } = useVendas({ empresaId, mes, eixo, ativo: Boolean(empresaId) });

  /*
   * O filtro por operador só existe para quem enxerga mais de uma pessoa.
   *
   * Quem tem apenas `individual` vê a própria carteira e nada mais — oferecer
   * um seletor com um nome só seria um controle que não controla nada, que é o
   * defeito que o catálogo de permissões inteiro existe para não cometer.
   *
   * A régua de QUEM aparece continua sendo a RLS; isto só estreita o que já
   * chegou. Por isso o filtro é feito em memória, sobre o mês carregado.
   */
  const niveis = niveisLiberados('vendas', temPermissao);
  const veAlemDeSi = niveis.some(n => n !== 'individual');

  const operadores = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const v of vendas) {
      mapa.set(v.operador_id, v.perfis?.nome ?? 'Sem nome');
    }
    return [...mapa].map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [vendas]);

  const vendasNaTela = useMemo(
    () => (filtroOperador === TODOS_OPERADORES
      ? vendas
      : vendas.filter(v => v.operador_id === filtroOperador)),
    [vendas, filtroOperador],
  );

  // Recalcula sobre o recorte visível: o placar tem de responder ao filtro, ou
  // a tela mostra um total que não corresponde à lista logo abaixo dele.
  const filtrando = filtroOperador !== TODOS_OPERADORES;
  const resumo = useMemo(
    () => (filtrando ? resumirVendas(vendasNaTela) : resumoTudo),
    [filtrando, vendasNaTela, resumoTudo],
  );
  const porDia = useMemo(() => agruparPorDia(vendasNaTela, eixo), [vendasNaTela, eixo]);

  const podeCriar    = temPermissao('criar_vendas');
  const podeEditar   = temPermissao('editar_vendas');
  const podeExcluir  = temPermissao('excluir_vendas');
  const podeConfirmar = temPermissao('confirmar_vendas');

  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

  const foraDaRegua = useMemo(
    () => GAVETAS_EM_ORDEM.filter(g => g !== 'na_meta' && resumo.porGaveta[g] > 0),
    [resumo],
  );

  async function onExcluir(venda: Venda) {
    const r = await excluir(venda.id, null);
    if (!r.ok) { toast.error(r.erro ?? 'Não foi possível excluir a venda.'); return; }
    toast.success('Venda na lixeira. Sete dias para restaurar.');
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <ShoppingBag className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Vendas</h1>
            <p className="text-[12px] text-muted-foreground">
              {rotuloDoMes(mes)} · {eixo === 'confirmacao'
                ? 'pelo dia da confirmação'
                : 'pelo dia da venda'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={eixo} onValueChange={v => setEixo(v as EixoDaVenda)}>
            <TabsList className="h-8">
              <TabsTrigger value="confirmacao" className="text-[12px]">Confirmação</TabsTrigger>
              <TabsTrigger value="venda" className="text-[12px]">Data da venda</TabsTrigger>
            </TabsList>
          </Tabs>
          {veAlemDeSi && operadores.length > 1 && (
            <Select value={filtroOperador} onValueChange={setFiltroOperador}>
              <SelectTrigger className="h-8 w-[180px] text-[12px]" aria-label="Filtrar por operador">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS_OPERADORES}>Todos os operadores</SelectItem>
                {operadores.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <SeletorMes mes={mes} onChange={setMes} desabilitado={carregando} />
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={recarregar} disabled={carregando} aria-label="Recarregar">
            <RefreshCw className={cn('h-4 w-4', carregando && 'animate-spin')} />
          </Button>
          {podeCriar && disponivel && (
            <Button size="sm" onClick={() => { setEmEdicao(null); setFormAberto(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Lançar venda
            </Button>
          )}
        </div>
      </div>

      {!disponivel && (
        <Aviso tom="alerta">
          A aba Vendas ainda não foi instalada neste banco. A migration
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
            20260915100000_vendas_fase1.sql
          </code>
          precisa ser aplicada antes que qualquer venda possa ser lançada.
        </Aviso>
      )}
      {erro && <Aviso tom="alerta">{erro}</Aviso>}

      {/* ── O placar ───────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          rotulo="Vendas na meta" valor={resumo.quantidade}
          sub="confirmadas e assinadas" Icon={CheckCircle2} tom="sucesso"
        />
        <KpiTile
          rotulo="Faturamento" valor={formatBRL(resumo.valor)}
          sub="só o que conta" Icon={Target} tom="primario"
        />
        <KpiTile
          rotulo="Recebido" valor={formatBRL(resumo.recebido)}
          sub={resumo.comEntrada > 0
            ? `${resumo.comEntrada} com entrada · ${formatBRL(resumo.entrada)}`
            : 'sem entrada registrada'}
          Icon={Wallet} tom="neutro"
        />
        <KpiTile
          rotulo="Devolução / cancelamento"
          valor={`${pct(resumo.pctDevolucao)} / ${pct(resumo.pctCancelamento)}`}
          sub="sobre o que foi confirmado" Icon={Percent} tom="alerta"
        />
      </div>

      {/* ── O que ficou de fora da régua ───────────────────────────────── */}
      {foraDaRegua.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Fora da meta
          </span>
          {foraDaRegua.map(g => (
            <span key={g} className="flex items-center gap-1.5 text-[12px]">
              <EtiquetaGaveta gaveta={g} />
              <span className="tabular-nums text-muted-foreground">
                {resumo.porGaveta[g]} · {formatBRL(resumo.valorPorGaveta[g])}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* ── A fila do líder ────────────────────────────────────────────── */}
      {podeConfirmar && pendentes.length > 0 && (
        <FilaDoLider vendas={pendentes} onConfirmar={confirmar} />
      )}

      {/* ── A pilha de dias ────────────────────────────────────────────── */}
      {carregando && porDia.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : porDia.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <Clock className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm font-medium">Nenhuma venda em {rotuloDoMes(mes)}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {eixo === 'confirmacao'
              ? 'Pelo dia da confirmação, venda ainda em aberto não aparece — troque para «Data da venda» para vê-las.'
              : 'Lançar a primeira venda do mês abre o dia de hoje.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {porDia.map(({ dia, vendas }) => {
            const naMeta = vendas.filter(v => v.conta_na_meta);
            const total = naMeta.reduce((s, v) => s + v.valor_na_meta, 0);
            return (
              <section key={dia} className="overflow-hidden rounded-xl border border-border bg-card">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                  <h2 className="text-[13px] font-semibold">{formatDate(dia)}</h2>
                  <p className="text-[12px] tabular-nums text-muted-foreground">
                    <strong className="text-foreground">{naMeta.length}</strong> na meta
                    {vendas.length !== naMeta.length && <> de {vendas.length}</>}
                    {' · '}
                    <strong className="text-foreground">{formatBRL(total)}</strong>
                  </p>
                </header>
                <div>
                  {vendas.map(v => (
                    <LinhaVenda
                      key={v.id} venda={v}
                      podeEditar={podeEditar} podeExcluir={podeExcluir}
                      onEditar={x => { setEmEdicao(x); setFormAberto(true); }}
                      onExcluir={x => { void onExcluir(x); }}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <FormularioVenda
        aberto={formAberto}
        onFechar={() => { setFormAberto(false); setEmEdicao(null); }}
        venda={emEdicao}
        operadorId={emEdicao?.operador_id ?? perfil?.id ?? ''}
        onSalvar={salvar}
      />
    </div>
  );
}
