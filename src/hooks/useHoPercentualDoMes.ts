/**
 * useHoPercentualDoMes — o percentual de H.O. que valia NO MÊS olhado.
 *
 * `useHoPercentual()` é o de hoje (`empresas.config.ho_percentual`). Num mês
 * fechado, o retrato guarda o do mês (`composicao_mes_config.empresa_config`,
 * 20261029200000): mudar o H.O. na aba Metas em novembro não reconverte os
 * acordos e a meta indireta de outubro (31/10/2026).
 *
 * Mês aberto ou não guardado: o de hoje, igual a `useHoPercentual()`. Sem
 * react-query de propósito — entra em telas e testes que não têm o provedor.
 */
import { useEffect, useState } from 'react';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useHoPercentual } from '@/lib/hoPercentual';
import { normalizarMes } from '@/lib/mesReferencia';
import { buscarHoPercentualDoMes, mesTemConfigGuardada } from '@/services/fechamento/configDoMes';

export function useHoPercentualDoMes(mesBruto: string | null | undefined): number {
  const hoje = useHoPercentual();
  const { empresa } = useEmpresa();
  const empresaId = empresa?.id ?? null;
  const mes = mesBruto ? normalizarMes(mesBruto) : null;
  const chave = empresaId && mesTemConfigGuardada(mes) ? `${empresaId}|${mes}` : null;
  const [doMes, setDoMes] = useState<{ chave: string; v: number | null } | null>(null);

  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    void buscarHoPercentualDoMes(empresaId, mes).then(v => { if (vivo) setDoMes({ chave, v }); });
    return () => { vivo = false; };
  }, [chave, empresaId, mes]);

  return chave && doMes?.chave === chave && doMes.v ? doMes.v : hoje;
}
