/**
 * DashboardComercial — a rota `/` do Comercial.
 *
 * ## A reescrita de 15/09/2026, e o defeito que a motivou
 *
 * A primeira versão desta tela nasceu na Fase 9 e durou um dia. O problema não
 * era o que ela calculava — as contas estavam certas e continuam, em
 * `@/lib/vendasPlacar` —, era **o que ela era**: quatro `KpiTile` chapados,
 * blocos de borda fina e barras de `div`, numa plataforma cujo Dashboard da
 * cobrança tem anel de meta, gráfico composto, cards com acento e animação.
 *
 * Pior: os quatro números do topo eram os MESMOS da aba Vendas, e o ranking de
 * doze linhas era o mesmo do Painel Líder, sem as ações. Três telas dizendo a
 * mesma coisa, e nenhuma delas dizendo tudo.
 *
 * O pedido foi literal — «a mesma estética do dashboard da BookPlay e da
 * PaguePlay, com as informações do Comercial» —, e a forma de obedecer foi
 * usar as PEÇAS daquele painel, não imitá-las: `MetricCard`, `DonutChart`,
 * `AnelProjecao`, `FaixaDiasUteis`, `opacidadeDaBarra` e as constantes de cor
 * são importados de `@/components/AnalyticsPanel` e `@/components/PainelMetas`.
 * Uma cópia visual teria começado igual e divergido no primeiro ajuste de lá.
 *
 * ## O que esta tela responde, e o que ela deixa para as outras
 *
 * A pergunta daqui é **como o mês está indo** — no conjunto, de relance,
 * incluindo o que só se enxerga somando: ticket médio, aproveitamento,
 * acumulado, ritmo, composição por equipe e por estado.
 *
 *   o que eu faço agora ....... Painel Líder (fila de assinatura, pessoa a
 *                               pessoa, com as ações do líder)
 *   o que entrou hoje ......... aba Vendas (a lista por dia)
 *   a conta fecha? ............ Fechamento
 *
 * Por isso o ranking de doze linhas virou um **pódio de três** com link para a
 * lista de verdade, e o bloco da automação virou uma faixa de uma linha: a
 * versão cortada de uma tela que existe inteira noutro lugar não é resumo, é
 * repetição.
 *
 * ## Tudo o que está aqui passou pela régua
 *
 * Todo total desta tela é «confirmada E assinada». O que fica de fora não some:
 * vai no anel «Onde as vendas pararam», com nome, valor e proporção — cada
 * gaveta é uma conversa diferente do líder.
 *
 * ## O robô soma no total e não disputa o pódio
 *
 * A venda da automação é confirmada, assinada, entrou no caixa do setor e
 * **soma** — tirá-la do total faria esta tela discordar do Fechamento. O que
 * ela não faz é competir por cabeça.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, RefreshCw, TrendingUp } from 'lucide-react';
import { FormaSaudacao } from '@/components/FormaSaudacao';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { SkeletonCard, MiniSparkline } from '@/components/AnalyticsPanel/SubComponents';
import { CHART_RECEBIDO } from '@/components/AnalyticsPanel/constants';
import { FaixaDiasUteis } from '@/components/PainelMetas/FaixaDiasUteis';
import { ALTURA_CARD_PROGRESSO } from '@/components/PainelMetas/tamanhoCards';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { useVendas } from '@/hooks/useVendas';
import { useVendasPlacar } from '@/hooks/useVendasPlacar';
import { useVendasMesAnterior } from '@/hooks/useVendasMesAnterior';
import { ROUTE_PATHS, getTodayISO } from '@/lib/index';
import { partesDoMes, rotuloDoMes, ehMesAtual } from '@/lib/mesReferencia';
import { diasUteisDoMes, diasUteisDecorridos } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import { resumirVendas, type EixoDaVenda } from '@/lib/vendas';
import {
  placarPorOperador, placarPorEquipe, separarAutomacao, vendasPorUF,
  vendasPorFormaDePagamento, serieDiaria, destaqueDoDia, totalDoRecorte,
} from '@/lib/vendasPlacar';
import {
  progressoDaMeta, ehRegua, fatorDePresenca, ajustarMetaPorPresenca,
  type ReguaMeta,
} from '@/lib/vendasMeta';
import { serieDoMes } from '@/lib/vendasDashboard';
import { buscarMetasDoMes, type MetaDeRecorte } from '@/services/vendas/metasVendas.service';
import { saudacao } from '@/pages/Dashboard/helpers';
import { AndamentoDasMetas } from './AndamentoDasMetas';
import { Faixa } from './componentes';
import { CardsDoMes } from './dashboard/CardsDoMes';
import { CardDoMes } from './dashboard/CardDoMes';
import { EvolucaoVendas } from './dashboard/EvolucaoVendas';
import { Podio, Equipes, Estados, FaixaDaAutomacao } from './dashboard/ComposicaoDoMes';

export default function DashboardComercial() {
  const { perfil } = useAuth();
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
  const anterior = useVendasMesAnterior({ empresaId, mes, ativo });

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
   * A régua que ordena o pódio é a que a configuração escolheu.
   *
   * Ordenar por valor um setor medido por quantidade premiaria exatamente quem
   * a configuração decidiu não premiar. Sem meta configurada, valor — é a
   * leitura que a operação faz primeiro quando ninguém disse qual vale.
   */
  const metaDoSetor = useMemo(
    () => metas.find(m => m.tipo === 'setor' && ehRegua(m.regua)) ?? null,
    [metas],
  );
  const regua: ReguaMeta = (metaDoSetor?.regua as ReguaMeta | undefined) ?? 'valor';

  const total = useMemo(() => totalDoRecorte(vendas, placar.indice), [vendas, placar.indice]);
  const resumo = total.resumo;

  const { pessoas: ranking, automacao } = useMemo(
    () => separarAutomacao(placarPorOperador(vendas, placar.indice, regua)),
    [vendas, placar.indice, regua],
  );
  const equipes = useMemo(
    () => (placar.disponivel ? placarPorEquipe(vendas, placar.indice) : []),
    [vendas, placar.indice, placar.disponivel],
  );
  const destaque = useMemo(
    () => destaqueDoDia(vendas, placar.indice, eixo, regua),
    [vendas, placar.indice, eixo, regua],
  );
  const ufs = useMemo(() => vendasPorUF(vendas), [vendas]);
  const formas = useMemo(() => vendasPorFormaDePagamento(vendas), [vendas]);
  const serie = useMemo(() => serieDoMes(serieDiaria(vendas, eixo), mes), [vendas, eixo, mes]);

  /*
   * A meta do setor, já descontada a ausência — a mesma conta que a linha do
   * `AndamentoDasMetas` faz, e de propósito: dois números de meta na mesma tela
   * com regras diferentes é como os dois lados divergem sem ninguém notar.
   */
  const metaAjustada = useMemo(() => {
    if (!metaDoSetor) return null;
    const presenca = placar.presencaPorRecorte.get(metaDoSetor.referencia_id);
    const fator = presenca ? fatorDePresenca(presenca) : null;
    return ajustarMetaPorPresenca(
      { regua: metaDoSetor.regua, quantidade: metaDoSetor.quantidade, valor: metaDoSetor.valor },
      fator,
    );
  }, [metaDoSetor, placar.presencaPorRecorte]);

  /** O resumo do SETOR da meta — e não o da tela, que poderia ter mais setores. */
  const resumoDoSetor = useMemo(() => {
    if (!metaDoSetor) return null;
    return resumirVendas(vendas.filter(v => v.setor_id === metaDoSetor.referencia_id));
  }, [vendas, metaDoSetor]);

  const andamento = useMemo(() => {
    if (!metaAjustada || !resumoDoSetor) return null;
    return progressoDaMeta({ meta: metaAjustada, resumo: resumoDoSetor, uteis, trabalhados });
  }, [metaAjustada, resumoDoSetor, uteis, trabalhados]);

  /*
   * A régua do gráfico é sempre dinheiro, então a linha de meta diária também.
   *
   * `ritmoValor` e não `ritmoOficial`: num setor medido por QUANTIDADE, a meta
   * oficial é «10 vendas», e desenhar 10 num eixo de reais cruzaria o gráfico
   * rente ao chão — um número certo no lugar errado é pior do que nenhum.
   */
  const metaDiaria = andamento?.ritmoValor?.porDia ?? null;

  const cardDaMeta = useMemo(() => {
    if (!metaDoSetor || !metaAjustada || !andamento?.oficial) return null;
    return {
      alvo: andamento.oficial.alvo,
      feito: andamento.oficial.feito,
      regua: (metaAjustada.regua ?? 'valor') as ReguaMeta,
      nome: metaDoSetor.nome,
    };
  }, [metaDoSetor, metaAjustada, andamento]);

  /** O ritmo do mês na faixa de controles — os últimos dias, em miniatura. */
  const sparkline = useMemo(
    () => serie.filter(p => p.valor > 0).map(p => ({ value: p.valor })),
    [serie],
  );

  const nome = perfil?.nome?.split(' ')[0] || 'Usuário';
  const diaSemana = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
  const dataFormatada = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const carregandoTudo = carregando && vendas.length === 0;
  const atualizando = carregando || placar.carregando || anterior.carregando;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* ── Saudação ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="flex items-center gap-1.5 text-2xl font-bold text-foreground">
            <span>{saudacao()}, {nome}!</span>
            <FormaSaudacao />
          </h1>
          <p className="text-sm text-muted-foreground capitalize mt-0.5">
            {diaSemana}, {dataFormatada}
          </p>
          {empresa && (
            <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> {empresa.nome}
            </p>
          )}
        </div>
      </div>

      {/* ── A faixa de controles ───────────────────────────────────────────
          O mesmo desenho do cabeçalho «Dados Analíticos» da cobrança: os
          controles que recortam TUDO o que vem abaixo moram numa faixa só, e
          não espalhados pela tela. */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-xl border border-border/70 bg-card shadow-sm"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 shrink-0">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold leading-none">Comercial</span>
              <div className="mt-0.5 -ml-1.5 flex items-center gap-2 flex-wrap">
                <SeletorMes mes={mes} onChange={setMes} desabilitado={carregando} />
                <Tabs value={eixo} onValueChange={v => setEixo(v as EixoDaVenda)}>
                  <TabsList className="h-7">
                    <TabsTrigger value="confirmacao" className="text-[11px]">Confirmação</TabsTrigger>
                    <TabsTrigger value="venda" className="text-[11px]">Data da venda</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </div>
          {!carregandoTudo && sparkline.length > 1 && (
            <div className="hidden lg:flex items-center gap-2 ml-2 pl-3 border-l border-border/60">
              <MiniSparkline data={sparkline} color={CHART_RECEBIDO} />
              <span className="text-[11px] text-muted-foreground">ritmo</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-5 text-xs">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {rotuloDoMes(mes)}
              </span>
              <span className="font-bold text-emerald-500 tabular-nums font-mono">
                {resumo.quantidade} venda{resumo.quantidade === 1 ? '' : 's'}
              </span>
            </div>
            {andamento?.oficial?.pct != null && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Meta</span>
                <span className="font-bold tabular-nums font-mono">
                  {Math.round(andamento.oficial.pct * 100)}%
                </span>
              </div>
            )}
          </div>
          <Button
            variant="ghost" size="icon" className="h-7 w-7 rounded-lg"
            onClick={() => { recarregar(); placar.recarregar(); }}
            disabled={atualizando}
            title="Atualizar dados"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 text-muted-foreground', atualizando && 'animate-spin')} />
          </Button>
        </div>
      </motion.div>

      {/* ── Avisos ─────────────────────────────────────────────────────── */}
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
          gente</strong>, não há quebra por equipe e a meta não desconta ausência. Confira se a
          migration
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
            20260915230000_vendas_fase9_placar_e_paineis.sql
          </code>
          está aplicada. O resto da tela está correto.
        </Faixa>
      )}

      <FaixaDiasUteis
        passados={trabalhados}
        restantes={Math.max(0, uteis - trabalhados)}
        total={uteis}
      />

      {/* ── O mês ──────────────────────────────────────────────────────── */}
      {carregandoTudo ? (
        <div className="grid gap-3 items-start lg:grid-cols-3">
          <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className={cn('rounded-xl bg-muted/25 animate-pulse', ALTURA_CARD_PROGRESSO)} />
        </div>
      ) : (
        <div className="grid gap-3 items-start lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CardsDoMes
              resumo={resumo}
              total={total}
              andamento={andamento}
              anterior={anterior.temBase ? anterior.resumo : null}
            />
          </div>
          <CardDoMes
            resumo={resumo}
            formas={formas}
            meta={cardDaMeta}
            podeConfigurarMeta={temPermissao('ver_metas_vendas')}
          />
        </div>
      )}

      {/* ── A meta, recorte a recorte, com a ausência descontada ────────── */}
      <AndamentoDasMetas
        vendas={vendas} metas={metas} eixo={eixo}
        uteis={uteis} trabalhados={trabalhados}
        pessoas={placar.disponivel ? placar.indice : undefined}
        presencaPorRecorte={placar.presencaPorRecorte}
      />

      {!carregandoTudo && (
        <EvolucaoVendas
          serie={serie}
          metaDiaria={metaDiaria}
          // Mês fechado não tem «hoje» para destacar. `getTodayISO` e não
          // `new Date()`: o dia tem de ser o de São Paulo, não o da máquina.
          diaDeHoje={ehMesAtual(mes) ? Number(getTodayISO().slice(8, 10)) : null}
          eixo={eixo}
        />
      )}

      <FaixaDaAutomacao
        robos={automacao.length}
        valor={total.valorAutomacao}
        fracao={total.fracaoAutomacao}
      />

      {/* ── Quem, que equipe, que estado ───────────────────────────────── */}
      {!carregandoTudo && (
        <div className="grid gap-3 lg:grid-cols-3">
          <Podio
            pessoas={ranking}
            regua={regua}
            destaque={destaque}
            total={ranking.length}
            linkDoRanking={temPermissao('ver_painel_lider') ? ROUTE_PATHS.VENDAS_PAINEL_LIDER : null}
          />
          <Equipes equipes={equipes} regua={regua} />
          <Estados ufs={ufs} />
        </div>
      )}
    </div>
  );
}
