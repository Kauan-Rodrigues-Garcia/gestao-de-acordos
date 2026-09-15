/**
 * DashboardComercial — a rota `/` do Comercial.
 *
 * ## O que ela substitui
 *
 * Até a Fase 9 o Comercial abria em `ProdutoEmMontagem`: a tela que diz «este
 * produto ainda não tem painel». O Dashboard da cobrança não servia — ele é
 * recebimento, acordo, ticket médio e colchão de ponta a ponta, e nenhuma
 * dessas palavras significa alguma coisa aqui.
 *
 * ## É o rodapé da planilha de agosto, e não uma ideia nova
 *
 * A planilha mensal já trazia, calculado à mão, tudo o que esta tela mostra:
 * as duas réguas rodando juntas — 161 vendas **e** R$ 962.136,00 —, projeção,
 * meta do dia, dias trabalhados, ranking por operador. O que muda é que a
 * conta deixa de ser refeita todo mês por uma pessoa.
 *
 * Os quatro recortes que faltavam da Fase 6 entram aqui: ranking por operador
 * com percentual de devolução e cancelamento, destaque do dia, vendas por
 * estado e formas de pagamento. As contas moram em `@/lib/vendasPlacar`; esta
 * tela só desenha.
 *
 * ## A régua aparece antes do número
 *
 * Todo total desta tela é «confirmada E assinada». O que fica de fora não
 * some: vai na faixa «Fora da meta», com nome e valor, porque cada gaveta é
 * uma conversa diferente do líder — pendente de assinatura é cobrança,
 * devolvida e cancelada são perda medida.
 *
 * ## O robô soma no total e não disputa o pódio
 *
 * A venda da automação é confirmada, assinada, entrou no caixa do setor e
 * **soma**. Tirá-la do total faria esta tela discordar do Fechamento. O que
 * ela não faz é competir por cabeça: o card da automação fica à parte, e o
 * destaque do dia é sempre de gente.
 *
 * ## Gráfico sem biblioteca, e o motivo é técnico
 *
 * As barras são `div` com largura em porcentagem. As variáveis de tema deste
 * projeto são `oklch`, e `hsl(var(--primary))` — a forma que toda biblioteca
 * de gráfico usa nos exemplos — apaga o gráfico sem erro nenhum no console.
 * Ver `useChartColors`. Para três barras horizontais, CSS puro é mais barato
 * do que acertar a ponte.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, RefreshCw, CheckCircle2, Target, Wallet, Percent,
  Trophy, MapPin, CreditCard, Bot, CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KpiTile } from '@/components/KpiTile';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { useVendas } from '@/hooks/useVendas';
import { useVendasPlacar } from '@/hooks/useVendasPlacar';
import { formatBRL } from '@/lib/money';
import { formatDate, getTodayISO } from '@/lib/index';
import { partesDoMes, rotuloDoMes } from '@/lib/mesReferencia';
import { diasUteisDoMes, diasUteisDecorridos } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import { GAVETAS_EM_ORDEM, type EixoDaVenda } from '@/lib/vendas';
import {
  placarPorOperador, separarAutomacao, vendasPorUF,
  vendasPorFormaDePagamento, serieDiaria, destaqueDoDia, totalDoRecorte,
} from '@/lib/vendasPlacar';
import { ehRegua, type ReguaMeta } from '@/lib/vendasMeta';
import { buscarMetasDoMes, type MetaDeRecorte } from '@/services/vendas/metasVendas.service';
import { AndamentoDasMetas } from './AndamentoDasMetas';
import { Bloco, Faixa, Barra, LinhaDoRanking, ForaDaMeta } from './componentes';

/** Quantas linhas o ranking mostra antes de «ver todos» virar outra tela. */
const TOPO_DO_RANKING = 12;




export default function DashboardComercial() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();

  const [eixo, setEixo] = useState<EixoDaVenda>('confirmacao');
  const [metas, setMetas] = useState<MetaDeRecorte[]>([]);

  const empresaId = empresa?.id ?? null;
  const ativo = Boolean(empresaId);

  const { vendas, carregando, disponivel, erro, recarregar } =
    useVendas({ empresaId, mes, eixo, ativo });
  const placar = useVendasPlacar({ empresaId, mes, ativo });

  useEffect(() => {
    if (!empresaId || !temPermissao('ver_metas_vendas')) { setMetas([]); return; }
    const { ano, mes: m } = partesDoMes(mes);
    void buscarMetasDoMes(empresaId, ano, m).then(r => setMetas(r.dado ?? []));
  }, [empresaId, mes, temPermissao]);

  const { uteis, trabalhados } = useMemo(() => {
    const { ano, mes: m } = partesDoMes(mes);
    return {
      uteis: diasUteisDoMes(ano, m),
      trabalhados: diasUteisDecorridos(ano, m, [], getTodayISO()),
    };
  }, [mes]);

  /*
   * A régua que ordena o ranking é a que a configuração escolheu.
   *
   * Ordenar por valor um setor medido por quantidade premiaria exatamente
   * quem a configuração decidiu não premiar. Sem meta configurada, valor — é
   * a leitura que a operação faz primeiro quando ninguém disse qual vale.
   */
  const regua: ReguaMeta = useMemo(() => {
    const doSetor = metas.find(m => m.tipo === 'setor' && ehRegua(m.regua));
    return (doSetor?.regua as ReguaMeta | undefined) ?? 'valor';
  }, [metas]);

  const total = useMemo(() => totalDoRecorte(vendas, placar.indice), [vendas, placar.indice]);
  const resumo = total.resumo;

  const { pessoas: ranking, automacao } = useMemo(
    () => separarAutomacao(placarPorOperador(vendas, placar.indice, regua)),
    [vendas, placar.indice, regua],
  );
  const destaque = useMemo(
    () => destaqueDoDia(vendas, placar.indice, eixo, regua),
    [vendas, placar.indice, eixo, regua],
  );
  const porDia = useMemo(() => serieDiaria(vendas, eixo), [vendas, eixo]);
  const ufs = useMemo(() => vendasPorUF(vendas), [vendas]);
  const formas = useMemo(() => vendasPorFormaDePagamento(vendas), [vendas]);

  const maiorDoDia = Math.max(1, ...porDia.map(p => (regua === 'quantidade' ? p.quantidade : p.valor)));
  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
  const carregandoTudo = carregando && vendas.length === 0;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Comercial</h1>
            <p className="text-[12px] text-muted-foreground">
              {rotuloDoMes(mes)} · {eixo === 'confirmacao'
                ? 'pelo dia da confirmação'
                : 'pelo dia da venda'}
              {' · '}{trabalhados} de {uteis} dias úteis
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
          <SeletorMes mes={mes} onChange={setMes} desabilitado={carregando} />
          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => { recarregar(); placar.recarregar(); }}
            disabled={carregando} aria-label="Recarregar">
            <RefreshCw className={cn('h-4 w-4', carregando && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {!disponivel && (
        <Faixa tom="alerta">
          A aba Vendas não respondeu. <strong>Recarregue a página</strong> — o banco guarda o
          desenho das tabelas em cache. Se persistir, confira se a migration
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
            20260915100000_vendas_fase1.sql
          </code>
          está aplicada.
        </Faixa>
      )}
      {erro && <Faixa tom="alerta">{erro}</Faixa>}
      {disponivel && !placar.disponivel && (
        <Faixa tom="info">
          O cadastro do placar não respondeu, então <strong>a automação aparece como
          gente</strong> e a meta não desconta ausência. Confira se a migration
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
            20260915230000_vendas_fase9_placar_e_paineis.sql
          </code>
          está aplicada. O resto da tela está correto.
        </Faixa>
      )}

      {/* ── O placar ───────────────────────────────────────────────────── */}
      {carregandoTudo ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            rotulo="Faturamento" valor={formatBRL(resumo.valor)}
            sub="confirmado e assinado" Icon={Target} tom="primario"
          />
          <KpiTile
            rotulo="Vendas na meta" valor={resumo.quantidade}
            sub={total.pessoasQueVenderam === 1
              ? '1 pessoa vendeu'
              : `${total.pessoasQueVenderam} pessoas venderam`}
            Icon={CheckCircle2} tom="sucesso"
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
      )}

      {/* ── O que ficou de fora da régua ───────────────────────────────── */}
      <ForaDaMeta
        porGaveta={resumo.porGaveta} valorPorGaveta={resumo.valorPorGaveta}
        ordem={GAVETAS_EM_ORDEM}
      />

      {/* ── A meta, com a ausência descontada ──────────────────────────── */}
      <AndamentoDasMetas
        vendas={vendas} metas={metas} eixo={eixo}
        uteis={uteis} trabalhados={trabalhados}
        pessoas={placar.disponivel ? placar.indice : undefined}
        presencaPorRecorte={placar.presencaPorRecorte}
      />

      {/* ── Destaque do dia ────────────────────────────────────────────── */}
      {destaque && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
          <Trophy className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="text-[12px] text-muted-foreground">
            Destaque de <strong className="text-foreground">{formatDate(destaque.dia)}</strong>
          </span>
          <span className="text-[14px] font-semibold">{destaque.linha.nome}</span>
          <span className="text-[13px] tabular-nums text-muted-foreground">
            {destaque.linha.resumo.quantidade} venda
            {destaque.linha.resumo.quantidade === 1 ? '' : 's'}
            {' · '}
            <strong className="text-foreground">{formatBRL(destaque.linha.resumo.valor)}</strong>
          </span>
        </div>
      )}

      {/* ── Ranking ────────────────────────────────────────────────────── */}
      <Bloco
        titulo="Ranking do mês" Icone={Trophy}
        sub={regua === 'quantidade' ? 'por quantidade de vendas' : 'por faturamento'}
        vazio={ranking.length === 0 ? 'Nenhuma venda na régua neste mês.' : undefined}
      >
        <div>
          {ranking.slice(0, TOPO_DO_RANKING).map((l, i) => (
            <LinhaDoRanking key={l.operadorId} linha={l} posicao={i + 1} regua={regua} />
          ))}
          {ranking.length > TOPO_DO_RANKING && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              e mais {ranking.length - TOPO_DO_RANKING} — a lista inteira está no Painel Líder.
            </p>
          )}
        </div>
      </Bloco>

      {/* ── A automação, à parte ───────────────────────────────────────── */}
      {automacao.length > 0 && (
        <Bloco
          titulo="Automação" Icone={Bot}
          sub={total.fracaoAutomacao !== null
            ? `${Math.round(total.fracaoAutomacao * 100)}% do faturamento do mês`
            : undefined}
        >
          <p className="border-b border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            As vendas dos robôs <strong>somam</strong> no total do setor — elas foram
            confirmadas, assinadas e entraram no caixa. O que elas não fazem é disputar o
            placar por cabeça, e por isso ficam aqui.
          </p>
          {automacao.map((l, i) => (
            <LinhaDoRanking key={l.operadorId} linha={l} posicao={i + 1} regua={regua} />
          ))}
        </Bloco>
      )}

      {/* ── O dia a dia ────────────────────────────────────────────────── */}
      <Bloco
        titulo="Dia a dia" Icone={CalendarDays}
        sub={eixo === 'confirmacao' ? 'pelo dia da confirmação' : 'pelo dia da venda'}
        vazio={porDia.length === 0 ? 'Nenhum dia com venda na régua.' : undefined}
      >
        <div className="flex items-end gap-1 overflow-x-auto px-3 py-3">
          {porDia.map(p => {
            const medida = regua === 'quantidade' ? p.quantidade : p.valor;
            const altura = Math.max(4, Math.round((medida / maiorDoDia) * 100));
            return (
              <div key={p.dia} className="flex min-w-[26px] flex-1 flex-col items-center gap-1">
                <div className="flex h-24 w-full items-end" title={
                  `${formatDate(p.dia)} · ${p.quantidade} venda${p.quantidade === 1 ? '' : 's'} · ${formatBRL(p.valor)}`
                }>
                  <div className="w-full rounded-t bg-primary/70" style={{ height: `${altura}%` }} />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {p.dia.slice(8, 10)}
                </span>
              </div>
            );
          })}
        </div>
      </Bloco>

      {/* ── Estado e forma de pagamento ────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco
          titulo="Por estado" Icone={MapPin}
          sub={ufs.length > 0 ? `${ufs.length} ${ufs.length === 1 ? 'estado' : 'estados'}` : undefined}
          vazio={ufs.length === 0 ? 'Nenhuma venda na régua neste mês.' : undefined}
        >
          <div className="py-1.5">
            {ufs.slice(0, 10).map(f => <Barra key={f.chave} fatia={f} formatar={formatBRL} />)}
          </div>
        </Bloco>

        <Bloco
          titulo="Formas de pagamento" Icone={CreditCard}
          vazio={formas.length === 0 ? 'Nenhuma venda na régua neste mês.' : undefined}
        >
          <div className="py-1.5">
            {formas.slice(0, 10).map(f => <Barra key={f.chave} fatia={f} formatar={formatBRL} />)}
          </div>
          <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            A forma é <strong>classificação</strong>, e o valor mostrado é o da venda. As colunas
            de decomposição do relatório somam R$ 27.437,73 a mais que o total recebido, e 66
            linhas marcadas «SEM RECEBIMENTO» trazem valor nelas — por isso elas não somam aqui.
          </p>
        </Bloco>
      </div>
    </div>
  );
}


