/**
 * PainelDiretoriaComercial — o mês do Comercial visto de cima.
 *
 * ## A pergunta é outra que a do líder
 *
 * O líder pergunta «o que eu faço hoje». A diretoria pergunta «o mês está
 * melhor ou pior que o anterior, e onde». Por isso esta tela nasce com a
 * comparação ao lado de cada número, e não com a fila de assinatura.
 *
 * ## A comparação é com o MESMO recorte do mês anterior
 *
 * Duas buscas, os dois meses pelo eixo de confirmação. Comparar o mês corrido
 * com o mês fechado anterior é comparar 10 dias com 21, e a queda que aparece
 * é do calendário. Por isso o delta vem sempre acompanhado de «X de Y dias
 * úteis» — e há a leitura por ritmo, que divide os dois pelos dias que cada um
 * teve.
 *
 * ## Onde esta tela para, e por quê
 *
 * Ela **não** reconcilia. «De onde veio esse número e ele bate?» é a pergunta
 * do Fechamento do Setor, que tem as quatro igualdades, os cinco destinos e o
 * retrato do lote — e que já existe desde a Fase 6. Repetir aqui uma versão
 * resumida dela criaria dois lugares onde a conta do setor é mostrada, e um
 * dia eles discordariam. O que há aqui é o link.
 *
 * ## Só BookPlay, por enquanto, e não por decisão
 *
 * O Comercial tem uma empresa e um setor cadastrados hoje. A tela agrupa por
 * setor porque o agrupamento é o que a torna útil no dia em que houver dois —
 * e um agrupamento de um só não custa nada.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Target, Wallet, Percent,
  Trophy, MapPin, CreditCard, Bot, Building2, Users, Scale, CheckCircle2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiTile } from '@/components/KpiTile';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { useVendas } from '@/hooks/useVendas';
import { useVendasPlacar } from '@/hooks/useVendasPlacar';
import { formatBRL } from '@/lib/money';
import { ROUTE_PATHS, getTodayISO } from '@/lib/index';
import {
  partesDoMes, rotuloDoMes, primeiroDiaDoMes, ultimoDiaDoMes,
} from '@/lib/mesReferencia';
import { diasUteisDoMes, diasUteisDecorridos } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import { GAVETAS_EM_ORDEM, resumirVendas } from '@/lib/vendas';
import {
  placarPorOperador, placarPorEquipe, separarAutomacao, totalDoRecorte,
  vendasPorUF, vendasPorFormaDePagamento, type FatiaSimples,
} from '@/lib/vendasPlacar';
import { ehRegua, type ReguaMeta } from '@/lib/vendasMeta';
import { buscarMetasDoMes, type MetaDeRecorte } from '@/services/vendas/metasVendas.service';
import { buscarVendas, type Venda } from '@/services/vendas/vendas.service';
import { AndamentoDasMetas } from './AndamentoDasMetas';
import { Bloco, Faixa, Barra, LinhaDoRanking, ForaDaMeta } from './componentes';

const TOPO_DO_RANKING = 15;

/** O mês anterior a `'yyyy-MM'`, no mesmo formato. */
function mesAnterior(mes: string): string {
  const { ano, mes: m } = partesDoMes(mes);
  const d = new Date(Date.UTC(ano, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * A variação entre dois números, e o que ela quer dizer.
 *
 * `null` quando não há base: sair de zero para qualquer coisa é «+∞%», que não
 * informa nada. A tela escreve «sem base» em vez de desenhar uma seta que o
 * olho lê como crescimento medido.
 */
function variacao(agora: number, antes: number): number | null {
  if (!Number.isFinite(antes) || antes === 0) return null;
  return (agora - antes) / antes;
}

function Delta({ pct, sufixo }: { pct: number | null; sufixo?: string }) {
  if (pct === null) {
    return <span className="text-[11px] text-muted-foreground">sem base no mês anterior</span>;
  }
  const subiu = pct > 0.0005;
  const caiu = pct < -0.0005;
  const Icone = subiu ? TrendingUp : caiu ? TrendingDown : Minus;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[11px] tabular-nums',
      subiu && 'text-success',
      caiu && 'text-destructive',
      !subiu && !caiu && 'text-muted-foreground',
    )}>
      <Icone className="h-3 w-3" aria-hidden />
      {pct > 0 ? '+' : ''}{(pct * 100).toFixed(1)}%{sufixo ? ` ${sufixo}` : ''}
    </span>
  );
}

export default function PainelDiretoriaComercial() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();

  const [metas, setMetas] = useState<MetaDeRecorte[]>([]);
  const [anterior, setAnterior] = useState<Venda[]>([]);
  const [carregandoAnterior, setCarregandoAnterior] = useState(false);

  const empresaId = empresa?.id ?? null;
  const ativo = Boolean(empresaId);

  // Eixo fixo em `confirmacao`: é o oficial, o que fecha o mês e a meta. Um
  // painel de diretoria que deixasse trocar o eixo produziria duas verdades.
  const { vendas, carregando, disponivel, erro, recarregar } =
    useVendas({ empresaId, mes, eixo: 'confirmacao', ativo });
  const placar = useVendasPlacar({ empresaId, mes, ativo });

  const mesPassado = useMemo(() => mesAnterior(mes), [mes]);

  useEffect(() => {
    if (!empresaId) { setAnterior([]); return; }
    let vivo = true;
    setCarregandoAnterior(true);
    void buscarVendas({
      empresaId,
      de: primeiroDiaDoMes(mesPassado),
      ate: ultimoDiaDoMes(mesPassado),
      eixo: 'confirmacao',
    }).then(r => {
      if (!vivo) return;
      setAnterior(r.vendas);
      setCarregandoAnterior(false);
    });
    return () => { vivo = false; };
  }, [empresaId, mesPassado]);

  useEffect(() => {
    if (!empresaId || !temPermissao('ver_metas_vendas')) { setMetas([]); return; }
    const { ano, mes: m } = partesDoMes(mes);
    void buscarMetasDoMes(empresaId, ano, m).then(r => setMetas(r.dado ?? []));
  }, [empresaId, mes, temPermissao]);

  const dias = useMemo(() => {
    const a = partesDoMes(mes);
    const b = partesDoMes(mesPassado);
    const hoje = getTodayISO();
    return {
      uteis: diasUteisDoMes(a.ano, a.mes),
      trabalhados: diasUteisDecorridos(a.ano, a.mes, [], hoje),
      uteisAnterior: diasUteisDoMes(b.ano, b.mes),
      trabalhadosAnterior: diasUteisDecorridos(b.ano, b.mes, [], hoje),
    };
  }, [mes, mesPassado]);

  const regua: ReguaMeta = useMemo(() => {
    const doSetor = metas.find(m => m.tipo === 'setor' && ehRegua(m.regua));
    return (doSetor?.regua as ReguaMeta | undefined) ?? 'valor';
  }, [metas]);

  const total = useMemo(() => totalDoRecorte(vendas, placar.indice), [vendas, placar.indice]);
  const resumo = total.resumo;
  const resumoAnterior = useMemo(() => resumirVendas(anterior), [anterior]);

  /**
   * O ritmo: quanto por dia útil, nos dois meses.
   *
   * É a única comparação honesta enquanto o mês corre. Dez dias contra vinte e
   * um não medem nada; por dia útil, medem.
   */
  const ritmo = useMemo(() => {
    const agora = dias.trabalhados > 0 ? resumo.valor / dias.trabalhados : 0;
    // O mês anterior já fechou: divide pelos dias úteis dele, não pelos
    // decorridos — que hoje são todos, mas não serão se alguém olhar em
    // janeiro o mês de dezembro.
    const base = Math.min(dias.trabalhadosAnterior, dias.uteisAnterior) || dias.uteisAnterior;
    const antes = base > 0 ? resumoAnterior.valor / base : 0;
    return { agora, antes, variacao: variacao(agora, antes) };
  }, [resumo.valor, resumoAnterior.valor, dias]);

  /** Uma fatia por setor, para a barra. O nome vem do cadastro. */
  const setores = useMemo((): FatiaSimples[] => {
    const nomes = new Map<string, string>();
    for (const p of placar.pessoas) {
      if (p.setor_id && p.setor_nome) nomes.set(p.setor_id, p.setor_nome);
    }
    const grupos = new Map<string, Venda[]>();
    for (const v of vendas) {
      const id = v.setor_id ?? '__sem_setor__';
      const lista = grupos.get(id);
      if (lista) lista.push(v); else grupos.set(id, [v]);
    }
    const linhas = [...grupos].map(([id, lista]) => {
      const r = resumirVendas(lista);
      return {
        chave: id,
        rotulo: nomes.get(id) ?? (id === '__sem_setor__' ? 'Sem setor' : 'Setor não cadastrado'),
        quantidade: r.quantidade,
        valor: r.valor,
        fracao: 0,
      };
    });
    const soma = linhas.reduce((s, l) => s + l.valor, 0);
    return linhas
      .map(l => ({ ...l, fracao: soma > 0 ? l.valor / soma : 0 }))
      .sort((a, b) => b.valor - a.valor);
  }, [vendas, placar.pessoas]);

  const equipes = useMemo(() => placarPorEquipe(vendas, placar.indice), [vendas, placar.indice]);
  const { pessoas: ranking, automacao } = useMemo(
    () => separarAutomacao(placarPorOperador(vendas, placar.indice, regua)),
    [vendas, placar.indice, regua],
  );
  const ufs = useMemo(() => vendasPorUF(vendas), [vendas]);
  const formas = useMemo(() => vendasPorFormaDePagamento(vendas), [vendas]);

  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
  const carregandoTudo = carregando && vendas.length === 0;
  const comparando = !carregandoAnterior && anterior.length > 0;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Painel Diretoria</h1>
            <p className="text-[12px] text-muted-foreground">
              {rotuloDoMes(mes)} · pelo dia da confirmação · {dias.trabalhados} de {dias.uteis} dias
              úteis{comparando && <> · comparado a {rotuloDoMes(mesPassado)}</>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          A aba Vendas não respondeu. <strong>Recarregue a página</strong>; se persistir, confira
          se a migration <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
            20260915100000_vendas_fase1.sql</code> está aplicada.
        </Faixa>
      )}
      {erro && <Faixa tom="alerta">{erro}</Faixa>}

      {/* ── O mês, contra o anterior ───────────────────────────────────── */}
      {carregandoTudo ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            rotulo="Faturamento" valor={formatBRL(resumo.valor)}
            sub={comparando ? `${formatBRL(resumoAnterior.valor)} em ${rotuloDoMes(mesPassado)}` : 'confirmado e assinado'}
            Icon={Target} tom="primario"
          />
          <KpiTile
            rotulo="Vendas na meta" valor={resumo.quantidade}
            sub={comparando ? `${resumoAnterior.quantidade} no mês anterior` : 'confirmadas e assinadas'}
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
            sub={comparando
              ? `${pct(resumoAnterior.pctDevolucao)} / ${pct(resumoAnterior.pctCancelamento)} antes`
              : 'sobre o que foi confirmado'}
            Icon={Percent} tom="alerta"
          />
        </div>
      )}

      {comparando && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-border bg-muted/20 px-3 py-2 text-[12px]">
          <span className="font-medium">Contra {rotuloDoMes(mesPassado)}</span>
          <span className="flex items-center gap-1.5">
            faturamento <Delta pct={variacao(resumo.valor, resumoAnterior.valor)} />
          </span>
          <span className="flex items-center gap-1.5">
            vendas <Delta pct={variacao(resumo.quantidade, resumoAnterior.quantidade)} />
          </span>
          <span className="flex items-center gap-1.5">
            por dia útil <Delta pct={ritmo.variacao} />
            <span className="tabular-nums text-muted-foreground">
              ({formatBRL(ritmo.agora)} × {formatBRL(ritmo.antes)})
            </span>
          </span>
        </div>
      )}

      <ForaDaMeta
        porGaveta={resumo.porGaveta} valorPorGaveta={resumo.valorPorGaveta}
        ordem={GAVETAS_EM_ORDEM}
      />

      {/* ── A meta ─────────────────────────────────────────────────────── */}
      <AndamentoDasMetas
        vendas={vendas} metas={metas} eixo="confirmacao"
        uteis={dias.uteis} trabalhados={dias.trabalhados}
        pessoas={placar.disponivel ? placar.indice : undefined}
        presencaPorRecorte={placar.presencaPorRecorte}
      />

      {/* ── Onde o resultado acontece ──────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco
          titulo="Por setor" Icone={Building2}
          acao={
            <Button asChild size="sm" variant="ghost" className="h-7 text-[11px]">
              <Link to={ROUTE_PATHS.VENDAS_FECHAMENTO}>
                <Scale className="mr-1 h-3.5 w-3.5" /> Conferir a conta
              </Link>
            </Button>
          }
          vazio={setores.length === 0 ? 'Nenhuma venda na régua neste mês.' : undefined}
        >
          <div className="py-1.5">
            {setores.map(f => <Barra key={f.chave} fatia={f} />)}
          </div>
          <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            Estes são os totais <strong>gravados em vendas</strong>. De onde cada real veio — e se
            o retrato do mês fecha — é a pergunta do Fechamento do Setor, que tem as quatro
            igualdades e os cinco destinos.
          </p>
        </Bloco>

        <Bloco
          titulo="Por equipe" Icone={Users} sub="a soma bate com o total"
          vazio={equipes.length === 0 ? 'Nenhuma venda na régua neste mês.' : undefined}
        >
          {equipes.map(e => (
            <div key={e.equipeId ?? 'sem'}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {e.nome}
                {e.equipeId === null && (
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    vendedor sem equipe no cadastro
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {e.pessoas} {e.pessoas === 1 ? 'pessoa' : 'pessoas'}
              </span>
              <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                {e.resumo.quantidade}v
              </span>
              <span className="w-28 shrink-0 text-right text-[13px] font-semibold tabular-nums">
                {formatBRL(e.resumo.valor)}
              </span>
            </div>
          ))}
        </Bloco>
      </div>

      {/* ── Quem produz ────────────────────────────────────────────────── */}
      <Bloco
        titulo="Ranking do mês" Icone={Trophy}
        sub={regua === 'quantidade' ? 'por quantidade de vendas' : 'por faturamento'}
        vazio={ranking.length === 0 ? 'Nenhuma venda na régua neste mês.' : undefined}
      >
        {ranking.slice(0, TOPO_DO_RANKING).map((l, i) => (
          <LinhaDoRanking key={l.operadorId} linha={l} posicao={i + 1} regua={regua} />
        ))}
        {ranking.length > TOPO_DO_RANKING && (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            e mais {ranking.length - TOPO_DO_RANKING} pessoas.
          </p>
        )}
      </Bloco>

      {automacao.length > 0 && (
        <Bloco
          titulo="Automação" Icone={Bot}
          sub={total.fracaoAutomacao !== null
            ? `${Math.round(total.fracaoAutomacao * 100)}% do faturamento do mês`
            : undefined}
        >
          <p className="border-b border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            Soma no total do setor — a venda do robô foi confirmada, assinada e entrou no caixa.
            Fica aqui para não disputar o placar por cabeça.
          </p>
          {automacao.map(l => (
            <LinhaDoRanking key={l.operadorId} linha={l} posicao={null} regua={regua} />
          ))}
        </Bloco>
      )}

      {/* ── Mercado ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco
          titulo="Por estado" Icone={MapPin}
          sub={ufs.length > 0 ? `${ufs.length} ${ufs.length === 1 ? 'estado' : 'estados'}` : undefined}
          vazio={ufs.length === 0 ? 'Nenhuma venda na régua neste mês.' : undefined}
        >
          <div className="py-1.5">
            {ufs.slice(0, 12).map(f => <Barra key={f.chave} fatia={f} />)}
          </div>
        </Bloco>

        <Bloco
          titulo="Formas de pagamento" Icone={CreditCard}
          vazio={formas.length === 0 ? 'Nenhuma venda na régua neste mês.' : undefined}
        >
          <div className="py-1.5">
            {formas.slice(0, 12).map(f => <Barra key={f.chave} fatia={f} />)}
          </div>
        </Bloco>
      </div>
    </div>
  );
}

