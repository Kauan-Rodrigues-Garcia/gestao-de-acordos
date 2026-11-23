/**
 * Os Cupons do Pix na aba Pix Automático (23/11/2026): qual desafio está com
 * os cupons ligados para quem olha, e a cor da linha do período.
 */
import { useAuth } from '@/hooks/useAuth';
import { useDesafioVale } from '@/hooks/useDesafioVale';
import type { DesafioVale } from '@/services/desafioVale/desafioVale.service';

/** O desafio com os cupons ligados, ou `null`. Usa a mesma consulta da barra de cima. */
export function useCampanhaCupom(): DesafioVale | null {
  const { perfil } = useAuth();
  const { data } = useDesafioVale(!!perfil?.id);
  // A Manutenção (ranking) não tem Pix automático: nada de cupom na aba Pix.
  if (data?.meu_setor?.cupom_regra === 'ranking') return null;
  return data && data.cupom_ativo && data.cupom_inicio && data.cupom_fim ? data : null;
}

/** As classes da linha da tabela que é da campanha (a laranja do cupom). */
export const CLASSE_LINHA_CUPOM = 'bg-orange-400/[0.08] shadow-[inset_4px_0_0_0_#fb923c] hover:bg-orange-400/[0.14]';
