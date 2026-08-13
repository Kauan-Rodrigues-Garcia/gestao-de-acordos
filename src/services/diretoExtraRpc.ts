import { supabase } from '@/lib/supabase';

type RpcError = {
  code?: string;
  message: string;
};

type RpcResponse = {
  error: RpcError | null;
};

type RpcInvoker = (
  nome: string,
  argumentos: Record<string, unknown>,
) => Promise<RpcResponse>;

type DadosComuns = {
  valor: number;
  vencimento: string;
  nomeCliente: string;
  tipo: string;
  nrCliente: string;
  instituicao: string;
  whatsapp: string | null;
  parcelas: number;
};

type VincularExtraParams = DadosComuns & {
  diretoId: string;
  extraOperadorId: string;
  extraOperadorNome: string;
};

type ConverterParaExtraParams = DadosComuns & {
  acordoId: string;
  novoDiretoOperadorId: string;
  novoDiretoOperadorNome: string;
};

/**
 * Durante o rollout, a aplicação nova pode chegar à Vercel antes da
 * migration que adiciona os argumentos de validação. O fallback é usado
 * exclusivamente quando o PostgREST confirma que a assinatura nova ainda não
 * existe. Qualquer erro de regra, RLS ou autorização é devolvido sem atalho.
 */
async function executarComCompatibilidade(
  nome: string,
  argumentosProtegidos: Record<string, unknown>,
  argumentosLegados: Record<string, unknown>,
): Promise<RpcError | null> {
  const invocar = supabase.rpc.bind(supabase) as unknown as RpcInvoker;
  const resposta = await invocar(nome, argumentosProtegidos);

  if (resposta.error?.code !== 'PGRST202') return resposta.error;

  const legado = await invocar(nome, argumentosLegados);
  return legado.error;
}

export function vincularExtraAoDireto(params: VincularExtraParams): Promise<RpcError | null> {
  const argumentosLegados = {
    p_direto_id: params.diretoId,
    p_extra_op_id: params.extraOperadorId,
    p_extra_op_nome: params.extraOperadorNome,
    p_valor: params.valor,
    p_vencimento: params.vencimento,
    p_nome_cliente: params.nomeCliente,
    p_tipo: params.tipo,
    p_whatsapp: params.whatsapp,
    p_parcelas: params.parcelas,
  };

  return executarComCompatibilidade(
    'fn_vincular_extra_ao_direto',
    {
      ...argumentosLegados,
      p_nr_cliente: params.nrCliente,
      p_instituicao: params.instituicao,
    },
    argumentosLegados,
  );
}

export function converterParaExtra(params: ConverterParaExtraParams): Promise<RpcError | null> {
  const argumentosLegados = {
    p_acordo_id: params.acordoId,
    p_novo_direto_op_id: params.novoDiretoOperadorId,
    p_novo_direto_op_nome: params.novoDiretoOperadorNome,
    p_valor: params.valor,
    p_vencimento: params.vencimento,
    p_nome_cliente: params.nomeCliente,
    p_tipo: params.tipo,
    p_whatsapp: params.whatsapp,
    p_parcelas: params.parcelas,
  };

  return executarComCompatibilidade(
    'fn_converter_para_extra',
    {
      ...argumentosLegados,
      p_nr_cliente: params.nrCliente,
      p_instituicao: params.instituicao,
    },
    argumentosLegados,
  );
}
