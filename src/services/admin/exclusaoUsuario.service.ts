/**
 * exclusaoUsuario.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Excluir um usuário que já tabulou, e limpar as tabulações quando ele muda de
 * empresa. Regra definida em 05/08/2026 (ver migration 20260805c).
 *
 * Ao excluir, os acordos do usuário são apagados — os NRs voltam a ficar livres
 * para outros tabularem — e quem excluiu BAIXA UM RELATÓRIO com todas as
 * tabulações dele, para poder conferir depois. Mesma coisa ao trocar de
 * empresa: o usuário chega limpo na nova e os acordos da anterior saem.
 *
 * A ordem é a garantia do processo: o relatório é gerado e baixado ANTES de
 * qualquer DELETE. Se ele falhar, nada é apagado — o operador tenta de novo em
 * vez de descobrir que perdeu o que não conseguiu ler.
 *
 * O que NÃO sai: `analitico_recebimentos` e `diario_recebimentos` são tabelas
 * separadas, alimentadas pela importação do relatório do ERP. O recebimento
 * segue contando nos totais de setor e equipe.
 */
import { supabase, type Acordo } from '@/lib/supabase';

export interface ResumoExclusao {
  nome:      string | null;
  empresaId: string | null;
  acordos:   number;
  historico: number;
  logs:      number;
}

export type ResultadoExclusao =
  | { status: 'ok';    acordosApagados: number; relatorio: string | null }
  | { status: 'falha'; mensagem: string };

/** Chamada de RPC sem os tipos gerados — as funções são da migration 20260805c. */
function rpc<T>(nome: string, args: Record<string, unknown>) {
  const chamar = supabase.rpc as unknown as (
    n: string, a: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { message: string; code?: string } | null }>;
  return chamar(nome, args);
}

/**
 * Quanto seria apagado. A tela mostra o número na confirmação em vez de um
 * "tem certeza?" genérico.
 */
export async function resumoExclusao(userId: string): Promise<ResumoExclusao | null> {
  const { data, error } = await rpc<{
    nome: string | null; empresa_id: string | null;
    acordos: number; historico: number; logs: number;
  }>('fn_admin_resumo_exclusao_usuario', { p_user_id: userId });

  if (error || !data) {
    console.warn('[exclusaoUsuario] resumo indisponível:', error?.message);
    return null;
  }
  return {
    nome:      data.nome,
    empresaId: data.empresa_id,
    acordos:   Number(data.acordos)   || 0,
    historico: Number(data.historico) || 0,
    logs:      Number(data.logs)      || 0,
  };
}

/** Colunas do relatório, na ordem em que aparecem na planilha. */
const COLUNAS: Array<[titulo: string, ler: (a: Acordo) => unknown]> = [
  ['NR / Código',   a => a.nr_cliente || a.instituicao || ''],
  ['Cliente',       a => a.nome_cliente ?? ''],
  ['Instituição',   a => a.instituicao ?? ''],
  ['Vencimento',    a => a.vencimento ?? ''],
  ['Valor',         a => a.valor ?? 0],
  ['Valor total',   a => a.valor_total ?? ''],
  ['Entrada',       a => a.valor_entrada ?? ''],
  ['Parcela',       a => `${a.numero_parcela ?? 1}/${a.parcelas ?? 1}`],
  ['Tipo',          a => a.tipo ?? ''],
  ['Status',        a => a.status ?? ''],
  ['Pagamento em',  a => a.data_pagamento ?? ''],
  ['Cadastrado em', a => a.data_cadastro ?? ''],
  ['Vínculo',       a => a.tipo_vinculo ?? 'direto'],
  ['Pareado com',   a => a.vinculo_operador_nome ?? ''],
  ['WhatsApp',      a => a.whatsapp ?? ''],
  ['Observações',   a => a.observacoes ?? ''],
];

/** Todas as tabulações do usuário. `empresaId` limita à empresa (troca de empresa). */
export async function buscarAcordosDoUsuario(
  userId: string, empresaId?: string | null,
): Promise<Acordo[]> {
  let q = supabase.from('acordos').select('*').eq('operador_id', userId);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q.order('data_cadastro', { ascending: false });
  if (error) {
    console.warn('[exclusaoUsuario] falha ao ler acordos:', error.message);
    return [];
  }
  return (data ?? []) as Acordo[];
}

/** `Fulano-de-Tal` → nome de arquivo sem acento, espaço ou barra. */
function nomeDeArquivo(nome: string, sufixo: string): string {
  const limpo = (nome || 'usuario')
    // NFD separa o acento da letra; o strip de nao-ASCII leva so o acento.
    .normalize('NFD').replace(/[^ -~]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'usuario';
  return `acordos-${limpo}-${sufixo}.xlsx`;
}

/**
 * Monta e baixa a planilha com as tabulações.
 *
 * O `import()` é dinâmico porque `@e965/xlsx` pesa ~484 KB: estático aqui, o
 * pacote entraria no chunk da tela de Usuários e seria baixado por quem só
 * quer trocar uma senha. Mesma regra da trava em
 * `services/xlsx-fora-do-caminho-de-leitura.test.ts`.
 *
 * @returns o nome do arquivo baixado, ou null se não havia o que exportar.
 * @throws  se a planilha não puder ser gerada — quem chama ABORTA a exclusão.
 */
export async function baixarRelatorioAcordos(
  nomeUsuario: string, acordos: Acordo[], sufixo: string,
): Promise<string | null> {
  if (!acordos.length) return null;

  const { utils, write } = await import('@e965/xlsx');

  const linhas = acordos.map(a => {
    const linha: Record<string, unknown> = {};
    for (const [titulo, ler] of COLUNAS) linha[titulo] = ler(a);
    return linha;
  });

  const ws = utils.json_to_sheet(linhas, { header: COLUNAS.map(([t]) => t) });
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Acordos');

  const buffer = write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const nome   = nomeDeArquivo(nomeUsuario, sufixo);

  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return nome;
}

/**
 * Exclui o usuário, apagando as tabulações dele.
 *
 * Relatório primeiro, DELETE depois — e o DELETE é uma transação só, no
 * servidor, para não existir estado intermediário com metade dos acordos fora
 * e o usuário ainda de pé.
 */
export async function excluirUsuarioComAcordos(params: {
  userId: string;
  nome:   string;
}): Promise<ResultadoExclusao> {
  const { userId, nome } = params;

  let relatorio: string | null = null;
  try {
    const acordos = await buscarAcordosDoUsuario(userId);
    relatorio = await baixarRelatorioAcordos(nome, acordos, 'excluido');
  } catch (e) {
    // Nada foi apagado ainda: dá para tentar de novo sem prejuízo.
    return {
      status: 'falha',
      mensagem: `Não foi possível gerar o relatório das tabulações, então nada foi excluído. ${
        e instanceof Error ? e.message : ''
      }`.trim(),
    };
  }

  const { data, error } = await rpc<{ ok: boolean; acordos_apagados: number }>(
    'fn_admin_delete_user', { p_user_id: userId, p_apagar_acordos: true },
  );

  if (error) return { status: 'falha', mensagem: traduzirErro(error.message) };

  return {
    status: 'ok',
    acordosApagados: Number(data?.acordos_apagados) || 0,
    relatorio,
  };
}

/**
 * Troca de empresa: o usuário vai limpo para a nova e os acordos da anterior
 * são apagados, com relatório. Chamada DEPOIS de o perfil já ter mudado de
 * empresa — por isso a empresa antiga vem por parâmetro.
 */
export async function limparAcordosDaEmpresaAnterior(params: {
  userId:            string;
  nome:              string;
  empresaAnteriorId: string;
}): Promise<ResultadoExclusao> {
  const { userId, nome, empresaAnteriorId } = params;

  let relatorio: string | null = null;
  try {
    const acordos = await buscarAcordosDoUsuario(userId, empresaAnteriorId);
    if (!acordos.length) return { status: 'ok', acordosApagados: 0, relatorio: null };
    relatorio = await baixarRelatorioAcordos(nome, acordos, 'empresa-anterior');
  } catch (e) {
    return {
      status: 'falha',
      mensagem: `Não foi possível gerar o relatório, então os acordos da empresa anterior NÃO foram apagados. ${
        e instanceof Error ? e.message : ''
      }`.trim(),
    };
  }

  const { data, error } = await rpc<number>('fn_admin_apagar_acordos_do_usuario', {
    p_user_id: userId, p_empresa_id: empresaAnteriorId,
  });

  if (error) return { status: 'falha', mensagem: traduzirErro(error.message) };
  return { status: 'ok', acordosApagados: Number(data) || 0, relatorio };
}

/** Texto cru do Postgres → frase que diz o que fazer. */
export function traduzirErro(mensagem: string): string {
  if (/violates foreign key constraint/i.test(mensagem)) {
    return 'O usuário ainda está referenciado em outro lugar do sistema. '
      + 'Recarregue a página e tente de novo; se persistir, avise o suporte.';
  }
  if (/could not find the function|does not exist/i.test(mensagem)) {
    return 'Migration 20260805c pendente — aplique-a no Supabase para excluir usuários com tabulações.';
  }
  if (/sem permiss[aã]o/i.test(mensagem)) return mensagem;
  return `Erro ao excluir usuário: ${mensagem}`;
}
