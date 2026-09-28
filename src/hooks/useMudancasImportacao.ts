/**
 * useMudancasImportacao — o histórico do mês para a aba Analítico.
 *
 * Chama `fn_analitico_mudancas_do_mes` (migration 20260929000000), que já
 * devolve o que a pessoa pode ver, e classifica a resposta com
 * `services/analitico/mudancasImportacao`.
 *
 * Relê no sinal do analítico — o mesmo que o Plantão Elite escuta. É por ele
 * que o card aparece sozinho quando o robô do 59 passa, sem a pessoa recarregar
 * a página: era esse o pedido («toda vez que o 59 for importado, seja feita uma
 * verificação... e seja notificado para a pessoa»).
 */
import { useCallback, useEffect, useState } from 'react';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { assinarSinal } from '@/lib/sinais';
import {
  classificarTodas, type Mudanca, type MudancaCrua,
} from '@/services/analitico/mudancasImportacao';

export interface EstadoMudancas {
  mudancas: Mudanca[];
  carregando: boolean;
  /** Nulo enquanto der certo. A aba não quebra por causa deste card. */
  erro: string | null;
  recarregar: () => void;
}

/** O banco devolve numeric como string; a tela precisa de número. */
function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizar(linhas: readonly Record<string, unknown>[]): MudancaCrua[] {
  return linhas.map(l => ({
    codigo:               String(l.codigo ?? ''),
    nome_cliente:         (l.nome_cliente as string | null) ?? null,
    data_pagamento:       String(l.data_pagamento ?? ''),
    lote_id:              (l.lote_id as string | null) ?? null,
    ocorrido_em:          String(l.ocorrido_em ?? ''),
    operador_antes_id:    (l.operador_antes_id as string | null) ?? null,
    operador_antes_nome:  (l.operador_antes_nome as string | null) ?? null,
    valor_antes:          numero(l.valor_antes),
    com_ele_desde:        (l.com_ele_desde as string | null) ?? null,
    operador_depois_id:   (l.operador_depois_id as string | null) ?? null,
    operador_depois_nome: (l.operador_depois_nome as string | null) ?? null,
    // `null` aqui é o NR que sumiu — não pode virar 0, que é «passou a valer
    // zero». `numero()` não serve.
    valor_depois:         l.valor_depois == null ? null : numero(l.valor_depois),
  }));
}

export function useMudancasImportacao(
  empresaId: string | null | undefined,
  mes: string | null | undefined,
): EstadoMudancas {
  const [mudancas, setMudancas] = useState<Mudanca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId || !mes) { setMudancas([]); return; }
    setCarregando(true);
    const { data, error } = await rpcSemTipo<Record<string, unknown>[]>(
      'fn_analitico_mudancas_do_mes',
      { p_empresa_id: empresaId, p_mes: mes },
    );
    if (error) {
      // O front pode subir antes da migration: o card some, a aba fica.
      setErro(/does not exist|schema cache/i.test(error.message)
        ? 'O histórico de mudanças ainda não está no banco (migration 20260929000000).'
        : error.message);
      setMudancas([]);
    } else {
      setErro(null);
      setMudancas(classificarTodas(normalizar(data ?? [])));
    }
    setCarregando(false);
  }, [empresaId, mes]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    if (!empresaId) return;
    const reler = () => { void carregar(); };
    return assinarSinal('analitico', empresaId, { onMudou: reler, onReconectado: reler });
  }, [empresaId, carregar]);

  return { mudancas, carregando, erro, recarregar: () => { void carregar(); } };
}
