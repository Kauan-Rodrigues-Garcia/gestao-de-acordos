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
 * ## Por que o desenho mudou
 *
 * A versão anterior era um `<Card>` neutro com uma grade de 720 px de largura
 * mínima, cabeçalho de colunas e um `<Switch>` de «Foi pago?». No meio de uma
 * tela feita de cartões com gradiente, ícone e número em fonte mono, ele parecia
 * outro sistema — e o interruptor não parecia um pagamento, parecia uma
 * preferência.
 *
 * ## 28/09/2026: sem o âmbar, e em colunas
 *
 * A moldura âmbar com gradiente (e o botão amarelo de pagar) gritava mais que
 * tudo na aba — «muito amarelo, destoando do Pix automático e da página». O
 * painel passou a ser um `Card` neutro com o violeta que as outras seções do
 * Pix usam (`PixMetaPainel`, `PixSaldoPainel`), e as pessoas viraram LINHAS de
 * uma tabela: Premiação, Já pago e Falta pagar alinhados em coluna, para o olho
 * descer a lista comparando valor com valor. O cabeçalho resume o que importa
 * para quem paga: quanto falta, quanto já saiu e quantos estão quitados.
 * Verde continua sendo «pago»; o âmbar saiu de vez.
 *
 * **Pagar virou botão.** «Pagar R$ 412,30» diz o que vai acontecer e quanto —
 * um interruptor não dizia nem uma coisa nem outra. Pago, a linha mostra o
 * carimbo verde com quem pagou e quando, e o desfazer fica ao lado, discreto,
 * porque desfazer é a exceção.
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
 * que ninguém confere, porque não se sabe o que conferir. E como a premiação
 * aqui é sempre dobrada, a conta «R$ 1.039,18 × 2» fica escrita embaixo — senão
 * o valor cheio pareceria erro para quem sabe de cor quanto a pessoa fez.
 *
 * ## A divergência NÃO tem coluna aqui
 *
 * Ela teve uma, por um dia, e saiu a pedido do Cleber em 02/09/2026. O acerto
 * já acontece do outro lado — a liderança carimba o saldo num acordo pela ação
 * «Corrigir valor», e ele entra no pagamento por ali.
 *
 * ## O que fica escolhido, fica
 *
 * Aberto/fechado, busca e «só quem falta» passam por `useEstadoLembrado`: sair
 * da aba para conferir um NR e voltar não pode desmontar a conferência que
 * estava em andamento.
 *
 * ## Quem vê
 *
 * Só quem já podia ver o Pix dos outros. O painel é uma leitura do que já está
 * na tela — ele não busca nada por conta própria, recebe a mesma lista que a
 * tabela usa. Filtrou por equipe? O painel fala daquela equipe.
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy, ChevronDown, Check, Search, Loader2, Wallet, Undo2, X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/index';
import { useEstadoLembrado } from '@/hooks/useEstadoLembrado';
import type { PixAutoAcordo } from '@/services/pix_automatico.service';
import type { MetaRecebimentoDobra } from './pixAutomaticoView';
import { painelPremiacoes, totalDoPainel, type Premiacao } from './pixPremiacao';
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
  /**
   * Prefixo da chave de memória do painel (aberto, busca, filtro).
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

/**
 * As colunas da tabela. Uma constante só para o cabeçalho e as linhas: se as
 * duas grades divergirem, os números deixam de ficar embaixo do título deles.
 */
const GRADE = 'md:grid md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_minmax(150px,auto)] md:items-center md:gap-4';

/**
 * Uma parcela da conta. No computador o título é o da coluna; no celular a
 * linha empilha, e o rótulo aparece em cima do número.
 */
function Parcela({
  rotulo, valor, cls, titulo, nota,
}: {
  rotulo: string; valor: number; cls?: string; titulo?: string; nota?: string;
}) {
  return (
    <div className="min-w-0 md:text-right" title={titulo}>
      <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground leading-none md:hidden">
        {rotulo}
      </p>
      <p className={cn('text-sm font-mono font-semibold tabular-nums leading-tight mt-1 md:mt-0', cls)}>
        {formatCurrency(valor)}
      </p>
      {nota && (
        <p className="text-[10px] leading-tight text-muted-foreground tabular-nums mt-0.5">
          {nota}
        </p>
      )}
    </div>
  );
}

/** Um número do resumo do cabeçalho. */
function Resumo({ rotulo, children, cls }: { rotulo: string; children: React.ReactNode; cls?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground leading-none">{rotulo}</p>
      <p className={cn('mt-1 text-sm font-mono font-bold tabular-nums leading-tight', cls)}>{children}</p>
    </div>
  );
}

function LinhaPremiacao({
  l, pagamento, podeMarcarPago, alterando, onMarcarPago,
}: {
  l: Premiacao;
  pagamento?: PixPremiacaoPagamento;
  podeMarcarPago: boolean;
  alterando: boolean;
  onMarcarPago?: (
    operadorId: string, pago: boolean, valorPago: number,
  ) => void | Promise<void>;
}) {
  const quitado = Math.abs(l.falta) < 0.005;
  const deve    = l.falta < -0.005;
  // O estado vem da conta, não do carimbo cru: é ela que já sabe ler a linha
  // antiga sem valor gravado.
  const pago    = l.premiacaoPaga;
  // Quanto da premiação já saiu — a barra é o que se lê de longe, antes dos
  // três números.
  const pctPago = l.premiacao > 0
    ? Math.min(Math.max((l.jaPago / l.premiacao) * 100, 0), 100)
    : 0;

  const carimbo = [
    pagamento?.pago_por_nome ? `por ${pagamento.pago_por_nome}` : '',
    pagamento?.pago_em ? `em ${new Date(pagamento.pago_em).toLocaleString('pt-BR')}` : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cn(
      'px-3 py-3 space-y-2.5 md:space-y-0 transition-colors',
      GRADE,
      pago ? 'bg-emerald-500/[0.04]' : 'hover:bg-muted/30',
    )}>
      {/* ── Pessoa: nome, situação e a barra do que já saiu ── */}
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{l.nome}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 max-w-[140px] rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500',
                quitado || pago ? 'bg-emerald-500' : 'bg-violet-500')}
              style={{ width: `${pctPago}%` }}
            />
          </div>
          <span className={cn(
            'text-[10.5px] tabular-nums',
            deve ? 'text-destructive' : 'text-muted-foreground',
          )}>
            {quitado
              ? 'quitada'
              : deve
                ? 'saiu a mais'
                : `${Math.round(pctPago)}% pago`}
          </span>
        </div>
      </div>

      {/* ── As três parcelas: uma coluna cada no computador ── */}
      <div className="grid grid-cols-3 gap-3 md:contents">
        <Parcela
          rotulo="Premiação"
          valor={l.premiacao}
          cls="text-foreground"
          titulo={`Comissão de ${formatCurrency(l.comissao)} dobrada por bater os dois requisitos`}
          nota={`${formatCurrency(l.comissao)} × 2`}
        />
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
            : quitado || pago ? 'text-muted-foreground' : 'text-violet-700 dark:text-violet-400'}
          titulo={deve ? 'Negativo: já saiu mais do que era devido' : undefined}
        />
      </div>

      {/* ── Ação ──────────────────────────────────────────────────────────
          O botão diz o valor porque é ele que vai sair. Pago, a linha mostra
          quem pagou e quando — por escrito, e não só no passar do mouse. */}
      <div className="flex items-center gap-1.5 md:justify-end">
        {podeMarcarPago && !pago ? (
          <button
            type="button"
            disabled={alterando}
            /* Marcar quita o que falta AGORA; negativo (pagou demais) vira
               zero — esse acerto é do saldo de divergência, não daqui. */
            onClick={() => void onMarcarPago?.(l.operadorId, true, Math.max(l.falta, 0))}
            aria-label={`Marcar a premiação de ${l.nome} como paga`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 h-8 text-[11px] font-semibold text-white hover:bg-violet-500 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {alterando
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Wallet className="w-3.5 h-3.5" />}
            Pagar {formatCurrency(Math.max(l.falta, 0))}
          </button>
        ) : (
          <div className="min-w-0 md:text-right" title={carimbo || undefined}>
            <span className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              pago
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'border-border bg-muted/40 text-muted-foreground',
            )}>
              {pago ? <Check className="w-3 h-3" /> : null}
              {pago ? 'Pago' : 'Não pago'}
            </span>
            {pago && pagamento?.pago_por_nome && (
              <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
                {pagamento.pago_por_nome}
                {pagamento.pago_em ? ` · ${new Date(pagamento.pago_em).toLocaleDateString('pt-BR')}` : ''}
              </p>
            )}
          </div>
        )}
        {podeMarcarPago && pago && (
          <button
            type="button"
            disabled={alterando}
            onClick={() => void onMarcarPago?.(l.operadorId, false, 0)}
            title="Desfazer o pagamento desta premiação"
            aria-label={`Desfazer o pagamento da premiação de ${l.nome}`}
            className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {alterando
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Undo2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

export function PixPainelPremiacoes({
  itens, pctPorSetor, mes, nomePorOperador, metaPorOperador, metaPorSetor,
  pagamentos = [], podeMarcarPago = false, alterandoOperadorId,
  chaveEstado = 'pix-premiacoes', onMarcarPago,
}: Props) {
  const [aberto, setAberto] = useEstadoLembrado(`${chaveEstado}|aberto`, true);
  const [busca, setBusca] = useEstadoLembrado(`${chaveEstado}|busca`, '');
  const [soPendentes, setSoPendentes] = useEstadoLembrado(`${chaveEstado}|pendentes`, false);

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

  const total = useMemo(() => totalDoPainel(linhas), [linhas]);
  // O «falta» de cada linha já desconta o carimbo mensal — somar é o bastante.
  const faltaPagar = total.falta;
  const quitadas = useMemo(
    () => linhas.filter(l => Math.abs(l.falta) < 0.005 || l.premiacaoPaga).length,
    [linhas],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas
      .filter(l => (termo ? l.nome.toLowerCase().includes(termo) : true))
      // «Só quem falta» é o modo de trabalho: a lista fica com o que ainda
      // precisa de ação, e some quem já está quitado.
      .filter(l => (soPendentes ? Math.abs(l.falta) >= 0.005 : true));
  }, [linhas, busca, soPendentes]);

  // Ninguém dobrou, nada na tela. O painel É a dobra — uma moldura vazia
  // dizendo "0 pessoas" ocuparia a aba para nunca dizer nada.
  if (linhas.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-border overflow-hidden">
        {/* ── Cabeçalho: o que é, e o resumo de quem paga ─────────────────── */}
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          aria-expanded={aberto}
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/10">
              <Trophy className="h-4 w-4 text-violet-700 dark:text-violet-400" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">
                Premiação dobrada a pagar
              </p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                {linhas.length} {linhas.length === 1 ? 'pessoa dobrou' : 'pessoas dobraram'} a
                comissão · {quitadas} de {linhas.length} {quitadas === 1 ? 'quitada' : 'quitadas'} ·
                bônus de {formatCurrency(total.bonus)}
              </p>
            </div>
          </div>

          {/* O que o pagador quer saber antes de abrir: quanto sai, quanto já
              saiu. A premiação cheia fica em texto corrido, embaixo do pago —
              o número grande é um só, o que falta. */}
          <div className="hidden items-center gap-6 sm:flex">
            <div className="min-w-0 text-right">
              <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground leading-none">Já pago</p>
              <p className="mt-1 text-[11px] font-mono tabular-nums text-muted-foreground leading-tight">
                {formatCurrency(total.jaPago)} de {formatCurrency(total.premiacao)}
              </p>
            </div>
            <div className="text-right">
              <Resumo
                rotulo="Falta pagar"
                cls={faltaPagar > 0.005 ? 'text-violet-700 dark:text-violet-400' : 'text-muted-foreground'}
              >
                {formatCurrency(faltaPagar)}
              </Resumo>
            </div>
          </div>
          <ChevronDown className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            aberto && 'rotate-180',
          )} />
        </button>

        {aberto && (
          <div className="border-t border-border p-3 space-y-2.5">
            {/* ── Busca e recorte ── */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[160px] flex-1 sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Procurar pessoa"
                  className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-xs outline-none focus:ring-1 focus:ring-ring"
                />
                {busca && (
                  <button
                    type="button" onClick={() => setBusca('')}
                    aria-label="Limpar a busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {/* Pílula, e não caixinha: é o mesmo controle de recorte que o
                  resto da aba usa, e ele liga e desliga um estado só. */}
              <button
                type="button"
                onClick={() => setSoPendentes(!soPendentes)}
                aria-pressed={soPendentes}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
                  soPendentes
                    ? 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                Só quem falta
              </button>
            </div>

            {visiveis.length === 0 ? (
              <p className="rounded-lg border border-border px-4 py-6 text-center text-xs text-muted-foreground">
                {busca.trim() ? 'Ninguém com esse nome.' : 'Tudo quitado por aqui.'}
              </p>
            ) : (
              <div className="rounded-lg border border-border divide-y divide-border">
                {/* Títulos das colunas — só no computador; no celular cada
                    número leva o próprio rótulo. */}
                <div className={cn(
                  'hidden bg-muted/30 px-3 py-2 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground',
                  GRADE,
                )}>
                  <span>Pessoa</span>
                  <span className="text-right">Premiação</span>
                  <span className="text-right">Já pago</span>
                  <span className="text-right">Falta pagar</span>
                  <span className="text-right">Situação</span>
                </div>
                {visiveis.map(l => (
                  <LinhaPremiacao
                    key={l.operadorId}
                    l={l}
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
      </Card>
    </motion.div>
  );
}
