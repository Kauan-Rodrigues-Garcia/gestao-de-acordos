/**
 * bancoHoras.service.ts — o banco de horas do DP (relatório HRBH102) no banco.
 *
 * Uma linha de `banco_horas_setores` = um setor do DP numa data de «Saldo Banco
 * em» (migration 20261118180000). A tela trabalha com «posições»: uma data com
 * os setores dela. Este módulo faz a ponte nos dois sentidos; a leitura do CSV
 * e as contas ficam em `lib/bancoHoras`.
 *
 * Quem vê o quê é a RLS (`fn_banco_horas_alcanca`): o `select` já volta só com
 * os setores do DP que a pessoa alcança. Escrita só por RPC.
 */
import { rpcSemTipo, tabelaSemTipo } from '@/lib/supabaseSemTipo';
import type { PessoaDP, PosicaoBH, SetorParaGravar } from '@/lib/bancoHoras/tipos';

export type { PosicaoBH, SetorParaGravar };

export interface LinhaBancoHoras {
  saldo_em: string;
  empresa_codigo: string;
  empresa_nome: string | null;
  setor_dp: string;
  depto: string | null;
  hierarquia: string | null;
  arquivo: string | null;
  gerado_em: string | null;
  usuario_dp: string | null;
  pessoas: PessoaDP[];
  importado_em: string | null;
}

export interface VinculoBH {
  empresaCodigo: string;
  setorDp: string;
  setorId: string;
}

export interface ResultadoImportacao {
  novos: number;
  trocados: number;
  iguais: number;
}

/** «2026-11-16T14:05:00» → «2026-11-16 14:05», como o painel escreve. */
function geradoDoBanco(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(v);
  return m ? `${m[1]} ${m[2]}` : v.slice(0, 10);
}

/** «2026-11-16 14:05» → «2026-11-16T14:05:00», para a coluna `timestamp`. */
function geradoParaBanco(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(v);
  if (!m) return null;
  return `${m[1]}T${m[2] ?? '00:00'}:00`;
}

const maior = (a: string | null, b: string | null) => ((a ?? '') > (b ?? '') ? a : b);

/** As linhas do banco viram as posições do painel, da data mais antiga à mais nova. */
export function linhasParaPosicoes(linhas: LinhaBancoHoras[]): PosicaoBH[] {
  const porData = new Map<string, PosicaoBH>();
  for (const l of linhas) {
    let pos = porData.get(l.saldo_em);
    if (!pos) {
      pos = { date: l.saldo_em, setores: {}, importadoEm: null, gerado: null, usuario: null };
      porData.set(l.saldo_em, pos);
    }
    const gerado = geradoDoBanco(l.gerado_em);
    pos.setores[`${l.empresa_codigo}|${l.setor_dp}`] = {
      setor: l.setor_dp,
      depto: l.depto,
      hierarquia: l.hierarquia,
      empresa: l.empresa_nome,
      empresaCode: l.empresa_codigo,
      arquivo: l.arquivo,
      gerado,
      usuario: l.usuario_dp,
      people: Array.isArray(l.pessoas) ? l.pessoas : [],
      importadoEm: l.importado_em,
    };
    pos.importadoEm = maior(pos.importadoEm, l.importado_em);
    pos.gerado = maior(pos.gerado, gerado);
    pos.usuario = pos.usuario ?? l.usuario_dp;
  }
  return [...porData.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Um setor do painel vira o item que `fn_banco_horas_importar` espera. */
export function setorParaRpc(s: SetorParaGravar) {
  return {
    saldo_em: s.date,
    empresa_codigo: String(s.empresaCode),
    empresa_nome: s.empresa,
    setor_dp: s.setor,
    depto: s.depto,
    hierarquia: s.hierarquia,
    arquivo: s.arquivo,
    gerado_em: geradoParaBanco(s.gerado),
    usuario_dp: s.usuario,
    pessoas: s.people.map(p => ({ mat: p.mat, nome: p.nome, saldo: p.saldo, em: p.em, venc: p.venc })),
    assinatura: s.assinatura,
  };
}

/** Se a tabela ainda não existe, a mensagem do PostgREST diz isso — e a tela também. */
export function ehEstruturaAusente(mensagem: string | null | undefined): boolean {
  const m = (mensagem ?? '').toLowerCase();
  return m.includes('banco_horas') && (m.includes('does not exist') || m.includes('schema cache')
    || m.includes('could not find'));
}

const COLUNAS = 'saldo_em, empresa_codigo, empresa_nome, setor_dp, depto, hierarquia, arquivo, '
  + 'gerado_em, usuario_dp, pessoas, importado_em';

/** Tudo o que a pessoa alcança desta empresa (a RLS recorta). */
export async function listarBancoHoras(empresaId: string): Promise<PosicaoBH[]> {
  // O PostgREST corta em 1.000 linhas sem avisar; ~25 setores por relatório
  // chegam lá em 40 relatórios. Pagina de 500 em 500.
  const linhas: LinhaBancoHoras[] = [];
  for (let de = 0; ; de += 500) {
    const { data, error } = await tabelaSemTipo<LinhaBancoHoras>('banco_horas_setores')
      .select(COLUNAS)
      .eq('empresa_id', empresaId)
      .order('saldo_em', { ascending: true })
      .order('setor_dp', { ascending: true })
      .range(de, de + 499);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return linhasParaPosicoes(linhas);
}

/** Grava um lote. O banco decide, setor a setor, o que é novo, igual ou trocado. */
export async function importarBancoHoras(
  empresaId: string, setores: SetorParaGravar[],
): Promise<ResultadoImportacao> {
  const total: ResultadoImportacao = { novos: 0, trocados: 0, iguais: 0 };
  // Lotes de 40 setores: um relatório tem ~25, e o backup pode trazer vários.
  for (let i = 0; i < setores.length; i += 40) {
    const { data, error } = await rpcSemTipo<ResultadoImportacao>('fn_banco_horas_importar', {
      p_empresa_id: empresaId,
      p_setores: setores.slice(i, i + 40).map(setorParaRpc),
    });
    if (error) throw new Error(error.message);
    total.novos += data?.novos ?? 0;
    total.trocados += data?.trocados ?? 0;
    total.iguais += data?.iguais ?? 0;
  }
  return total;
}

/** Apaga um relatório (todos os setores daquela data). */
export async function apagarBancoHoras(empresaId: string, saldoEm: string): Promise<number> {
  const { data, error } = await rpcSemTipo<number>('fn_banco_horas_apagar', {
    p_empresa_id: empresaId, p_saldo_em: saldoEm,
  });
  if (error) throw new Error(error.message);
  return data ?? 0;
}

interface LinhaVinculo { empresa_codigo: string; setor_dp: string; setor_id: string }

export async function listarVinculos(empresaId: string): Promise<VinculoBH[]> {
  const { data, error } = await tabelaSemTipo<LinhaVinculo>('banco_horas_mapa')
    .select('empresa_codigo, setor_dp, setor_id')
    .eq('empresa_id', empresaId);
  if (error) throw new Error(error.message);
  return (data ?? []).map(v => ({ empresaCodigo: v.empresa_codigo, setorDp: v.setor_dp, setorId: v.setor_id }));
}

/** Troca os vínculos dos pares listados. Par fora da lista fica como estava. */
export async function salvarVinculos(
  empresaId: string,
  mapa: { empresaCodigo: string; setorDp: string; setorIds: string[] }[],
): Promise<number> {
  const { data, error } = await rpcSemTipo<number>('fn_banco_horas_mapa_salvar', {
    p_empresa_id: empresaId,
    p_mapa: mapa.map(m => ({ empresa_codigo: m.empresaCodigo, setor_dp: m.setorDp, setor_ids: m.setorIds })),
  });
  if (error) throw new Error(error.message);
  return data ?? 0;
}
