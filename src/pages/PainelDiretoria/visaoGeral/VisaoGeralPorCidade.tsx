/**
 * VisaoGeralPorCidade — a primeira aba do Painel Diretoria (Visão geral 2.0).
 *
 * Tudo acontece no lugar, sem trocar de tela:
 *
 *   - clicar numa cidade abre o cartão dela para os lados, os outros recolhem,
 *     e o resto da tela passa a ser da cidade: indicadores, gráfico, formas e
 *     os setores dela (que se abrem no lugar);
 *   - clicar num dia do gráfico abre o resumo do dia ali mesmo — do geral, ou
 *     da cidade aberta.
 *
 * «Regra de negócio diferente é carteira diferente» (04/10/2026): o geral se
 * divide por carteira — Nosso produto (o 59) e Cofen (conciliação +
 * Analítico). Só conta o que tem cidade. O disjuntor troca o Cofen entre H.O.
 * (padrão, sempre ao abrir) e bruto, em todo número que o tem dentro.
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
import { useAuth } from '@/hooks/useAuth';
import { useMovimentoPreferido } from '@/hooks/useMovimentoPreferido';
import { buscarGradeDeSetores, espiarGradeDeSetores, type GradeDeSetores } from '@/services/mestre/diretoriaSetores.service';
import {
  buscarCofenDoMes, buscarMesPorCidade, espiarCofenDoMes, espiarMesPorCidade, type CofenDoMes, type MesPorCidade,
} from '@/services/mestre/diretoriaCidades.service';
import { esquecerLeiturasDo59 } from '@/services/mestre/cache59';
import { FiltroDePeriodo } from '../FiltroDePeriodo';
import { OndeOResultadoAcontece } from '../OndeOResultadoAcontece';
import {
  cofenNoDia, foraDaConta, montarVisao, nomeDoMes, type InfoDoSetor, type ModoCofen,
} from './modelo';
import { CartaoCidade, CartaoGeral, DisjuntorCofen, ForaDaConta, FormasDoEscopo, GraficoDoMes } from './partes';
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

/** A Cofen que não carregou vira aviso, e o resto da tela segue com o 59. */
type LeituraCofen = { ok: true; c: CofenDoMes } | { ok: false; erro: string };

export function VisaoGeralPorCidade({ empresaId, mes, versao = 0, onAbrirSetores, reserva }: {
  empresaId: string; mes: string; versao?: number; onAbrirSetores?: () => void;
  /** O que mostrar se o banco ainda não tem a função nova. */
  reserva?: ReactNode;
}) {
  const [corte, setCorte] = useState<number | null>(null);
  const [dados, setDados] = useState<MesPorCidade | null>(() => espiarMesPorCidade(empresaId, mes, null) ?? null);
  const [cofen, setCofen] = useState<LeituraCofen | null>(() => {
    const c = espiarCofenDoMes(empresaId, mes, null);
    return c ? { ok: true, c } : null;
  });
  const [grade, setGrade] = useState<GradeDeSetores | null>(() => espiarGradeDeSetores(empresaId, mes, null) ?? null);
  const [setores, setSetores] = useState<InfoDoSetor[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [dia, setDia] = useState<number | null>(null);
  const [recarga, setRecarga] = useState(0);
  // Sempre começa em H.O.: é o número que a operação acompanha.
  const [modo, setModo] = useState<ModoCofen>('ho');

  const { perfil } = useAuth();
  const superAdmin = perfil?.perfil === 'super_admin';
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
      buscarCofenDoMes(empresaId, mes, corte).then(
        (c): LeituraCofen => ({ ok: true, c }),
        (e): LeituraCofen => ({ ok: false, erro: e instanceof Error ? e.message : 'Falha ao ler a carteira Cofen.' }),
      ),
      buscarGradeDeSetores(empresaId, mes, corte).catch((): GradeDeSetores | null => null),
      lerSetores(empresaId).catch(() => [] as InfoDoSetor[]),
    ]).then(([m, c, g, s]): void => {
      if (!vivo) return;
      setDados(m); setCofen(c); setGrade(g); setSetores(s);
    }).catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar a visão geral.'); });
    return () => { vivo = false; };
    // `versao` e `recarga`: o «Atualizar» do cabeçalho e a classificação de carteira.
  }, [empresaId, mes, corte, versao, recarga]);

  const c = cofen?.ok ? cofen.c : null;
  const visao = useMemo(() => (dados ? montarVisao(dados, c, grade, setores, modo) : null), [dados, c, grade, setores, modo]);
  const cidades = useMemo(() => visao?.cidades ?? [], [visao]);
  const fora = useMemo(() => (dados ? foraDaConta(dados) : { valor: 0, carteiras: [] }), [dados]);
  const cidadeAberta = cidades.find(x => x.chave === aberta) ?? null;
  const cidadeComCofen = cidades.find(x => x.cofen) ?? null;
  // A escolha de cidade de carteira é do 59: só as cidades da empresa do painel.
  const cidadesParaEscolha = useMemo(
    () => (dados?.cidades ?? []).filter(x => x.cidadeId).map(x => ({ id: x.cidadeId as string, nome: x.nome ?? 'Cidade' })),
    [dados],
  );
  const avisoCofen = cofen?.ok === false
    ? `Não foi possível ler a carteira Cofen: ${cofen.erro}`
    : c?.aviso ?? null;

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
  if (!dados || !visao) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3"><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-56 rounded-3xl" /></div>
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  const escopo = cidadeAberta ? cidadeAberta.mes : visao.geral;
  const nSetores = cidadeAberta
    ? cidadeAberta.setores.length + (cidadeAberta.cofen ? 1 : 0)
    : cidades.reduce((a, x) => a + x.setores.length + (x.cofen ? 1 : 0), 0);
  const semSetorDaCidade = cidadeAberta ? cidadeAberta.carteirasSemSetor.reduce((a, k) => a + k.valor, 0) : 0;
  // A Cofen do dia entra no geral e na cidade dela.
  const cofenDoDia = dia !== null && (!cidadeAberta || cidadeAberta.cofen) ? cofenNoDia(c, dia, modo) : null;
  const temCofen = !!visao.geral.cofen;

  return (
    <div className={cn('vg', cidadeAberta && `foco-${cidadeAberta.marca}`, semMovimento && 'vg-quieto')}>
      {/* O período: o mês vem do cabeçalho do painel; o corte, daqui. */}
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
        <span className="font-semibold capitalize">{rotuloDoMes(mes)}</span>
        <span className="text-muted-foreground text-xs">
          {dados.diaCorte >= dados.diasNoMes ? 'mês fechado' : `até o dia ${dados.diaCorte}`} · comparando com o mesmo dia de {nomeDoMes(dados.mesAnterior)}
        </span>
        <span className="ml-auto flex items-center gap-3 flex-wrap">
          {temCofen && <DisjuntorCofen modo={modo} onTrocar={setModo} />}
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
            <CartaoGeral mes={visao.geral} carteiras={visao.carteiras} modo={modo} mesAnterior={dados.mesAnterior}
              diaCorte={dados.diaCorte} diasNoMes={dados.diasNoMes} recolhido={!!cidadeAberta} />
            {cidades.map(x => (
              <CartaoCidade key={x.chave} cidade={x} modo={modo} mesAnterior={dados.mesAnterior} diaCorte={dados.diaCorte} diasNoMes={dados.diasNoMes}
                aberta={aberta === x.chave} recolhida={!!aberta && aberta !== x.chave}
                onAbrir={() => abrirCidade(x.chave)} onFechar={fecharCidade} />
            ))}
          </div>

          {/* Os setores da cidade aberta, logo abaixo do cartão. */}
          <div className={cn('vg-desdobra', cidadeAberta && 'vg-aberto')} aria-live="polite">
            <div>
              {cidadeAberta && (
                <>
                  <SetoresDaCidade empresaId={empresaId} mes={mes} mesAnterior={dados.mesAnterior} diaCorte={dados.diaCorte}
                    cidade={cidadeAberta} cofen={cidadeAberta.cofen ? c : null} modo={modo}
                    cidadesParaEscolha={cidadesParaEscolha} superAdmin={superAdmin} onGravou={gravou} />
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
              sub={escopo.cofen ? `por pagamento · Cofen em ${modo === 'ho' ? 'H.O.' : 'bruto'}` : 'por pagamento'} Icon={Receipt} tom="primario" />
            <KpiTile rotulo="Operadores com recebimento" valor="" valorNumerico={escopo.operadores} formatar={v => String(Math.round(v))}
              sub={`${nSetores} setores com recebimento`} Icon={Users} tom="neutro" />
            {cidadeAberta ? (
              <KpiTile rotulo="Carteiras sem setor" valor={semSetorDaCidade ? formatBRL(semSetorDaCidade) : '—'}
                sub={cidadeAberta.carteirasSemSetor.length ? 'contam aqui por escolha de cidade' : 'nenhuma nesta cidade'} Icon={Layers} tom="alerta" />
            ) : (
              <KpiTile rotulo="Colchão · só no total" valor="" valorNumerico={escopo.colchao} formatar={formatBRL}
                sub="fora de setor, equipe e operador" Icon={Wallet} tom="alerta" />
            )}
          </div>

          {/* O que não conta é assunto do geral: recolhe com uma cidade aberta. */}
          {(fora.carteiras.length > 0 || avisoCofen) && (
            <div className={cn('vg-colapsa', cidadeAberta && 'vg-fechado')} aria-hidden={!!cidadeAberta}>
              <div>
                <ForaDaConta empresaId={empresaId} valor={fora.valor} carteiras={fora.carteiras} avisoCofen={avisoCofen}
                  cidades={cidadesParaEscolha} superAdmin={superAdmin} onGravou={gravou} />
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
                      cidadeDe={id => { const x = cidades.find(y => y.cidadeId === id); return x ? { nome: x.nome, marca: x.marca } : null; }}
                      cofen={cofenDoDia}
                      cidadeDoCofen={cidadeComCofen ? { nome: cidadeComCofen.nome, marca: cidadeComCofen.marca } : null}
                      modo={modo} onDia={setDia} onFechar={() => setDia(null)} />
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
