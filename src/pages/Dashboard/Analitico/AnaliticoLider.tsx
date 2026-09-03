/**
 * AnaliticoLider — visão líder/gerência/admin
 *
 * • Cards de resumo mensal (snapshot salvo na importação — não distorcido por deleções)
 * • Agrupamento por equipe em "Por operador" (respeita filtro de setor)
 * • Ranking com pódio (top 3 + faixas 4-10 + demais), filtrável por equipe/setor
 * • Destaques do dia filtráveis por equipe/setor
 * • Filtro de equipe nos tabs Ranking e Destaques (só equipes do setor selecionado)
 * • Filtro de data por operador expandido (client-side)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Upload, Users, Trophy, AlertCircle, ChevronDown, ChevronRight,
  Trash2, Loader2, Star, CalendarDays, X, Filter, Copy,
  TrendingUp, CreditCard, Calendar, BarChart3, ArrowRightLeft, Wallet,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useTenant } from '@/lib/tenant-config';
import { copiarTexto } from '@/lib/clipboard';
import { supabase } from '@/lib/supabase';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import {
  buscarResumoOperadoresAnalitico,
  buscarAnalitico,
  buscarDestaquesDoMes,
  buscarDestaquesPorGrupo,
  buscarEquipesComOperadores,
  buscarTotalOrfaosPorSetor,
  buscarTotalPorSetor,
  buscarResumoMensal,
  removerLinhaAnalitico,
  removerOrfaosDoMes,
  atualizarResumoMensal,
  mapaSetorDaEquipe,
  type ResumoOperadorAnalitico,
  type DestaqueDiaAnalitico,
  type DestaqueGrupoDia,
  type ResumoMensalAnalitico,
  type EquipeAnalitico,
  type OperadorEquipeInfo,
  type TotalDoSetor,
} from '@/services/analitico/analitico.service';
// A mesma regra que decide como o card SOMA decide o que a limpeza APAGA.
import { setorSomaPorUsuarios } from '@/services/analitico/escopoAnalitico';
// Limpar o mês do analítico apaga o mês do diário junto (BookPlay).
import { limparMesRecebimentos } from '@/services/analitico/limparMesRecebimentos';
import type { MarcaTransferido } from '@/services/analitico/fantasmaTransferencia';
import { removerFantasma } from '@/services/admin/transferenciaUsuario.service';
import { ConfirmarTirarFantasma } from '@/components/admin/ConfirmarTirarFantasma';
import {
  buscarExclusoesSetor, salvarExclusoesSetor,
} from '@/services/analitico/exclusoesSetor.service';
import type { OrigemKey } from '@/services/analitico/composicaoAcumulado';
import { ComposicaoAcumulado } from './ComposicaoAcumulado';
import { useAuth } from '@/hooks/useAuth';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
// As contas desta tela vivem em `agregacaoLider`: são puras e têm teste
// próprio, o que os `useMemo` que elas substituíram nunca tiveram.
import {
  filtrarResumos, agruparPorEquipe, calcularMetricas, perfilIdsDoSetor,
  filtrarOrfaosDoSetor, filtrarLinhasPorData,
  type VinculosOperador, type FiltroData,
} from './agregacaoLider';
import { montarTextoListaAnalitico } from './textoListaAnalitico';
import { getTodayISO } from '@/lib/index';
import { diasNoMes as diasDoMes } from '@/lib/mesReferencia';
import { toast } from 'sonner';
import { TabulacaoCell } from './TabulacaoCell';
import { ImportarModal } from './ImportarModal';
import { RankingView } from './RankingView';
import { useRankingAnalitico } from './useRankingAnalitico';
import { ConfigurarRankingDialog } from './ConfigurarRankingDialog';
import { LABEL_CRITERIO } from './rankingCriterio';
import { FormasPagamento } from './FormasPagamento';
import { idsOcultosRankingQuartil } from '@/services/situacaoUsuario.service';
import type { SituacaoUsuario } from '@/lib/supabase';
import { useAnaliticoImport } from '@/hooks/useAnaliticoImport';

const ORFAOS_PAGE = 100;
const DIAS_PT     = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES_PT    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

interface AnaliticoLiderProps {
  empresaId: string;
  mes: string;
  setorId?: string | null;
  /** true = diretoria/admin (enxerga e limpa a empresa toda). false = líder/
   *  gerência restritos ao próprio setor (setorId vem travado no setor deles). */
  podeVerTodosSetores?: boolean;
  temPermissaoImportar: boolean;
  operadorId: string;
  operadorNome: string;
  liderId?: string | null;
  onAbrirNovoAcordo: (dados: {
    instituicao: string; nomeCliente: string;
    forma: 'boleto_pix' | 'cartao'; valor: number; dataPagamento?: string;
  }) => void;
  onVerAcordo: (acordoId: string, codigo?: string) => void;
  onRefetch: () => void;
}

export function AnaliticoLider({
  empresaId, mes, setorId, podeVerTodosSetores = true,
  temPermissaoImportar, operadorId, operadorNome, liderId,
  onAbrirNovoAcordo, onVerAcordo, onRefetch,
}: AnaliticoLiderProps) {
  const importHook = useAnaliticoImport();
  const { perfil } = useAuth();
  const { temPermissao } = useCargoPermissoes();
  const perfilId = perfil?.id ?? null;
  // Quem edita a composição do acumulado é o mesmo público que importa o
  // relatório e responde pelo número do setor — igual à RLS da 20260812e.
  const podeEditarComposicao = temPermissaoImportar || podeVerTodosSetores;
  const tenant = useTenant();
  const isPP = tenant.isPaguePlay;
  const mostrarHO = isPP;                 // HO só existe no relatório PaguePlay

  const [modalImportar, setModalImportar] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<'operadores' | 'formas' | 'ranking' | 'destaques' | 'desempenho' | 'quartis' | 'grafico' | 'orfaos'>('operadores');

  /*
   * As cinco abas de dentro, cada uma com a própria chave — desligar uma não
   * mexe nas outras.
   *
   * `abaVisivel` existe pelo mesmo motivo da régua de cima: `abaAtiva` nasce
   * em `'operadores'`, então sem ele desligar "Por operador" tiraria o botão e
   * deixaria a lista de operadores no ar como tela de entrada. Os efeitos que
   * carregam órfãos e destaques também olham `abaVisivel`, senão a aba que
   * aparece e a que busca dados seriam duas diferentes.
   */
  const abasInternas = useMemo(() => ([
    { key: 'operadores', label: 'Por operador',        Icon: Users,       permissao: 'analitico_sub_por_operador' },
    // Por onde o dinheiro entrou (Pix, Boleto, Cartão…), com período, equipe e
    // operador — a leitura que antes só existia no ERP.
    { key: 'formas',     label: 'Formas de pagamento', Icon: Wallet,      permissao: 'analitico_sub_formas_pagamento' },
    { key: 'ranking',    label: 'Ranking',             Icon: Trophy,      permissao: 'analitico_sub_ranking' },
    { key: 'destaques',  label: 'Destaques do dia',    Icon: Star,        permissao: 'analitico_sub_destaques_dia' },
    // Desempenho Equipes / Quartis / Gráfico mudaram para o Painel Líder nos
    // dois tenants (BookPlay 2026-07). Aqui ficam só as de conferência.
    { key: 'orfaos',     label: 'Sem operador',        Icon: AlertCircle, permissao: 'analitico_sub_sem_operador' },
  ] as const).filter(a => temPermissao(a.permissao)), [temPermissao]);

  const abaVisivel = abasInternas.some(a => a.key === abaAtiva)
    ? abaAtiva
    : (abasInternas[0]?.key ?? null);

  // ── Resumos por operador ──────────────────────────────────────────────────
  const [resumos,        setResumos]        = useState<ResumoOperadorAnalitico[]>([]);
  const [loadingResumos, setLoadingResumos] = useState(true);

  // ── Snapshot mensal (cards de resumo) ────────────────────────────────────
  const [snapshot,        setSnapshot]        = useState<ResumoMensalAnalitico | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);

  // ── Linhas expandidas (lazy) ──────────────────────────────────────────────
  const [expandidos,    setExpandidos]    = useState<Set<string>>(new Set());
  const [linhasMap,     setLinhasMap]     = useState<Map<string, AnaliticoRecebimento[]>>(new Map());
  const [loadingLinhas, setLoadingLinhas] = useState<Set<string>>(new Set());
  const [filtrosDatas,  setFiltrosDatas]  = useState<Map<string, FiltroData>>(new Map());

  // ── Órfãos ────────────────────────────────────────────────────────────────
  const [orfaos,         setOrfaos]         = useState<AnaliticoRecebimento[]>([]);
  const [loadingOrfaos,  setLoadingOrfaos]  = useState(false);
  const [orfaosVisiveis, setOrfaosVisiveis] = useState(ORFAOS_PAGE);
  const [removendoId,       setRemovendoId]       = useState<string | null>(null);
  const [removendoTodos,    setRemovendoTodos]    = useState(false);
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [limpando,           setLimpando]           = useState(false);

  // ── Destaques ─────────────────────────────────────────────────────────────
  const [destaques,        setDestaques]        = useState<DestaqueDiaAnalitico[]>([]);
  const [loadingDestaques, setLoadingDestaques] = useState(false);
  /*
   * Os destaques POR GRUPO — um por equipe/subgrupo, por dia.
   *
   * Lista separada da de cima, e não uma substituição, porque a RPC nova pode
   * não existir no banco ainda. Quando ela falta, `destaquesPorGrupo` fica
   * vazio e a aba desenha o destaque único de sempre — sem tela em branco e
   * sem aviso de erro para quem não pode fazer nada a respeito.
   */
  const [destaquesPorGrupo, setDestaquesPorGrupo] = useState<DestaqueGrupoDia[]>([]);

  // ── Configuração do ranking ───────────────────────────────────────────────
  const [configRankingAberto, setConfigRankingAberto] = useState(false);

  // ── Equipes ───────────────────────────────────────────────────────────────
  const [equipes,           setEquipes]           = useState<EquipeAnalitico[]>([]);
  const [operadorEquipeMap, setOperadorEquipeMap] = useState<Record<string, OperadorEquipeInfo>>({});
  // Transferidos neste mês cujo recebimento ficou na equipe de origem.
  const [transferidos, setTransferidos] = useState<Record<string, MarcaTransferido>>({});
  // Quem o líder já tirou nesta sessão — some da tela antes do próximo refetch.
  const [fantasmasTirados, setFantasmasTirados] = useState<Set<string>>(new Set());
  // Confirmação de tirar o fantasma: mostra QUANTO a equipe perde antes do ato.
  const [confirmandoFantasma, setConfirmandoFantasma] =
    useState<{ perfilId: string; nome: string; equipeNome: string } | null>(null);
  const [tirandoFantasma, setTirandoFantasma] = useState(false);
  const [equipesExtras,     setEquipesExtras]     = useState<Record<string, string[]>>({});
  const [filtroEquipeId,    setFiltroEquipeId]    = useState<string | null>(null);
  // Item 5: ids que somem do ranking/quartil (férias/desligado). Só exibição —
  // o recebimento deles continua nos totais de setor/equipe.
  // Preenchido junto com a composição do mês, logo abaixo — a situação também
  // é um fato do MÊS, não de hoje.
  const [operadoresOcultos, setOperadoresOcultos] = useState<Set<string>>(new Set());

  // ── Órfãos por setor (sem operador pertencem ao setor da importação) ──────
  const [orfaosPorSetor, setOrfaosPorSetor] = useState<Record<string, { total: number; qtd: number }>>({});
  // ── Total do RELATÓRIO por setor + setores alternativos ───────────────────
  // Setor normal → total do relatório (carimbo). Setor alternativo → soma de
  // membros/clones. Fonte única do "total do setor" para as duas telas.
  const [totalPorSetor, setTotalPorSetor] = useState<Record<string, TotalDoSetor>>({});
  // Migration 20260812e aplicada? Falso = o controle de composição não aparece
  // e tudo conta, como sempre contou.
  const [exclusoesAtivas, setExclusoesAtivas] = useState(false);
  const [salvandoComposicao, setSalvandoComposicao] = useState(false);
  const [setoresAlternativos, setSetoresAlternativos] = useState<Set<string>>(new Set());
  const [nomeDoSetor, setNomeDoSetor] = useState<Map<string, string>>(new Map());

  // ── Cargas ────────────────────────────────────────────────────────────────
  const carregarResumos = useCallback(async () => {
    if (!empresaId || !mes) return;
    setLoadingResumos(true);
    setExpandidos(new Set());
    setLinhasMap(new Map());
    setFiltrosDatas(new Map());
    // As exclusões vêm ANTES: `buscarTotalPorSetor` já devolve o total líquido
    // delas, para que nenhuma tela precise lembrar de aplicá-las depois.
    const { porSetor: exclusoesDoMes, dbAtiva } = await buscarExclusoesSetor(empresaId, mes);
    const [{ data, error }, orfaosSetor, totSetor] = await Promise.all([
      buscarResumoOperadoresAnalitico(empresaId, mes),
      buscarTotalOrfaosPorSetor(empresaId, mes),
      buscarTotalPorSetor(empresaId, mes, exclusoesDoMes),
    ]);
    if (error) toast.error(`Erro ao carregar resumo: ${error}`);
    setResumos(data);
    setOrfaosPorSetor(orfaosSetor);
    setTotalPorSetor(totSetor);
    setExclusoesAtivas(dbAtiva);
    setLoadingResumos(false);
  }, [empresaId, mes]);

  /**
   * Grava a composição do setor em foco e recarrega os totais.
   *
   * Recarrega em vez de recalcular na memória porque o mesmo mês alimenta o
   * card, o Desempenho Equipes e o gráfico — reconstruir só um deles é como as
   * telas passam a discordar.
   */
  const salvarComposicao = useCallback(async (excluidas: Set<OrigemKey>) => {
    if (!empresaId || !mes || !setorId) return;
    setSalvandoComposicao(true);
    const ok = await salvarExclusoesSetor({
      empresaId, setorId, mes, excluidas, usuarioId: perfilId ?? null,
    });
    if (!ok) toast.error('Não foi possível salvar a composição do acumulado.');
    else await carregarResumos();
    setSalvandoComposicao(false);
  }, [empresaId, mes, setorId, perfilId, carregarResumos]);

  const carregarSnapshot = useCallback(async () => {
    if (!empresaId || !mes) return;
    setLoadingSnapshot(true);
    const { data } = await buscarResumoMensal(empresaId, mes);
    setSnapshot(data);
    setLoadingSnapshot(false);
  }, [empresaId, mes]);

  const carregarOrfaos = useCallback(async () => {
    if (!empresaId || !mes) return;
    setLoadingOrfaos(true);
    setOrfaosVisiveis(ORFAOS_PAGE);
    const { data } = await buscarAnalitico({ empresaId, mes, operadorId: null });
    setOrfaos(data);
    setLoadingOrfaos(false);
  }, [empresaId, mes]);

  /**
   * Carrega os destaques do mês — os por grupo e o único, na mesma ida.
   *
   * As duas RPCs juntas em `Promise.all` porque a por grupo é a que a tela
   * quer e a única é a rede de segurança dela: pedir a segunda só depois de a
   * primeira falhar dobraria o tempo de abertura da aba justamente no banco
   * onde a migration ainda não passou.
   *
   * `indisponivel` é o que separa "a RPC não existe" de "deu erro de verdade".
   * Só o erro de verdade vira toast: avisar que o módulo não está instalado
   * não ajuda quem está olhando o mês, e a tela já se vira com o destaque
   * único.
   */
  const carregarDestaques = useCallback(async (equipeId?: string | null, sId?: string | null) => {
    if (!empresaId || !mes) return;
    setLoadingDestaques(true);

    const [porGrupo, unico] = await Promise.all([
      buscarDestaquesPorGrupo(empresaId, mes, equipeId, sId),
      buscarDestaquesDoMes(empresaId, mes, equipeId, sId),
    ]);

    if (porGrupo.error && !porGrupo.indisponivel) {
      toast.error(`Erro ao carregar destaques por equipe: ${porGrupo.error}`);
    }
    if (unico.error) toast.error(`Erro ao carregar destaques: ${unico.error}`);

    setDestaquesPorGrupo(porGrupo.data);
    setDestaques(unico.data);
    setLoadingDestaques(false);
  }, [empresaId, mes]);

  useEffect(() => {
    void carregarResumos();
    void carregarSnapshot();
  }, [carregarResumos, carregarSnapshot]);

  useEffect(() => {
    if (abaVisivel === 'orfaos')    void carregarOrfaos();
    if (abaVisivel === 'destaques') void carregarDestaques(filtroEquipeId, setorId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaVisivel]);

  useEffect(() => {
    // Passa o mês: fechado usa o retrato congelado da composição, senão mover
    // alguém de equipe hoje reescreveria a lista do mês passado (20260803c).
    buscarEquipesComOperadores(empresaId, mes).then(
      ({ equipes: eq, operadorEquipeMap: oem, equipesExtrasPorOperador, situacaoPorOperador,
         transferidos }) => {
        setEquipes(eq);
        setOperadorEquipeMap(oem);
        setEquipesExtras(equipesExtrasPorOperador);
        // Quem saiu do setor/empresa neste mês e continua aparecendo na equipe
        // de origem (migration 20260813b). Vazio no caso normal.
        setTransferidos(transferidos ?? {});
        // Situação daquele mês — férias/desligamento de hoje não apagam alguém
        // do ranking de um mês que ele trabalhou inteiro.
        setOperadoresOcultos(idsOcultosRankingQuartil(situacaoPorOperador as Record<string, SituacaoUsuario>));
      });
    // Setores alternativos (coluna pode não existir → todos normais). O nome vem
    // junto porque o aviso de "Limpar mês" precisa DIZER qual setor vai embora.
    void (async () => {
      const comFlag = await supabase.from('setores')
        .select('id, nome, alternativo').eq('empresa_id', empresaId);
      if (comFlag.error) return;
      const alt = new Set<string>();
      const nomes = new Map<string, string>();
      for (const s of (comFlag.data as { id: string; nome: string; alternativo: boolean | null }[]) ?? []) {
        if (s.alternativo) alt.add(s.id);
        nomes.set(s.id, s.nome);
      }
      setSetoresAlternativos(alt);
      setNomeDoSetor(nomes);
    })();
  }, [empresaId, mes]);

  // Quando o setor externo muda: reseta filtro de equipe interno e recarrega destaques
  useEffect(() => {
    setFiltroEquipeId(null);
    if (abaVisivel === 'destaques') void carregarDestaques(null, setorId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setorId]);

  // ── Equipes filtradas pelo setor selecionado (para dropdowns internos) ────
  const equipesFiltradas = useMemo(() => {
    if (!setorId) return equipes;
    return equipes.filter(e => e.setor_id === setorId);
  }, [equipes, setorId]);

  // ── Escopo de setor (líder/gerência restritos) ────────────────────────────
  const restritoAoSetor = !podeVerTodosSetores && !!setorId;

  /**
   * "Limpar mês" apaga só o setor?
   *
   * Sim sempre que HÁ um setor em foco — não só quando o usuário está preso a
   * ele. Antes a conta era `restritoAoSetor`, então um admin que filtrasse o
   * Play 5 e clicasse em "Limpar mês" apagava agosto da EMPRESA INTEIRA: os
   * números na tela eram de um setor e o botão agia sobre todos. O aviso dizia
   * a verdade ("todos os registros de agosto"), mas ninguém lê um aviso
   * esperando que ele contrarie o filtro que acabou de aplicar.
   */
  const limparSomenteOSetor = !!setorId;

  /** Nome do setor em foco para o aviso e o toast — "o setor" se ainda não veio. */
  const setorEmFocoLabel = (setorId && nomeDoSetor.get(setorId)) || 'seu setor';

  /** Todos os perfis (ativos) do setor em foco — para limpar/remover escopado. */
  const idsDoSetor = useMemo(
    () => perfilIdsDoSetor(operadorEquipeMap, setorId),
    [operadorEquipeMap, setorId],
  );

  /**
   * O escopo que "Limpar mês" e "Remover órfãos" apagam.
   *
   * `porRelatorio` é a MESMA decisão que o card usa para somar
   * (`setorSomaPorUsuarios`, via `escopoDeSetor`): setor normal soma pelo
   * carimbo do relatório, alternativo e PaguePlay somam pelos operadores.
   * Passar aqui uma regra diferente da que soma é o defeito que fazia sobrar
   * dinheiro na tela depois de limpar — ver `limparDadosDoMesSetor`.
   */
  const escopoLimpeza = useMemo(() => ({
    setorId,
    perfilIds: idsDoSetor,
    porRelatorio: !setorSomaPorUsuarios({
      isPaguePlay: isPP,
      alternativo: !!setorId && setoresAlternativos.has(setorId),
    }),
  }), [setorId, idsDoSetor, isPP, setoresAlternativos]);

  const orfaosVisiveisSetor = useMemo(
    () => filtrarOrfaosDoSetor(orfaos, restritoAoSetor, operadorEquipeMap, setorId),
    [orfaos, restritoAoSetor, operadorEquipeMap, setorId],
  );

  // ── Filtro de equipe ──────────────────────────────────────────────────────
  function mudarFiltroEquipe(equipeId: string | null) {
    setFiltroEquipeId(equipeId);
    if (abaVisivel === 'destaques') void carregarDestaques(equipeId, setorId);
  }

  // ── Toggle card de operador ───────────────────────────────────────────────
  async function toggleExpandido(opId: string) {
    const jaAberto = expandidos.has(opId);
    setExpandidos(prev => {
      const next = new Set(prev);
      if (jaAberto) next.delete(opId);
      else next.add(opId);
      return next;
    });
    if (!jaAberto && !linhasMap.has(opId)) {
      setLoadingLinhas(prev => new Set(prev).add(opId));
      const { data } = await buscarAnalitico({ empresaId, mes, operadorId: opId });
      setLinhasMap(prev => new Map(prev).set(opId, data));
      setLoadingLinhas(prev => { const s = new Set(prev); s.delete(opId); return s; });
    }
  }

  function getLinhasOp(opId: string): AnaliticoRecebimento[] {
    return filtrarLinhasPorData(linhasMap.get(opId) ?? [], filtrosDatas.get(opId));
  }

  function setFiltroData(opId: string, campo: 'inicio' | 'fim', valor: string) {
    setFiltrosDatas(prev => {
      const next  = new Map(prev);
      const atual = next.get(opId) ?? { inicio: '', fim: '' };
      next.set(opId, { ...atual, [campo]: valor });
      return next;
    });
  }

  function limparFiltroData(opId: string) {
    setFiltrosDatas(prev => { const next = new Map(prev); next.delete(opId); return next; });
  }

  // ── Órfãos ────────────────────────────────────────────────────────────────
  async function removerOrfao(id: string) {
    setRemovendoId(id);
    const { error } = await removerLinhaAnalitico(id);
    if (error) toast.error(`Erro ao remover: ${error}`);
    else {
      toast.success('Linha removida.');
      setOrfaos(prev => prev.filter(o => o.id !== id));
      onRefetch();
    }
    setRemovendoId(null);
  }

  async function removerTodosOrfaos() {
    setRemovendoTodos(true);
    // Restrito ao setor: remove os órfãos QUE A LISTA ACIMA MOSTRA — carimbados
    // no setor, ou sem carimbo e importados por gente dele. Fora do escopo
    // restrito a lista traz todos, e o botão remove todos: os dois casam.
    const { error } = await removerOrfaosDoMes(
      empresaId, mes, restritoAoSetor ? escopoLimpeza : undefined);
    if (error) toast.error(`Erro ao remover: ${error}`);
    else {
      toast.success('Todos os registros sem operador foram removidos.');
      if (restritoAoSetor) void carregarOrfaos();
      else setOrfaos([]);
      onRefetch();
    }
    setRemovendoTodos(false);
  }

  /**
   * O líder tira da equipe o recebimento de quem foi transferido.
   *
   * Nada é apagado: o valor continua no total da empresa e no do setor. Ele só
   * deixa de aparecer nesta equipe — que é exatamente a pergunta que o líder
   * está respondendo ao clicar.
   */
  async function tirarDaEquipe() {
    const alvo = confirmandoFantasma;
    if (!alvo) return;
    const marca = transferidos[alvo.perfilId];
    if (!marca) return;

    setTirandoFantasma(true);
    const { error } = await removerFantasma(marca.transferenciaId, perfil?.id ?? null);
    setTirandoFantasma(false);

    if (error) { toast.error(`Não foi possível tirar: ${error}`); return; }

    setFantasmasTirados(prev => new Set(prev).add(alvo.perfilId));
    setConfirmandoFantasma(null);
    toast.success(
      `Recebimento de ${alvo.nome} saiu desta equipe. Ele continua no total do setor `
      + 'e da empresa, e some também do quadro de membros.',
      { duration: 8000 },
    );
    void carregarResumos();
    onRefetch();
  }

  async function limparMes() {
    setLimpando(true);
    // Com um setor em foco, limpa só ele — seja porque o usuário está preso a
    // esse setor, seja porque ele mesmo o filtrou. Sem setor nenhum, a empresa.
    //
    // Na BookPlay o RECEBIMENTO DIÁRIO sai do mesmo arquivo (ver
    // `limparMesRecebimentos`), então o mês dele cai junto — e volta na próxima
    // importação do relatório, que traz o mês inteiro.
    const { error, erroDiario } = await limparMesRecebimentos({
      empresaId, mes,
      escopo: limparSomenteOSetor ? escopoLimpeza : null,
      incluirDiario: !isPP,
    });
    if (error) {
      toast.error(`Erro ao limpar: ${error}`);
    } else {
      // O analítico já saiu; só o diário ficou. Dizer as duas coisas, senão o
      // líder acha que nada foi apagado e clica de novo.
      if (erroDiario) {
        toast.warning(
          `Analítico do mês excluído, mas o recebimento diário não foi. ${erroDiario}`,
        );
      }
      // Recalcula o snapshot mensal para o card refletir o que sobrou no banco
      await atualizarResumoMensal(empresaId, mes);
      const mesLabel = new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      const abas = isPP ? 'Dados' : 'Analítico e recebimento diário';
      toast.success(
        limparSomenteOSetor
          ? `${abas} de ${setorEmFocoLabel} em ${mesLabel} excluídos. Reimporte o relatório quando necessário.`
          : `${abas} de ${mesLabel} excluídos. Reimporte o relatório quando necessário.`,
      );
      setConfirmandoLimpeza(false);
      void carregarResumos();
      void carregarSnapshot();
      if (abaVisivel === 'orfaos')    void carregarOrfaos();
      if (abaVisivel === 'destaques') void carregarDestaques(filtroEquipeId, setorId);
      onRefetch();
    }
    setLimpando(false);
  }

  function handlePosImport() {
    setModalImportar(false);
    if (importHook.estado === 'done') {
      void carregarResumos();
      void carregarSnapshot();
      if (abaVisivel === 'orfaos')    void carregarOrfaos();
      if (abaVisivel === 'destaques') void carregarDestaques(filtroEquipeId, setorId);
      onRefetch();
    }
  }

  // Os vínculos que respondem "este operador conta neste setor/equipe?" —
  // inclui os clonados de outro setor. Ver `agregacaoLider`.
  const vinculos: VinculosOperador = useMemo(() => ({
    operadorEquipeMap,
    equipesExtras,
    setorDaEquipe: mapaSetorDaEquipe(equipes),
  }), [operadorEquipeMap, equipesExtras, equipes]);

  const resumosFiltrados = useMemo(
    () => filtrarResumos(resumos, { setorId, equipeId: filtroEquipeId }, vinculos),
    [resumos, setorId, filtroEquipeId, vinculos],
  );

  const resumosPorEquipe = useMemo(
    () => agruparPorEquipe(resumos, equipes, { setorId }, vinculos),
    [resumos, equipes, setorId, vinculos],
  );

  const metricas = useMemo(() => calcularMetricas({
    setorId, equipeId: filtroEquipeId, snapshot, resumosFiltrados,
    orfaosPorSetor, totalPorSetor, setoresAlternativos, isPaguePlay: isPP,
  }), [setorId, filtroEquipeId, snapshot, resumosFiltrados,
       orfaosPorSetor, totalPorSetor, setoresAlternativos, isPP]);

  /*
   * O ranking configurável.
   *
   * Recebe `resumosFiltrados` — o mesmo recorte de setor/equipe que a aba já
   * aplica — para o placar concordar com o resto da tela. Quem o hook tira
   * depois é só quem a CONFIGURAÇÃO manda tirar.
   */
  const rank = useRankingAnalitico({
    empresaId, mes, setorId,
    resumos: resumosFiltrados,
    equipes: equipesFiltradas,
    operadoresOcultos,
  });

  // Sem setor em foco não há regra a escrever: a configuração é por setor.
  const podeConfigurarRanking =
    temPermissao('analitico_ranking_configurar') && !!setorId && rank.configDisponivel;

  // ── Helpers destaques ──────────────────────────────────────────────────────
  const [mesAnoStr, mesNumStr] = mes.split('-');
  const diasNoMes    = diasDoMes(mes);
  // `getTodayISO` e não `new Date().toISOString()`: é este valor que decide
  // quais dias aparecem como futuros na lista de Destaques. Com o toISOString,
  // depois das 21h no Brasil o "hoje" virava amanhã e o dia corrente aparecia
  // esmaecido como se ainda não tivesse chegado.
  const hojeISO      = getTodayISO();
  const destaquesMap = useMemo(() => new Map(destaques.map(d => [d.dia, d])), [destaques]);

  /**
   * Dia → os destaques daquele dia, um por equipe/subgrupo.
   *
   * A RPC já devolve ordenado por dia e grupo; o que falta é agrupar por dia e
   * ordenar por valor DENTRO do dia, que é a ordem em que a tela lista os
   * cards — o maior recebimento do dia primeiro, seja de que grupo for.
   */
  const destaquesGrupoMap = useMemo(() => {
    const m = new Map<string, DestaqueGrupoDia[]>();
    for (const d of destaquesPorGrupo) {
      const lista = m.get(d.dia) ?? [];
      lista.push(d);
      m.set(d.dia, lista);
    }
    for (const lista of m.values()) lista.sort((a, b) => b.total_recebido - a.total_recebido);
    return m;
  }, [destaquesPorGrupo]);

  /** Há divisão de verdade? Um grupo só por dia não justifica mudar o desenho. */
  const temDestaquePorGrupo = useMemo(
    () => [...destaquesGrupoMap.values()].some(l => l.length > 1),
    [destaquesGrupoMap],
  );

  // ── Seletor de equipe reutilizável ────────────────────────────────────────
  const seletorEquipe = equipesFiltradas.length > 0 && (
    <div className="flex items-center gap-2">
      <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <select
        value={filtroEquipeId ?? ''}
        onChange={e => mudarFiltroEquipe(e.target.value || null)}
        className="h-7 px-2 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">Todas as equipes</option>
        {equipesFiltradas.map(eq => (
          <option key={eq.id} value={eq.id}>{eq.nome}</option>
        ))}
      </select>
      {filtroEquipeId && (
        <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs text-muted-foreground"
          onClick={() => mudarFiltroEquipe(null)}>
          <X className="w-3 h-3" /> Limpar
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Cards de resumo mensal ─────────────────────────────────────────── */}
      <div className={cn('grid grid-cols-2 sm:grid-cols-3 gap-3', mostrarHO ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        {loadingSnapshot ? (
          Array.from({ length: mostrarHO ? 5 : 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))
        ) : metricas ? (
          <>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total recebido</p>
                    <p className="text-base font-bold text-primary font-mono leading-tight mt-1 truncate">
                      {formatBRL(metricas.totalRecebido)}
                    </p>
                  </div>
                  <TrendingUp className="w-4 h-4 text-primary/50 shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>
            {mostrarHO && (
              <Card className="border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total HO</p>
                      <p className="text-base font-bold font-mono leading-tight mt-1 truncate">
                        {formatBRL(metricas.totalHo)}
                      </p>
                    </div>
                    <CreditCard className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Operadores</p>
                    <p className="text-xl font-bold leading-tight mt-1">{metricas.totalOperadores}</p>
                  </div>
                  <Users className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Acordos pagos</p>
                    <p className="text-xl font-bold leading-tight mt-1">
                      {metricas.totalPagamentos.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <BarChart3 className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Período</p>
                    {metricas.periodoInicio && metricas.periodoFim ? (
                      <p className="text-xs font-semibold leading-tight mt-1">
                        {new Date(metricas.periodoInicio + 'T12:00:00').toLocaleDateString('pt-BR')}
                        <span className="text-muted-foreground"> a </span>
                        {new Date(metricas.periodoFim + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">—</p>
                    )}
                  </div>
                  <Calendar className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="col-span-full text-center py-4 text-xs text-muted-foreground">
            Nenhum dado importado para este mês.
          </div>
        )}
      </div>

      {/* Composição do acumulado — de onde vieram os reais do card acima.
          Só com um setor em foco: sem filtro, o número é o da empresa, e a
          empresa soma tudo por definição — não há origem a tirar. */}
      {setorId && exclusoesAtivas && !loadingResumos && (
        <ComposicaoAcumulado
          origens={totalPorSetor[setorId]?.origens ?? []}
          nomeDoSetor={id => nomeDoSetor.get(id)}
          podeEditar={podeEditarComposicao}
          salvando={salvandoComposicao}
          onSalvar={excluidas => { void salvarComposicao(excluidas); }}
        />
      )}

      {/* Tabs + botão importar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Com cinco abas a régua não cabe em tela estreita: rola na horizontal
            em vez de quebrar linha — a borda inferior do strip é uma só. */}
        <div className="flex items-center gap-1 border-b border-border max-w-full overflow-x-auto">
          {abasInternas.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setAbaAtiva(key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
                abaVisivel === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
        {temPermissaoImportar && (
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmandoLimpeza(true)}
            >
              <Trash2 className="w-4 h-4" /> Limpar mês
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setModalImportar(true)}>
              <Upload className="w-4 h-4" /> Importar relatório
            </Button>
          </div>
        )}
      </div>

      {/* Cinco abas desligadas: os cards de resumo acima continuam valendo, e
          esta linha explica por que a régua está vazia. */}
      {abaVisivel === null && (
        <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
          Nenhum detalhamento do Analítico está liberado para o seu cargo.
        </div>
      )}

      {/* ── Aba: Por operador ─────────────────────────────────────────────── */}
      {abaVisivel === 'operadores' && (
        <div className="space-y-5">
          {loadingResumos && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg" />)}
            </div>
          )}
          {!loadingResumos && resumosPorEquipe.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhum dado para este mês.</p>
            </div>
          )}
          {!loadingResumos && resumosPorEquipe.map(grupo => (
            <div key={grupo.equipeId ?? '__sem__'} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2">
                  {grupo.equipeNome}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {grupo.items.map(r => {
                const aberto      = expandidos.has(r.operador_id);
                const carregando  = loadingLinhas.has(r.operador_id);
                const linhas      = getLinhasOp(r.operador_id);
                const todasLinhas = linhasMap.get(r.operador_id) ?? [];
                const filtro      = filtrosDatas.get(r.operador_id);
                const temFiltro   = !!(filtro?.inicio || filtro?.fim);

                return (
                  <Card key={r.operador_id} className="border-border">
                    <CardHeader className="p-3 cursor-pointer select-none"
                      onClick={() => void toggleExpandido(r.operador_id)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {carregando
                            ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                            : aberto
                              ? <ChevronDown  className="w-4 h-4 text-muted-foreground" />
                              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          <div>
                            <CardTitle className="text-sm flex items-center gap-1.5 flex-wrap">
                              {r.operador_nome ?? r.operador_usuario}
                              {transferidos[r.operador_id] && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-normal gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400"
                                  title={
                                    'Transferido neste mês. O recebimento continua aqui até a '
                                    + 'liderança decidir tirar.'
                                  }
                                >
                                  <ArrowRightLeft className="w-3 h-3" />
                                  transferido
                                </Badge>
                              )}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground font-mono">{r.operador_usuario}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className="text-sm font-bold text-primary">{formatBRL(r.total_recebido)}</p>
                            <p className="text-xs text-muted-foreground">recebido</p>
                          </div>
                          {mostrarHO && (
                            <div>
                              <p className="text-sm font-semibold">{formatBRL(r.total_ho)}</p>
                              <p className="text-xs text-muted-foreground">HO</p>
                            </div>
                          )}
                          <Badge variant="outline" className="shrink-0">{r.total_pagamentos} pgto.</Badge>
                          {/* Tirar da equipe o recebimento de quem foi
                              transferido. Não apaga nada: o valor continua no
                              total da empresa e no do setor — só deixa de
                              aparecer aqui, que é a pergunta do líder. */}
                          {transferidos[r.operador_id] && temPermissaoImportar && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive shrink-0"
                              disabled={fantasmasTirados.has(r.operador_id)}
                              onClick={e => {
                                e.stopPropagation();
                                setConfirmandoFantasma({
                                  perfilId:   r.operador_id,
                                  nome:       r.operador_nome ?? r.operador_usuario,
                                  equipeNome: grupo.equipeNome,
                                });
                              }}
                            >
                              Tirar da equipe
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    {aberto && (
                      <CardContent className="p-0 border-t">
                        {carregando ? (
                          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20 flex-wrap">
                              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="text-xs text-muted-foreground">Filtrar:</span>
                              <input type="date" value={filtro?.inicio ?? ''}
                                onChange={e => setFiltroData(r.operador_id, 'inicio', e.target.value)}
                                className="h-6 px-1.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <span className="text-xs text-muted-foreground">até</span>
                              <input type="date" value={filtro?.fim ?? ''}
                                onChange={e => setFiltroData(r.operador_id, 'fim', e.target.value)}
                                className="h-6 px-1.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              {temFiltro && (
                                <>
                                  <Button size="sm" variant="ghost"
                                    className="h-6 px-1.5 gap-1 text-xs text-muted-foreground"
                                    onClick={() => limparFiltroData(r.operador_id)}>
                                    <X className="w-3 h-3" /> Limpar
                                  </Button>
                                  <span className="text-xs text-muted-foreground">
                                    {linhas.length}/{todasLinhas.length}
                                  </span>
                                </>
                              )}
                              <Button size="sm" variant="outline"
                                className="h-6 px-2 gap-1 text-xs ml-auto"
                                disabled={linhas.length === 0}
                                onClick={() => void copiarTexto(
                                  montarTextoListaAnalitico(r.operador_nome ?? r.operador_usuario, linhas),
                                  'Lista de acordos copiada',
                                )}>
                                <Copy className="w-3 h-3" /> Copiar lista
                              </Button>
                            </div>

                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/30">
                                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">CÓDIGO</th>
                                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">FORMA</th>
                                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">RECEBIDO</th>
                                  {mostrarHO && <th className="text-right px-3 py-2 font-semibold text-muted-foreground">HO</th>}
                                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">DATA</th>
                                  <th className="text-right px-3 py-2 font-semibold text-muted-foreground">AÇÃO</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {linhas.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground text-xs">
                                      {temFiltro ? 'Nenhum registro no período.' : 'Sem registros.'}
                                    </td>
                                  </tr>
                                ) : linhas.flatMap(linha => {
                                  const pagamentos = linha.pagamentos_detalhados;
                                  const formaBadge = (
                                    <Badge variant="outline" className={
                                      linha.forma_pagamento === 'cartao'
                                        ? 'text-xs border-purple-300 text-purple-700'
                                        : 'text-xs border-blue-300 text-blue-700'
                                    }>
                                      {linha.forma_detalhe || (linha.forma_pagamento === 'cartao' ? 'Cartão' : 'Boleto/Pix')}
                                    </Badge>
                                  );

                                  if (!pagamentos || pagamentos.length <= 1) {
                                    return [
                                      <tr key={linha.id} className="hover:bg-muted/20">
                                        <td className="px-3 py-2">
                                          <span className="font-semibold">{linha.codigo}</span>
                                          {linha.nome_cliente && (
                                            <span className="block text-muted-foreground truncate max-w-[120px]">{linha.nome_cliente}</span>
                                          )}
                                          {linha.instituicao && (
                                            <span className="block text-[10px] text-muted-foreground/70 truncate max-w-[120px]">{linha.instituicao}</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2">{formaBadge}</td>
                                        <td className="px-3 py-2 text-right font-mono">{formatBRL(linha.valor_recebido)}</td>
                                        {mostrarHO && <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatBRL(linha.total_ho)}</td>}
                                        <td className="px-3 py-2 tabular-nums">
                                          {new Date(linha.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <TabulacaoCell
                                            linha={linha} empresaId={empresaId}
                                            operadorId={r.operador_id}
                                            operadorNome={r.operador_nome ?? r.operador_usuario}
                                            liderId={liderId}
                                            onAbrirNovoAcordo={onAbrirNovoAcordo}
                                            onVerAcordo={onVerAcordo}
                                            onRefetch={onRefetch}
                                          />
                                        </td>
                                      </tr>,
                                    ];
                                  }

                                  return pagamentos.map((p, idx) => (
                                    <tr key={`${linha.id}::${idx}`} className="hover:bg-muted/20">
                                      {idx === 0 && (
                                        <td rowSpan={pagamentos.length} className="px-3 py-2 align-top">
                                          <span className="font-semibold">{linha.codigo}</span>
                                          {linha.nome_cliente && (
                                            <span className="block text-muted-foreground truncate max-w-[120px]">{linha.nome_cliente}</span>
                                          )}
                                          {linha.instituicao && (
                                            <span className="block text-[10px] text-muted-foreground/70 truncate max-w-[120px]">{linha.instituicao}</span>
                                          )}
                                        </td>
                                      )}
                                      <td className="px-3 py-2">{formaBadge}</td>
                                      <td className="px-3 py-2 text-right font-mono">{formatBRL(p.valor)}</td>
                                      {mostrarHO && <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatBRL(p.total_ho)}</td>}
                                      <td className="px-3 py-2 tabular-nums">
                                        {new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                                      </td>
                                      {idx === 0 && (
                                        <td rowSpan={pagamentos.length} className="px-3 py-2 text-right align-top">
                                          <TabulacaoCell
                                            linha={linha} empresaId={empresaId}
                                            operadorId={r.operador_id}
                                            operadorNome={r.operador_nome ?? r.operador_usuario}
                                            liderId={liderId}
                                            onAbrirNovoAcordo={onAbrirNovoAcordo}
                                            onVerAcordo={onVerAcordo}
                                            onRefetch={onRefetch}
                                          />
                                        </td>
                                      )}
                                    </tr>
                                  ));
                                })}
                              </tbody>
                            </table>
                          </>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Aba: Formas de pagamento ──────────────────────────────────────── */}
      {abaVisivel === 'formas' && (
        <FormasPagamento
          empresaId={empresaId}
          mes={mes}
          setorId={setorId}
          setorNome={setorId ? nomeDoSetor.get(setorId) : undefined}
          isPaguePlay={isPP}
          mostrarHO={mostrarHO}
          // As mesmas equipes dos outros filtros da tela (já pelo setor em foco)
          equipes={equipesFiltradas}
          resumos={resumos}
          vinculos={vinculos}
          equipeId={filtroEquipeId}
          onEquipeChange={mudarFiltroEquipe}
        />
      )}

      {/* ── Aba: Ranking ──────────────────────────────────────────────────── */}
      {abaVisivel === 'ranking' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            {equipesFiltradas.length > 0 ? (
              <div className="flex items-center gap-2">{seletorEquipe}</div>
            ) : <span />}

            <div className="flex items-center gap-2">
              {/* A régua da posição fica escrita na tela. Sem isto, "por que
                  fulano está na frente?" vira uma pergunta sem resposta
                  visível para quem não configurou o ranking. */}
              <Badge variant="outline" className="text-[11px] gap-1">
                <Trophy className="w-3 h-3" /> {LABEL_CRITERIO[rank.config.criterio]}
              </Badge>
              {rank.config.perfisExcluidos.length > 0 && (
                <Badge variant="secondary" className="text-[11px]">
                  {rank.config.perfisExcluidos.length} fora
                </Badge>
              )}
              {podeConfigurarRanking && (
                <Button
                  size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                  onClick={() => setConfigRankingAberto(true)}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Configurar
                </Button>
              )}
            </div>
          </div>

          {loadingResumos || rank.carregando ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-muted rounded-lg" />)}
            </div>
          ) : rank.linhas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">
                {resumosFiltrados.length === 0
                  ? 'Nenhum dado para exibir.'
                  : 'Ninguém participa do ranking com a configuração atual.'}
              </p>
            </div>
          ) : (
            <RankingView
              resumos={rank.linhas}
              grupos={rank.grupos}
              criterio={rank.config.criterio}
              mostrarCopiar
            />
          )}
        </div>
      )}

      {/* A configuração vive fora da aba: fechar o diálogo não pode depender de
          a aba continuar montada. */}
      <ConfigurarRankingDialog
        aberto={configRankingAberto}
        onFechar={() => setConfigRankingAberto(false)}
        config={rank.config}
        grupos={rank.gruposConfiguraveis}
        pessoas={rank.pessoasConfiguraveis}
        salvando={rank.salvando}
        onSalvar={async nova => {
          const ok = await rank.salvar(nova, perfilId);
          if (ok) {
            toast.success('Ranking configurado.');
            setConfigRankingAberto(false);
          } else {
            toast.error('Não foi possível salvar a configuração do ranking.');
          }
        }}
      />

      {/* ── Aba: Destaques do dia ─────────────────────────────────────────── */}
      {abaVisivel === 'destaques' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold">{MESES_PT[Number(mesNumStr) - 1]} de {mesAnoStr}</p>
              <p className="text-xs text-muted-foreground">
                {temDestaquePorGrupo
                  ? 'Maior recebimento de cada equipe/subgrupo, por dia'
                  : 'Destaque de recebimento por dia'}
              </p>
            </div>
            {equipesFiltradas.length > 0 && seletorEquipe}
          </div>

          {loadingDestaques ? (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {Array.from({ length: diasNoMes }, (_, i) => {
                const d      = i + 1;
                const diaStr = `${mes}-${String(d).padStart(2, '0')}`;
                const isHoje = diaStr === hojeISO;
                const isFut  = diaStr > hojeISO;

                /*
                 * Um destaque por equipe/subgrupo quando há divisão; o destaque
                 * único quando não há.
                 *
                 * O caminho antigo continua vivo, e não por gentileza com o
                 * código velho: enquanto a RPC nova não estiver no banco,
                 * `destaquesGrupoMap` vem vazio e é ELE que segura a aba de pé.
                 */
                const doDia = temDestaquePorGrupo ? (destaquesGrupoMap.get(diaStr) ?? []) : [];
                const unico = destaquesMap.get(diaStr);
                const temAlgo = doDia.length > 0 || !!unico;

                return (
                  <div key={diaStr} className={cn(
                    'flex gap-3 rounded-lg border px-4 py-3',
                    doDia.length > 1 ? 'items-start' : 'items-center',
                    isHoje   && 'border-primary/40 bg-primary/5',
                    !isHoje && !isFut && temAlgo && 'border-border bg-card',
                    isFut    && 'border-border/50 bg-muted/20 opacity-50',
                    !temAlgo && !isFut && 'border-border/50 bg-muted/10',
                  )}>
                    <div className={cn('text-center shrink-0 w-10', doDia.length > 1 && 'pt-0.5')}>
                      <p className={cn('text-lg font-bold leading-none', isHoje ? 'text-primary' : 'text-foreground')}>
                        {String(d).padStart(2, '0')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {DIAS_PT[new Date(diaStr + 'T12:00:00').getDay()]}
                      </p>
                    </div>
                    <div className={cn('w-px self-stretch', isHoje ? 'bg-primary/30' : 'bg-border')} />

                    {doDia.length > 0 ? (
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {doDia.map(g => (
                          <div key={`${g.grupo_id ?? 'sem'}-${g.operador_id}`} className="flex items-center gap-2">
                            <Star className="w-3.5 h-3.5 text-amber-500 shrink-0 fill-amber-400" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold truncate">
                                {g.operador_nome ?? g.operador_usuario}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {g.grupo_nome ?? 'sem equipe'}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-primary font-mono">{formatBRL(g.total_recebido)}</p>
                              <p className="text-xs text-muted-foreground">
                                {g.total_pagamentos} pgto{g.total_pagamentos !== 1 ? 's' : ''}.
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : unico ? (
                      <>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Star className="w-3.5 h-3.5 text-amber-500 shrink-0 fill-amber-400" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{unico.operador_nome ?? unico.operador_usuario}</p>
                            <p className="text-xs text-muted-foreground">destaque do dia</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-primary font-mono">{formatBRL(unico.total_recebido)}</p>
                          <p className="text-xs text-muted-foreground">
                            {unico.total_pagamentos} pgto{unico.total_pagamentos !== 1 ? 's' : ''}.
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground italic flex-1">
                        {isFut ? '—' : 'Sem recebimentos'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Desempenho Equipes / Quartis / Gráfico recebimento agora moram no
          Painel Líder (os dois tenants — mudança de caminho). */}

      {/* ── Aba: Sem operador ─────────────────────────────────────────────── */}
      {abaVisivel === 'orfaos' && (
        <div className="space-y-3">
          {loadingOrfaos && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-muted rounded-lg" />)}
            </div>
          )}
          {!loadingOrfaos && orfaosVisiveisSetor.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhuma linha sem operador. ✓</p>
            </div>
          )}
          {!loadingOrfaos && orfaosVisiveisSetor.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {orfaosVisiveisSetor.length} linha{orfaosVisiveisSetor.length !== 1 ? 's' : ''} não vinculada{orfaosVisiveisSetor.length !== 1 ? 's' : ''}.
                </p>
                <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs"
                  onClick={() => void removerTodosOrfaos()} disabled={removendoTodos}>
                  {removendoTodos
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Trash2 className="w-3 h-3" />}
                  Remover todos
                </Button>
              </div>
              <Card className="border-border">
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">COBRADORA</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">CÓDIGO</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">FORMA</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">RECEBIDO</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">DATA</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">REMOVER</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {orfaosVisiveisSetor.slice(0, orfaosVisiveis).map(linha => (
                        <tr key={linha.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-mono text-amber-600">{linha.operador_usuario}</td>
                          <td className="px-3 py-2 font-semibold">{linha.codigo}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={
                              linha.forma_pagamento === 'cartao'
                                ? 'text-xs border-purple-300 text-purple-700'
                                : 'text-xs border-blue-300 text-blue-700'
                            }>
                              {linha.forma_pagamento === 'cartao' ? 'Cartão' : 'Boleto/Pix'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{formatBRL(linha.valor_recebido)}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {new Date(linha.data_pagamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                              onClick={() => void removerOrfao(linha.id)}
                              disabled={removendoId === linha.id}>
                              {removendoId === linha.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              {orfaosVisiveis < orfaosVisiveisSetor.length && (
                <div className="flex justify-center pt-1">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs"
                    onClick={() => setOrfaosVisiveis(prev => prev + ORFAOS_PAGE)}>
                    Carregar mais ({orfaosVisiveisSetor.length - orfaosVisiveis} restantes)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <AlertDialog open={confirmandoLimpeza} onOpenChange={setConfirmandoLimpeza}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> Limpar dados do mês
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <p>
                Todos os registros importados de{' '}
                <strong>
                  {new Date(mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </strong>{' '}
                {limparSomenteOSetor ? <>do setor <strong>{setorEmFocoLabel}</strong> </> : ''}
                serão excluídos permanentemente,
                incluindo todas as tabulações registradas no período.
                {limparSomenteOSetor
                  ? ' Os dados dos demais setores não serão afetados.'
                  : ' Isso alcança TODOS os setores da empresa — para limpar apenas um, filtre o setor antes.'}
              </p>
              {!isPP && (
                <p>
                  O <strong>Recebimento diário</strong> do mês sai junto: as duas abas
                  vêm do mesmo relatório, e deixar uma sem a outra é o que fazia o
                  diário ficar acima do analítico. Reimportar o relatório do mês
                  reconstrói os dois, dia por dia.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Esta ação não pode ser desfeita. Após a exclusão, reimporte o relatório para restaurar os dados.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={limpando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void limparMes()}
              disabled={limpando}
              className="bg-destructive hover:bg-destructive/90 text-white gap-1.5"
            >
              {limpando && <Loader2 className="w-4 h-4 animate-spin" />}
              {limpando ? 'Excluindo…' : 'Confirmar exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tirar o fantasma da equipe — mesma confirmação do quadro de membros,
          porque é o mesmo registro dos dois lados. */}
      <ConfirmarTirarFantasma
        alvo={confirmandoFantasma}
        empresaId={empresaId}
        mes={mes}
        removendo={tirandoFantasma}
        onCancelar={() => setConfirmandoFantasma(null)}
        onConfirmar={() => void tirarDaEquipe()}
      />

      <ImportarModal aberto={modalImportar} onFechar={handlePosImport} hook={importHook} />
    </div>
  );
}
