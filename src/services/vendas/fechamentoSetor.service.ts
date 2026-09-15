/**
 * fechamentoSetor.service.ts — a conta do setor, como o banco a devolve.
 *
 * Só leitura. A função SQL é `STABLE` e não escreve nada: ela responde «onde
 * foi parar cada real do retrato deste mês», e a resposta é derivada do lote
 * vigente — nunca de uma tabela de resumo que alguém tenha de manter em dia.
 *
 * ## O portão de escopo mora no banco, e é de propósito
 *
 * `fn_vendas_fechamento_do_setor` é `SECURITY DEFINER` e exige escopo de setor
 * ou mais. Esconder o botão no cliente não seria trava: a RPC continuaria
 * respondendo por URL. Aqui o que se faz é TRADUZIR a recusa — o `42501` que
 * chega é mensagem de gente, e a tela mostra ela em vez de sumir sem dizer por
 * quê.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { normalizarLinhas, organizarFechamento, type Fechamento } from '@/lib/vendasFechamento';
import { mensagemDoErro } from './erroDoBanco';

export interface ResultadoFechamento {
  ok: boolean;
  dado: Fechamento | null;
  erro: string | null;
  /** `true` quando a recusa foi de permissão, não de instalação. */
  semAlcance: boolean;
}

/** A recusa de escopo chega como `42501` e já vem escrita para gente. */
function pareceRecusaDeAcesso(mensagem: string): boolean {
  return /fora do seu (acesso|alcance)|alcança menos que isso/i.test(mensagem);
}

/**
 * O fechamento de um setor num mês.
 *
 * `mes` é `'yyyy-MM'`, como no resto da aba; o banco recebe o primeiro dia e
 * trunca de novo por garantia — quem chama não precisa saber disso.
 */
export async function buscarFechamentoDoSetor(params: {
  empresaId: string;
  setorId: string;
  /** 'yyyy-MM' */
  mes: string;
}): Promise<ResultadoFechamento> {
  const { data, error } = await rpcSemTipo<unknown[]>('fn_vendas_fechamento_do_setor', {
    p_empresa_id: params.empresaId,
    p_setor_id:   params.setorId,
    p_mes:        `${params.mes}-01`,
  });

  if (error) {
    const bruta = error.message ?? '';
    if (pareceRecusaDeAcesso(bruta)) {
      return { ok: false, dado: null, erro: bruta, semAlcance: true };
    }
    return {
      ok: false,
      dado: null,
      erro: mensagemDoErro(bruta, 'O fechamento do setor',
                           '20260915160000_vendas_fase6_a_conta_do_setor_fecha.sql'),
      semAlcance: false,
    };
  }

  return {
    ok: true,
    dado: organizarFechamento(normalizarLinhas(Array.isArray(data) ? data : [])),
    erro: null,
    semAlcance: false,
  };
}
