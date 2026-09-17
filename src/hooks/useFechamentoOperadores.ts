/**
 * useFechamentoOperadores — junta o que a aba Fechamento precisa, de onde já mora.
 *
 * ## As fontes, uma por pergunta
 *
 *   quem são os operadores .. `perfis`, com o mesmo corte da aba Quartis
 *                             (`PERFIS_QUE_CONTAM_NO_RECEBIMENTO`, ativo ou
 *                             desligado, arquivado só depois da saída)
 *   de que setor, no mês .... `buscarEquipesComOperadores` — o retrato do mês
 *                             fechado, ao vivo no corrente — + `setoresDoOperador`
 *   fechamento .............. `buscarResumoOperadoresAnalitico`: o MESMO número
 *                             do Analítico, ajuste manual incluído
 *   meta e degraus .......... `metas` (`meta_valor` + `metas_extras`)
 *   quartis, feriados ....... `metas_config_mes`
 *   treinamento ............. `equipes.treinamento_inicio` (dias úteis reduzidos)
 *   D.U. e situação ......... `fechamento_operadores` — a única fonte nova
 *
 * `perfis.situacao` aparece só no FILTRO de quem existe (ativo ou desligado),
 * copiado da aba Quartis. Ela não vira a situação do fechamento, e nada aqui a
 * escreve.
 *
 * ## Sempre o número de agora
 *
 * Reimportar o Analítico ou lançar um ajuste manual dispara uma releitura
 * silenciosa (tempo real, agrupado). Os cálculos da tabela são derivados — não
 * há valor calculado guardado para envelhecer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { QuartilConfig } from '@/lib/supabase';
import { getTodayISO, PERFIS_QUE_CONTAM_NO_RECEBIMENTO } from '@/lib/index';
import { partesDoMes } from '@/lib/mesReferencia';
import { diasUteisDoMes, diasUteisDecorridos, QUARTIS_PADRAO } from '@/lib/diasUteis';
import { assinarTabela } from '@/lib/realtime';
import { assinarSinal } from '@/lib/sinais';
import { invalidarSomasDeAjuste } from '@/services/analitico/ajusteManual.service';
import { criarAgrupador } from '@/lib/agrupador';
import { comecouAtualizacao } from '@/lib/estadoAtualizacao';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { lerMetasExtras } from '@/services/comissao/entradaDoOperador';
import {
  buscarEquipesComOperadores, buscarResumoOperadoresAnalitico,
  mapaSetorDaEquipe, setoresDoOperador, type ComposicaoEquipes,
} from '@/services/analitico/analitico.service';
import {
  buscarManuaisDoMes, salvarManualFechamento, type ManualFechamento,
} from '@/services/fechamentoOperadores/fechamentoOperadores.service';
import {
  montarLinhaFechamento, ordenarLinhasFechamento, resumirFechamento,
  type LinhaFechamento, type ResumoFechamento,
} from '@/services/fechamentoOperadores/calculoFechamento';

interface PerfilFechamento {
  id: string;
  nome: string;
  setor_id: string | null;
  equipe_id: string | null;
  arquivado?: boolean | null;
  desligado_em?: string | null;
}

interface MetaDoOperador {
  valor: number;
  extras: number[];
}

interface BaseFechamento {
  perfis: PerfilFechamento[];
  recebido: Map<string, number>;
  metas: Map<string, MetaDoOperador>;
  quartis: QuartilConfig[];
  feriados: string[];
  contarHoje: boolean;
  /** equipe_id → início do treinamento (só equipes em treinamento). */
  treino: Map<string, string | null>;
  composicao: ComposicaoEquipes;
  /** Existe `metas_config_mes` para o mês? Sem ela, quartis e feriados são os padrões. */
  temConfig: boolean;
  erroResumo: string | null;
}

interface Params {
  empresaId: string | null;
  /** 'yyyy-MM' */
  mes: string;
  /** Setor em foco. `null` = todos os setores. */
  setorId: string | null;
  /** `false` congela: não busca nem assina. */
  ativo: boolean;
}

export interface FechamentoOperadores {
  linhas: LinhaFechamento[];
  resumo: ResumoFechamento;
  quartis: QuartilConfig[];
  carregando: boolean;
  atualizando: boolean;
  erro: string | null;
  temConfig: boolean;
  /** A tabela das colunas manuais existe? `false` = migration pendente. */
  manuaisDisponivel: boolean;
  /** Operador com gravação em andamento. */
  salvandoId: string | null;
  salvar: (operadorId: string, manual: ManualFechamento) => Promise<{ ok: boolean; erro: string | null }>;
  recarregar: () => Promise<void>;
}

const MANUAL_VAZIO: ManualFechamento = { duTrabalhado: null, situacao: null };

export function useFechamentoOperadores({
  empresaId, mes, setorId, ativo,
}: Params): FechamentoOperadores {
  const { ano, mes: mesNum } = partesDoMes(mes);

  const [base, setBase] = useState<BaseFechamento | null>(null);
  const [manuais, setManuais] = useState<Map<string, ManualFechamento>>(new Map());
  const [manuaisDisponivel, setManuaisDisponivel] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  /** Só a releitura mais recente escreve — duas sobrepostas chegam fora de ordem. */
  const serie = useRef(0);
  /** Mês e empresa da base na tela: trocar de mês volta ao esqueleto. */
  const chaveNaTela = useRef<string | null>(null);

  const carregar = useCallback(async () => {
    if (!ativo || !empresaId) return;
    const meu = ++serie.current;
    const chave = `${empresaId}:${mes}`;
    const primeira = chaveNaTela.current !== chave;

    if (primeira) setCarregando(true);
    else setAtualizando(true);
    const encerrar = primeira ? null : comecouAtualizacao();

    try {
      const [perfisResp, resumoResp, metasResp, cfg, equipesResp, composicao, manuaisResp] =
        await Promise.all([
          /*
           * O mesmo corte da aba Quartis: quem produz recebimento, ativo OU
           * desligado (desligar zera `ativo`), e o arquivado só some dos meses
           * posteriores à saída — logo abaixo.
           */
          supabase.from('perfis')
            .select('id, nome, setor_id, equipe_id, arquivado, desligado_em')
            .eq('empresa_id', empresaId)
            .in('perfil', [...PERFIS_QUE_CONTAM_NO_RECEBIMENTO])
            .or('ativo.eq.true,situacao.eq.desligado')
            .order('nome'),
          buscarResumoOperadoresAnalitico(empresaId, mes),
          // `select('*')` como na aba Quartis: `metas_extras` e as colunas da
          // meta indireta dependem de migration, e nomear coluna ausente
          // derruba a consulta inteira no PostgREST.
          supabase.from('metas').select('*')
            .eq('empresa_id', empresaId).eq('tipo', 'operador')
            .eq('mes', mesNum).eq('ano', ano),
          getMetasConfig(empresaId, mesNum, ano),
          supabase.from('equipes').select('id, treinamento, treinamento_inicio')
            .eq('empresa_id', empresaId),
          buscarEquipesComOperadores(empresaId, mes),
          buscarManuaisDoMes(empresaId, ano, mesNum),
        ]);

      if (meu !== serie.current) { encerrar?.(false); return; }

      if (perfisResp.error) throw new Error(perfisResp.error.message);

      const perfis = ((perfisResp.data as unknown as PerfilFechamento[]) ?? [])
        .filter(p => p.arquivado !== true
          || (!!p.desligado_em && mes <= p.desligado_em.slice(0, 7)));

      const recebido = new Map<string, number>();
      for (const r of resumoResp.data) {
        recebido.set(r.operador_id, Number(r.total_recebido) || 0);
      }

      const metas = new Map<string, MetaDoOperador>();
      for (const m of (metasResp.data as { referencia_id: string; meta_valor: number; metas_extras?: unknown }[]) ?? []) {
        const valor = Number(m.meta_valor) || 0;
        if (valor > 0) metas.set(m.referencia_id, { valor, extras: lerMetasExtras(m.metas_extras) });
      }

      const treino = new Map<string, string | null>();
      for (const e of (equipesResp.data as { id: string; treinamento: boolean | null; treinamento_inicio: string | null }[]) ?? []) {
        if (e.treinamento) treino.set(e.id, e.treinamento_inicio ?? null);
      }

      setBase({
        perfis,
        recebido,
        metas,
        quartis: cfg.data?.quartis?.length ? cfg.data.quartis : QUARTIS_PADRAO,
        feriados: cfg.data?.feriados ?? [],
        contarHoje: cfg.data?.contar_dia_atual === true,
        treino,
        composicao,
        temConfig: !!cfg.data,
        erroResumo: resumoResp.error,
      });
      setManuais(manuaisResp.porOperador);
      setManuaisDisponivel(manuaisResp.disponivel);
      setErro(resumoResp.error
        ?? (manuaisResp.disponivel ? manuaisResp.erro : null));
      chaveNaTela.current = chave;
      encerrar?.(true);
    } catch (e) {
      if (meu !== serie.current) { encerrar?.(false); return; }
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o fechamento.');
      encerrar?.(false);
    } finally {
      if (meu === serie.current) {
        setCarregando(false);
        setAtualizando(false);
      }
    }
  }, [ativo, empresaId, mes, mesNum, ano]);

  useEffect(() => { void carregar(); }, [carregar]);

  /*
   * Reimportação do Analítico e ajuste manual: relê em silêncio. Uma importação
   * manda milhares de eventos — o agrupador faz disso poucas releituras.
   */
  useEffect(() => {
    if (!ativo || !empresaId) return;
    const agrupador = criarAgrupador(() => { void carregar(); }, { esperaMs: 1_500, tetoMs: 6_000 });
    const reler = () => { void carregar(); };
    // O analítico vem por sinal do banco (um aviso por comando). O ajuste manual
    // segue linha a linha, no mesmo tópico da tela de ajustes — um canal só.
    const cancelarAnalitico = assinarSinal('analitico', empresaId, {
      onMudou: agrupador.avisar, onReconectado: reler,
    });
    const cancelarAjustes = assinarTabela(
      { topico: `rt-ajustes-${empresaId}`, escutas: [{ tabela: 'analitico_ajustes_manuais' }] },
      {
        // As somas de ajuste ficam guardadas por segundos (`somasPorOperador`):
        // o card mudou em outra tela, então a releitura não pode usar a guardada.
        onEvento: () => { invalidarSomasDeAjuste(); agrupador.avisar(); },
        onReconectado: () => { invalidarSomasDeAjuste(); reler(); },
      },
    );
    return () => { agrupador.cancelar(); cancelarAnalitico(); cancelarAjustes(); };
  }, [ativo, empresaId, carregar]);

  const quartis = base?.quartis ?? QUARTIS_PADRAO;

  const linhas = useMemo<LinhaFechamento[]>(() => {
    if (!base) return [];
    const { composicao } = base;
    const setorDaEquipe = mapaSetorDaEquipe(composicao.equipes);
    const nomeDaEquipe = new Map(composicao.equipes.map(e => [e.id, e.nome]));

    const totalUteis = diasUteisDoMes(ano, mesNum, base.feriados);
    const decorridos = Math.max(
      diasUteisDecorridos(ano, mesNum, base.feriados, getTodayISO(), undefined, base.contarHoje), 1,
    );

    const montadas = base.perfis
      .filter(p => {
        if (!setorId) return true;
        const setores = setoresDoOperador(
          p.id, composicao.operadorEquipeMap, composicao.equipesExtrasPorOperador, setorDaEquipe,
        );
        // Sem equipe no mês, o setor do cadastro — a mesma reserva do
        // relatório de fechamento (`info?.setor_id ?? p?.setor_id`).
        if (setores.size === 0 && p.setor_id) setores.add(p.setor_id);
        return setores.has(setorId);
      })
      .map(p => {
        // Treinamento: mesma redução de dias úteis da aba Quartis.
        const inicio = p.equipe_id ? base.treino.get(p.equipe_id) : null;
        const dias = inicio
          ? {
              totalUteis: diasUteisDoMes(ano, mesNum, base.feriados, inicio),
              decorridos: Math.max(
                diasUteisDecorridos(ano, mesNum, base.feriados, getTodayISO(), inicio, base.contarHoje), 1,
              ),
            }
          : { totalUteis, decorridos };

        const meta = base.metas.get(p.id);
        const manual = manuais.get(p.id) ?? MANUAL_VAZIO;
        const equipeNome = composicao.operadorEquipeMap[p.id]?.equipe_nome
          ?? (p.equipe_id ? nomeDaEquipe.get(p.equipe_id) ?? null : null);

        return montarLinhaFechamento({
          operadorId: p.id,
          nome: p.nome,
          equipeNome,
          fechamento: base.recebido.get(p.id) ?? 0,
          meta: meta?.valor ?? null,
          metasExtras: meta?.extras ?? [],
          duTrabalhado: manual.duTrabalhado,
          situacao: manual.situacao,
          totalUteis: dias.totalUteis,
          decorridos: dias.decorridos,
        }, base.quartis);
      });
    // Por quartil, como a aba Quartis do Painel Líder (14/09/2026).
    return ordenarLinhasFechamento(montadas);
  }, [base, manuais, setorId, ano, mesNum]);

  const resumo = useMemo(() => resumirFechamento(linhas, quartis), [linhas, quartis]);

  const salvar = useCallback(async (operadorId: string, manual: ManualFechamento) => {
    if (!empresaId) return { ok: false, erro: 'Empresa não carregada.' };
    const anterior = manuais.get(operadorId) ?? MANUAL_VAZIO;

    // Otimista: a tabela e os cards mudam na hora. Recusou, volta.
    setManuais(m => new Map(m).set(operadorId, manual));
    setSalvandoId(operadorId);
    try {
      const r = await salvarManualFechamento({ empresaId, operadorId, ano, mes: mesNum, manual });
      if (!r.ok) setManuais(m => new Map(m).set(operadorId, anterior));
      return r;
    } finally {
      setSalvandoId(atual => (atual === operadorId ? null : atual));
    }
  }, [empresaId, manuais, ano, mesNum]);

  return {
    linhas,
    resumo,
    quartis,
    carregando,
    atualizando,
    erro,
    temConfig: base?.temConfig ?? true,
    manuaisDisponivel,
    salvandoId,
    salvar,
    recarregar: carregar,
  };
}
