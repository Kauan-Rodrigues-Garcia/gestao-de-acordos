/**
 * useRegistrarPixAoPagar — o acordo recorrente que vira pago entra no Pix.
 *
 * As telas que mudam status (lista, detalhe, edição) chamam isto DEPOIS de
 * gravar, com o acordo já no estado novo. A regra mora em
 * `registrarAcordoPagoNoPix`; aqui ficam só quem está clicando, a permissão do
 * Pix dele e o aviso na tela.
 *
 * Nunca lança: o status já foi gravado, e um erro aqui não pode parecer que o
 * "Pago" falhou.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { niveisLiberados } from '@/lib/permissoes-escopo';
import { getTodayISO } from '@/lib/index';
import {
  registrarAcordoPagoNoPix, avisoPixDoAcordoPago, type AcordoParaPix,
} from '@/services/pixAutomaticoDoAcordo.service';

export function useRegistrarPixAoPagar(): (acordo: AcordoParaPix) => Promise<void> {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();

  return useCallback(async (acordo: AcordoParaPix) => {
    if (!perfil?.id || !empresa?.id) return;
    const niveisPix = niveisLiberados('pix', temPermissao);
    try {
      const r = await registrarAcordoPagoNoPix({
        acordo,
        empresaId: empresa.id,
        quemAgeId: perfil.id,
        podeAgirSobreOutros: niveisPix.includes('setor') || niveisPix.includes('todos_setores'),
        hoje: getTodayISO(),
      });
      const aviso = avisoPixDoAcordoPago(r, String(acordo.nr_cliente ?? '').trim());
      if (!aviso) return;
      if (aviso.tipo === 'sucesso') toast.success(aviso.texto, { duration: 6000 });
      else toast.warning(aviso.texto, { duration: 10000 });
    } catch (e) {
      console.warn('[useRegistrarPixAoPagar]', e);
      toast.warning(
        'O acordo está pago, mas não foi possível registrar no Pix Automático. '
        + 'Registre pela aba Pix Automático para não perder a comissão.',
        { duration: 10000 },
      );
    }
  }, [perfil?.id, empresa?.id, temPermissao]);
}
