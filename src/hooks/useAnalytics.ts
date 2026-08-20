/**
 * useAnalytics.ts — ATUALIZADO
 * Adicionado: `acordosMes: Acordo[]` no retorno para o AnalyticsPanel calcular % por tipo.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase, Acordo } from '@/lib/supabase';
import {
  useRealtimeAcordos, type AcordoRealtimeEvent,
} from '@/providers/RealtimeAcordosProvider';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { useCargoPermissoes } from './useCargoPermissoes';
import { temEscopo } from '@/lib/permissoes-escopo';
import { getTodayISO, PP_HO_PERCENTUAL } from '@/lib/index';
import {
  normalizarMes, partesDoMes, primeiroDiaDoMes, ultimoDiaDoMes, diasNoMes,
} from '@/lib/mesReferencia';
import { useTenant } from '@/lib/tenant-config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetaInfo {
  id?: string;
  tipo: 'setor' | 'equipe' | 'operador';
  referencia_id: string;
  meta_valor: number;
  meta_acordos: number;
  mes: number;
  ano: number;
}

export interface AnalyticsData {
  // Valores monetários
  valorRecebidoMes: number;
  valorAgendadoMes: number;
  valorNaoPago: number;
  valorAgendadoHoje: number;

  // "Agendado restante no mês" — acordos PENDENTES (status='verificar_pendente')
  // com vencimento no mês atual e ainda não resolvidos (exclui pago e não pago).
  // Usado apenas em PaguePlay/Bookplay.
  valorAgendadoRestanteMes: number;
  totalAgendadoRestanteMes: number;

  // H.O. — Honorários Operacionais PaguePlay (24,96% do bruto recebido)
  // Disponível para todos, mas só relevante para PaguePlay
  valorHOMes: number;        // H.O. do total recebido no mês
  valorHOAgendado: number;   // H.O. do total agendado no mês
  valorHONaoPago: number;    // H.O. do total não pago

  // Quantidades
  totalAcordosMes: number;
  totalAcordosHoje: number;
  totalPagosMes: number;
  totalNaoPagos: number;
  totalPendentes: number;

  // Meta
  meta: MetaInfo | null;
  percMeta: number;
  percMetaAcordos: number;

  // Por status (para gráfico)
  porStatus: { name: string; value: number; color: string; icon: string }[];

  // Por dia do mês (para gráfico de área)
  porDia: { dia: string; recebido: number; agendado: number; ho: number }[];

  // Por equipe (admin/líder)
  porEquipe?: { nome: string; acordos: number; valor: number; meta: number; perc: number }[];

  // Por operador (admin/líder)
  porOperador?: { id: string; nome: string; acordos: number; valor: number; meta: number; perc: number }[];

  // NOVO: acordos do mês atual (para calcular % por tipo no painel)
  acordosMes: Acordo[];

  // Setores disponíveis para filtro (admin)
  setores: { id: string; nome: string }[];
  setorFiltro: string | null;
  setSetorFiltro: (id: string | null) => void;

  // Filtro por equipe (Líder/Elite: visão de equipe específica)
  equipeFiltro: string | null;
  setEquipeFiltro: (id: string | null) => void;
  // Equipes do setor do lider/elite (carregadas dinamicamente)
  equipesDoSetor: { id: string; nome: string }[];

  // Filtro por operador (Elite em visão individual)
  operadorFiltro: string | null;
  setOperadorFiltro: (id: string | null) => void;

  loading: boolean;
  refetch: () => void;
}

function calcPerc(realizado: number, meta: number): number {
  if (!meta || meta <= 0) return 0;
  return Math.min(Math.round((realizado / meta) * 100), 999);
}

interface EscopoAcordosRealtime {
  empresaId: string;
  inicio: string;
  fim: string;
  isAdmin: boolean;
  isLider: boolean;
  verTodosSetores: boolean;
  perfilId: string;
  perfilSetorId: string | null;
  setorFiltro: string | null;
  operadorFiltro: string | null;
  operadoresDaEquipe: ReadonlySet<string> | null;
  cloneIdsSetor: ReadonlySet<string>;
}

/** A mesma hierarquia aplicada na query inicial, agora para um único evento. */
function pertenceAoEscopoRealtime(
  acordo: Partial<Acordo>,
  escopo: EscopoAcordosRealtime,
): boolean {
  if (acordo.empresa_id !== escopo.empresaId) return false;
  const vencimento = acordo.vencimento ?? '';
  if (vencimento < escopo.inicio || vencimento > escopo.fim) return false;

  if (escopo.operadorFiltro) return acordo.operador_id === escopo.operadorFiltro;
  if (escopo.operadoresDaEquipe) {
    return !!acordo.operador_id && escopo.operadoresDaEquipe.has(acordo.operador_id);
  }
  if (escopo.isAdmin) {
    return !escopo.setorFiltro || acordo.setor_id === escopo.setorFiltro;
  }
  if (!escopo.isLider) return acordo.operador_id === escopo.perfilId;
  if (escopo.verTodosSetores) {
    return !escopo.setorFiltro || acordo.setor_id === escopo.setorFiltro;
  }
  return acordo.setor_id === escopo.perfilSetorId
    || (!!acordo.operador_id && escopo.cloneIdsSetor.has(acordo.operador_id));
}

/** Preserva todos os objetos/linhas que não mudaram. */
function aplicarDeltaRealtime(
  atual: Acordo[],
  evento: AcordoRealtimeEvent,
  escopo: EscopoAcordosRealtime,
): Acordo[] {
  const id = evento.newRecord?.id ?? evento.oldRecord?.id;
  if (!id) return atual;
  const indice = atual.findIndex(a => a.id === id);

  if (evento.eventType === 'DELETE') {
    return indice < 0 ? atual : atual.filter(a => a.id !== id);
  }
  if (!evento.newRecord) return atual;

  const existente = indice >= 0 ? atual[indice] : null;
  const proximo = (existente
    ? { ...existente, ...evento.newRecord }
    : evento.newRecord) as Acordo;
  const pertence = pertenceAoEscopoRealtime(proximo, escopo);

  if (!pertence) return indice < 0 ? atual : atual.filter(a => a.id !== id);
  if (indice < 0) return [proximo, ...atual];

  const lista = [...atual];
  lista[indice] = proximo;
  return lista;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param mesRef mês a analisar (`yyyy-MM`). Omitido = mês corrente, que é como
 *   todos os consumidores antigos continuam se comportando.
 */
export function useAnalytics(
  mesRef?: string | null,
  contexto: 'dashboard' | 'diretoria' = 'dashboard',
): AnalyticsData {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();
  const verTodosSetores = contexto === 'diretoria'
    ? temPermissao('ver_painel_diretoria')
    : temEscopo('dashboard', 'todos_setores', temPermissao);
  const podeFiltrarSetor = contexto === 'diretoria'
    ? temPermissao('ver_painel_diretoria')
    : temEscopo('dashboard', 'setor', temPermissao) || verTodosSetores;
  const podeFiltrarEquipe = contexto === 'diretoria'
    ? temPermissao('ver_painel_diretoria')
    : temEscopo('dashboard', 'equipe', temPermissao);
  const visaoAmpla = contexto === 'diretoria'
    ? temPermissao('ver_painel_diretoria')
    : podeFiltrarEquipe || podeFiltrarSetor || verTodosSetores;
  const tenant = useTenant();
  const isPP = tenant.isPaguePlay;
  const isBookplay = tenant.slug === 'bookplay';
  const { subscribe, unsubscribe } = useRealtimeAcordos();
  // ID estável por instância
  const instanceId = useRef(`useAnalytics-${Math.random().toString(36).slice(2, 10)}`).current;
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [setorFiltro, setSetorFiltro] = useState<string | null>(null);
  const [equipeFiltro, setEquipeFiltro] = useState<string | null>(null);
  const [operadorFiltro, setOperadorFiltro] = useState<string | null>(null);
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);
  const [equipesDoSetor, setEquipesDoSetor] = useState<{ id: string; nome: string }[]>([]);
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [metasEquipe, setMetasEquipe] = useState<MetaInfo[]>([]);
  const [metasOperador, setMetasOperador] = useState<MetaInfo[]>([]);
  const [operadoresMap, setOperadoresMap] = useState<Record<string, string>>({});
  const [equipesMap, setEquipesMap] = useState<Record<string, string>>({});
  // BUG FIX Painel Diretoria / Performance por equipe:
  // A tabela `acordos` NÃO tem coluna `equipe_id` — a equipe é uma propriedade do
  // perfil (operador). Para agrupar corretamente por equipe, precisamos do mapa
  // operador_id → equipe_id. Sem isto, todos os acordos caíam em "Sem equipe".
  const [operadorEquipeMap, setOperadorEquipeMap] = useState<Record<string, string | null>>({});
  const escopoRealtimeRef = useRef<EscopoAcordosRealtime | null>(null);
  const [loading, setLoading] = useState(true);
  const mesAnalise  = normalizarMes(mesRef);
  const { mes, ano } = partesDoMes(mesAnalise);
  const inicio = primeiroDiaDoMes(mesAnalise);
  const fim = ultimoDiaDoMes(mesAnalise);
  const hoje = getTodayISO();

  const fetchAll = useCallback(async (silencioso = false) => {
    if (!perfil || !empresa?.id) return;
    // Realtime atualiza os dados por baixo do painel já montado. O esqueleto é
    // reservado à primeira carga/troca de escopo; reexibi-lo a cada INSERT ou
    // UPDATE fazia todo o dashboard piscar e perder a posição visual.
    if (!silencioso) setLoading(true);
    const isAdmin = visaoAmpla && verTodosSetores;
    const isLider = visaoAmpla;
    const isDiretoria = false;

    try {
      // ── Carregar setores para o filtro do admin/diretoria ────────────────────
      // Líder/Elite/Gerência com 'ver_todos_setores' também ganha o filtro
      if (podeFiltrarSetor && verTodosSetores) {
        const { data: setoresData } = await supabase
          .from('setores')
          .select('id, nome')
          .eq('empresa_id', empresa.id)
          .order('nome');
        setSetores((setoresData as { id: string; nome: string }[]) ?? []);
      }

      // ── Carregar equipes do setor para o Líder/Elite ─────────────────────────
      let equipesDoSetorAtual: { id: string; nome: string }[] = [];
      if (podeFiltrarEquipe && (perfil.setor_id || verTodosSetores)) {
        let eqQuery = supabase
          .from('equipes')
          .select('id, nome')
          .eq('empresa_id', empresa.id);
        // Sem 'ver_todos_setores': apenas equipes do próprio setor
        if (!verTodosSetores && perfil.setor_id) {
          eqQuery = eqQuery.eq('setor_id', perfil.setor_id);
        }
        const { data: eqData } = await eqQuery.order('nome');
        equipesDoSetorAtual = (eqData as { id: string; nome: string }[]) ?? [];
        setEquipesDoSetor(equipesDoSetorAtual);
      }

      // ── Resolver operadores da equipe selecionada (se equipeFiltro ativo) ───
      // O campo equipe_id existe em perfis (não em acordos), então precisamos
      // buscar os operador_id dos membros da equipe e filtrar acordos por IN.
      let operadoresDaEquipe: string[] | null = null;
      if (podeFiltrarEquipe && equipeFiltro && !operadorFiltro) {
        const { data: membros } = await supabase
          .from('perfis')
          .select('id')
          .eq('empresa_id', empresa.id)
          .eq('equipe_id', equipeFiltro);
        operadoresDaEquipe = ((membros as { id: string }[]) ?? []).map(m => m.id);
      }

      // BookPlay: operadores CLONADOS em equipes do setor do líder (setor de
      // origem diferente). A visão geral do setor precisa incluí-los, senão um
      // setor formado só por clones (ex.: Digital) fica com o dashboard zerado.
      let cloneIdsSetor: string[] = [];
      if (isBookplay && isLider && !verTodosSetores && perfil.setor_id && !operadorFiltro && !equipeFiltro) {
        const { data: eqs } = await supabase
          .from('equipes').select('id').eq('empresa_id', empresa.id).eq('setor_id', perfil.setor_id);
        const eqIds = ((eqs as { id: string }[]) ?? []).map(e => e.id);
        if (eqIds.length) {
          const { data: cl } = await supabase
            .from('equipe_operadores_clones').select('operador_id')
            .eq('empresa_id', empresa.id).in('equipe_id', eqIds);
          cloneIdsSetor = [...new Set(((cl as { operador_id: string }[]) ?? []).map(c => c.operador_id))];
        }
      }

      escopoRealtimeRef.current = {
        empresaId: empresa.id,
        inicio,
        fim,
        isAdmin,
        isLider,
        verTodosSetores,
        perfilId: perfil.id,
        perfilSetorId: perfil.setor_id ?? null,
        setorFiltro,
        operadorFiltro,
        operadoresDaEquipe: operadoresDaEquipe === null ? null : new Set(operadoresDaEquipe),
        cloneIdsSetor: new Set(cloneIdsSetor),
      };

      // ── Acordos conforme perfil ──────────────────────────────────────────────
      // Reconstruída a cada página: o PostgREST corta em 1000 linhas por query,
      // então uma busca única truncava a visão do admin (empresa toda passa de
      // 1000 acordos/mês) e a série "agendado" do gráfico vinha incompleta.
      // Ordena por id para a paginação por range ser determinística.
      const montarQuery = () => {
        let q = supabase
          .from('acordos')
          .select('id, empresa_id, operador_id, setor_id, vencimento, valor, status, tipo, tipo_vinculo')
          .eq('empresa_id', empresa.id)
          .gte('vencimento', inicio)
          .lte('vencimento', fim)
          .order('id', { ascending: true });

        // Filtros explícitos vencem o nível de visão. Isso é importante para
        // gerência/superadmin: ter acesso à empresa inteira não pode inutilizar
        // o clique numa equipe ou na visão individual.
        if (operadorFiltro) {
          q = q.eq('operador_id', operadorFiltro);
        } else if (operadoresDaEquipe !== null) {
          if (operadoresDaEquipe.length === 0) {
            q = q.eq('operador_id', '00000000-0000-0000-0000-000000000000');
          } else {
            q = q.in('operador_id', operadoresDaEquipe);
          }
        } else if (!isAdmin && !isDiretoria) {
          if (isLider && (perfil.setor_id || verTodosSetores)) {
            // Líder/Elite: hierarquia de filtros
            // 1. visão individual → filtra pelo próprio operador_id
            // 2. visão de equipe  → filtra por operador_id IN (membros da equipe)
            // 3. visão geral      → filtra pelo setor_id
            //    (com 'ver_todos_setores': empresa toda, respeitando setorFiltro)
            if (verTodosSetores) {
              if (setorFiltro) q = q.eq('setor_id', setorFiltro);
            } else if (cloneIdsSetor.length) {
              // BookPlay: setor do líder + operadores clonados nele (setor de
              // origem diferente). A RLS já autoriza esses acordos ao líder.
              q = q.or(`setor_id.eq.${perfil.setor_id},operador_id.in.(${cloneIdsSetor.join(',')})`);
            } else {
              q = q.eq('setor_id', perfil.setor_id);
            }
          } else {
            q = q.eq('operador_id', perfil.id);
          }
        } else if (setorFiltro) {
          // Admin/Diretoria filtrou por setor específico
          q = q.eq('setor_id', setorFiltro);
        }
        return q;
      };

      const PAGE = 1000;
      let acordosData: Acordo[] = [];
      let offset = 0;
      while (true) {
        const { data: pagina, error: errPagina } =
          await montarQuery().range(offset, offset + PAGE - 1);
        if (errPagina) break;
        const batch = (pagina as Acordo[]) ?? [];
        acordosData = acordosData.concat(batch);
        if (batch.length < PAGE) break;
        offset += PAGE;
      }
      setAcordos(acordosData);

      // ── Meta: hierarquia dependente do filtro ativo ──────────────────────────
      // Prioridade:
      //   1. Filtro individual (operadorFiltro) → meta do operador
      //   2. Filtro de equipe (equipeFiltro)     → meta da equipe selecionada
      //   3. Padrão Líder/Elite                  → meta do setor
      //   4. Operador comum                      → meta do próprio operador
      //   5. Admin                               → sem meta principal
      let tipoMeta: 'setor' | 'equipe' | 'operador' | null = null;
      let refId: string | null = null;

      if (!isAdmin) {
        if (operadorFiltro) {
          tipoMeta = 'operador';
          refId    = operadorFiltro;
        } else if (equipeFiltro && isLider) {
          tipoMeta = 'equipe';
          refId    = equipeFiltro;
        } else if (isLider && verTodosSetores && setorFiltro) {
          // Com 'ver_todos_setores' e um setor filtrado → meta do setor filtrado
          tipoMeta = 'setor';
          refId    = setorFiltro;
        } else if (isLider && perfil.setor_id) {
          tipoMeta = 'setor';
          refId    = perfil.setor_id;
        } else if (!isLider) {
          tipoMeta = 'operador';
          refId    = perfil.id;
        }
      }

      if (tipoMeta && refId) {
        const { data: metaData } = await supabase
          .from('metas')
          .select('*')
          .eq('tipo', tipoMeta)
          .eq('referencia_id', refId)
          .eq('empresa_id', empresa.id)
          .eq('mes', mes)
          .eq('ano', ano)
          .maybeSingle();
        setMeta(metaData as MetaInfo | null);
      } else if (isAdmin) {
        setMeta(null);
      }

      // ── Metas por equipe / operador (admin/líder/diretoria) ─────────────────
      if (isAdmin || isLider || isDiretoria) {
        const [{ data: meq }, { data: mop }] = await Promise.all([
          supabase
            .from('metas')
            .select('*')
            .eq('tipo', 'equipe')
            .eq('empresa_id', empresa.id)
            .eq('mes', mes)
            .eq('ano', ano),
          supabase
            .from('metas')
            .select('*')
            .eq('tipo', 'operador')
            .eq('empresa_id', empresa.id)
            .eq('mes', mes)
            .eq('ano', ano),
        ]);
        setMetasEquipe((meq as MetaInfo[]) || []);
        setMetasOperador((mop as MetaInfo[]) || []);

        // Mapas de nomes
        const [{ data: ops }, { data: eqs }] = await Promise.all([
          supabase
            .from('perfis')
            .select('id, nome, equipe_id')
            .eq('empresa_id', empresa.id)
            .in('perfil', ['operador', 'elite', 'gerencia']),
          supabase
            .from('equipes')
            .select('id, nome')
            .eq('empresa_id', empresa.id),
        ]);

        const opMap: Record<string, string> = {};
        const opEqMap: Record<string, string | null> = {};
        ((ops as { id: string; nome: string; equipe_id: string | null }[]) || []).forEach(o => {
          opMap[o.id]   = o.nome;
          opEqMap[o.id] = o.equipe_id ?? null;
        });
        setOperadoresMap(opMap);
        setOperadorEquipeMap(opEqMap);

        const eqMap: Record<string, string> = {};
        ((eqs as { id: string; nome: string }[]) || []).forEach(e => { eqMap[e.id] = e.nome; });
        setEquipesMap(eqMap);
      }
    } catch (err) {
      console.error('[useAnalytics] erro:', err);
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [perfil, empresa, mes, ano, inicio, fim, setorFiltro, equipeFiltro, operadorFiltro, verTodosSetores, isBookplay, podeFiltrarSetor, podeFiltrarEquipe, visaoAmpla]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Realtime: subscribe no canal central (sem canal próprio) ────────────────
  // Um evento altera apenas o registro afetado. Os `useMemo` abaixo recalculam
  // os agregados sobre o snapshot local sem nova leitura no banco e sem trocar
  // o painel por skeleton.
  useEffect(() => {
    subscribe(instanceId, evento => {
      const escopo = escopoRealtimeRef.current;
      if (!escopo) return;
      setAcordos(atual => aplicarDeltaRealtime(atual, evento, escopo));
    });
    return () => unsubscribe(instanceId);
  }, [subscribe, unsubscribe, instanceId]);

  // ── Derivados computados ─────────────────────────────────────────────────────
  const derived = useMemo(() => {
    const isWideView = visaoAmpla && !operadorFiltro;

    const acordosMes = acordos.filter(
      a => a.vencimento >= inicio && a.vencimento <= fim,
    );
    const acordosHoje = acordosMes.filter(a => a.vencimento === hoje);

    // Para métricas de valor: exclui extras na visão ampla (evita dupla contagem).
    // Vale para PaguePlay e BookPlay (ambos usam vínculo direto/extra).
    const acordosMesMetricas = isWideView
      ? acordosMes.filter(a => a.tipo_vinculo !== 'extra')
      : acordosMes;

    const pagos       = acordosMesMetricas.filter(a => a.status === 'pago');
    const naoPagos    = acordosMesMetricas.filter(a => a.status === 'nao_pago');
    const pendentes   = acordosMesMetricas.filter(a => a.status === 'verificar_pendente');

    const valorRecebidoMes   = pagos.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const valorAgendadoMes   = acordosMesMetricas.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const valorNaoPago       = naoPagos.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const valorAgendadoHoje  = acordosHoje.reduce((s, a) => s + (Number(a.valor) || 0), 0);

    // ── "Agendado restante no mês" — pendentes (exclui pago e não pago) ────
    const valorAgendadoRestanteMes = pendentes.reduce((s, a) => s + (Number(a.valor) || 0), 0);
    const totalAgendadoRestanteMes = pendentes.length;

    // H.O. — Honorários Operacionais (24,96% do bruto)
    const valorHOMes      = valorRecebidoMes * PP_HO_PERCENTUAL;
    const valorHOAgendado = valorAgendadoMes * PP_HO_PERCENTUAL;
    const valorHONaoPago  = valorNaoPago * PP_HO_PERCENTUAL;

    /**
     * A meta é comparada com o BRUTO recebido — nos dois tenants.
     *
     * A versão anterior usava o H.O. na PaguePlay ("meta é baseada em H.O."),
     * mas `metas.meta_valor` guarda o campo **Meta R$** da aba Metas, que é o
     * total. O campo "Meta H.O. (24,96%)" ao lado é só um conversor de tela:
     * `MetasConfig` o recalcula a partir do total ao carregar e NUNCA o
     * persiste. Dividir o H.O. por uma meta em bruto devolvia ~1/4 do
     * percentual real — a PaguePlay via 20% onde tinha 80%.
     *
     * As outras telas já comparavam bruto com bruto: `percMetaAnalitico` no
     * AnalyticsPanel, `MetaProgressoHeader`, `DesempenhoEquipes` e as metas por
     * equipe/operador logo abaixo. Esta linha era a única fora do compasso.
     */
    const percMeta       = calcPerc(valorRecebidoMes, meta?.meta_valor ?? 0);
    const percMetaAcordos = calcPerc(pagos.length, meta?.meta_acordos ?? 0);

    // Por status
    const porStatus = [
      { name: 'Pago',     value: pagos.length,     color: '#22c55e', icon: 'check' },
      { name: 'Pendente', value: pendentes.length,  color: '#f59e0b', icon: 'clock' },
      { name: 'Não Pago', value: naoPagos.length,   color: '#ef4444', icon: 'x'    },
    ].filter(s => s.value > 0);

    // Por dia do mês
    const porDia = Array.from({ length: diasNoMes(mesAnalise) }, (_, i) => {
      const d = String(i + 1).padStart(2, '0');
      const iso = `${ano}-${String(mes).padStart(2, '0')}-${d}`;
      const doDia = acordosMesMetricas.filter(a => a.vencimento === iso);
      const recDia = doDia.filter(a => a.status === 'pago').reduce((s, a) => s + (Number(a.valor) || 0), 0);
      return {
        dia: String(i + 1),
        recebido: recDia,
        agendado: doDia.reduce((s, a) => s + (Number(a.valor) || 0), 0),
        ho:       recDia * PP_HO_PERCENTUAL,
      };
    });

    // Por equipe
    // BUG FIX: a equipe é derivada do OPERADOR (perfis.equipe_id), pois a
    // tabela `acordos` não possui esse campo. O código anterior usava
    // `(a as any).equipe_id` e caía sempre no fallback 'sem_equipe' — todo
    // operador aparecia sem equipe (ex: Jose_Victor com equipe Luciana
    // saía listado como "Sem equipe").
    const porEquipe = Object.entries(
      acordosMesMetricas.reduce<Record<string, { acordos: number; valor: number }>>(
        (acc, a) => {
          const oid = a.operador_id ?? null;
          const eid = (oid && operadorEquipeMap[oid]) || 'sem_equipe';
          if (!acc[eid]) acc[eid] = { acordos: 0, valor: 0 };
          if (a.status === 'pago') { acc[eid].acordos++; acc[eid].valor += Number(a.valor) || 0; }
          return acc;
        }, {}
      )
    ).map(([eid, d]) => {
      const metaEq = metasEquipe.find(m => m.referencia_id === eid);
      return {
        nome: equipesMap[eid] ?? 'Sem equipe',
        acordos: d.acordos,
        valor: d.valor,
        meta: metaEq?.meta_valor ?? 0,
        perc: calcPerc(d.valor, metaEq?.meta_valor ?? 0),
      };
    }).sort((a, b) => b.valor - a.valor);

    // Por operador
    const porOperador = Object.entries(
      acordosMesMetricas.reduce<Record<string, { acordos: number; valor: number }>>(
        (acc, a) => {
          const oid = (a as any).operador_id ?? 'desconhecido';
          if (!acc[oid]) acc[oid] = { acordos: 0, valor: 0 };
          if (a.status === 'pago') { acc[oid].acordos++; acc[oid].valor += Number(a.valor) || 0; }
          return acc;
        }, {}
      )
    ).map(([oid, d]) => {
      const metaOp = metasOperador.find(m => m.referencia_id === oid);
      return {
        id: oid,
        nome: operadoresMap[oid] ?? 'Operador',
        acordos: d.acordos,
        valor: d.valor,
        meta: metaOp?.meta_valor ?? 0,
        perc: calcPerc(d.valor, metaOp?.meta_valor ?? 0),
      };
    }).sort((a, b) => b.valor - a.valor);

    return {
      valorRecebidoMes,
      valorAgendadoMes,
      valorNaoPago,
      valorAgendadoHoje,
      valorAgendadoRestanteMes,
      totalAgendadoRestanteMes,
      valorHOMes,
      valorHOAgendado,
      valorHONaoPago,
      totalAcordosMes: acordosMesMetricas.length,
      totalAcordosHoje: acordosHoje.length,
      totalPagosMes: pagos.length,
      totalNaoPagos: naoPagos.length,
      totalPendentes: pendentes.length,
      percMeta,
      percMetaAcordos,
      porStatus,
      porDia,
      porEquipe,
      porOperador,
      acordosMes, // NOVO: exportado para cálculo de tipo no painel
    };
  }, [acordos, meta, metasEquipe, metasOperador, operadoresMap, operadorEquipeMap, equipesMap, inicio, fim, hoje, mesAnalise, mes, ano, isPP, perfil?.perfil, operadorFiltro, visaoAmpla]);

  return {
    ...derived,
    meta,
    loading,
    refetch: fetchAll,
    setores,
    setorFiltro,
    setSetorFiltro,
    equipeFiltro,
    setEquipeFiltro,
    equipesDoSetor,
    operadorFiltro,
    setOperadorFiltro,
  };
}
