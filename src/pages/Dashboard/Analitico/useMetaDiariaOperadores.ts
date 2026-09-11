/**
 * useMetaDiariaOperadores — a régua da estrela EM DIA, lida da aba Metas.
 *
 * A lista «Por operador» do Analítico nunca soube de meta: ela responde
 * «quanto cada um recebeu». Para dizer quem está em dia com a média diária ela
 * precisa de três coisas que moram na aba Metas — as MESMAS três que a aba
 * Quartis lê:
 *
 *   • a meta DIRETA de cada operador no mês (`metas`, tipo operador);
 *   • o calendário do mês — feriados e «contar o dia atual»
 *     (`metas_config_mes`, por `getMetasConfig`);
 *   • as equipes em treinamento, que encolhem os dias úteis de quem está nelas.
 *
 * As contas ficam em `emDiaOperador.ts`, testado à parte. Aqui só se busca.
 *
 * ## Tolerante
 *
 * Uma leitura que falha deixa a parte dela vazia: sem meta ninguém ganha
 * estrela, sem treinamento vale o mês cheio. A lista continua funcionando como
 * sempre — a estrela é um acréscimo e não pode derrubar a tela.
 *
 * ## `carregado` é do mês pedido
 *
 * Trocar de mês não apaga o que havia antes de a leitura nova chegar, então
 * `carregado` só vale `true` quando os dados são DESTA empresa e deste mês. Sem
 * isso a estrela de agosto piscaria sobre a lista de setembro durante a busca.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getMetasConfig } from '@/services/metas/metasConfig.service';

export interface MetasDiariasDoMes {
  /** operador_id → meta direta bruta do mês. Só metas positivas. */
  metaPorOperador: Record<string, number>;
  /** equipe_id → início do treinamento. Só equipes em treinamento. */
  treinoPorEquipe: Record<string, string | null>;
  feriados: string[];
  contarHoje: boolean;
  /** Os dados acima são da empresa e do mês pedidos? */
  carregado: boolean;
}

interface Lido extends Omit<MetasDiariasDoMes, 'carregado'> {
  /** `empresaId|mes` de onde os dados vieram. */
  chave: string;
}

const NADA_LIDO: Lido = {
  chave: '', metaPorOperador: {}, treinoPorEquipe: {}, feriados: [], contarHoje: false,
};

export function useMetaDiariaOperadores(params: {
  /** Desligado = não busca. Só vale buscar quando a estrela pode aparecer. */
  ativo: boolean;
  empresaId: string;
  /** `yyyy-MM`. */
  mes: string;
}): MetasDiariasDoMes {
  const { ativo, empresaId, mes } = params;
  const chave = `${empresaId}|${mes}`;
  const [lido, setLido] = useState<Lido>(NADA_LIDO);

  useEffect(() => {
    // Já lido para esta chave: voltar à aba ou trocar Mês ↔ Dia dentro do mesmo
    // mês não refaz as três leituras.
    if (!ativo || !empresaId || lido.chave === chave) return;
    let vivo = true;
    const [ano, mesNum] = mes.split('-').map(Number);

    void (async () => {
      let lidoAgora: Lido = { ...NADA_LIDO, chave };
      try {
        const [metasR, cfg, equipesR] = await Promise.all([
          supabase.from('metas').select('referencia_id, meta_valor')
            .eq('empresa_id', empresaId).eq('tipo', 'operador')
            .eq('mes', mesNum).eq('ano', ano),
          getMetasConfig(empresaId, mesNum, ano),
          // Coluna de treinamento ausente devolve erro e o mapa fica vazio — o
          // que só faz a régua voltar ao mês cheio, como nos Quartis.
          supabase.from('equipes').select('id, treinamento, treinamento_inicio')
            .eq('empresa_id', empresaId),
        ]);

        const metaPorOperador: Record<string, number> = {};
        for (const m of (metasR.data as { referencia_id: string; meta_valor: number }[] | null) ?? []) {
          const v = Number(m.meta_valor) || 0;
          if (v > 0) metaPorOperador[m.referencia_id] = v;
        }

        const treinoPorEquipe: Record<string, string | null> = {};
        const equipes = equipesR.error ? null : equipesR.data;
        for (const e of (equipes as { id: string; treinamento: boolean | null; treinamento_inicio: string | null }[] | null) ?? []) {
          if (e.treinamento) treinoPorEquipe[e.id] = e.treinamento_inicio ?? null;
        }

        lidoAgora = {
          chave,
          metaPorOperador,
          treinoPorEquipe,
          feriados:   cfg.data?.feriados ?? [],
          contarHoje: cfg.data?.contar_dia_atual === true,
        };
      } catch { /* sem régua — ninguém ganha estrela, a lista segue igual */ }
      if (vivo) setLido(lidoAgora);
    })();

    return () => { vivo = false; };
  }, [ativo, empresaId, mes, chave, lido.chave]);

  const carregado = lido.chave === chave;
  return useMemo(() => ({
    metaPorOperador: lido.metaPorOperador,
    treinoPorEquipe: lido.treinoPorEquipe,
    feriados:        lido.feriados,
    contarHoje:      lido.contarHoje,
    carregado,
  }), [lido, carregado]);
}
