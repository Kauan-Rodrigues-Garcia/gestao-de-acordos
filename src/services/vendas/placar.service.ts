/**
 * placar.service.ts — o cadastro que o placar do Comercial pergunta.
 *
 * Uma RPC, `fn_vendas_placar_pessoas`, e três respostas que a lista de vendas
 * não dá: quem é robô, em que equipe a pessoa credita, e quantos dias úteis ela
 * perdeu no mês por ausência que abate meta.
 *
 * ## Por que não é a lista de Acompanhamento
 *
 * `fn_acompanhamento_pessoas` mede alcance pela equipe de HOJE e exclui os
 * robôs — as duas decisões certas para ler o histórico de um transferido, e as
 * duas erradas para creditar dinheiro. Aqui o alcance é `fn_vendas_alcanca`, o
 * mesmo da policy `vendas_select`, porque esta lista existe para dar nome e
 * equipe às vendas que já chegaram na tela.
 *
 * ## O número de dias vem sem o motivo, de propósito
 *
 * Atestado e INSS são dado de saúde. A meta proporcional precisa saber que a
 * pessoa perdeu 4 dias úteis; não precisa saber por quê. Quem quer o motivo
 * continua passando por `ver_acompanhamento` e `ver_feedbacks`.
 */
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import type { PessoaDoPlacar } from '@/lib/vendasPlacar';
import { mensagemDoErro, pareceNaoInstalado } from './erroDoBanco';

const MIGRATION = '20260915230000_vendas_fase9_placar_e_paineis.sql';

/** A pessoa, com o que a meta proporcional precisa saber dela. */
export interface PessoaComAusencia extends PessoaDoPlacar {
  foto_url: string | null;
  cargo: string;
  situacao: string;
  /** Dias úteis do mês perdidos em ausência que abate meta. Meio período = 0,5. */
  diasAbatidos: number;
  /** O denominador, vindo do banco para a tela não recalcular com outra régua. */
  diasUteisDoMes: number;
}

export interface PessoasDoPlacar {
  pessoas: PessoaComAusencia[];
  /** `false` enquanto a migration não for aplicada. A tela segue sem o cadastro. */
  disponivel: boolean;
  erro: string | null;
}

function num(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function textoOuNulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : String(valor);
}

/**
 * O cadastro das pessoas alcançadas, com a ausência do mês.
 *
 * `mes` é `'yyyy-MM'` como no resto da aba. Omiti-lo devolve o cadastro sem
 * conta de ausência — `diasAbatidos` vem zero e `diasUteisDoMes` também, e é
 * assim que a tela sabe que não perguntou, em vez de achar que ninguém faltou.
 */
export async function buscarPessoasDoPlacar(
  empresaId: string,
  mes?: string | null,
): Promise<PessoasDoPlacar> {
  const { data, error } = await rpcSemTipo<Record<string, unknown>[]>(
    'fn_vendas_placar_pessoas',
    { p_empresa_id: empresaId, p_mes: mes ? `${mes}-01` : null },
  );

  if (error) {
    return {
      pessoas: [],
      disponivel: !pareceNaoInstalado(error.message),
      erro: mensagemDoErro(error.message, 'O placar de Vendas', MIGRATION),
    };
  }

  const pessoas = (Array.isArray(data) ? data : []).map((l): PessoaComAusencia => ({
    id:             String(l.id),
    nome:           String(l.nome ?? '—'),
    foto_url:       textoOuNulo(l.foto_url),
    cargo:          String(l.cargo ?? ''),
    situacao:       String(l.situacao ?? 'ativo'),
    robo:           l.robo === true,
    equipe_id:      textoOuNulo(l.equipe_id),
    equipe_nome:    textoOuNulo(l.equipe_nome),
    setor_id:       textoOuNulo(l.setor_id),
    setor_nome:     textoOuNulo(l.setor_nome),
    diasAbatidos:   num(l.dias_abatidos),
    diasUteisDoMes: num(l.dias_uteis_do_mes),
  }));

  return { pessoas, disponivel: true, erro: null };
}
