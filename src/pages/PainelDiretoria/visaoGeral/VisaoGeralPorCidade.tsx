/**
 * VisaoGeralPorCidade — a primeira aba do Painel Diretoria (Visão geral 3.0).
 *
 * O objetivo (Cleber, 04/10/2026): a diretoria bate o olho e vê o que importa,
 * e o detalhe só aparece quando ela clica. Três camadas:
 *
 *   1. o PULSO — o mês do geral (ou da empresa filtrada): quanto entrou, quanto
 *      devia ter entrado até hoje, onde fecha, e as pessoas por quartil; e as
 *      cidades, que filtram a tela;
 *   2. o que PEDE ATENÇÃO — até quatro sinais, cada um abre o setor;
 *   3. o PLACAR — um cartão por setor; o detalhe abre embaixo da fileira dele,
 *      com equipes, quartis, pessoas, agenda e dia a dia.
 *
 * Fontes, sem conta nova: o 59 (Nosso produto) e a conciliação (Cofen) para o
 * recebido; a meta do SETOR na aba Metas; as funções do Painel Líder para
 * equipes e quartis. Regra de negócio diferente é carteira diferente, e o
 * disjuntor troca o Cofen entre H.O. e bruto em todo número que o tem dentro.
 *
 * Leve: a primeira pintura usa só o 59, a Cofen e as metas. Equipes e pessoas
 * (o Analítico) chegam depois, sem travar a tela, e ficam no cache do 59. Nada
 * roda parado; o movimento só desliga com a escolha explícita da pessoa
 * (`useMovimentoPreferido`).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDownAZ, ArrowDownWideNarrow, TrendingDown } from 'lucide-react';
import { AbasSegmentadas, type AbaSegmentada } from '@/components/AbasSegmentadas';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { rotuloDoMes } from '@/lib/mesReferencia';
import { useHoPercentual } from '@/lib/hoPercentual';
import { getTodayISO } from '@/lib/index';
import { useAuth } from '@/hooks/useAuth';
import { useMovimentoPreferido } from '@/hooks/useMovimentoPreferido';
import { buscarGradeDeSetores, espiarGradeDeSetores, type GradeDeSetores } from '@/services/mestre/diretoriaSetores.service';
import {
  buscarCofenDoMes, buscarMesPorCidade, espiarCofenDoMes, espiarMesPorCidade, type CofenDoMes, type MesPorCidade,
} from '@/services/mestre/diretoriaCidades.service';
import {
  buscarFontesDoPainel, buscarIdDaPaguePlay, buscarIndiretoDoPainel, buscarMetasDoPainel, espiarFontesDoPainel,
  type FontesDoPainel, type MetasDoPainel,
} from '@/services/mestre/diretoriaPlacar.service';
import { esquecerLeiturasDo59 } from '@/services/mestre/cache59';
import type { LinhaQuartil } from '@/pages/Dashboard/Analitico/linhasQuartil';
import type { MapaRecebimentoIndireto } from '@/services/metas/recebimentoIndireto.service';
import { FiltroDePeriodo } from '../FiltroDePeriodo';
import { cofenNoDia, foraDaConta, montarVisao, nomeDoMes, type InfoDoSetor, type ModoCofen } from './modelo';
import {
  calendarioDoMes, diaDeHoje, metaDoConjunto, ordenarPlacar, pessoasDaEmpresa, pessoasDoAlternativo, resumirQuartis, ritmoDe,
  setoresDoPlacar, sinaisDoPlacar,
  type OrdemDoPlacar, type ResumoQuartis, type SetorDoPlacar,
} from './placar';
import { DisjuntorCofen, ForaDaConta } from './partes';
import { CartaoDaCidade, CartaoDoMes } from './Pulso';
import { PlacarDeSetores, RankingDeRitmo } from './PlacarDeSetores';
import { DetalheDoSetor, type AbaDoSetor } from './DetalheDoSetor';
import { GraficoRitmo } from './GraficoRitmo';
import { ResumoDoDia } from './ResumoDoDia';
import { mil } from './formato';
import './visaoGeral.css';

/** Cidade e regra de cada setor da empresa. Cadastro: muda pouco, guardado por empresa. */
const setoresDaEmpresa = new Map<string, Promise<InfoDoSetor[]>>();
function lerSetores(empresaId: string): Promise<InfoDoSetor[]> {
  let p = setoresDaEmpresa.get(empresaId);
  if (!p) {
    p = Promise.resolve(
      supabase.from('setores').select('id, nome, cidade_id, regra, ativo, alternativo').eq('empresa_id', empresaId),
    ).then(({ data, error }) => {
      if (error) { setoresDaEmpresa.delete(empresaId); throw new Error(error.message); }
      // `cidade_id` e `regra` são de 02-03/10 e ainda não estão em `database.types.ts`.
      return ((data ?? []) as unknown as {
        id: string; nome: string; cidade_id: string | null; regra: string | null; ativo: boolean | null; alternativo: boolean | null;
      }[])
        .filter(s => s.ativo !== false)
        .map((s): InfoDoSetor => ({
          id: s.id, nome: s.nome, cidadeId: s.cidade_id, regra: s.regra === 'cofen' ? 'cofen' : s.regra === 'nosso_produto' ? 'nosso_produto' : null,
          alternativo: s.alternativo === true,
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

type LeituraCofen = { ok: true; c: CofenDoMes } | { ok: false; erro: string };
/** `undefined` carregando; `null` sem acesso ou falhou (a tela segue sem). */
type Fontes = FontesDoPainel | null | undefined;

const ORDENS: readonly AbaSegmentada<OrdemDoPlacar>[] = [
  { key: 'ritmo', label: 'Pior ritmo primeiro', Icon: TrendingDown },
  { key: 'valor', label: 'Maior recebido', Icon: ArrowDownWideNarrow },
  { key: 'az', label: 'A–Z', Icon: ArrowDownAZ },
];

const TOM: Record<string, string> = { ruim: 'var(--vg-q4)', alerta: 'var(--vg-q3)', bom: 'var(--vg-q1)', q4: 'var(--vg-q4)' };

export function VisaoGeralPorCidade({ empresaId, mes, versao = 0, reserva }: {
  empresaId: string; mes: string; versao?: number;
  /** Mantido por compatibilidade: o atalho para a aba Setores. */
  onAbrirSetores?: () => void;
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
  const [metas, setMetas] = useState<MetasDoPainel | null>(null);
  const [fontesBP, setFontesBP] = useState<Fontes>(() => espiarFontesDoPainel(empresaId, mes));
  const [fontesPP, setFontesPP] = useState<Fontes>(undefined);
  const [ppId, setPpId] = useState<string | null>(null);
  const [indiretoPP, setIndiretoPP] = useState<MapaRecebimentoIndireto>({});
  const [erro, setErro] = useState<string | null>(null);
  const [marca, setMarca] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [aba, setAba] = useState<AbaDoSetor>('equipes');
  const [ordem, setOrdem] = useState<OrdemDoPlacar>('ritmo');
  const [dia, setDia] = useState<number | null>(null);
  const [recarga, setRecarga] = useState(0);
  // Sempre começa em H.O.: é o número que a operação acompanha.
  const [modo, setModo] = useState<ModoCofen>('ho');

  const ho = useHoPercentual();
  const { perfil } = useAuth();
  const superAdmin = perfil?.perfil === 'super_admin';
  const { semMovimento } = useMovimentoPreferido();

  // Outro mês: o corte, o filtro e o que estava aberto não valem mais.
  useEffect(() => { setCorte(null); setMarca(null); setAberto(null); setDia(null); }, [mes, empresaId]);
  useEffect(() => { setDia(null); }, [corte]);

  // A primeira pintura: 59, Cofen, grade, cadastro e metas.
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
      buscarMetasDoPainel(empresaId, mes).catch((): MetasDoPainel | null => null),
    ]).then(([m, c, g, s, mt]): void => {
      if (!vivo) return;
      setDados(m); setCofen(c); setGrade(g); setSetores(s); setMetas(mt);
    }).catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar a visão geral.'); });
    return () => { vivo = false; };
  }, [empresaId, mes, corte, versao, recarga]);

  // Depois: equipes e pessoas (o Analítico), sem travar a tela.
  useEffect(() => {
    if (!empresaId || !dados) return;
    let vivo = true;
    buscarFontesDoPainel(empresaId, mes).then(f => { if (vivo) setFontesBP(f); }, () => { if (vivo) setFontesBP(null); });
    return () => { vivo = false; };
  }, [empresaId, mes, dados, versao, recarga]);

  const c = cofen?.ok ? cofen.c : null;
  const temCofen = !!c?.conta;
  useEffect(() => {
    if (!temCofen) { setFontesPP(null); return; }
    let vivo = true;
    buscarIdDaPaguePlay()
      .then(id => {
        if (!vivo) return null;
        setPpId(id);
        return id ? buscarFontesDoPainel(id, mes) : null;
      })
      .then(f => { if (vivo) setFontesPP(f ?? null); }, () => { if (vivo) setFontesPP(null); });
    return () => { vivo = false; };
  }, [temCofen, mes, versao, recarga]);

  // A meta indireta (regra Cofen): o recebido indireto de quem a tem.
  useEffect(() => {
    if (!fontesPP || !ppId) { setIndiretoPP({}); return; }
    let vivo = true;
    buscarIndiretoDoPainel(fontesPP, ppId).then(m => { if (vivo) setIndiretoPP(m); }, () => { if (vivo) setIndiretoPP({}); });
    return () => { vivo = false; };
  }, [fontesPP, ppId]);

  // ── As contas ──────────────────────────────────────────────────────────────
  const visao = useMemo(() => (dados ? montarVisao(dados, c, grade, setores, modo) : null), [dados, c, grade, setores, modo]);
  const cal = useMemo(
    () => (dados ? calendarioDoMes(mes, dados.diaCorte, dados.diasNoMes, metas?.feriados ?? [], metas?.contarHoje ?? false) : null),
    [dados, mes, metas],
  );
  // O quartil e as equipes são do MÊS (o Analítico até hoje), nunca do corte
  // escolhido no filtro — como na aba Quartis do Painel Líder.
  const calMes = useMemo(
    () => (dados ? calendarioDoMes(mes, diaDeHoje(mes, getTodayISO(), dados.diasNoMes), dados.diasNoMes, metas?.feriados ?? [], metas?.contarHoje ?? false) : null),
    [dados, mes, metas],
  );
  const placar = useMemo(
    () => (visao && cal ? setoresDoPlacar({ visao, setores, metas: metas?.metas ?? {}, cofen: c, modo, cal }) : []),
    [visao, cal, setores, metas, c, modo],
  );
  const quartisCfg = useMemo(() => metas?.quartis ?? fontesBP?.quartis ?? [], [metas, fontesBP]);
  const pessoasBP = useMemo(() => (fontesBP && calMes ? pessoasDaEmpresa(fontesBP, calMes, false, ho) : fontesBP), [fontesBP, calMes, ho]);
  const pessoasPP = useMemo(
    () => (fontesPP && calMes ? pessoasDaEmpresa(fontesPP, calMes, modo === 'ho', ho, indiretoPP) : fontesPP),
    [fontesPP, calMes, modo, ho, indiretoPP],
  );

  /** As pessoas de um setor do placar: `undefined` carregando, `null` sem acesso. */
  const linhasDe = useCallback((s: SetorDoPlacar): LinhaQuartil[] | null | undefined => {
    const fonte = s.cofen ? pessoasPP : pessoasBP;
    if (fonte === undefined) return undefined;
    if (fonte === null || !(fonte instanceof Map)) return null;
    if (!s.setorId) return [];
    if (s.alternativo && fontesBP) return pessoasDoAlternativo(fonte, fontesBP, s.setorId);
    return fonte.get(s.setorId) ?? [];
  }, [pessoasBP, pessoasPP, fontesBP]);

  const quartisPorSetor = useMemo(() => {
    const m = new Map<string, ResumoQuartis | null>();
    for (const s of placar) {
      const l = linhasDe(s);
      if (l === undefined) m.set(s.chave, null);
      else if (l !== null) m.set(s.chave, resumirQuartis(l, quartisCfg));
    }
    return m;
  }, [placar, linhasDe, quartisCfg]);

  // O conjunto (cidade, geral) deixa o alternativo de fora: as pessoas dele já
  // estão no setor de origem, e os clones contariam duas vezes.
  const resumoDe = useCallback((lista: SetorDoPlacar[]): ResumoQuartis | null => {
    const somam = lista.filter(s => !s.alternativo);
    if (somam.some(s => linhasDe(s) === undefined)) return null;
    return resumirQuartis(somam.flatMap(s => linhasDe(s) ?? []), quartisCfg);
  }, [linhasDe, quartisCfg]);

  const cidades = useMemo(() => visao?.cidades ?? [], [visao]);
  const cidadeFiltro = cidades.find(x => x.chave === marca) ?? null;
  const doFiltro = useMemo(() => (marca ? placar.filter(s => s.cidadeId === marca) : placar), [placar, marca]);
  const ordenados = useMemo(() => ordenarPlacar(doFiltro, ordem), [doFiltro, ordem]);
  const escopo = cidadeFiltro ? cidadeFiltro.mes : visao?.geral ?? null;
  const metaEscopo = useMemo(() => metaDoConjunto(doFiltro), [doFiltro]);
  const ritmoEscopo = escopo && cal ? ritmoDe(escopo.valor, metaEscopo.meta, cal) : null;
  const quartisEscopo = useMemo(() => resumoDe(doFiltro), [resumoDe, doFiltro]);
  const resumoEmpresa = useMemo(() => resumoDe(placar), [resumoDe, placar]);

  const sinais = useMemo(() => {
    const q4 = doFiltro.filter(s => !s.alternativo)
      .map(s => ({ s, n: (linhasDe(s) ?? []).filter(l => l.quartil?.quartil === 4).length }));
    const total = q4.reduce((a, x) => a + x.n, 0);
    const mais = [...q4].sort((a, b) => b.n - a.n)[0];
    return sinaisDoPlacar(doFiltro, total ? { qtd: total, maisEm: mais?.s ?? null } : null, mil);
  }, [doFiltro, linhasDe]);

  const fora = useMemo(() => (dados ? foraDaConta(dados) : { valor: 0, carteiras: [] }), [dados]);
  const cidadesParaEscolha = useMemo(
    () => (dados?.cidades ?? []).filter(x => x.cidadeId).map(x => ({ id: x.cidadeId as string, nome: x.nome ?? 'Cidade' })),
    [dados],
  );
  const avisoCofen = cofen?.ok === false ? `Não foi possível ler a carteira Cofen: ${cofen.erro}` : c?.aviso ?? null;

  const abrir = useCallback((chave: string, abaInicial: AbaDoSetor = 'equipes') => {
    setAberto(a => (a === chave ? null : chave));
    setAba(abaInicial);
  }, []);
  const abrirPorSinal = useCallback((chave: string, abaInicial: AbaDoSetor) => {
    const s = placar.find(x => x.chave === chave);
    if (s && marca && s.cidadeId !== marca) setMarca(null);
    setAberto(chave);
    setAba(abaInicial);
  }, [placar, marca]);
  const filtrar = useCallback((chave: string) => {
    setMarca(m => (m === chave ? null : chave));
    setAberto(null);
    setDia(null);
  }, []);

  // Esc fecha o que estiver por cima: o dia, o setor, o filtro.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dia !== null) setDia(null); else if (aberto) setAberto(null); else if (marca) setMarca(null);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [dia, aberto, marca]);

  const gravou = useCallback(() => { esquecerLeiturasDo59(); setRecarga(r => r + 1); }, []);

  if (erro && !dados && reserva && faltaAFuncao(erro)) return <>{reserva}</>;
  if (erro && !dados) {
    return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">{erro}</div>;
  }
  if (!dados || !visao || !cal || !calMes || !escopo) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3"><Skeleton className="h-60 rounded-3xl" /><Skeleton className="h-60 rounded-3xl" /><Skeleton className="h-60 rounded-3xl" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      </div>
    );
  }

  const marcaDe = (s: SetorDoPlacar) => cidades.find(x => x.cidadeId === s.cidadeId);
  const rotuloEscopo = cidadeFiltro
    ? `Recebido no mês · ${cidadeFiltro.rotuloMarca ?? cidadeFiltro.nome}`
    : 'Recebido no mês · geral';
  const cofenDoDia = dia !== null && (!cidadeFiltro || cidadeFiltro.cofen) ? cofenNoDia(c, dia, modo) : null;
  const cidadeComCofen = cidades.find(x => x.cofen) ?? null;
  const pessoasEscopo = quartisEscopo ? quartisEscopo.total : null;

  const detalhe = (s: SetorDoPlacar) => {
    const cid = marcaDe(s);
    const daMarca = placar.filter(x => x.cidadeId === s.cidadeId);
    return (
      <DetalheDoSetor key={s.chave} setor={s} cal={cal} calMes={calMes} indireto={s.cofen ? indiretoPP : undefined} modo={modo} ho={ho} mes={mes} mesAnterior={dados.mesAnterior}
        diaCorte={dados.diaCorte} diasNoMes={dados.diasNoMes} empresaId={empresaId}
        empresaDoSetor={s.cofen ? ppId : empresaId}
        fontes={s.cofen ? fontesPP : fontesBP} linhas={linhasDe(s)} quartis={quartisCfg}
        resumoEmpresa={resumoEmpresa} resumoMarca={resumoDe(daMarca)} rotuloMarca={cid?.rotuloMarca ?? cid?.nome ?? 'Cidade'}
        cofen={s.cofen ? c : null} aba={aba} onAba={setAba} onFechar={() => setAberto(null)} />
    );
  };

  return (
    <div className={cn('vg', cidadeFiltro && `foco-${cidadeFiltro.marca}`, semMovimento && 'vg-quieto')}>
      <div className="vg-barra">
        <span className="vg-barra-mes">{rotuloDoMes(mes)}</span>
        <span className="vg-barra-sub">
          {dados.diaCorte >= dados.diasNoMes ? 'mês fechado' : `até o dia ${dados.diaCorte}`} · dia útil {cal.decorridos} de {cal.totalUteis} · comparando com o mesmo dia de {nomeDoMes(dados.mesAnterior)}
        </span>
        <span className="vg-barra-dir">
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
          <section className="vg-pulso" aria-label="O mês">
            <CartaoDoMes rotulo={rotuloEscopo} escopo={escopo} ritmo={ritmoEscopo} semMeta={metaEscopo.semMeta}
              quartis={quartisEscopo} carteiras={cidadeFiltro ? carteirasDaCidade(cidadeFiltro.mes) : visao.carteiras}
              modo={modo} mesAnterior={dados.mesAnterior} pessoas={pessoasEscopo} />
            {cidades.map(x => {
              const dela = placar.filter(s => s.cidadeId === x.cidadeId);
              const m = metaDoConjunto(dela);
              return (
                <CartaoDaCidade key={x.chave} cidade={x} setores={dela} ritmo={ritmoDe(x.mes.valor, m.meta, cal)}
                  quartis={resumoDe(dela)} modo={modo} ativa={marca === x.chave} onClick={() => filtrar(x.chave)} />
              );
            })}
          </section>

          {sinais.length > 0 && (
            <section className="vg-sinais" aria-label="O que pede atenção">
              <span className="vg-rot">Pede atenção</span>
              {sinais.map(s => (
                <button key={`${s.tom}-${s.chave}`} type="button" className="vg-sinal" style={{ ['--s' as string]: TOM[s.tom] }}
                  onClick={() => abrirPorSinal(s.chave, s.aba)}>
                  <span className="vg-sinal-ic">{s.marca}</span>
                  <span><b>{s.titulo}</b><small>{s.sub}</small></span>
                </button>
              ))}
            </section>
          )}

          {!cidadeFiltro && (fora.carteiras.length > 0 || avisoCofen) && (
            <ForaDaConta empresaId={empresaId} valor={fora.valor} carteiras={fora.carteiras} avisoCofen={avisoCofen}
              cidades={cidadesParaEscolha} superAdmin={superAdmin} onGravou={gravou} />
          )}

          <div className="vg-sec">
            <h2>Setores{cidadeFiltro ? ` de ${cidadeFiltro.nome}` : ''} · {ordenados.length}</h2>
            <AbasSegmentadas<OrdemDoPlacar> abas={ORDENS} ativa={ordem} onTrocar={setOrdem} rotulo="Ordenar setores" />
          </div>
          <PlacarDeSetores setores={ordenados} quartisPorSetor={quartisPorSetor} modo={modo} mesAnterior={dados.mesAnterior}
            aberto={aberto} onAbrir={abrir} detalhe={detalhe} />

          <div className={cn('vg-baixo', dia !== null && 'vg-dia-aberto')}>
            <div className="vg-bloco">
              <h3>Ritmo do mês {cidadeFiltro && <span className="vg-filtro">· {cidadeFiltro.nome}</span>}
                <span className="vg-dica">clique num dia para ver o resumo</span></h3>
              <div className="vg-meta-txt">O acumulado contra o caminho da meta, e cada dia contra a meta por dia útil{escopo.cofen ? ` · Cofen em ${modo === 'ho' ? 'H.O.' : 'bruto'}` : ''}</div>
              <GraficoRitmo mes={mes} serie={escopo.serie} meta={ritmoEscopo?.meta ?? null} cal={cal}
                diaCorte={dados.diaCorte} diasNoMes={dados.diasNoMes} diaAberto={dia}
                onDia={d => setDia(atual => (atual === d ? null : d))} />
              <div className={cn('vg-desdobra', dia !== null && 'vg-aberto')}>
                <div>
                  {dia !== null && (
                    <ResumoDoDia empresaId={empresaId} mes={mes} mesAnterior={dados.mesAnterior} dia={dia} diaCorte={dados.diaCorte}
                      escopo={cidadeFiltro ? cidadeFiltro.chave : 'geral'} rotuloEscopo={cidadeFiltro ? cidadeFiltro.nome : 'cobrança inteira'}
                      cidadeDe={id => { const x = cidades.find(y => y.cidadeId === id); return x ? { nome: x.nome, marca: x.marca } : null; }}
                      cofen={cofenDoDia}
                      cidadeDoCofen={cidadeComCofen ? { nome: cidadeComCofen.nome, marca: cidadeComCofen.marca } : null}
                      modo={modo} onDia={setDia} onFechar={() => setDia(null)} />
                  )}
                </div>
              </div>
            </div>
            <div className="vg-bloco vg-rank-bloco" aria-hidden={dia !== null}>
              <h3>Setores por ritmo</h3>
              <div className="vg-meta-txt">% do que cada setor deveria ter recebido até hoje · o risco é 100%</div>
              <RankingDeRitmo setores={doFiltro} onAbrir={abrir} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** A barra de carteiras de uma cidade, no formato do geral. */
function carteirasDaCidade(m: { nossoProduto: number; cofen: { valor: number } | null }) {
  const r: { chave: 'nosso_produto' | 'cofen'; nome: string; valor: number }[] = [{ chave: 'nosso_produto', nome: 'Nosso produto', valor: m.nossoProduto }];
  if (m.cofen) r.push({ chave: 'cofen', nome: 'Cofen', valor: m.cofen.valor });
  return r;
}
