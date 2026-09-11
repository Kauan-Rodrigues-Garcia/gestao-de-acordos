/**
 * useLixeiraNumeros — o que está na Lixeira de Números desta empresa.
 *
 * Mesmo desenho de `useControleNumeros`: `loading` só na primeira carga, e a
 * releitura de realtime reconcilia a lista em vez de piscar a tela. Quem vê o
 * quê é da RLS (`numeros_lixeira_select`), que entrega a lixeira só a quem
 * administra o módulo — para os outros ela chega vazia.
 *
 * `empresaId = null` desliga o hook: a área do Núcleo o monta sempre (regra dos
 * hooks), e só passa a empresa quando a pessoa pode ver a aba.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { assinarTabela } from '@/lib/realtime';
import { reconciliarLista } from '@/lib/dadosVivos';
import { listarLixeira, type LixeiraNumeroRow } from '@/services/numeros/numeros.service';

export interface EstadoLixeiraNumeros {
  itens: LixeiraNumeroRow[];
  loading: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useLixeiraNumeros(empresaId: string | null): EstadoLixeiraNumeros {
  const [itens, setItens]     = useState<LixeiraNumeroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState<string | null>(null);

  const primeiraCarga = useRef(true);

  const carregar = useCallback(async () => {
    if (!empresaId) {
      setItens([]);
      setLoading(false);
      return;
    }
    try {
      const lista = await listarLixeira(empresaId);
      setItens(anterior => reconciliarLista(anterior, lista, { chave: i => i.id }));
      setErro(null);
    } catch (e) {
      const erroPg = e as { code?: string; message?: string };
      // A tabela nasce na migration 20260911150000, aplicada à mão. Antes dela a
      // aba explica o que falta, em vez de mostrar o erro cru do PostgREST.
      setErro(erroPg.code === 'PGRST205' || erroPg.code === '42P01'
        ? 'A Lixeira de Números ainda não foi ativada no banco. Ela aparece aqui assim que a atualização for aplicada.'
        : erroPg.message ?? 'Não foi possível carregar a lixeira.');
    } finally {
      if (primeiraCarga.current) {
        primeiraCarga.current = false;
        setLoading(false);
      }
    }
  }, [empresaId]);

  useEffect(() => { primeiraCarga.current = true; setLoading(true); }, [empresaId]);
  useEffect(() => { void carregar(); }, [carregar]);

  // Outra pessoa exclui ou restaura com a aba aberta: sem isto, só depois de um F5.
  useEffect(() => {
    if (!empresaId) return;
    return assinarTabela(
      {
        topico: `numeros-lixeira:${empresaId}`,
        escutas: [{ tabela: 'numeros_lixeira', filtro: `empresa_id=eq.${empresaId}` }],
      },
      {
        onEvento:      () => { void carregar(); },
        onReconectado: () => { void carregar(); },
      },
    );
  }, [empresaId, carregar]);

  return { itens, loading, erro, recarregar: carregar };
}
