import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { setoresQuePodeImportar } from '@/lib/relatoriosDoSetor';
import {
  listarSetoresComRelatorio, type SetorComRelatorio,
} from '@/services/relatorio1017/relatorioDoSetor.service';

/**
 * Os setores em que a pessoa logada importa relatório próprio (o 1017 da
 * Manutenção): o líder do próprio setor e o super admin. Vazio = o botão não
 * existe para ela, e a página não reserva lugar para ele.
 */
export function useSetoresQueImportamRelatorio(empresaId: string | null | undefined): SetorComRelatorio[] {
  const { perfil } = useAuth();
  const [configurados, setConfigurados] = useState<SetorComRelatorio[]>([]);
  useEffect(() => {
    if (!empresaId) { setConfigurados([]); return; }
    let cancelado = false;
    void listarSetoresComRelatorio(empresaId).then(l => { if (!cancelado) setConfigurados(l); });
    return () => { cancelado = true; };
  }, [empresaId]);
  return useMemo(
    () => setoresQuePodeImportar({ perfil: perfil?.perfil, setorId: perfil?.setor_id }, configurados),
    [perfil?.perfil, perfil?.setor_id, configurados],
  );
}
