/**
 * PainelLiderComercial — o painel de quem cobra a equipe.
 *
 * ## Por que não é o Painel Líder da cobrança
 *
 * Aquele mede recebimento, acordo, ticket médio e quartil. Aqui a pergunta é
 * outra: quem vendeu, quem está devendo assinatura, quem devolveu, e quem não
 * estava.
 *
 * ## As três perguntas do líder, nesta ordem
 *
 *   1. A equipe vai bater?      — a meta, com a ausência já descontada.
 *   2. O que está travado?      — a fila de assinatura, por pessoa.
 *   3. Quem precisa de conversa? — quem devolve muito, quem não vendeu,
 *                                  quem está fora.
 *
 * O ranking vem por último de propósito. Ele é o resultado; as duas perguntas
 * acima são o que ainda dá para mudar hoje.
 *
 * ## «Pendente de assinatura» é a coluna que vale dinheiro
 *
 * «Falta de assinatura do contrato» é o maior motivo de cancelamento no
 * relatório: 27 dos 44 de setembro. Uma venda confirmada e não assinada é uma
 * venda que já foi feita e ainda pode ser perdida — por isso ela aparece em
 * âmbar, pessoa por pessoa, antes do placar.
 *
 * ## Quem não vendeu aparece
 *
 * Um painel montado só sobre as vendas do mês esconde exatamente quem o líder
 * precisa procurar. A lista de pessoas vem do cadastro
 * (`fn_vendas_placar_pessoas`), e quem não tem venda nenhuma aparece com zero —
 * com a ausência ao lado, quando houver, para o zero não ser lido como
 * desleixo de quem estava de atestado.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, RefreshCw, TriangleAlert, PenLine, UserMinus, Users, Trophy, Bot,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { KpiTile } from '@/components/KpiTile';
import { SeletorMes } from '@/components/AnalyticsPanel/SeletorMes';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMesGlobal } from '@/providers/MesProvider';
import { useVendas } from '@/hooks/useVendas';
import { useVendasPlacar } from '@/hooks/useVendasPlacar';
import { formatBRL } from '@/lib/money';
import { ROUTE_PATHS, getTodayISO } from '@/lib/index';
import { partesDoMes, rotuloDoMes } from '@/lib/mesReferencia';
import { diasUteisDoMes, diasUteisDecorridos } from '@/lib/diasUteis';
import { cn } from '@/lib/utils';
import { GAVETA_COLORS } from '@/lib/vendas';
import {
  placarPorOperador, placarPorEquipe, separarAutomacao, totalDoRecorte,
  type LinhaDoPlacar,
} from '@/lib/vendasPlacar';
import {
  progressoDaMeta, fatorDePresenca, ajustarMetaPorPresenca, rotuloDaPresenca,
  ehRegua, REGUA_LABEL, type ReguaMeta,
} from '@/lib/vendasMeta';
import { resumirVendas } from '@/lib/vendas';
import { buscarMetasDoMes, type MetaDeRecorte } from '@/services/vendas/metasVendas.service';
import type { PessoaComAusencia } from '@/services/vendas/placar.service';
import { Bloco, Faixa } from './componentes';

/** O `Select` do shadcn recusa `value=""`; o «todas» precisa de um valor. */
const TODAS_AS_EQUIPES = '__todas__';

interface LinhaDaPessoa {
  pessoa: PessoaComAusencia;
  placar: LinhaDoPlacar;
}

export default function PainelLiderComercial() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const { mes, setMes } = useMesGlobal();

  const [equipeEscolhida, setEquipeEscolhida] = useState(TODAS_AS_EQUIPES);
  const [metas, setMetas] = useState<MetaDeRecorte[]>([]);

  const empresaId = empresa?.id ?? null;
  const ativo = Boolean(empresaId);

  /*
   * O eixo é fixo em `confirmacao`, e isso é decisão e não esquecimento.
   *
   * A meta conta pela data de confirmação. Um painel de cobrança de meta que
   * deixasse trocar o eixo mostraria, no outro, um percentual que parece certo
   * e não é — e o líder cobraria a equipe por ele.
   */
  const { vendas, carregando, disponivel, erro, recarregar } =
    useVendas({ empresaId, mes, eixo: 'confirmacao', ativo });
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

  const regua: ReguaMeta = useMemo(() => {
    const doSetor = metas.find(m => m.tipo === 'setor' && ehRegua(m.regua));
    return (doSetor?.regua as ReguaMeta | undefined) ?? 'valor';
  }, [metas]);

  /** As equipes que existem no cadastro — não só as que venderam. */
  const equipes = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of placar.pessoas) {
      if (p.equipe_id && p.equipe_nome) mapa.set(p.equipe_id, p.equipe_nome);
    }
    return [...mapa].map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [placar.pessoas]);

  const filtrando = equipeEscolhida !== TODAS_AS_EQUIPES;

  const vendasNaTela = useMemo(() => {
    if (!filtrando) return vendas;
    const daEquipe = new Set(
      placar.pessoas.filter(p => p.equipe_id === equipeEscolhida).map(p => p.id),
    );
    return vendas.filter(v => daEquipe.has(v.operador_id));
  }, [vendas, filtrando, equipeEscolhida, placar.pessoas]);

  /** Quem vendeu no recorte. Decide se um desligado ainda tem o que explicar. */
  const quemVendeu = useMemo(
    () => new Set(vendasNaTela.map(v => v.operador_id)),
    [vendasNaTela],
  );

  /**
   * Quem entra na tela: a equipe escolhida, ou todo mundo que o alcance traz.
   *
   * ## O desligado que vendeu continua na lista
   *
   * Seria mais simples tirar todo desligado — o perfil dele existe para a venda
   * ter dono, não para ocupar linha num painel de cobrança de meta. Mas as
   * vendas dele **somam no total** lá em cima, e uma tela que mostra um total
   * maior do que a soma da lista abaixo é a tela que o Fechamento do Setor
   * existe para tornar impossível.
   *
   * Então: desligado sem venda no recorte sai; desligado COM venda fica, para
   * o número ter de onde vir. É o mesmo raciocínio da gaveta `sem_operador` do
   * Fechamento — o geral traz venda antiga de gente que já não está no setor, e
   * escondê-la não a faz sumir da conta.
   *
   * O robô sai sempre: ele tem card próprio, logo abaixo, com o total dele.
   */
  const pessoasNaTela = useMemo(
    () => placar.pessoas.filter(p =>
      !p.robo
      && (p.situacao !== 'desligado' || quemVendeu.has(p.id))
      && (!filtrando || p.equipe_id === equipeEscolhida)),
    [placar.pessoas, filtrando, equipeEscolhida, quemVendeu],
  );

  const total = useMemo(
    () => totalDoRecorte(vendasNaTela, placar.indice),
    [vendasNaTela, placar.indice],
  );

  /*
   * A lista de gente: o cadastro à esquerda, o placar à direita.
   *
   * Sai do CADASTRO e não das vendas. Um painel montado sobre as vendas do mês
   * esconde exatamente quem o líder precisa procurar — quem não vendeu.
   */
  const linhas = useMemo((): LinhaDaPessoa[] => {
    const porPessoa = new Map(
      placarPorOperador(vendasNaTela, placar.indice, regua).map(l => [l.operadorId, l]),
    );
    const vazio = resumirVendas([]);

    return pessoasNaTela
      .map((pessoa): LinhaDaPessoa => ({
        pessoa,
        placar: porPessoa.get(pessoa.id) ?? {
          operadorId: pessoa.id,
          nome: pessoa.nome,
          robo: pessoa.robo,
          equipeId: pessoa.equipe_id,
          equipeNome: pessoa.equipe_nome,
          setorId: pessoa.setor_id,
          setorNome: pessoa.setor_nome,
          resumo: vazio,
        },
      }))
      .sort((a, b) => {
        const da = regua === 'valor' ? a.placar.resumo.valor : a.placar.resumo.quantidade;
        const db = regua === 'valor' ? b.placar.resumo.valor : b.placar.resumo.quantidade;
        if (db !== da) return db - da;
        return a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR');
      });
  }, [pessoasNaTela, vendasNaTela, placar.indice, regua]);

  /** A automação do recorte, à parte — soma no total, não disputa o pódio. */
  const automacao = useMemo(
    () => separarAutomacao(placarPorOperador(vendasNaTela, placar.indice, regua)).automacao,
    [vendasNaTela, placar.indice, regua],
  );

  /** A fila de assinatura, pessoa por pessoa. É o que ainda dá para salvar. */
  const filaDeAssinatura = useMemo(
    () => linhas.filter(l => l.placar.resumo.porGaveta.pendente_assinatura > 0),
    [linhas],
  );

  const semVenda = useMemo(
    () => linhas.filter(l => l.placar.resumo.quantidade === 0),
    [linhas],
  );

  const ausentesHoje = useMemo(
    () => pessoasNaTela.filter(p => p.diasAbatidos > 0),
    [pessoasNaTela],
  );

  /** A meta do recorte na tela: a da equipe escolhida, ou a do setor. */
  const metaDoRecorte = useMemo(() => {
    if (filtrando) return metas.find(m => m.tipo === 'equipe' && m.referencia_id === equipeEscolhida);
    return metas.find(m => m.tipo === 'setor' && ehRegua(m.regua));
  }, [metas, filtrando, equipeEscolhida]);

  const presenca = metaDoRecorte
    ? placar.presencaPorRecorte.get(metaDoRecorte.referencia_id)
    : undefined;
  const fator = presenca ? fatorDePresenca(presenca) : null;
  const explicacao = presenca ? rotuloDaPresenca(presenca, fator) : null;

  const andamento = useMemo(() => {
    if (!metaDoRecorte || !ehRegua(metaDoRecorte.regua)) return null;
    const meta = ajustarMetaPorPresenca(
      { regua: metaDoRecorte.regua, quantidade: metaDoRecorte.quantidade, valor: metaDoRecorte.valor },
      fator,
    );
    return progressoDaMeta({ meta, resumo: total.resumo, uteis, trabalhados });
  }, [metaDoRecorte, fator, total.resumo, uteis, trabalhados]);

  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
  const carregandoTudo = (carregando || placar.carregando) && placar.pessoas.length === 0;
  const equipesDoRecorte = useMemo(
    () => placarPorEquipe(vendas, placar.indice),
    [vendas, placar.indice],
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-border bg-card p-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Painel Líder</h1>
            <p className="text-[12px] text-muted-foreground">
              {rotuloDoMes(mes)} · pelo dia da confirmação · {trabalhados} de {uteis} dias úteis
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {equipes.length > 1 && (
            <Select value={equipeEscolhida} onValueChange={setEquipeEscolhida}>
              <SelectTrigger className="h-8 w-[200px] text-[12px]" aria-label="Filtrar por equipe">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS_AS_EQUIPES}>Todas as equipes</SelectItem>
                {equipes.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
      {!placar.disponivel && (
        <Faixa tom="info">
          O cadastro das pessoas não respondeu, então <strong>quem não vendeu não aparece</strong> e
          a meta não desconta ausência. Confira a migration
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">
            20260915230000_vendas_fase9_placar_e_paineis.sql</code>.
        </Faixa>
      )}

      {/* ── 1. A equipe vai bater? ─────────────────────────────────────── */}
      {carregandoTudo ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile
            rotulo={regua === 'quantidade' ? 'Vendas na meta' : 'Faturamento'}
            valor={regua === 'quantidade' ? total.resumo.quantidade : formatBRL(total.resumo.valor)}
            sub="confirmado e assinado" Icon={Trophy} tom="primario"
          />
          <KpiTile
            rotulo="Pendente de assinatura"
            valor={total.resumo.porGaveta.pendente_assinatura}
            sub={formatBRL(total.resumo.valorPorGaveta.pendente_assinatura)}
            Icon={PenLine} tom="alerta"
          />
          <KpiTile
            rotulo="Devolução / cancelamento"
            valor={`${pct(total.resumo.pctDevolucao)} / ${pct(total.resumo.pctCancelamento)}`}
            sub="sobre o que foi confirmado" Icon={TriangleAlert} tom="alerta"
          />
          <KpiTile
            rotulo="Gente que vendeu"
            valor={`${total.pessoasQueVenderam} de ${pessoasNaTela.length}`}
            sub={ausentesHoje.length > 0
              ? `${ausentesHoje.length} com ausência no mês`
              : 'ninguém com ausência no mês'}
            Icon={Users} tom="neutro"
          />
        </div>
      )}

      {andamento?.oficial && (
        <section className="space-y-1.5 rounded-xl border border-border bg-card px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="flex items-center gap-2 text-[13px] font-medium">
              {metaDoRecorte?.nome}
              <Badge variant="outline" className="text-[10px] font-normal">
                {REGUA_LABEL[andamento.regua!]}
              </Badge>
            </span>
            <span className="text-[12px] tabular-nums">
              <strong className={cn(andamento.oficial.bateu && 'text-success')}>
                {regua === 'quantidade'
                  ? andamento.oficial.feito
                  : formatBRL(andamento.oficial.feito)}
              </strong>
              <span className="text-muted-foreground">
                {' de '}
                {regua === 'quantidade'
                  ? andamento.oficial.alvo
                  : formatBRL(andamento.oficial.alvo)}
                {' · '}{pct(andamento.oficial.pct)}
              </span>
            </span>
          </div>
          <Progress
            value={Math.min(Math.round((andamento.oficial.pct ?? 0) * 100), 100)}
            className="h-1.5"
          />
          {explicacao && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <UserMinus className="h-3 w-3 shrink-0" aria-hidden /> {explicacao}
            </p>
          )}
          {andamento.ritmoOficial?.precisaPorDia != null && !andamento.oficial.bateu && (
            <p className="text-[11px] tabular-nums text-muted-foreground">
              Precisa de{' '}
              <strong className="text-foreground">
                {regua === 'quantidade'
                  ? `${Math.ceil(andamento.ritmoOficial.precisaPorDia)} por dia`
                  : `${formatBRL(andamento.ritmoOficial.precisaPorDia)} por dia`}
              </strong>
              {' · ritmo '}{pct(andamento.ritmoOficial.projecaoPct)}
            </p>
          )}
        </section>
      )}

      {!andamento && (
        <Faixa tom="info">
          {filtrando
            ? <>Esta equipe não tem meta configurada para {rotuloDoMes(mes)}.{' '}</>
            : <>Nenhum setor tem meta com régua escolhida para {rotuloDoMes(mes)}.{' '}</>}
          <Link to={ROUTE_PATHS.VENDAS_METAS} className="underline underline-offset-2">
            Configurar em Metas de Vendas
          </Link>.
        </Faixa>
      )}

      {/* ── 2. O que está travado ──────────────────────────────────────── */}
      <Bloco
        titulo="Esperando assinatura" Icone={PenLine}
        sub="o maior motivo de cancelamento do relatório"
        vazio={filaDeAssinatura.length === 0
          ? 'Ninguém com venda confirmada e não assinada. É o estado bom.'
          : undefined}
      >
        {filaDeAssinatura.map(({ pessoa, placar: l }) => (
          <div key={pessoa.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{pessoa.nome}</span>
            {pessoa.equipe_nome && (
              <span className="shrink-0 text-[11px] text-muted-foreground">{pessoa.equipe_nome}</span>
            )}
            <Badge variant="outline" className={cn('text-[10px]', GAVETA_COLORS.pendente_assinatura)}>
              {l.resumo.porGaveta.pendente_assinatura} venda
              {l.resumo.porGaveta.pendente_assinatura === 1 ? '' : 's'}
            </Badge>
            <span className="w-24 shrink-0 text-right text-[13px] font-semibold tabular-nums">
              {formatBRL(l.resumo.valorPorGaveta.pendente_assinatura)}
            </span>
          </div>
        ))}
      </Bloco>

      {/* ── 3. A equipe, pessoa por pessoa ─────────────────────────────── */}
      <Bloco
        titulo={filtrando ? 'A equipe' : 'As pessoas'} Icone={Users}
        sub={regua === 'quantidade' ? 'ordenado por quantidade' : 'ordenado por faturamento'}
        vazio={linhas.length === 0
          ? (placar.disponivel
              ? 'Nenhuma pessoa no seu alcance para este recorte.'
              : 'O cadastro não respondeu — ver o aviso acima.')
          : undefined}
      >
        {linhas.map(({ pessoa, placar: l }) => {
          const r = l.resumo;
          const perdeu = (r.pctDevolucao ?? 0) + (r.pctCancelamento ?? 0) > 0;
          const foraDoMes = pessoa.diasAbatidos > 0;
          return (
            <div key={pessoa.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-accent/30">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {pessoa.nome}
                {/* Só aparece aqui quem ainda tem venda no recorte — ver
                    `pessoasNaTela`. Sem o rótulo, a linha se leria como alguém
                    da equipe que não vendeu, e o líder cobraria um ausente. */}
                {pessoa.situacao === 'desligado' && (
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    desligado · a venda continua contando
                  </span>
                )}
                {r.quantidade === 0 && pessoa.situacao !== 'desligado' && (
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    sem venda no mês
                  </span>
                )}
              </span>
              {!filtrando && pessoa.equipe_nome && (
                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                  {pessoa.equipe_nome}
                </span>
              )}
              {foraDoMes && (
                <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                  <UserMinus className="h-3 w-3" aria-hidden />
                  {pessoa.diasAbatidos.toString().replace('.', ',')}d
                </span>
              )}
              {r.porGaveta.pendente_assinatura > 0 && (
                <Badge variant="outline" className={cn('text-[10px]', GAVETA_COLORS.pendente_assinatura)}>
                  {r.porGaveta.pendente_assinatura} sem assinar
                </Badge>
              )}
              {perdeu && (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  dev {pct(r.pctDevolucao)} · canc {pct(r.pctCancelamento)}
                </span>
              )}
              <span className="w-14 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                {regua === 'quantidade' ? formatBRL(r.valor) : `${r.quantidade}v`}
              </span>
              <span className="w-24 shrink-0 text-right text-[13px] font-semibold tabular-nums">
                {regua === 'quantidade' ? r.quantidade : formatBRL(r.valor)}
              </span>
            </div>
          );
        })}
      </Bloco>

      {/* ── As equipes, quando o painel mostra o setor inteiro ─────────── */}
      {!filtrando && equipesDoRecorte.length > 1 && (
        <Bloco titulo="Por equipe" Icone={Users} sub="a soma bate com o total do setor">
          {equipesDoRecorte.map(e => (
            <div key={e.equipeId ?? 'sem'}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                {e.nome}
                {e.equipeId === null && (
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    resíduo a resolver — vendedor sem equipe no cadastro
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {e.pessoas} {e.pessoas === 1 ? 'pessoa' : 'pessoas'}
              </span>
              <span className="w-14 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                {e.resumo.quantidade}v
              </span>
              <span className="w-28 shrink-0 text-right text-[13px] font-semibold tabular-nums">
                {formatBRL(e.resumo.valor)}
              </span>
            </div>
          ))}
        </Bloco>
      )}

      {/* ── A automação ────────────────────────────────────────────────── */}
      {automacao.length > 0 && (
        <Bloco
          titulo="Automação" Icone={Bot}
          sub={total.fracaoAutomacao !== null
            ? `${Math.round(total.fracaoAutomacao * 100)}% do faturamento deste recorte`
            : undefined}
        >
          {automacao.map(l => (
            <div key={l.operadorId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{l.nome}</span>
              <span className="w-14 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                {l.resumo.quantidade}v
              </span>
              <span className="w-28 shrink-0 text-right text-[13px] font-semibold tabular-nums">
                {formatBRL(l.resumo.valor)}
              </span>
            </div>
          ))}
        </Bloco>
      )}

      {/* ── Quem não vendeu, resumido ──────────────────────────────────── */}
      {semVenda.length > 0 && (
        <p className="px-1 text-[11px] text-muted-foreground">
          {semVenda.length} {semVenda.length === 1 ? 'pessoa' : 'pessoas'} sem venda na régua em{' '}
          {rotuloDoMes(mes)}
          {ausentesHoje.length > 0 && <> · {ausentesHoje.length} com ausência registrada</>}.
          {' '}O detalhe de cada uma está em{' '}
          <Link to={ROUTE_PATHS.VENDAS_ACOMPANHAMENTO} className="underline underline-offset-2">
            Acompanhamento
          </Link>.
        </p>
      )}
    </div>
  );
}



