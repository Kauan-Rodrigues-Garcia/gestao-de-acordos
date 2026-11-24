/**
 * agendados.service.ts — as leituras da aba «Agendados» do Painel Líder.
 *
 * Duas consultas, de propósito:
 *
 *   buscarAgenda ............ o recorte inteiro, só as colunas que CONTAM
 *                             (sem nome de cliente, sem NR)
 *   buscarAgendaDaPessoa .... a lista de UMA pessoa, com cliente e NR, só
 *                             quando o líder abre a linha dela
 *
 * A aba Acompanhamento saiu em 31/08/2026 por trazer todo acordo do mês, com
 * tudo, de todo mundo no alcance. Esta aba responde a uma pergunta parecida, e
 * por isso nasce leve: a lista detalhada vem pessoa a pessoa, sob demanda.
 *
 * Nenhuma das duas assina realtime: o botão de recarregar e a troca de mês
 * bastam, e um canal por painel aberto foi o que pesou no banco antes.
 */
import { supabase } from '@/lib/supabase';
import { lerTodasAsPaginas } from '@/lib/lerTodasAsPaginas';
import type { LinhaAgenda } from './agendados';

/** Ids por pedido. O filtro viaja na URL; 100 UUIDs são ~3,7 mil caracteres. */
const IDS_POR_PEDIDO = 100;

const COLUNAS_BASE = 'id, operador_id, setor_id, vencimento, valor, status, tipo_vinculo';
/** Com o par DIRETO/EXTRA (20261030235500). Sem a coluna, cai na base. */
const COLUNAS_COM_PAR = `${COLUNAS_BASE}, par_acordo_id`;

/**
 * A agenda do recorte: os acordos das pessoas, com vencimento no intervalo.
 *
 * Pelo OPERADOR, e não pelo `setor_id` do acordo: o painel mostra «as pessoas
 * que eu acompanho», e o clone emprestado a outro setor carrega o acordo com o
 * setor de origem. Quem separa por setor é `distribuirPorSetor`.
 */
export async function buscarAgenda(p: {
  empresaId: string;
  operadores: readonly string[];
  de: string;
  ate: string;
}): Promise<LinhaAgenda[]> {
  if (!p.operadores.length) return [];
  const fatias: string[][] = [];
  for (let i = 0; i < p.operadores.length; i += IDS_POR_PEDIDO) {
    fatias.push(p.operadores.slice(i, i + IDS_POR_PEDIDO));
  }

  const ler = (colunas: string) => Promise.all(fatias.map(ids =>
    lerTodasAsPaginas<LinhaAgenda>((de, ate) => supabase
      .from('acordos')
      .select(colunas)
      .eq('empresa_id', p.empresaId)
      .in('operador_id', ids)
      .gte('vencimento', p.de)
      .lte('vencimento', p.ate)
      // Ordem total pela PK: sem ela as páginas se sobrepõem.
      .order('id', { ascending: true })
      .range(de, ate)),
  ));

  try {
    return (await ler(COLUNAS_COM_PAR)).flat();
  } catch (e) {
    if (!/par_acordo_id/.test(String((e as Error)?.message ?? e))) throw e;
    return (await ler(COLUNAS_BASE)).flat();
  }
}

/** Um acordo da lista de uma pessoa. */
export interface AcordoDaAgenda extends LinhaAgenda {
  nome_cliente: string | null;
  nr_cliente: string | null;
  /** Na regra Cofen, o Código do cliente. */
  instituicao: string | null;
  tipo: string | null;
  numero_parcela: number | null;
  parcelas: number | null;
  vinculo_operador_nome: string | null;
}

const COLUNAS_DETALHE =
  `${COLUNAS_BASE}, nome_cliente, nr_cliente, instituicao, tipo, numero_parcela, parcelas, vinculo_operador_nome`;

/** A lista de uma pessoa no intervalo, por vencimento. */
export async function buscarAgendaDaPessoa(p: {
  empresaId: string;
  operadorId: string;
  de: string;
  ate: string;
}): Promise<AcordoDaAgenda[]> {
  return lerTodasAsPaginas<AcordoDaAgenda>((de, ate) => supabase
    .from('acordos')
    .select(COLUNAS_DETALHE)
    .eq('empresa_id', p.empresaId)
    .eq('operador_id', p.operadorId)
    .gte('vencimento', p.de)
    .lte('vencimento', p.ate)
    .order('vencimento', { ascending: true })
    .order('id', { ascending: true })
    .range(de, ate));
}
