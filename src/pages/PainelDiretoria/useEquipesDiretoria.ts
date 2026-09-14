/**
 * useEquipesDiretoria — os dados do Painel Líder, carregados para a Diretoria.
 *
 * Uma carga por empresa e mês, e não por setor: composição das equipes, resumo
 * do analítico por operador, metas, quartis, feriados, liderança e quem conta no
 * recebimento. Com isso na mão, abrir o Receptivo e depois o Play 1 não vai ao
 * banco de novo — `equipesDoSetor` só recorta.
 *
 * As fontes são as MESMAS de `DesempenhoEquipes` (Painel Líder), de propósito:
 * a Diretoria olhando a equipe do Matheus e o Matheus olhando a própria equipe
 * precisam ver o mesmo acumulado, a mesma faixa e as mesmas pessoas em cada
 * quartil. Ver `equipesDiretoria.ts` para as contas.
 *
 * O recebimento por dia é pesado (a varredura do mês inteiro) e só serve ao
 * detalhe de UMA equipe: vem sob demanda, em `serieDaEquipe`, e fica guardado
 * para o próximo clique.
 *
 * O que a pessoa enxerga continua sendo decidido pela RLS: sem alcance do
 * analítico, os resumos chegam vazios e as equipes aparecem zeradas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type QuartilConfig } from '@/lib/supabase';
import { getTodayISO, PERFIS_QUE_CONTAM_NO_RECEBIMENTO } from '@/lib/index';
import { diasUteisDoMes, diasUteisDecorridos, QUARTIS_PADRAO } from '@/lib/diasUteis';
import { ehMesAtual } from '@/lib/mesReferencia';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  buscarEquipesComOperadores, buscarLideresDoRetrato, buscarRecebidoPorDia,
  buscarResumoOperadoresAnalitico, operadoresDaEquipe,
  type ComposicaoEquipes, type LinhaRecebidaDia, type ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import {
  lideresDaEquipe, type LiderInfo, type PerfilLider,
} from '@/pages/Dashboard/Analitico/lideresDaEquipe';
import {
  montarEquipesDoSetor, serieDiariaDaEquipe,
  type EquipeDiretoria, type MetaDoMes,
} from '@/services/mestre/equipesDiretoria';

interface Base {
  composicao: ComposicaoEquipes;
  resumos: ResumoOperadorAnalitico[];
  metas: MetaDoMes[];
  quartis: QuartilConfig[];
  feriados: string[];
  contarHoje: boolean;
  identidade: Record<string, { nome: string; fotoUrl: string | null }>;
  treino: Record<string, string | null>;
  lideres: Record<string, LiderInfo[]>;
}

export interface UseEquipesDiretoria {
  carregando: boolean;
  erro: string | null;
  /** As equipes do sistema do setor, com os números do Painel Líder. */
  equipesDoSetor: (setorId: string) => EquipeDiretoria[];
  lideresDe: (equipeId: string) => LiderInfo[];
  /** Recebimento por dia da equipe no mês. Busca uma vez e guarda. */
  serieDaEquipe: (equipeId: string) => Promise<{ dia: number; valor: number }[]>;
}

export function useEquipesDiretoria(
  empresaId: string, mes: string, ativo = true,
  /** Muda no «Atualizar» do cabeçalho do painel: força a recarga. */
  versao = 0,
): UseEquipesDiretoria {
  const [base, setBase] = useState<Base | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const linhasDoMes = useRef<{ chave: string; linhas: Promise<LinhaRecebidaDia[]> } | null>(null);

  const [ano, mesNum] = mes.split('-').map(Number);

  useEffect(() => {
    if (!ativo || !empresaId) return;
    let vivo = true;
    setCarregando(true);
    setErro(null);
    void (async () => {
      try {
        const [
          composicao, resumos, metasRes, config, identidadeRes, treinoRes,
          lideresRes, explicitosRes, clonesRes,
        ] = await Promise.all([
          buscarEquipesComOperadores(empresaId, mes),
          buscarResumoOperadoresAnalitico(empresaId, mes),
          supabase.from('metas').select('tipo, referencia_id, meta_valor')
            .eq('empresa_id', empresaId).eq('mes', mesNum).eq('ano', ano)
            .in('tipo', ['equipe', 'operador']),
          getMetasConfig(empresaId, mesNum, ano),
          // Quem conta no recebimento: a MESMA régua de `DesempenhoEquipes`.
          supabase.from('perfis').select('id, nome, foto_url')
            .eq('empresa_id', empresaId)
            .in('perfil', [...PERFIS_QUE_CONTAM_NO_RECEBIMENTO])
            .eq('ativo', true)
            .eq('situacao', 'ativo'),
          supabase.from('equipes').select('id, treinamento, treinamento_inicio').eq('empresa_id', empresaId),
          supabase.from('perfis').select('id, nome, foto_url, equipe_id')
            .eq('empresa_id', empresaId).eq('perfil', 'lider'),
          supabase.from('equipe_lideres').select('equipe_id, lider_id').eq('empresa_id', empresaId),
          supabase.from('equipe_operadores_clones').select('equipe_id, operador_id').eq('empresa_id', empresaId),
        ]);
        if (!vivo) return;

        const identidade: Base['identidade'] = {};
        for (const p of (identidadeRes.data as { id: string; nome: string; foto_url: string | null }[] | null) ?? []) {
          identidade[p.id] = { nome: p.nome, fotoUrl: p.foto_url };
        }
        const treino: Base['treino'] = {};
        for (const e of (treinoRes.data as { id: string; treinamento: boolean | null; treinamento_inicio: string | null }[] | null) ?? []) {
          if (e.treinamento) treino[e.id] = e.treinamento_inicio ?? null;
        }
        // Mês fechado lê a liderança do retrato, como o Painel Líder.
        const doRetrato = !ehMesAtual(mes) ? await buscarLideresDoRetrato(empresaId, mes) : null;
        if (!vivo) return;

        setBase({
          composicao,
          resumos: resumos.data,
          metas: (metasRes.data as MetaDoMes[] | null) ?? [],
          quartis: config.data?.quartis?.length ? config.data.quartis : QUARTIS_PADRAO,
          feriados: config.data?.feriados ?? [],
          contarHoje: config.data?.contar_dia_atual === true,
          identidade,
          treino,
          lideres: doRetrato ?? lideresDaEquipe({
            lideres:    (lideresRes.data as PerfilLider[] | null) ?? [],
            explicitos: (explicitosRes.data as { equipe_id: string; lider_id: string }[] | null) ?? [],
            clones:     (clonesRes.data as { equipe_id: string; operador_id: string }[] | null) ?? [],
          }),
        });
        if (resumos.error) setErro(resumos.error);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar as equipes.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [empresaId, mes, ano, mesNum, ativo, versao]);

  const diasDaEquipe = useCallback((equipeId: string) => {
    const feriados = base?.feriados ?? [];
    const inicio = base?.treino[equipeId] ?? undefined;
    return {
      totalUteis: diasUteisDoMes(ano, mesNum, feriados, inicio),
      decorridos: diasUteisDecorridos(ano, mesNum, feriados, getTodayISO(), inicio, base?.contarHoje ?? false),
      treino: base ? equipeId in base.treino : false,
    };
  }, [base, ano, mesNum]);

  // Por setor, e só enquanto a base for a mesma: carga nova (outro mês, o
  // «Atualizar») joga o recorte fora junto. A MESMA lista volta ao mesmo setor,
  // então quem a usa em `useMemo` não recalcula à toa.
  const cache = useRef<{ base: Base | null; porSetor: Map<string, EquipeDiretoria[]> }>({
    base: null, porSetor: new Map(),
  });

  const equipesDoSetor = useCallback((setorId: string): EquipeDiretoria[] => {
    if (!base) return [];
    if (cache.current.base !== base) cache.current = { base, porSetor: new Map() };
    const guardado = cache.current.porSetor.get(setorId);
    if (guardado) return guardado;
    const r = montarEquipesDoSetor({
      setorId,
      equipes: base.composicao.equipes,
      operadorEquipeMap: base.composicao.operadorEquipeMap,
      equipesExtrasPorOperador: base.composicao.equipesExtrasPorOperador,
      resumos: base.resumos,
      metas: base.metas,
      identidade: base.identidade,
      quartis: base.quartis,
      diasDaEquipe,
    });
    cache.current.porSetor.set(setorId, r);
    return r;
  }, [base, diasDaEquipe]);

  const lideresDe = useCallback((equipeId: string) => base?.lideres[equipeId] ?? [], [base]);

  const serieDaEquipe = useCallback(async (equipeId: string) => {
    if (!base) return [];
    const chave = `${empresaId}|${mes}|${versao}`;
    if (linhasDoMes.current?.chave !== chave) {
      linhasDoMes.current = {
        chave,
        linhas: buscarRecebidoPorDia(empresaId, mes).then(r => r.data),
      };
    }
    const linhas = await linhasDoMes.current.linhas;
    const ids = operadoresDaEquipe(equipeId, {
      operadorEquipeMap: base.composicao.operadorEquipeMap,
      equipesExtrasPorOperador: base.composicao.equipesExtrasPorOperador,
    });
    return serieDiariaDaEquipe(linhas, ids, mes);
  }, [base, empresaId, mes, versao]);

  return { carregando, erro, equipesDoSetor, lideresDe, serieDaEquipe };
}
