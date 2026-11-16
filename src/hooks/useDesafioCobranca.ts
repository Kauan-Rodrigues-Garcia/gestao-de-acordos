/**
 * O Desafio Cobrança no Gestão: o placar (todo mundo que vê) e a meta
 * individual (as 4,5 médias de quem está olhando).
 *
 * O placar muda quando o robô do 59 sobe um lote (de hora em hora): reler a
 * cada 5 minutos basta, e NÃO reler ao voltar para a aba — o pico de todo
 * mundo voltando junto já derrubou o banco (Caça às Bruxas, out/2026).
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { buscarDesafioCobranca, type PlacarCobranca } from '@/services/desafioCobranca/desafioCobranca.service';
import { buscarAnaliticoPeriodo, somarPorDia } from '@/services/desempenhoDia/desempenhoDia.service';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { diasUteisDoSetor } from '@/lib/diasUteisDoSetor';
import { minhaMetaPeloRecebido, type MinhaMetaNoDesafio } from '@/lib/desafioMediaOperador';

export type { MinhaMetaNoDesafio };

export const RELEITURA_DESAFIO_COBRANCA_MS = 5 * 60 * 1000;

export function useDesafioCobranca(ativo: boolean) {
  const { perfil } = useAuth();
  return useQuery({
    queryKey: ['desafio-cobranca', perfil?.id ?? null],
    queryFn: buscarDesafioCobranca,
    enabled: ativo && !!perfil?.id,
    refetchInterval: RELEITURA_DESAFIO_COBRANCA_MS,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 1000,
    retry: 1,
  });
}

/**
 * A regra individual (4,5 médias = 1h mais cedo; 5 = sai às 14:00): a média é a do sistema (recebido no mês ÷ dias úteis
 * trabalhados), congelada na véspera do desafio. Só busca com a gaveta aberta.
 *
 * O dinheiro é SEMPRE o 59 do operador (o Analítico, que a sincronização do 59
 * preenche) — mesmo com o placar geral em «só o lançamento do super_admin».
 * Por isso a chave da consulta não leva `fonte`, total nem lançamentos.
 */
export function useMinhaMetaNoDesafio(placar: PlacarCobranca | null | undefined, hoje: number, aberto: boolean) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const inicio = placar?.dias[0];
  const fim = placar?.dias[placar.dias.length - 1];

  return useQuery({
    queryKey: ['desafio-cobranca-minha', perfil?.id ?? null, empresa?.id ?? null, inicio, fim, hoje, placar?.regra_medias, placar?.regra_medias_maior],
    enabled: aberto && !!perfil?.id && !!empresa?.id && !!inicio && !!fim,
    refetchInterval: aberto ? RELEITURA_DESAFIO_COBRANCA_MS : false,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 1000,
    queryFn: async (): Promise<MinhaMetaNoDesafio> => {
      const operadorId = perfil!.id;
      const [ano, mes] = inicio!.split('-').map(Number);
      const de = `${inicio!.slice(0, 7)}-01`;
      const [analitico, config] = await Promise.all([
        buscarAnaliticoPeriodo({ empresaId: empresa!.id, de, ate: fim!, operadorId, escopo: { tipo: 'operador', operadorId } }),
        getMetasConfig(empresa!.id, mes, ano),
      ]);
      if (analitico.erro) throw new Error(analitico.erro);
      const { bruto } = somarPorDia(analitico.linhas, { tipo: 'operador', operadorId });
      const feriados = diasUteisDoSetor(config, perfil?.setor_id ?? null, operadorId).feriados;
      return minhaMetaPeloRecebido(placar!, bruto, feriados, hoje);
    },
  });
}
