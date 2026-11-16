/**
 * O Desafio Cobrança no Gestão: o placar (todo mundo que vê) e a meta
 * individual (as 4,5 médias de quem está olhando).
 *
 * ## Ao vivo (16/11/2026)
 *
 * O placar muda quando o robô do 59 sobe um lote (de hora em hora), quando o
 * super_admin lança/remove um ajuste ou mexe no desafio. Em cada uma dessas o
 * banco manda o sinal `desafios:<empresa>` com `tabela` começando em
 * `desafio_cobranca` (migration 20261116210000), e a tela relê sozinha — sem
 * recarregar a página. O portão de `lib/sinais.ts` espalha as releituras em
 * alguns segundos e segura a aba escondida até a pessoa voltar.
 *
 * A releitura de 5 minutos fica de rede de baixo (sinal perdido, migration
 * ainda não aplicada). E NÃO reler ao voltar para a aba — o pico de todo mundo
 * voltando junto já derrubou o banco (Caça às Bruxas, out/2026).
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { assinarSinal } from '@/lib/sinais';
import { useAuth } from './useAuth';
import { useEmpresa } from './useEmpresa';
import { buscarDesafioCobranca, type PlacarCobranca } from '@/services/desafioCobranca/desafioCobranca.service';
import { buscarAnaliticoPeriodo, somarPorDia } from '@/services/desempenhoDia/desempenhoDia.service';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import { diasUteisDoSetor } from '@/lib/diasUteisDoSetor';
import { minhaMetaNoDesafio, type MinhaMetaNoDesafio } from '@/lib/desafioMediaOperador';

export type { MinhaMetaNoDesafio };

export const RELEITURA_DESAFIO_COBRANCA_MS = 5 * 60 * 1000;

/** O sinal `desafios` também leva os Desafios 2.0: só estes são do Desafio Cobrança. */
export const ehSinalDoDesafioCobranca = (tabela: string) => tabela.startsWith('desafio_cobranca');

/**
 * Relê o que o Desafio Cobrança mostra quando o banco avisa que mudou.
 * `chaves`: prefixos de queryKey do react-query a invalidar.
 */
export function useSinalDoDesafioCobranca(ativo: boolean, chaves: readonly (readonly unknown[])[]) {
  const { empresa } = useEmpresa();
  const qc = useQueryClient();
  const empresaId = empresa?.id ?? null;
  const assinatura = JSON.stringify(chaves);
  useEffect(() => {
    if (!ativo || !empresaId) return;
    const lista = JSON.parse(assinatura) as unknown[][];
    const reler = () => { for (const queryKey of lista) void qc.invalidateQueries({ queryKey }); };
    return assinarSinal('desafios', empresaId, {
      // Sinal sem tabela = vários juntos pelo banco: relê por garantia.
      onMudou: (s) => { if (!s.tabela || ehSinalDoDesafioCobranca(s.tabela)) reler(); },
      onReconectado: reler,
    });
  }, [ativo, empresaId, assinatura, qc]);
}

export function useDesafioCobranca(ativo: boolean) {
  const { perfil } = useAuth();
  const habilitado = ativo && !!perfil?.id;
  useSinalDoDesafioCobranca(habilitado, [['desafio-cobranca'], ['desafio-cobranca-minha']]);
  return useQuery({
    queryKey: ['desafio-cobranca', perfil?.id ?? null],
    queryFn: buscarDesafioCobranca,
    enabled: habilitado,
    refetchInterval: RELEITURA_DESAFIO_COBRANCA_MS,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 1000,
    retry: 1,
  });
}

/** A meta do mês do operador (aba Metas). 0 = sem meta cadastrada. */
async function buscarMetaDoMes(empresaId: string, operadorId: string, mes: number, ano: number): Promise<number> {
  const { data, error } = await supabase.from('metas')
    .select('meta_valor')
    .eq('empresa_id', empresaId).eq('tipo', 'operador').eq('referencia_id', operadorId)
    .eq('mes', mes).eq('ano', ano)
    .limit(1);
  if (error) throw new Error(error.message);
  return Number((data as { meta_valor: number | string | null }[] | null)?.[0]?.meta_valor) || 0;
}

/**
 * A regra individual (4,5 médias = 1h mais cedo; 5 = sai às 14:00): a média é
 * a meta do mês ÷ os dias úteis da pessoa no mês. Só busca com a gaveta aberta.
 *
 * O feito é SEMPRE o 59 do operador (o Analítico, que a sincronização do 59
 * preenche) — mesmo com o placar geral em «só o lançamento do super_admin».
 * Por isso a chave da consulta não leva `fonte`, total nem lançamentos.
 */
export function useMinhaMetaNoDesafio(placar: PlacarCobranca | null | undefined, hoje: number, aberto: boolean) {
  const { perfil } = useAuth();
  const { empresa } = useEmpresa();
  const inicio = placar?.dias[0];
  const fim = placar?.dias[placar.dias.length - 1];
  const qc = useQueryClient();
  const empresaId = empresa?.id ?? null;

  // O feito dele vem do Analítico, que a sincronização do 59 escreve DEPOIS do
  // lote (o sinal do desafio pode chegar antes). Com a gaveta aberta, o sinal
  // do analítico relê também — tabulação (só UPDATE) no máximo a cada 2 min.
  useEffect(() => {
    if (!aberto || !empresaId) return;
    const reler = () => { void qc.invalidateQueries({ queryKey: ['desafio-cobranca-minha'] }); };
    return assinarSinal('analitico', empresaId, { onMudou: reler, onReconectado: reler }, { minimoSoUpdateMs: 2 * 60 * 1000 });
  }, [aberto, empresaId, qc]);

  return useQuery({
    queryKey: ['desafio-cobranca-minha', perfil?.id ?? null, empresa?.id ?? null, inicio, fim, hoje, placar?.regra_medias, placar?.regra_medias_maior],
    enabled: aberto && !!perfil?.id && !!empresa?.id && !!inicio && !!fim,
    refetchInterval: aberto ? RELEITURA_DESAFIO_COBRANCA_MS : false,
    refetchOnWindowFocus: false,
    staleTime: 4 * 60 * 1000,
    queryFn: async (): Promise<MinhaMetaNoDesafio> => {
      const operadorId = perfil!.id;
      const [ano, mes] = inicio!.split('-').map(Number);
      const [analitico, config, metaMensal] = await Promise.all([
        buscarAnaliticoPeriodo({ empresaId: empresa!.id, de: inicio!, ate: fim!, operadorId, escopo: { tipo: 'operador', operadorId } }),
        getMetasConfig(empresa!.id, mes, ano),
        buscarMetaDoMes(empresa!.id, operadorId, mes, ano),
      ]);
      if (analitico.erro) throw new Error(analitico.erro);
      const { bruto } = somarPorDia(analitico.linhas, { tipo: 'operador', operadorId });
      // A régua da PESSOA: setor + feriados + os dias dela (meta proporcional).
      const feriados = diasUteisDoSetor(config, perfil?.setor_id ?? null, operadorId).feriados;
      return minhaMetaNoDesafio(placar!, metaMensal, bruto, feriados, hoje);
    },
  });
}
