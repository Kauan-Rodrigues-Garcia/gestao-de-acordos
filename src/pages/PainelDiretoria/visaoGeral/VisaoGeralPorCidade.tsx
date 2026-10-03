/**
 * VisaoGeralPorCidade — a primeira aba do Painel Diretoria (Visão geral 2.0).
 *
 * Tudo acontece no lugar, sem trocar de tela:
 *
 *   - clicar numa cidade abre o cartão dela para os lados, os outros recolhem,
 *     e o resto da tela passa a ser da cidade: indicadores, gráfico, formas e
 *     os setores dela (que se abrem no lugar, com o detalhe da aba Setores);
 *   - clicar num dia do gráfico abre o resumo do dia ali mesmo — do geral, ou
 *     da cidade aberta.
 *
 * Os números saem de três fontes que não se misturam (ver `modelo.ts`): o mês
 * da cidade pela carteira, os setores pela grade da aba Setores e equipes, a
 * regra pelo setor (ou pela carteira sem setor).
 *
 * Leve de propósito: um gráfico de barras em DOM (sem recharts), transições
 * curtas disparadas por clique, nada rodando parado. O movimento só desliga
 * com a escolha explícita da pessoa (`useMovimentoPreferido`).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CreditCard, Receipt, Users, Layers, Wallet, ArrowRight } from 'lucide-react';
import { KpiTile } from '@/components/KpiTile';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { useHoPercentual } from '@/lib/hoPercentual';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useMovimentoPreferido } from '@/hooks/useMovimentoPreferido';
import { buscarGradeDeSetores, espiarGradeDeSetores, type GradeDeSetores } from '@/services/mestre/diretoriaSetores.service';
import { buscarMesPorCidade, espiarMesPorCidade, type MesPorCidade } from '@/services/mestre/diretoriaCidades.service';
import { esquecerLeiturasDo59 } from '@/services/mestre/cache59';
import { FiltroDePeriodo } from '../FiltroDePeriodo';
import { OndeOResultadoAcontece } from '../OndeOResultadoAcontece';
import { montarCidades, semCidade, nomeDoMes, type InfoDoSetor, type CidadeDaVisao } from './modelo';
import { CartaoCidade, CartaoGeral, CarteirasSemCidade, FormasDoEscopo, GraficoDoMes } from './partes';
import { mediaDoAnterior, pct } from './formato';
import { ResumoDoDia } from './ResumoDoDia';
import { SetoresDaCidade } from './SetoresDaCidade';
import './visaoGeral.css';

/** Cidade e regra de cada setor da empresa. Cadastro: muda pouco, guardado por empresa. */
const setoresDaEmpresa = new Map<string, Promise<InfoDoSetor[]>>();
function lerSetores(empresaId: string): Promise<InfoDoSetor[]> {
  let p = setoresDaEmpresa.get(empresaId);
  if (!p) {
    p = Promise.resolve(
      supabase.from('setores').select('id, nome, cidade_id, regra').eq('empresa_id', empresaId),
    ).then(({ data, error }) => {
      if (error) { setoresDaEmpresa.delete(empresaId); throw new Error(error.message); }
      // `cidade_id` e `regra` são de 02-03/10 e ainda não estão em `database.types.ts`.
      return ((data ?? []) as unknown as { id: string; nome: string; cidade_id: string | null; regra: string | null }[]).map((s): InfoDoSetor => ({
        id: s.id, nome: s.nome, cidadeId: s.cidade_id, regra: s.regra === 'cofen' ? 'cofen' : s.regra === 'nosso_produto' ? 'nosso_produto' : null,
      }));
    });
    setoresDaEmpresa.set(empresaId, p);
  }
  return p;
}

/**
 * A função do banco ainda não existe (migration 20261003170000 não aplicada):
 * o PostgREST responde PGRST202 / «Could not find the function». A tela
 * anterior responde no lugar, em vez de um erro na primeira aba do painel.
 */
const faltaAFuncao = (msg: string) => /fn_mestre_diretoria_cidades|could not find the function|PGRST202/i.test(msg);

export function VisaoGeralPorCidade({ empresaId, mes, versao = 0, onAbrirSetores, reserva }: {
  empresaId: string; mes: string; versao?: number; onAbrirSetores?: () => void;
  /** O que mostrar se o banco ainda não tem a função nova. */
  reserva?: ReactNode;
}) {
  const [corte, setCorte] = useState<number | null>(null);
  const [dados, setDados] = useState<MesPorCidade | null>(() => espiarMesPorCidade(empresaId, mes, null) ?? null);
  const [grade, setGrade] = useState<GradeDeSetores | null>(() => espiarGradeDeSetores(empresaId, mes, null) ?? null);
  const [setores, setSetores] = useState<InfoDoSetor[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [dia, setDia] = useState<number | null>(null);
  const [recarga, setRecarga] = useState(0);

  const ho = useHoPercentual();
  const { temPermissao } = useCargoPermissoes();
  const podeDefinir = temPermissao('painel_diretoria_definir_carteira');
  const { semMovimento } = useMovimentoPreferido();

  // Outro mês: o corte escolhido, a cidade e o dia abertos não valem mais.
  useEffect(() => { setCorte(null); setAberta(null); setDia(null); }, [mes, empresaId]);
  // Outro corte: o dia aberto pode ter ficado depois dele.
  useEffect(() => { setDia(null); }, [corte]);

  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    setErro(null);
    Promise.all([
      buscarMesPorCidade(empresaId, mes, corte),
      buscarGradeDeSetores(empresaId, mes, corte).catch((): GradeDeSetores | null => null),
      lerSetores(empresaId).catch(() => [] as InfoDoSetor[]),
    ]).then(([m, g, s]): void => {
      if (!vivo) return;
      setDados(m); setGrade(g); setSetores(s);
    }).catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar a visão geral.'); });
    return () => { vivo = false; };
    // `versao` e `recarga`: o «Atualizar» do cabeçalho e a classificação de carteira.
  }, [empresaId, mes, corte, versao, recarga]);

  const cidades = useMemo<CidadeDaVisao[]>(() => (dados ? montarCidades(dados, grade, setores) : []), [dados, grade, setores]);
  const pendentes = useMemo(() => (dados ? semCidade(dados) : { valor: 0, carteiras: [] }), [dados]);
  const cidadeAberta = cidades.find(c => c.chave === aberta) ?? null;
  const cidadesParaEscolha = useMemo(() => cidades.map(c => ({ id: c.cidadeId as string, nome: c.nome })), [cidades]);

  const fecharCidade = useCallback(() => { setAberta(null); }, []);
  const abrirCidade = useCallback((chave: string) => { setAberta(chave); }, []);

  // Esc fecha o que estiver por cima: primeiro o dia, depois a cidade.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dia !== null) setDia(null); else if (aberta) setAberta(null);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [dia, aberta]);

  const gravou = useCallback(() => { esquecerLeiturasDo59(); setRecarga(r => r + 1); }, []);

  if (erro && !dados && reserva && faltaAFuncao(erro)) return <>{reserva}</>;
  if (erro && !dados) {
    return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">{erro}</div>;
  }
  if (!dados) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3"><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-56 rounded-3xl" /></div>
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  const escopo = cidadeAberta ? cidadeAberta.mes : dados.geral;
  const quarto = cidadeAberta
    ? cidadeAberta.carteirasSemSetor.reduce((a, k) => a + k.valor, 0)
    : dados.geral.colchao;

  return (
    <div className={cn('vg', cidadeAberta && `foco-${cidadeAberta.marca}`, semMovimento && 'vg-quieto')}>
      {/* O período: o mês vem do cabeçalho do painel; o corte, daqui. */}
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
        <span className="font-semibold capitalize">{rotuloDoMes(mes)}</span>
        <span className="text-muted-foreground text-xs">
          {dados.diaCorte >= dados.diasNoMes ? 'mês fechado' : `até o dia ${dados.diaCorte}`} · comparando com o mesmo dia de {nomeDoMes(dados.mesAnterior)}
        </span>
        <span className="ml-auto">
          <FiltroDePeriodo mes={mes} corte={dados.diaCorte} diasNoMes={dados.diasNoMes} escolhido={corte} onEscolher={setCorte} />
        </span>
      </div>

      {!dados.temLote ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum relatório 59 promovido para {rotuloDoMes(mes)}.
        </div>
      ) : (
        <>
          <div className="vg-topo">
            <CartaoGeral mes={dados.geral} mesAnterior={dados.mesAnterior} diaCorte={dados.diaCorte} diasNoMes={dados.diasNoMes}
              cidades={cidades} semCidade={pendentes.valor} recolhido={!!cidadeAberta} />
            {cidades.map(c => (
              <CartaoCidade key={c.chave} cidade={c} mesAnterior={dados.mesAnterior} diaCorte={dados.diaCorte} diasNoMes={dados.diasNoMes}
                ho={ho} aberta={aberta === c.chave} recolhida={!!aberta && aberta !== c.chave}
                onAbrir={() => abrirCidade(c.chave)} onFechar={fecharCidade} />
            ))}
          </div>

          {/* Os setores da cidade aberta, logo abaixo do cartão. */}
          <div className={cn('vg-desdobra', cidadeAberta && 'vg-aberto')} aria-live="polite">
            <div>
              {cidadeAberta && (
                <>
                  <SetoresDaCidade empresaId={empresaId} mes={mes} mesAnterior={dados.mesAnterior} diaCorte={dados.diaCorte}
                    cidade={cidadeAberta} ho={ho} cidadesParaEscolha={cidadesParaEscolha} podeDefinir={podeDefinir} onGravou={gravou} />
                  <p className="vg-nota" style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    A soma dos setores não é o valor da cidade: o colchão e o que conta só no total não são de setor nenhum, e o
                    Integral conta na carteira de origem e na de destino.
                    {onAbrirSetores && (
                      <button type="button" onClick={onAbrirSetores} className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline">
                        Ver em Setores e equipes <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Os indicadores do escopo: trocam de valor no lugar. */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiTile rotulo="Pagamentos no mês" valor="" valorNumerico={escopo.linhas} formatar={v => Math.round(v).toLocaleString('pt-BR')}
              sub={`até o dia ${dados.diaCorte}`} Icon={CreditCard} tom="sucesso" />
            <KpiTile rotulo="Ticket médio" valor="" valorNumerico={escopo.linhas ? escopo.valor / escopo.linhas : 0} formatar={formatBRL}
              sub="por pagamento" Icon={Receipt} tom="primario" />
            <KpiTile rotulo="Operadores com recebimento" valor="" valorNumerico={escopo.operadores} formatar={v => String(Math.round(v))}
              sub={cidadeAberta ? `em ${cidadeAberta.setores.length} setores` : `${cidades.reduce((a, c) => a + c.setores.length, 0)} setores com recebimento`}
              Icon={Users} tom="neutro" />
            {cidadeAberta ? (
              <KpiTile rotulo="Carteiras sem setor" valor={quarto ? formatBRL(quarto) : '—'}
                sub={cidadeAberta.carteirasSemSetor.length ? 'contam aqui por escolha de cidade' : 'nenhuma nesta cidade'} Icon={Layers} tom="alerta" />
            ) : (
              <KpiTile rotulo="Colchão · só no total" valor="" valorNumerico={quarto} formatar={formatBRL}
                sub="fora de setor, equipe e operador" Icon={Wallet} tom="alerta" />
            )}
          </div>

          {/* O dinheiro sem cidade é assunto do geral: recolhe com uma cidade aberta. */}
          {pendentes.carteiras.length > 0 && (
            <div className={cn('vg-colapsa', cidadeAberta && 'vg-fechado')} aria-hidden={!!cidadeAberta}>
              <div>
                <CarteirasSemCidade empresaId={empresaId} valor={pendentes.valor} carteiras={pendentes.carteiras}
                  cidades={cidadesParaEscolha} podeDefinir={podeDefinir} onGravou={gravou} />
              </div>
            </div>
          )}

          <div className={cn('vg-grade2', dia !== null && 'vg-dia-aberto')}>
            <div className="vg-bloco">
              <h3>Dia a dia {cidadeAberta && <span className="vg-filtro">· {cidadeAberta.nome}</span>}
                <span className="vg-dica">clique num dia para ver o resumo</span></h3>
              <div className="vg-meta">Recebido por dia · o tracejado é a média diária de {nomeDoMes(dados.mesAnterior)}</div>
              <GraficoDoMes mes={mes} serie={escopo.serie} diaCorte={dados.diaCorte} diasNoMes={dados.diasNoMes}
                mediaAnterior={mediaDoAnterior(escopo)} mesAnterior={dados.mesAnterior} diaAberto={dia}
                onDia={d => setDia(atual => (atual === d ? null : d))} />
              <div className={cn('vg-desdobra', dia !== null && 'vg-aberto')}>
                <div>
                  {dia !== null && (
                    <ResumoDoDia empresaId={empresaId} mes={mes} mesAnterior={dados.mesAnterior} dia={dia} diaCorte={dados.diaCorte}
                      escopo={cidadeAberta ? cidadeAberta.chave : 'geral'} rotuloEscopo={cidadeAberta ? cidadeAberta.nome : 'cobrança inteira'}
                      cidadeDe={id => { const c = cidades.find(x => x.cidadeId === id); return c ? { nome: c.nome, marca: c.marca } : null; }}
                      ho={ho} onDia={setDia} onFechar={() => setDia(null)} />
                  )}
                </div>
              </div>
            </div>
            <div className="vg-bloco vg-formas-bloco" aria-hidden={dia !== null}>
              <h3>Por onde o dinheiro entrou {cidadeAberta && <span className="vg-filtro">· {cidadeAberta.nome}</span>}</h3>
              <div className="vg-meta">Formas de pagamento no mês · {pct(100)} = {formatBRL(escopo.valor)}</div>
              <FormasDoEscopo formas={escopo.formas} />
            </div>
          </div>

          {/* A tabela de onde o resultado acontece continua, no geral. */}
          {!cidadeAberta && (
            <OndeOResultadoAcontece empresaId={empresaId} mes={mes} diaCorte={dados.diaCorte} versao={versao + recarga} />
          )}
        </>
      )}
    </div>
  );
}
