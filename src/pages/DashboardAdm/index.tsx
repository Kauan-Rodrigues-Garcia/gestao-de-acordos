/**
 * Dashboard – ADM — o painel do Núcleo de Inteligência e Gestão.
 *
 * ## Por que uma aba, e não o `/` de antes
 *
 * Até 11/09/2026 este painel era o que `/` desenhava para quem estava no SETOR
 * do Núcleo (`DashboardNucleo`, decidido por `useNucleo`). Virou aba própria,
 * com chave e card no painel de permissões (`ver_dashboard_adm`): quem vê é
 * decisão do painel, como toda aba. Para o Assistente ADM ele continua sendo a
 * tela inicial — a rota `/` o manda para cá pela chave.
 *
 * ## A ordem das seções
 *
 * A urgência de quem abre às sete da manhã, e depois o retrato:
 *
 *   1. o que voltou dos setores e espera tratamento;
 *   2. o acervo hoje, em indicadores;
 *   3. o período: entradas e saídas por dia, a qualidade (quanto demora a
 *      aquecer, por que volta), o que volta banido por setor e o que aconteceu
 *      por último;
 *   4. os aparelhos vaga a vaga, e quem está com quantos.
 *
 * ## Um filtro só
 *
 * O período (7, 30 ou 90 dias) fica numa linha acima de tudo e vale para todas as
 * seções do período. O acervo é sempre o de hoje, e cada seção diz a qual das
 * duas perguntas responde.
 *
 * ## O que ele não decide
 *
 * Nada sobre acesso. A rota exige `ver_dashboard_adm`, e o DADO passa pela RLS do
 * Controle de Números: quem não é do Núcleo nem super_admin abre a aba e vê zeros.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Ban, CheckCircle2, Flame, Hash, Send, Timer, Trash2, Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTE_PATHS } from '@/lib/index';
import { cn } from '@/lib/utils';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useControleNumeros } from '@/hooks/useControleNumeros';
import { useLixeiraNumeros } from '@/hooks/useLixeiraNumeros';
import { useMovimentacoesDoPeriodo } from '@/hooks/useMovimentacoesDoPeriodo';
import { mascararNumero } from '@/services/numeros/numerosFormato';
import { MOTIVO_LABELS, TRATAMENTO_LABELS } from '@/services/numeros/numerosRegras';
import {
  PERIODOS, type Periodo,
  serieDoFluxo, somarFluxo, banimentoPorSetor, motivosDeRetorno, aquecimentoMediano,
  retratoDoAcervo, distribuicaoPorSetor,
} from './metricas';
import { GraficoFluxo } from './GraficoFluxo';
import { ParedeDeAparelhos } from './ParedeDeAparelhos';

type Tom = 'neutro' | 'aquecendo' | 'pronto' | 'grave' | 'setor';

const COR_DO_TOM: Record<Tom, string> = {
  neutro:    'text-muted-foreground',
  aquecendo: 'text-warning',
  pronto:    'text-success',
  grave:     'text-destructive',
  setor:     'text-primary',
};

/**
 * Um número com o rótulo em cima. O ícone carrega o tom do estado; o número e o
 * texto ficam na cor de texto — cor sozinha não diz nada a quem não a distingue.
 */
function Indicador({
  icone: Icone, rotulo, valor, detalhe, tom = 'neutro',
}: {
  icone: React.ElementType;
  rotulo: string;
  valor: number;
  detalhe?: string;
  tom?: Tom;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icone className={cn('h-3.5 w-3.5 shrink-0', COR_DO_TOM[tom])} aria-hidden />
        <span className="truncate">{rotulo}</span>
      </p>
      <p className="mt-1.5 text-2xl font-semibold leading-none">{valor.toLocaleString('pt-BR')}</p>
      {detalhe && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

/** O título de uma faixa da página — e a qual pergunta ela responde. */
function TituloDeSecao({ children, detalhe }: { children: React.ReactNode; detalhe?: string }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">{children}</h2>
      {detalhe && <span className="text-xs text-muted-foreground">{detalhe}</span>}
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

function diasPorExtenso(dias: number): string {
  if (dias < 1) return 'menos de 1 dia';
  const arredondado = Math.round(dias * 10) / 10;
  return `${arredondado.toLocaleString('pt-BR')} ${arredondado === 1 ? 'dia' : 'dias'}`;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export default function DashboardAdm() {
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const {
    aparelhos, numeros, celulares, nomeDoSetor, loading, erro,
  } = useControleNumeros();

  const [periodo, setPeriodo] = useState<Periodo>(30);

  const empresaId = empresa?.id ?? null;
  // A lixeira é de quem administra os números; para os outros ela nem é lida.
  const podeVerLixeira = temPermissao('numeros_administrar');
  const lixeira = useLixeiraNumeros(podeVerLixeira ? empresaId : null);
  const trilha = useMovimentacoesDoPeriodo(empresaId, periodo, numeros);

  const acervo       = useMemo(() => retratoDoAcervo(numeros), [numeros]);
  const distribuicao = useMemo(() => distribuicaoPorSetor(numeros), [numeros]);
  const serie        = useMemo(() => serieDoFluxo(trilha.movs, trilha.dias), [trilha.movs, trilha.dias]);
  const totais       = useMemo(() => somarFluxo(serie), [serie]);
  const porSetor     = useMemo(() => banimentoPorSetor(trilha.movs), [trilha.movs]);
  const motivos      = useMemo(() => motivosDeRetorno(trilha.movs), [trilha.movs]);
  const aquecimento  = useMemo(
    () => aquecimentoMediano(numeros, trilha.movs, trilha.inicio),
    [numeros, trilha.movs, trilha.inicio],
  );

  const esperando = useMemo(() => numeros.filter(n => n.tratamento === 'pendente'), [numeros]);
  const porMotivoNaFila = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of numeros) {
      if (n.tratamento !== null && n.motivo_retorno) {
        m.set(n.motivo_retorno, (m.get(n.motivo_retorno) ?? 0) + 1);
      }
    }
    return m;
  }, [numeros]);

  const nomeDoCelular = useMemo(() => {
    const mapa = new Map(celulares.map(c => [c.id, c.identificacao]));
    return (id: string) => mapa.get(id) ?? '—';
  }, [celulares]);
  const numeroPorId = useMemo(() => new Map(numeros.map(n => [n.id, n.numero])), [numeros]);

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Skeleton className="h-12 w-80" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  const atualizando = trilha.carregando && !trilha.primeiraCarga;
  const pendentes = acervo.esperando + acervo.tratando;
  const maiorMotivo = motivos[0]?.quantos ?? 0;
  const maiorSetor = distribuicao[0]?.total ?? 0;
  const recentes = trilha.movs.slice(0, 8);
  const desde = trilha.inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  return (
    <div className="space-y-7 p-4 md:p-6">
      {/* ── Cabeçalho e o filtro único ───────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Núcleo de Inteligência e Gestão
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Dashboard – ADM</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {acervo.total.toLocaleString('pt-BR')} {acervo.total === 1 ? 'número' : 'números'} em{' '}
            {celulares.length} {celulares.length === 1 ? 'aparelho' : 'aparelhos'}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Período" className="inline-flex rounded-md border bg-background p-0.5">
            {PERIODOS.map(p => (
              <button
                key={p} type="button" role="radio" aria-checked={periodo === p}
                onClick={() => setPeriodo(p)}
                className={cn(
                  'rounded px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  periodo === p
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {p} dias
              </button>
            ))}
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to={ROUTE_PATHS.CONTROLE_NUMEROS}>
              Controle de Números <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {erro && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{erro}</CardContent>
        </Card>
      )}

      {/* ── 1. A fila de trabalho, antes de qualquer contagem ────────────── */}
      {pendentes > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {pendentes === 1
                ? '1 número voltou de um setor'
                : `${pendentes} números voltaram dos setores`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[...porMotivoNaFila].map(([motivo, quantos]) => (
                <Badge key={motivo} variant="outline" className="border-destructive/25 bg-destructive/10 text-destructive">
                  {MOTIVO_LABELS[motivo as keyof typeof MOTIVO_LABELS] ?? motivo}: {quantos}
                </Badge>
              ))}
              {acervo.tratando > 0 && (
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  <Wrench className="mr-1 h-3 w-3" />
                  {TRATAMENTO_LABELS.em_andamento}: {acervo.tratando}
                </Badge>
              )}
            </div>
            {/* Cinco, e não a lista inteira: isto é um aviso, e a tela de
                trabalho é o Controle de Números. */}
            <ul className="space-y-1 text-sm">
              {esperando.slice(0, 5).map(n => (
                <li key={n.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{mascararNumero(n.numero)}</span>
                  <span className="text-muted-foreground">
                    {nomeDoCelular(n.celular_id)} · {nomeDoSetor(n.setor_id)}
                    {n.motivo_retorno ? ` · ${MOTIVO_LABELS[n.motivo_retorno]}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {esperando.length > 5 && (
              <p className="text-xs text-muted-foreground">e mais {esperando.length - 5}.</p>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to={ROUTE_PATHS.CONTROLE_NUMEROS}>Tratar agora</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── 2. O acervo, hoje ────────────────────────────────────────────── */}
      <section className="space-y-3" aria-label="O acervo hoje">
        <TituloDeSecao detalhe="o acervo agora">Hoje</TituloDeSecao>
        <div className={cn(
          'grid grid-cols-2 gap-3 sm:grid-cols-3',
          podeVerLixeira ? 'lg:grid-cols-6' : 'lg:grid-cols-5',
        )}>
          <Indicador icone={Hash} rotulo="Números" valor={acervo.total}
            detalhe={`${acervo.noNucleo.toLocaleString('pt-BR')} no Núcleo`} />
          <Indicador icone={Flame} tom="aquecendo" rotulo="Em aquecimento" valor={acervo.aquecendo}
            detalhe="Ainda não saem do Núcleo" />
          <Indicador icone={CheckCircle2} tom="pronto" rotulo="Prontos para liberar" valor={acervo.prontos}
            detalhe="Ativos, no Núcleo, sem tratamento" />
          <Indicador icone={Send} tom="setor" rotulo="Nos setores" valor={acervo.nosSetores}
            detalhe={`${distribuicao.reduce((s, d) => s + d.comOperador, 0).toLocaleString('pt-BR')} em uso`} />
          <Indicador icone={Ban} tom={acervo.banidos > 0 ? 'grave' : 'neutro'} rotulo="Banidos" valor={acervo.banidos}
            detalhe="Não voltam a circular" />
          {podeVerLixeira && (
            <Indicador icone={Trash2} rotulo="Na lixeira" valor={lixeira.itens.length}
              detalhe="Excluídos que ainda dá para restaurar" />
          )}
        </div>
      </section>

      {/* ── 3. O período ─────────────────────────────────────────────────── */}
      <section className="space-y-3" aria-label="O período">
        <TituloDeSecao detalhe={`de ${desde} até hoje`}>Últimos {trilha.dias} dias</TituloDeSecao>

        {trilha.erro && (
          <Card className="border-destructive/40">
            <CardContent className="py-4 text-sm text-destructive">{trilha.erro}</CardContent>
          </Card>
        )}

        {trilha.primeiraCarga ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-80 rounded-xl lg:col-span-2" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <GraficoFluxo serie={serie} totais={totais} atualizando={atualizando} />
              </div>

              <Card className={cn('transition-opacity', atualizando && 'opacity-60')}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Qualidade</CardTitle>
                  <p className="text-xs text-muted-foreground">O que o período diz sobre os chips.</p>
                </CardHeader>
                <CardContent className="space-y-5">
                  <dl className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> Ativados
                      </dt>
                      <dd className="mt-1 text-xl font-semibold">{totais.ativados.toLocaleString('pt-BR')}</dd>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Ban className="h-3.5 w-3.5 text-destructive" aria-hidden /> Banidos
                      </dt>
                      <dd className="mt-1 text-xl font-semibold">{totais.banidos.toLocaleString('pt-BR')}</dd>
                    </div>
                  </dl>

                  <div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Timer className="h-3.5 w-3.5" aria-hidden /> Do cadastro à ativação
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {aquecimento.dias === null ? '—' : diasPorExtenso(aquecimento.dias)}
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      {aquecimento.amostra === 0
                        ? 'Nenhum número cadastrado no período ficou ativo ainda.'
                        : `Mediana de ${aquecimento.amostra} ${aquecimento.amostra === 1 ? 'número cadastrado' : 'números cadastrados'} no período que já ficaram ativos.`}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">Por que voltaram ao Núcleo</p>
                    {motivos.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhum retorno no período.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {motivos.map(m => (
                          <li key={m.motivo} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 text-xs">
                            <span className="truncate">{MOTIVO_LABELS[m.motivo]}</span>
                            <span className="h-2 rounded-full bg-muted" aria-hidden>
                              <span
                                className="block h-2 rounded-full bg-primary/70"
                                style={{ width: `${(m.quantos / maiorMotivo) * 100}%` }}
                              />
                            </span>
                            <span className="w-6 text-right tabular-nums text-muted-foreground">{m.quantos}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className={cn('transition-opacity', atualizando && 'opacity-60')}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">O que volta banido, por setor</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Do que o Núcleo liberou a cada setor, quanto voltou como banido.
                  </p>
                </CardHeader>
                <CardContent>
                  {porSetor.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Nenhuma liberação nem retorno no período.
                    </p>
                  ) : (
                    <ul className="space-y-3.5">
                      {porSetor.map(s => {
                        const pct = s.taxa === null ? null : Math.round(s.taxa * 100);
                        return (
                          <li key={s.setorId} className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                              <span className="truncate">{nomeDoSetor(s.setorId)}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {pct === null ? (
                                  `${s.voltaramBanidos} ${s.voltaramBanidos === 1 ? 'banido' : 'banidos'} · sem liberação no período`
                                ) : (
                                  <>
                                    <strong className="font-semibold text-foreground">{pct}%</strong>
                                    {' · '}{s.voltaramBanidos} de {s.liberados}
                                  </>
                                )}
                              </span>
                            </div>
                            <div
                              className="h-2 rounded-full bg-destructive/15"
                              role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0}
                              aria-label={`Voltaram banidos de ${nomeDoSetor(s.setorId)}`}
                            >
                              <div className="h-2 rounded-full bg-destructive" style={{ width: `${pct ?? 0}%` }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className={cn('transition-opacity', atualizando && 'opacity-60')}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">O que aconteceu por último</CardTitle>
                  <p className="text-xs text-muted-foreground">As movimentações mais recentes do período.</p>
                </CardHeader>
                <CardContent>
                  {recentes.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Nada registrado no período.</p>
                  ) : (
                    <ol className="space-y-2.5">
                      {recentes.map(m => {
                        const numero = numeroPorId.get(m.numero_id);
                        return (
                          <li key={m.id} className="border-l-2 border-border pl-3">
                            <p className="text-sm leading-snug">
                              {numero && (
                                <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                                  {mascararNumero(numero)}
                                </span>
                              )}
                              {m.descricao}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {quando(m.criado_em)}{m.autor_nome ? ` · ${m.autor_nome}` : ''}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>

      {/* ── 4. Os aparelhos e os setores, hoje ───────────────────────────── */}
      <section className="space-y-3" aria-label="Aparelhos e setores">
        <TituloDeSecao detalhe="hoje">Aparelhos e setores</TituloDeSecao>

        <ParedeDeAparelhos aparelhos={aparelhos} nomeDoSetor={nomeDoSetor} />

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Quem está com quantos</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Os números que já saíram para os setores.</p>
            </div>
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Legenda">
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-primary" aria-hidden />Em uso</li>
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-primary/35" aria-hidden />Aguardando distribuição</li>
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-destructive" aria-hidden />Banido no setor</li>
            </ul>
          </CardHeader>
          <CardContent>
            {distribuicao.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum número liberado a setor ainda. Um número sai do Núcleo quando está ativo.
              </p>
            ) : (
              <ul className="space-y-3.5">
                {distribuicao.map(s => (
                  <li key={s.setorId} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{nomeDoSetor(s.setorId)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <strong className="font-semibold text-foreground">{s.total}</strong>
                        {' · '}{s.comOperador} em uso · {s.aguardando} aguardando
                        {s.banidos > 0 ? ` · ${s.banidos} ${s.banidos === 1 ? 'banido' : 'banidos'}` : ''}
                      </span>
                    </div>
                    {/* A barra tem o tamanho do setor perto do maior: comparar dois
                        setores é comparar o comprimento, e não só as proporções. */}
                    <div className="flex h-2.5 gap-0.5" style={{ width: `${(s.total / maiorSetor) * 100}%` }} aria-hidden>
                      {s.comOperador > 0 && <span className="rounded-full bg-primary" style={{ flexGrow: s.comOperador }} />}
                      {s.aguardando > 0 && <span className="rounded-full bg-primary/35" style={{ flexGrow: s.aguardando }} />}
                      {s.banidos > 0 && <span className="rounded-full bg-destructive" style={{ flexGrow: s.banidos }} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
