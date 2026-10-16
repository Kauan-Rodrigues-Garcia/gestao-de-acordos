/**
 * PixPainelPremiacoes — a premiação da DOBRA, e quanto dela ainda sai.
 *
 * ## O que este painel responde, e o que ele deixou de responder
 *
 * Ele nasceu respondendo «quanto ainda falta para cada pessoa?» e listava todo
 * mundo com comissão no mês. Isso fazia dele uma segunda tabela do Pix
 * automático: as mesmas pessoas, os mesmos valores, e o mesmo controle de
 * pagamento que a lista de acordos já tem linha a linha.
 *
 * Agora só entra quem **dobrou**. A dobra é mensal, cruza dois requisitos (a
 * quantidade de acordos Pix e a meta de recebimento) e não pertence a nenhum
 * acordo — não existe linha onde carimbá-la, e era só ela que precisava de um
 * lugar próprio. Quem não dobrou continua sendo pago pela lista de acordos.
 *
 * O recorte mora em `painelPremiacoes`; aqui fica o desenho.
 *
 * ## 16/10/2026: virou a sub-aba «Premiação dobrada»
 *
 * Deixou de ser um card dobrável no meio da tela e passou a ser o assunto de
 * uma aba inteira — e o desenho mudou com isso:
 *
 *   • **o resumo vem primeiro**, em quatro números grandes: falta pagar, já
 *     pago, a premiação inteira e quantas pessoas dobraram/quitaram, com a
 *     barra do quanto da premiação já saiu;
 *   • **cada pessoa é um cartão**, com a foto (a mesma do pódio), a premiação
 *     em destaque e a conta «comissão × 2» embaixo, as três parcelas lado a
 *     lado e a barra do que já saiu dela;
 *   • **o recorte é «A pagar · Quitados · Todos»** — antes era só «só quem
 *     falta», e conferir quem já recebeu exigia desligar o filtro e procurar;
 *   • **pagar pede confirmação**: o botão diz o valor, e o segundo clique diz
 *     para quem. Num grid de cartões, um clique errado pagava a pessoa ao lado;
 *   • **quem está perto de dobrar** aparece embaixo (`pertoDeDobrar`). O painel
 *     ficava vazio o mês inteiro até o primeiro fechar os dois requisitos, sem
 *     dizer nada a quem cobra o time.
 *
 * ## As cores são as do Gestão, não do Pix (16/10/2026, segunda rodada)
 *
 * A primeira versão desta aba saiu em violeta com degradê, e o botão de pagar
 * era um bloco roxo cheio — «estranho, não combina com o Gestão nem com o
 * Pix», e destoava justamente na aba de PAGAMENTO, que pede sobriedade. Agora
 * tudo é token do tema: o destaque é o `primary` (o azul da marca), «pago» é
 * `success`, e o resto é neutro. «Pagar» é o botão de contorno padrão; o botão
 * cheio aparece só na confirmação, que é quando o dinheiro sai de fato. O
 * âmbar que saiu em 28/09/2026 («muito amarelo, destoando») não voltou.
 *
 * ## Marcar como pago QUITA — não é só um carimbo
 *
 * O clique registra o valor que saiu (o próprio «falta» daquele instante), e ele
 * entra no «já pago» — a mesma mecânica do pagamento por linha do Pix. Um fato,
 * um número.
 *
 * Premiação marcada antes desta mudança não tem valor gravado; ela é lida como
 * quitação total do que faltava. Ver `PagamentoMensalPremiacao`.
 *
 * ## As três parcelas ficam à vista
 *
 * Premiação, já pago e falta, sempre as três. O resultado sozinho seria mais
 * limpo e seria pior: um número que encolheu sem explicação é o tipo de coisa
 * que ninguém confere, porque não se sabe o que conferir.
 *
 * ## A divergência NÃO tem coluna aqui
 *
 * Ela teve uma, por um dia, e saiu a pedido do Cleber em 02/09/2026. O acerto
 * já acontece do outro lado — a liderança carimba o saldo num acordo pela ação
 * «Corrigir valor», e ele entra no pagamento por ali.
 *
 * ## Quem vê
 *
 * Só quem já podia ver o Pix dos outros. O painel é uma leitura do que já está
 * na tela — ele não busca nada por conta própria, recebe a mesma lista que a
 * tabela usa. Filtrou por equipe? O painel fala daquela equipe.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy, Check, Search, Loader2, Wallet, Undo2, X, CircleCheck, Circle,
  TrendingUp, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/index';
import { useEstadoLembrado } from '@/hooks/useEstadoLembrado';
import { AvatarParticipante } from '@/pages/Analitico/Desafios/AvatarParticipante';
import type { PixAutoAcordo } from '@/services/pix_automatico.service';
import type { MetaRecebimentoDobra } from './pixAutomaticoView';
import {
  painelPremiacoes, pertoDeDobrar, totalDoPainel, type Premiacao, type QuaseDobra,
} from './pixPremiacao';
import type { MesRef } from '@/lib/mesReferencia';
import type { PixPremiacaoPagamento } from '@/services/pix_automatico.service';

interface Props {
  itens: PixAutoAcordo[];
  pctPorSetor: Record<string, number>;
  mes: MesRef;
  nomePorOperador?: Record<string, string>;
  /** Meta de recebimento por operador — é ela que decide a dobra. */
  metaPorOperador?: Record<string, MetaRecebimentoDobra>;
  metaPorSetor?: Record<string, number>;
  pagamentos?: readonly PixPremiacaoPagamento[];
  podeMarcarPago?: boolean;
  alterandoOperadorId?: string | null;
  /** Foto de cada pessoa (`perfis.foto_url`). Sem foto, as iniciais. */
  fotoPorOperador?: Record<string, string | null>;
  /** «outubro de 2026» — para o vazio dizer de quando é. */
  rotuloMes?: string;
  /**
   * Prefixo da chave de memória do painel (busca, recorte).
   *
   * Vem de fora porque só quem chama conhece empresa, perfil e mês — sem eles a
   * escolha de uma pessoa reapareceria para a próxima que abrisse a aba.
   */
  chaveEstado?: string;
  /** `valorPago` é o que sai agora: o «falta pagar» da linha no clique. */
  onMarcarPago?: (
    operadorId: string, pago: boolean, valorPago: number,
  ) => void | Promise<void>;
}

type Recorte = 'a_pagar' | 'quitados' | 'todos';

const quitada = (l: Premiacao) => Math.abs(l.falta) < 0.005 || l.premiacaoPaga;

/** Um número grande do resumo. */
function Kpi({
  rotulo, valor, nota, cls, destaque,
}: {
  rotulo: string; valor: React.ReactNode; nota?: React.ReactNode; cls?: string; destaque?: boolean;
}) {
  return (
    <div className={cn('min-w-0 bg-card px-4 py-3.5', destaque && 'bg-muted/40')}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">
        {rotulo}
      </p>
      <p className={cn('mt-1.5 truncate font-mono text-lg font-bold tabular-nums leading-tight', cls)}>
        {valor}
      </p>
      {nota && <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** Uma parcela pequena dentro do cartão. */
function Parcela({ rotulo, valor, cls, nota }: {
  rotulo: string; valor: number; cls?: string; nota?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground leading-none">{rotulo}</p>
      <p className={cn('mt-1 truncate font-mono text-[13px] font-semibold tabular-nums leading-tight', cls)}>
        {formatCurrency(valor)}
      </p>
      {nota && <p className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground" title={nota}>{nota}</p>}
    </div>
  );
}

function CartaoPremiacao({
  l, foto, pagamento, podeMarcarPago, alterando, onMarcarPago,
}: {
  l: Premiacao;
  foto: string | null;
  pagamento?: PixPremiacaoPagamento;
  podeMarcarPago: boolean;
  alterando: boolean;
  onMarcarPago?: (
    operadorId: string, pago: boolean, valorPago: number,
  ) => void | Promise<void>;
}) {
  /** Esperando o segundo clique do «Pagar». */
  const [confirmando, setConfirmando] = useState(false);

  const deve = l.falta < -0.005;
  // O estado vem da conta, não do carimbo cru: é ela que já sabe ler a linha
  // antiga sem valor gravado.
  const pago = l.premiacaoPaga;
  const ok = quitada(l);
  const pctPago = l.premiacao > 0
    ? Math.min(Math.max((l.jaPago / l.premiacao) * 100, 0), 100)
    : 0;
  /* Marcar quita o que falta AGORA; negativo (pagou demais) vira zero — esse
     acerto é do saldo de divergência, não daqui. */
  const valorAPagar = Math.max(l.falta, 0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4 transition-colors',
        ok
          ? 'border-success/25 bg-success/[0.03]'
          : 'border-border bg-card hover:border-foreground/20',
      )}
    >
      {/* ── Quem, e em que pé está ── */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <AvatarParticipante nome={l.nome} fotoUrl={foto} className="h-11 w-11" />
          <span className={cn(
            'absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-card',
            ok ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground',
          )}>
            {ok ? <Check className="h-3 w-3" /> : <Trophy className="h-2.5 w-2.5" />}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{l.nome}</p>
          <p className={cn(
            'text-[11px] tabular-nums',
            deve ? 'text-destructive' : ok ? 'text-success' : 'text-muted-foreground',
          )}>
            {ok ? 'Premiação quitada' : deve ? 'Saiu a mais que o devido' : `${Math.round(pctPago)}% já pago`}
          </p>
        </div>
        <div className="shrink-0 text-right" title={`Comissão de ${formatCurrency(l.comissao)} dobrada por bater os dois requisitos`}>
          <p className="font-mono text-base font-bold tabular-nums leading-tight text-foreground">
            {formatCurrency(l.premiacao)}
          </p>
          <p className="text-[10px] tabular-nums text-muted-foreground">{formatCurrency(l.comissao)} × 2</p>
        </div>
      </div>

      {/* ── A barra do que já saiu ── */}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-500',
            ok ? 'bg-success' : 'bg-primary')}
          style={{ width: `${ok ? 100 : pctPago}%` }}
        />
      </div>

      {/* ── As parcelas ── */}
      <div className="grid grid-cols-2 gap-3">
        <Parcela
          rotulo="Já pago"
          valor={l.jaPago}
          cls="text-muted-foreground"
          /* Quanto veio do carimbo mensal: sem isto o «já pago» sobe sozinho
             depois do clique e parece número que apareceu do nada.
             O acerto de divergência entra na nota, e NÃO no valor: ele é dívida
             de outro mês, e somá-lo aqui descontaria da premiação deste. */
          nota={[
            l.pagoNaPremiacao > 0
              ? `${formatCurrency(l.pagoNaPremiacao)} na premiação`
              : null,
            Math.abs(l.ajustesPagos) >= 0.005
              ? `${l.ajustesPagos > 0 ? '+' : '−'}${formatCurrency(Math.abs(l.ajustesPagos))} de acerto, à parte`
              : null,
          ].filter(Boolean).join(' · ') || undefined}
        />
        <Parcela
          rotulo="Falta pagar"
          valor={l.falta}
          cls={deve
            ? 'text-destructive'
            : ok ? 'text-muted-foreground' : 'text-foreground'}
          nota={deve ? 'Negativo: já saiu mais do que era devido' : undefined}
        />
      </div>

      {/* ── Ação ──────────────────────────────────────────────────────────
          O botão diz o valor; a confirmação diz para quem. Pago, o cartão
          mostra quem pagou e quando — por escrito, e não só no passar do mouse. */}
      <div className="mt-auto">
        {podeMarcarPago && !pago ? (
          confirmando ? (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                disabled={alterando}
                onClick={async () => {
                  await onMarcarPago?.(l.operadorId, true, valorAPagar);
                  setConfirmando(false);
                }}
                aria-label={`Confirmar o pagamento da premiação de ${l.nome}`}
                className="h-8 flex-1 gap-1.5 text-xs"
              >
                {alterando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirmar {formatCurrency(valorAPagar)}
              </Button>
              <Button
                size="sm" variant="ghost"
                disabled={alterando}
                onClick={() => setConfirmando(false)}
                aria-label="Cancelar o pagamento"
                className="h-8 px-2.5 text-xs text-muted-foreground"
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="sm" variant="outline"
              disabled={alterando}
              onClick={() => setConfirmando(true)}
              aria-label={`Marcar a premiação de ${l.nome} como paga`}
              className="h-8 w-full gap-1.5 text-xs"
            >
              {alterando
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Wallet className="h-3.5 w-3.5 text-muted-foreground" />}
              Pagar {formatCurrency(valorAPagar)}
            </Button>
          )
        ) : (
          <div className="flex items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider',
              pago
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-border bg-muted/40 text-muted-foreground',
            )}>
              {pago ? <Check className="h-3 w-3" /> : null}
              {pago ? 'Pago' : 'Não pago'}
            </span>
            {pago && pagamento?.pago_por_nome && (
              <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">
                {pagamento.pago_por_nome}
                {pagamento.pago_em ? ` · ${new Date(pagamento.pago_em).toLocaleDateString('pt-BR')}` : ''}
              </span>
            )}
            {podeMarcarPago && pago && (
              <button
                type="button"
                disabled={alterando}
                onClick={() => void onMarcarPago?.(l.operadorId, false, 0)}
                title="Desfazer o pagamento desta premiação"
                aria-label={`Desfazer o pagamento da premiação de ${l.nome}`}
                className="ml-auto flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[10.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {alterando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                Desfazer
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Um requisito da dobra, em pílula: ✓ fechado, ○ com o quanto falta. */
function Requisito({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] tabular-nums',
      ok
        ? 'border-success/30 bg-success/10 text-success'
        : 'border-border bg-muted/40 text-muted-foreground',
    )}>
      {ok ? <CircleCheck className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
      {texto}
    </span>
  );
}

function LinhaQuase({ q, foto }: { q: QuaseDobra; foto: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
      <AvatarParticipante nome={q.nome} fotoUrl={foto} className="h-8 w-8 shrink-0" />
      <div className="min-w-[140px] flex-1">
        <p className="truncate text-xs font-semibold text-foreground">{q.nome}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <Requisito
            ok={q.acordosOk}
            texto={q.acordosOk ? `${q.feitos}/${q.meta} acordos` : `${q.feitos}/${q.meta} acordos · faltam ${q.faltamAcordos}`}
          />
          <Requisito
            ok={q.metaOk}
            texto={!q.metaDefinida
              ? 'sem meta no mês'
              : q.metaOk ? `meta ${q.pctMeta}%` : `meta ${q.pctMeta}% · faltam ${formatCurrency(q.faltaMeta)}`}
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground leading-none">Se dobrar</p>
        <p className="mt-1 font-mono text-xs font-semibold tabular-nums text-foreground">
          +{formatCurrency(q.comissao)}
        </p>
      </div>
    </div>
  );
}

export function PixPainelPremiacoes({
  itens, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor,
  pagamentos = [], podeMarcarPago = false, alterandoOperadorId,
  fotoPorOperador = {}, rotuloMes, chaveEstado = 'pix-premiacoes', onMarcarPago,
}: Props) {
  const [busca, setBusca] = useEstadoLembrado(`${chaveEstado}|busca`, '');
  const [recorte, setRecorte] = useEstadoLembrado<Recorte>(`${chaveEstado}|recorte`, 'a_pagar');

  const pagamentoPorOperador = useMemo(
    () => new Map(pagamentos.map(p => [p.operador_id, p])),
    [pagamentos],
  );

  /** O carimbo mensal no formato que a conta entende. */
  const carimbos = useMemo(() => {
    const m: Record<string, { pago: boolean; valorPago?: number | null }> = {};
    for (const p of pagamentos) {
      m[p.operador_id] = {
        pago: p.pago === true,
        valorPago: p.valor_pago == null ? null : Number(p.valor_pago),
      };
    }
    return m;
  }, [pagamentos]);

  const linhas = useMemo(
    () => painelPremiacoes({
      itens, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor,
      pagamentoPorOperador: carimbos,
    }),
    [itens, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor, carimbos],
  );

  const quase = useMemo(
    () => pertoDeDobrar({ itens, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor }),
    [itens, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor],
  );

  const total = useMemo(() => totalDoPainel(linhas), [linhas]);
  // O «falta» de cada linha já desconta o carimbo mensal — somar é o bastante.
  const faltaPagar = total.falta;
  const nQuitadas = useMemo(() => linhas.filter(quitada).length, [linhas]);
  const nAPagar = linhas.length - nQuitadas;
  const pctGeral = total.premiacao > 0
    ? Math.min(Math.max(Math.round((total.jaPago / total.premiacao) * 100), 0), 100)
    : 0;

  /*
   * O recorte guardado é a escolha da pessoa, mas não pode abrir a aba vazia
   * quando há o que ver: «A pagar» com tudo quitado mostra os quitados.
   */
  const recorteEfetivo: Recorte = recorte === 'a_pagar' && nAPagar === 0 && nQuitadas > 0
    ? 'quitados'
    : recorte;

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas
      .filter(l => (termo ? l.nome.toLowerCase().includes(termo) : true))
      .filter(l => recorteEfetivo === 'todos'
        ? true
        : recorteEfetivo === 'quitados' ? quitada(l) : !quitada(l));
  }, [linhas, busca, recorteEfetivo]);

  const recortes: { key: Recorte; label: string; n: number }[] = [
    { key: 'a_pagar',  label: 'A pagar',  n: nAPagar },
    { key: 'quitados', label: 'Quitados', n: nQuitadas },
    { key: 'todos',    label: 'Todos',    n: linhas.length },
  ];

  return (
    <div className="space-y-4">
      {/* ── O resumo de quem paga ───────────────────────────────────────── */}
      <Card className="overflow-hidden border-border">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Trophy className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground leading-tight">Premiação dobrada a pagar</h2>
            <p className="text-[11px] text-muted-foreground">
              Quem cumpriu os dois requisitos do mês recebe a comissão de novo.
              Quem não dobrou é pago pela lista de Registros.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border-t border-border bg-border lg:grid-cols-4">
          <Kpi
            rotulo="Falta pagar" destaque
            valor={formatCurrency(faltaPagar)}
            cls={faltaPagar > 0.005 ? 'text-foreground' : 'text-muted-foreground'}
            nota={nAPagar > 0 ? `${nAPagar} ${nAPagar === 1 ? 'pessoa' : 'pessoas'} a pagar` : 'nada pendente'}
          />
          <Kpi
            rotulo="Já pago"
            valor={formatCurrency(total.jaPago)}
            cls="text-success"
            nota={`${pctGeral}% da premiação`}
          />
          <Kpi
            rotulo="Premiação total"
            valor={formatCurrency(total.premiacao)}
            nota={`bônus da dobra: ${formatCurrency(total.bonus)}`}
          />
          <Kpi
            rotulo="Dobraram"
            valor={<span className="font-sans">{linhas.length}</span>}
            nota={`${nQuitadas} de ${linhas.length} ${nQuitadas === 1 ? 'quitada' : 'quitadas'}`}
          />
        </div>

        {linhas.length > 0 && (
          <div className="border-t border-border px-5 py-3">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all duration-700',
                  pctGeral >= 100 ? 'bg-success' : 'bg-primary')}
                style={{ width: `${pctGeral}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* ── As pessoas que dobraram ─────────────────────────────────────── */}
      {linhas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Trophy className="h-7 w-7 text-muted-foreground/30" />
          <p className="text-sm font-medium text-foreground">
            Ninguém dobrou a comissão{rotuloMes ? ` em ${rotuloMes}` : ''} ainda
          </p>
          <p className="max-w-md text-[11px] text-muted-foreground">
            A dobra fecha quando a pessoa cumpre a meta de acordos Pix do setor E a
            meta de recebimento do mês.{quase.length > 0 ? ' Veja abaixo quem está perto.' : ''}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Procurar pessoa"
                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-8 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              {busca && (
                <button
                  type="button" onClick={() => setBusca('')}
                  aria-label="Limpar a busca"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div role="group" aria-label="Recorte da premiação"
              className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
              {recortes.map(r => (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={recorteEfetivo === r.key}
                  onClick={() => setRecorte(r.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    recorteEfetivo === r.key
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r.label}
                  <span className={cn(
                    'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                    recorteEfetivo === r.key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    {r.n}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {visiveis.length === 0 ? (
            <p className="rounded-xl border border-border px-4 py-8 text-center text-xs text-muted-foreground">
              {busca.trim() ? 'Ninguém com esse nome.' : 'Nada neste recorte.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visiveis.map(l => (
                <CartaoPremiacao
                  key={l.operadorId}
                  l={l}
                  foto={fotoPorOperador[l.operadorId] ?? null}
                  pagamento={pagamentoPorOperador.get(l.operadorId)}
                  podeMarcarPago={podeMarcarPago}
                  alterando={alterandoOperadorId === l.operadorId}
                  onMarcarPago={onMarcarPago}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Perto de dobrar ─────────────────────────────────────────────── */}
      {quase.length > 0 && (
        <Card className="overflow-hidden border-border">
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-foreground">Perto de dobrar</p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                Um requisito fechado, ou 70% de um deles. O valor é o que a dobra pagaria a mais hoje.
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> {quase.length}
            </span>
          </div>
          <div className="divide-y divide-border">
            {quase.map(q => (
              <LinhaQuase key={q.operadorId} q={q} foto={fotoPorOperador[q.operadorId] ?? null} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
