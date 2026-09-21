/**
 * QuartisComercial — a aba Quartis do Painel do Líder do Comercial.
 *
 * ## O pedido de 21/09/2026
 *
 * «No painel líder foi copiado o do BookPlay, mas do lado do Desempenho Equipes
 * ele fez a aba Pessoas, e eu quero uma aba de Quartis. Pode manter as
 * informações de vendas — faturamento, ticket e tudo mais —, só que eu quero
 * informação também de Quartil, as cores bonitinhas de Quartil.»
 *
 * Então é a leitura de `QuartisOperadores` da cobrança — tabela por pessoa com
 * meta, realizado, ritmo, esperado até hoje, diferença, % de projeção e a faixa
 * colorida, mais a distribuição ao lado — com a fonte trocada: onde lá se lê o
 * recebimento do analítico, aqui se lê a venda **confirmada e assinada**.
 *
 * Aba Pessoas continua onde estava. As duas respondem coisas diferentes:
 * Pessoas diz QUANTO cada um fez; Quartis diz se esse quanto está no RITMO.
 *
 * ## A meta individual não existe no Comercial, e é daí que vem a régua daqui
 *
 * `metas` do Comercial tem dois tipos: `setor` e `equipe`. Não há meta por
 * pessoa, e não é esquecimento — a operação combina o alvo com o time, não com
 * cada vendedor.
 *
 * Sem alvo individual não há projeção individual, e sem projeção não há
 * quartil. Só que a pergunta «quem está no ritmo?» continua valendo, e a
 * resposta honesta é a **parte de cada um na meta do time**: a meta da equipe
 * (ou, sem ela, a do setor) dividida pelas pessoas que a equipe tem para
 * cumpri-la.
 *
 * A tela diz isso com todas as letras — a coluna se chama «PARTE NA META» e o
 * cabeçalho explica de onde ela saiu. É a mesma conta que o operador já vê em
 * `MinhaParteNaMeta`, na aba Vendas, e de propósito: duas telas do mesmo
 * sistema não podem dizer números diferentes para a mesma pessoa.
 *
 * ## Quem NÃO entra na tabela
 *
 * As mesmas três exclusões da cobrança, e pelos mesmos motivos:
 *
 *   • **robô** — automação não tem ritmo a medir, e disputaria faixa com gente;
 *   • **desligado sem venda** — seria medido contra o mês inteiro que não
 *     trabalhou, e cairia de faixa por ter saído;
 *   • **sem parte na meta** — recorte sem meta configurada não tem contra o que
 *     projetar. A linha existiria com «—» em tudo, e a distribuição ao lado já
 *     ignora quem não tem meta: a tabela e o gráfico mostrariam populações
 *     diferentes em silêncio.
 *
 * Quem cai no terceiro caso não some: vai para a faixa do topo, que diz quantos
 * são e qual recorte está sem meta.
 *
 * ## A ausência desconta, aqui como em todo o Comercial
 *
 * A parte de cada um é medida contra os dias úteis que ELA tinha. Quem perdeu 4
 * dias em atestado não é cobrado pelos 22 do mês — `fatorDePresenca` e
 * `ajustarMetaPorPresenca`, os mesmos do card de equipe.
 *
 * ## A régua manda na unidade, e o quartil não muda com ela
 *
 * Setor medido por quantidade é projetado em quantidade; por valor, em valor. A
 * % de projeção é a mesma conta nos dois casos — é razão entre realizado e
 * esperado —, então a faixa não depende da unidade escolhida.
 */
import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, Target, TriangleAlert, Users } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { COR_QUARTIL, QUARTIS_PADRAO } from '@/lib/diasUteis';
import { calcularProjecao } from '@/lib/projecaoMetas';
import { ajustarMetaPorPresenca, ehRegua, type ReguaMeta } from '@/lib/vendasMeta';
import type { ResumoVendas } from '@/lib/vendas';
import { ticketMedio } from '@/lib/vendasDashboard';
import type { MetaDeRecorte } from '@/services/vendas/metasVendas.service';
import type { PessoaComAusencia } from '@/services/vendas/placar.service';
import type { PresencaDoRecorte } from '@/lib/vendasMeta';
import { PizzaQuartis3D, type FatiaQuartil } from '@/pages/Dashboard/Analitico/PizzaQuartis3D';
import { corTexto } from '@/lib/temas';

export interface LinhaQuartil {
  id: string;
  nome: string;
  fotoUrl: string | null;
  equipeNome: string | null;
  setorNome: string | null;
  /** O que a pessoa fez no recorte. Zero para quem não vendeu. */
  resumo: ResumoVendas;
  /** Dias úteis do mês que a ausência dela abateu. */
  diasAbatidos: number;
}

interface Props {
  /** As pessoas do recorte, já sem robô e sem desligado que não vendeu. */
  pessoas: readonly PessoaComAusencia[];
  /** O placar por pessoa: id → resumo do que ela fez. */
  resumoPorPessoa: ReadonlyMap<string, ResumoVendas>;
  /** As metas do mês, como o banco as devolve. */
  metas: readonly MetaDeRecorte[];
  /** A presença de cada setor e equipe, indexada pelo id do recorte. */
  presencaPorRecorte: ReadonlyMap<string, PresencaDoRecorte>;
  /** A régua do painel — quantidade ou valor. */
  regua: ReguaMeta;
  uteis: number;
  trabalhados: number;
}

/** O número que a régua lê de um resumo. */
function medir(r: ResumoVendas | undefined, regua: ReguaMeta): number {
  if (!r) return 0;
  return regua === 'quantidade' ? r.quantidade : r.valor;
}

function formatarNaRegua(n: number, regua: ReguaMeta): string {
  if (regua !== 'quantidade') return formatBRL(n);
  const texto = n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${texto} ${Math.abs(n) === 1 ? 'venda' : 'vendas'}`;
}

const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

/** A linha já com a conta feita — ou sem, quando não há parte na meta. */
interface LinhaCalculada {
  pessoa: PessoaComAusencia;
  feito: number;
  resumo: ResumoVendas;
  /** A parte dela na meta do time, já descontada a ausência DELA. */
  parte: number | null;
  /** Dias úteis que valem para esta pessoa (o mês menos a ausência dela). */
  uteisDela: number;
  projecao: ReturnType<typeof calcularProjecao>;
  recorte: string | null;
}

export function QuartisComercial({
  pessoas, resumoPorPessoa, metas, presencaPorRecorte, regua, uteis, trabalhados,
}: Props) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [foco, setFoco] = useState<number | null>(null);

  const linhas = useMemo((): LinhaCalculada[] => {
    /**
     * A meta de um recorte na régua do painel, SEM desconto de ausência.
     *
     * O desconto vem depois e é individual: descontar aqui usaria a ausência
     * do time inteiro para medir uma pessoa que não faltou.
     */
    const metaBrutaDe = (id: string | null): { alvo: number; id: string } | null => {
      if (!id) return null;
      const m = metas.find(x => x.referencia_id === id && ehRegua(x.regua));
      if (!m) return null;
      const alvo = regua === 'quantidade' ? m.quantidade : m.valor;
      return alvo > 0 ? { alvo, id } : null;
    };

    /** Quantas pessoas o recorte tem para cumprir a meta dele. */
    const cabecasDo = (id: string) => presencaPorRecorte.get(id)?.pessoas ?? 0;

    return pessoas.map((p): LinhaCalculada => {
      const resumo = resumoPorPessoa.get(p.id);
      const feito = medir(resumo, regua);

      /*
       * A equipe manda; o setor é a reserva.
       *
       * Uma pessoa com equipe é medida pela meta da equipe dela — é com esse
       * time que ela combinou o alvo. Sem equipe (ou sem meta de equipe), cai
       * na do setor. É a mesma ordem que `MinhaParteNaMeta` usa na aba Vendas.
       */
      const recorte = metaBrutaDe(p.equipe_id) ?? metaBrutaDe(p.setor_id);
      const cabecas = recorte ? cabecasDo(recorte.id) : 0;

      // O mês que ESTA pessoa tinha, e não o do calendário.
      const uteisDela = Math.max(0, uteis - p.diasAbatidos);

      let parte: number | null = null;
      if (recorte && cabecas > 0) {
        // A parte bruta, e então o desconto da ausência dela — na mesma função
        // que o card de equipe usa, para os dois lados nunca divergirem.
        const bruta = recorte.alvo / cabecas;
        const fator = uteis > 0 ? uteisDela / uteis : null;
        const ajustada = ajustarMetaPorPresenca(
          regua === 'quantidade'
            ? { regua, quantidade: bruta, valor: 0 }
            : { regua, quantidade: 0, valor: bruta },
          fator,
        );
        const alvo = regua === 'quantidade' ? ajustada.quantidade : ajustada.valor;
        parte = alvo > 0 ? alvo : null;
      }

      const projecao = parte === null ? null : calcularProjecao({
        meta: parte,
        recebido: feito,
        // Os dias úteis DELA nos dois lados: a meta já foi reduzida, e medir
        // uma meta reduzida contra o mês cheio devolveria a punição pela porta
        // dos fundos.
        totalUteis: uteisDela,
        decorridos: Math.min(trabalhados, uteisDela),
        quartis: QUARTIS_PADRAO,
        limitePct: 999,
      });

      return {
        pessoa: p,
        feito,
        resumo: resumo ?? { quantidade: 0, valor: 0 } as ResumoVendas,
        parte,
        uteisDela,
        projecao,
        recorte: recorte?.id ?? null,
      };
    });
  }, [pessoas, resumoPorPessoa, metas, presencaPorRecorte, regua, uteis, trabalhados]);

  const comMeta = useMemo(
    () => linhas.filter(l => l.projecao !== null)
      .sort((a, b) => (b.projecao?.projecaoPct ?? 0) - (a.projecao?.projecaoPct ?? 0)),
    [linhas],
  );
  const semMeta = useMemo(() => linhas.filter(l => l.projecao === null), [linhas]);

  const fatias = useMemo((): FatiaQuartil[] =>
    QUARTIS_PADRAO.map(q => ({
      quartil: q.quartil,
      qtd: comMeta.filter(l => l.projecao?.quartil?.quartil === q.quartil).length,
    })), [comMeta]);

  const visiveis = useMemo(
    () => (foco === null ? comMeta : comMeta.filter(l => l.projecao?.quartil?.quartil === foco)),
    [comMeta, foco],
  );

  if (pessoas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-14 text-muted-foreground">
        <Users className="h-6 w-6 opacity-40" aria-hidden />
        <p className="text-sm">Ninguém no recorte escolhido.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── O que está sendo medido ────────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <Target className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>
          O Comercial não tem meta por pessoa, então o quartil mede a{' '}
          <strong className="text-foreground">parte de cada um na meta do time</strong>: a meta da
          equipe (ou, sem ela, a do setor) dividida por quem a equipe tem para cumpri-la, já com a
          ausência de cada um descontada. A régua é{' '}
          <strong className="text-foreground">{regua === 'quantidade' ? 'quantidade de vendas' : 'faturamento'}</strong>,
          e o que conta é venda confirmada e assinada.
        </p>
      </div>

      {semMeta.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-foreground/80">
            <strong>{semMeta.length} {semMeta.length === 1 ? 'pessoa está' : 'pessoas estão'} fora do quartil</strong>
            {' '}— a equipe ou o setor {semMeta.length === 1 ? 'dela' : 'delas'} não tem meta configurada neste mês,
            e sem alvo não há ritmo a medir. Configure a meta na aba Metas, em Usuários.
            <span className="ml-1 text-muted-foreground">
              ({semMeta.slice(0, 6).map(l => l.pessoa.nome.split(' ')[0]).join(', ')}
              {semMeta.length > 6 ? ` e mais ${semMeta.length - 6}` : ''})
            </span>
          </p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        {/* ── A tabela ─────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[820px] text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px]">
                  <th className="min-w-[190px] px-3 py-3 text-left font-semibold text-muted-foreground">PESSOA</th>
                  <th className="w-[110px] px-3 py-3 text-right font-semibold text-muted-foreground">PARTE NA META</th>
                  <th className="w-[110px] px-3 py-3 text-right font-semibold text-muted-foreground">FEITO</th>
                  <th className="w-[100px] px-3 py-3 text-right font-semibold text-muted-foreground">ATÉ HOJE</th>
                  <th className="w-[110px] px-3 py-3 text-right font-semibold text-muted-foreground">FALTA / SOBRA</th>
                  <th className="w-[110px] px-3 py-3 text-right font-semibold text-muted-foreground">TICKET</th>
                  <th className="w-[96px] px-3 py-3 text-right font-semibold text-muted-foreground">PROJEÇÃO</th>
                  <th className="w-[92px] px-3 py-3 text-center font-semibold text-muted-foreground">QUARTIL</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      {foco === null
                        ? 'Ninguém com meta configurada no recorte.'
                        : `Ninguém no ${foco}º quartil.`}
                    </td>
                  </tr>
                ) : visiveis.map((l, i) => {
                  const p = l.projecao!;
                  const q = p.quartil?.quartil ?? 4;
                  const cor = COR_QUARTIL[q];
                  const detalhe = aberta === l.pessoa.id;
                  const ticket = ticketMedio(l.resumo);
                  return (
                    <Fragment key={l.pessoa.id}>
                      <tr
                        className={cn(
                          'cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40',
                          i % 2 === 0 && 'bg-muted/10',
                          detalhe && 'bg-accent/50',
                        )}
                        onClick={() => setAberta(detalhe ? null : l.pessoa.id)}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {l.pessoa.foto_url ? (
                              <img src={l.pessoa.foto_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                            ) : (
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                                {iniciais(l.pessoa.nome)}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">{l.pessoa.nome}</p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {l.pessoa.equipe_nome ?? l.pessoa.setor_nome ?? 'sem equipe'}
                                {l.pessoa.diasAbatidos > 0 && (
                                  <span className="ml-1 text-amber-600 dark:text-amber-400">
                                    · −{l.pessoa.diasAbatidos.toLocaleString('pt-BR')} dia
                                    {l.pessoa.diasAbatidos === 1 ? '' : 's'}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-muted-foreground">
                          {formatarNaRegua(l.parte ?? 0, regua)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                          {formatarNaRegua(l.feito, regua)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-muted-foreground">
                          {formatarNaRegua(p.esperado, regua)}
                        </td>
                        <td className={cn(
                          'whitespace-nowrap px-3 py-2.5 text-right font-mono font-medium',
                          p.diferenca >= 0 ? 'text-success' : 'text-destructive',
                        )}>
                          {p.diferenca >= 0 ? '+' : '−'}{formatarNaRegua(Math.abs(p.diferenca), regua)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-muted-foreground">
                          {ticket !== null ? formatBRL(ticket) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-bold tabular-nums"
                          style={{ color: cor }}>
                          {p.projecaoPct}%
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <span
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                              style={{ backgroundColor: cor, color: corTexto(cor) }}
                              title={`${q}º quartil`}
                            >
                              {q}
                            </span>
                            <ChevronDown className={cn(
                              'h-3.5 w-3.5 text-muted-foreground transition-transform', detalhe && 'rotate-180',
                            )} aria-hidden />
                          </div>
                        </td>
                      </tr>
                      {detalhe && (
                        <tr className="border-b border-border bg-accent/20">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
                              <Campo rotulo="Vendas na meta">{l.resumo.quantidade}</Campo>
                              <Campo rotulo="Faturamento">
                                <span className="font-mono">{formatBRL(l.resumo.valor)}</span>
                              </Campo>
                              <Campo rotulo="Ritmo necessário">
                                <span className="font-mono">{formatarNaRegua(p.metaDiaria, regua)}/dia útil</span>
                              </Campo>
                              <Campo rotulo="Dias úteis dela">
                                {l.uteisDela.toLocaleString('pt-BR')} de {uteis}
                              </Campo>
                              <Campo rotulo="Para subir de faixa">
                                {p.proximo && p.paraSubir !== null
                                  ? <span className="font-mono">
                                      +{formatarNaRegua(p.paraSubir, regua)} → {p.proximo.quartil}º
                                    </span>
                                  : <span className="text-success">já está na melhor faixa</span>}
                              </Campo>
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              A parte na meta saiu {l.pessoa.equipe_nome ? 'da equipe' : 'do setor'}{' '}
                              <strong className="text-foreground">
                                {l.pessoa.equipe_nome ?? l.pessoa.setor_nome ?? '—'}
                              </strong>
                              , dividida por {presencaPorRecorte.get(l.recorte ?? '')?.pessoas ?? 0} pessoa
                              {(presencaPorRecorte.get(l.recorte ?? '')?.pessoas ?? 0) === 1 ? '' : 's'}.
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── A distribuição ───────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Distribuição
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/80">
            {comMeta.length} {comMeta.length === 1 ? 'pessoa' : 'pessoas'} com parte na meta
            {foco !== null && ' · clique de novo para ver todas'}
          </p>
          <div className="mt-2 flex justify-center">
            <PizzaQuartis3D
              fatias={fatias} total={comMeta.length}
              selecionado={foco} onSelecionar={setFoco}
            />
          </div>
          <ul className="mt-2 space-y-1">
            {QUARTIS_PADRAO.map(q => {
              const qtd = fatias.find(f => f.quartil === q.quartil)?.qtd ?? 0;
              return (
                <li key={q.quartil}>
                  <button
                    type="button"
                    onClick={() => setFoco(foco === q.quartil ? null : q.quartil)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2 py-1 text-[11px] transition-colors hover:bg-accent/40',
                      foco === q.quartil && 'bg-accent/60',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_QUARTIL[q.quartil] }} />
                      {q.quartil}º quartil
                      <span className="text-muted-foreground">· {q.min_pct}%+</span>
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-foreground">{qtd}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <div className="mt-0.5 truncate text-xs text-foreground">{children}</div>
    </div>
  );
}
