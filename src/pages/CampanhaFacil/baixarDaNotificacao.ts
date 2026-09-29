/**
 * O clique na notificação de campanha: baixa a planilha do operador.
 *
 * O service (e com ele o escritor de .xlsx) entra por `import()` só no clique:
 * o sino está em toda tela, e quem nunca recebe campanha não precisa carregar
 * o gerador de Excel.
 */
import { toast } from 'sonner';

export async function baixarCampanhaDaNotificacao(envioId: string): Promise<void> {
  const aviso = toast.loading('Preparando a planilha…');
  try {
    const { baixarEnvioCampanha, DIAS_VALIDADE_ENVIO } = await import('./campanhaFacilEnvios.service');
    const ok = await baixarEnvioCampanha(envioId);
    if (ok) {
      toast.success('Planilha da campanha baixada.', { id: aviso });
    } else {
      toast.error(
        `Esta campanha não está mais disponível: passou de ${DIAS_VALIDADE_ENVIO} dias ou o líder repassou para outra pessoa.`,
        { id: aviso },
      );
    }
  } catch (err) {
    console.error('[CampanhaFacil] download pela notificação falhou:', err);
    toast.error('Não foi possível baixar a planilha. Tente de novo.', { id: aviso });
  }
}
