/**
 * useAcumuladoDoSetorNoMes — o acumulado do card de setor, buscado para a aba Comissão.
 *
 * A liderança confirma «o setor bateu a meta» na tela de Metas. O número que ela
 * olha precisa ser o do card de Desempenho Equipes, então a busca é a MESMA do
 * Painel Líder (exclusões → total do relatório, órfãos, resumo por operador,
 * composição das equipes, setores alternativos, Contribuição Receptivo) e a conta
 * é a mesma função (`acumuladoDoSetor`).
 *
 * O resumo por operador volta junto: a lista de comissão dos operadores lê o
 * recebido de cada um da mesma resposta.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buscarEquipesComOperadores, buscarResumoOperadoresAnalitico,
  buscarTotalOrfaosPorSetor, buscarTotalPorSetor, mapaSetorDaEquipe,
  type ResumoOperadorAnalitico,
} from '@/services/analitico/analitico.service';
import { buscarExclusoesSetor } from '@/services/analitico/exclusoesSetor.service';
import { buscarContribuicoesReceptivo } from '@/services/analitico/contribuicaoReceptivo.service';
import {
  acumuladoDoSetor, somarAnaliticoPorSetor, type SomaDoSetor,
} from '@/services/analitico/acumuladoDoSetor';

const NENHUM: ResumoOperadorAnalitico[] = [];

export interface AcumuladoDoSetorNoMes {
  /** `null` enquanto carrega ou quando a busca falhou. */
  acumulado: SomaDoSetor | null;
  resumos: ResumoOperadorAnalitico[];
  carregado: boolean;
}

export function useAcumuladoDoSetorNoMes(params: {
  empresaId: string;
  /** `yyyy-MM`. */
  mes: string;
  setorId: string;
  isPaguePlay: boolean;
  ativo: boolean;
}): AcumuladoDoSetorNoMes {
  const { empresaId, mes, setorId, isPaguePlay, ativo } = params;
  const chave = `${empresaId}|${mes}|${setorId}|${isPaguePlay}`;

  const [lido, setLido] = useState<{
    chave: string; acumulado: SomaDoSetor | null; resumos: ResumoOperadorAnalitico[];
  }>({ chave: '', acumulado: null, resumos: NENHUM });

  useEffect(() => {
    if (!ativo || !empresaId || !setorId) return;
    let vivo = true;

    void (async () => {
      try {
        // As exclusões entram no total do relatório — mesma ordem do Painel Líder.
        const { porSetor: exclusoes } = await buscarExclusoesSetor(empresaId, mes);
        const [resumos, orfaos, totalPorSetor, composicao, setores, receptivo] = await Promise.all([
          buscarResumoOperadoresAnalitico(empresaId, mes),
          buscarTotalOrfaosPorSetor(empresaId, mes),
          buscarTotalPorSetor(empresaId, mes, exclusoes),
          buscarEquipesComOperadores(empresaId, mes),
          supabase.from('setores').select('id, alternativo').eq('empresa_id', empresaId),
          // O Receptivo é da BookPlay; na PaguePlay o card de setor não o soma.
          isPaguePlay
            ? Promise.resolve({ porSetor: {} as Record<string, { acumulado: number }> })
            : buscarContribuicoesReceptivo(empresaId, mes),
        ]);
        if (!vivo) return;

        const somaPorSetor = somarAnaliticoPorSetor({
          resumos: resumos.data,
          operadorEquipeMap: composicao.operadorEquipeMap,
          equipesExtrasPorOperador: composicao.equipesExtrasPorOperador,
          setorDaEquipe: mapaSetorDaEquipe(composicao.equipes),
          orfaosPorSetor: orfaos,
        });
        const linhasSetores = (setores.error ? [] : setores.data ?? []) as
          { id: string; alternativo: boolean | null }[];
        const alternativo = linhasSetores.some(s => s.id === setorId && s.alternativo === true);

        setLido({
          chave,
          resumos: resumos.data,
          acumulado: acumuladoDoSetor({
            setorId, isPaguePlay, alternativo, somaPorSetor, totalPorSetor,
            receptivoPorSetor: receptivo.porSetor,
          }),
        });
      } catch (err) {
        console.warn('[comissao] acumulado do setor indisponível:', err);
        if (vivo) setLido({ chave, acumulado: null, resumos: NENHUM });
      }
    })();

    return () => { vivo = false; };
  }, [ativo, empresaId, mes, setorId, isPaguePlay, chave]);

  const carregado = lido.chave === chave;
  return useMemo(() => ({
    acumulado: carregado ? lido.acumulado : null,
    resumos: carregado ? lido.resumos : NENHUM,
    carregado,
  }), [carregado, lido]);
}
