import { rpcSemTipo } from '@/lib/supabaseSemTipo';

export interface ConciliacaoSetor {
  setorId: string;
  bruto: number;
  ho: number;
  quantidade: number;
}

/** A API entrega inteiros como texto para não arredondar no transporte JSON. */
export function centavosParaReais(valor: string): number {
  if (!/^-?\d+$/.test(valor)) throw new Error('Valor inválido na conciliação');
  const centavos = Number(valor);
  if (!Number.isSafeInteger(centavos)) throw new Error('Valor da conciliação excede a precisão suportada');
  return centavos / 100;
}

export async function carregarConciliacaoSetor(empresaId: string, mes: string): Promise<ConciliacaoSetor> {
  const { data, error } = await rpcSemTipo<{
    setor_id: string; total_centavos: string; ho_centavos: string; quantidade: number;
  }>('fn_pp_conciliacao_setor', { p_empresa_id: empresaId, p_mes: mes });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Conciliação indisponível');
  return {
    setorId: data.setor_id,
    bruto: centavosParaReais(data.total_centavos),
    ho: centavosParaReais(data.ho_centavos),
    quantidade: data.quantidade,
  };
}
