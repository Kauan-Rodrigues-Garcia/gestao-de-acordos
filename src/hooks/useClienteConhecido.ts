import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface ClienteConhecido {
  nome: string | null;
  /** Só vem quando a chave é o NR — sem NR, a instituição é a própria chave. */
  instituicao: string | null;
}

/**
 * Nome e instituição que o sistema já conhece de um NR (ou do Código, na regra
 * Cofen): o acordo anterior com a mesma chave, senão o relatório 58/59.
 * RPC `fn_cliente_pelo_codigo` (migration 20261117170000).
 *
 * Mesmo jeito do `useProfissional`: espera 400 ms depois da última tecla e só
 * busca com 4 caracteres ou mais. Sem a migration, ou com erro, devolve null e
 * o formulário segue como sempre.
 */
export function useClienteConhecido(
  chave: string,
  empresaId: string | undefined,
  campo: 'nr_cliente' | 'instituicao',
) {
  const [cliente, setCliente] = useState<ClienteConhecido | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const valor = chave.trim();
    if (valor.length < 4 || !empresaId) {
      setCliente(null);
      setLoading(false);
      return;
    }

    let cancelado = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('fn_cliente_pelo_codigo' as never, {
          p_empresa_id:  empresaId,
          p_nr_cliente:  campo === 'nr_cliente' ? valor : '',
          p_instituicao: campo === 'instituicao' ? valor : '',
        } as never);
        if (cancelado) return;
        const lista = (!error && Array.isArray(data) ? data : []) as Array<{
          cliente_nome: string | null; cliente_instituicao: string | null;
        }>;
        const linha = lista[0];
        if (error) console.warn('[useClienteConhecido]', error.message);
        setCliente(linha && (linha.cliente_nome || linha.cliente_instituicao)
          ? { nome: linha.cliente_nome, instituicao: linha.cliente_instituicao }
          : null);
      } catch (e) {
        if (!cancelado) {
          console.warn('[useClienteConhecido]', e);
          setCliente(null);
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    }, 400);

    return () => { cancelado = true; clearTimeout(timer); };
  }, [chave, empresaId, campo]);

  return { cliente, loading };
}
