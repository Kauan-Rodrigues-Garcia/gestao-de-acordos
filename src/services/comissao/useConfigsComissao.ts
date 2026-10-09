/**
 * useConfigsComissao — as configurações e os bônus de comissão do mês, vivos.
 *
 * O Dashboard do operador e a aba Comissão da tela de Metas leem daqui. O tempo
 * real é o que faz a confirmação da meta do setor chegar ao operador sem
 * recarregar — foi pedido explícito: «todo o cálculo deverá atualizar
 * automaticamente».
 *
 * Salvar uma configuração apaga e recria as faixas dela, o que dispara uma
 * rajada de eventos. O agrupador junta a rajada numa leitura só.
 *
 * `carregado` é do mês pedido: trocar de mês não mostra a configuração do mês
 * anterior enquanto a nova não chega.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { assinarSinal } from '@/lib/sinais';
import { criarAgrupador } from '@/lib/agrupador';
import { buscarConfigsDoMes } from './comissao.service';
import type { BonusComissao } from './bonus';
import type { ConfigComissao } from './comissao';

const NENHUMA: ConfigComissao[] = [];
const NENHUM_BONUS: BonusComissao[] = [];

export interface ConfigsDoMes {
  configs: ConfigComissao[];
  bonus: BonusComissao[];
  /** `false` = a migration da comissão ainda não existe neste banco. */
  dbAtiva: boolean;
  carregado: boolean;
  recarregar: () => void;
}

export function useConfigsComissao(params: {
  empresaId: string | null | undefined;
  ano: number;
  mes: number;
  /** Desligado = não busca nem assina. */
  ativo: boolean;
}): ConfigsDoMes {
  const { empresaId, ano, mes, ativo } = params;
  const chave = `${empresaId ?? ''}|${ano}|${mes}`;

  const [lido, setLido] = useState<{
    chave: string; configs: ConfigComissao[]; bonus: BonusComissao[]; dbAtiva: boolean;
  }>({ chave: '', configs: NENHUMA, bonus: NENHUM_BONUS, dbAtiva: true });
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao(v => v + 1), []);

  useEffect(() => {
    if (!ativo || !empresaId) return;
    let vivo = true;
    void buscarConfigsDoMes(empresaId, ano, mes).then(r => {
      if (vivo) setLido({ chave, configs: r.configs, bonus: r.bonus, dbAtiva: r.dbAtiva });
    });
    return () => { vivo = false; };
  }, [ativo, empresaId, ano, mes, chave, versao]);

  const dbAtiva = lido.dbAtiva;
  useEffect(() => {
    if (!ativo || !empresaId || !dbAtiva) return;
    const grupo = criarAgrupador(recarregar, { esperaMs: 300, tetoMs: 1_200 });
    // Sinal «mudou» da empresa para as cinco tabelas (20261009201000; eram
    // cinco assinaturas de Postgres Changes por aba). Faixas e usuários do
    // bônus não têm empresa: o banco acha pela configuração/bônus.
    const sair = assinarSinal('comissao', empresaId, {
      onMudou: () => grupo.avisar(),
      onReconectado: () => grupo.avisar(),
    });
    return () => { grupo.cancelar(); sair(); };
  }, [ativo, empresaId, dbAtiva, recarregar]);

  const carregado = lido.chave === chave;
  return useMemo(() => ({
    configs: carregado ? lido.configs : NENHUMA,
    bonus: carregado ? lido.bonus : NENHUM_BONUS,
    dbAtiva: lido.dbAtiva,
    carregado,
    recarregar,
  }), [carregado, lido, recarregar]);
}
