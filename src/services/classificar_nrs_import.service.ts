/**
 * Classificação em batch de NRs durante a importação de planilha Excel.
 *
 * Recebe uma lista de NRs extraídos da planilha + contexto do operador que
 * está importando, e retorna por NR uma das categorias:
 *
 *  - 'novo'         → NR ainda não existe no banco em nenhum acordo ativo.
 *  - 'disponivel'   → NR existe registrado historicamente mas sem vínculo ativo
 *                     (na prática, o lote atual de verificação só considera
 *                     acordos ativos; NRs ausentes deste lote são 'novo' ou
 *                     'disponivel' dependendo de histórico — como não temos
 *                     um serviço histórico separado, 'disponivel' fica
 *                     reservado para futura expansão e, hoje, é tratado
 *                     igual a 'novo').
 *  - 'duplicado'    → NR pertence a outro operador com vínculo ativo e
 *                     nem o operador atual nem o dono têm lógica
 *                     Direto/Extra ativa → precisa autorização.
 *  - 'extra'        → Operador atual TEM lógica Direto/Extra ativa; o NR
 *                     entra como EXTRA vinculado ao acordo direto existente.
 *  - 'direto'       → Operador atual NÃO tem lógica ativa, mas o operador
 *                     dono TEM. O NR vira DIRETO para o operador atual, e
 *                     o acordo anterior é rebaixado a EXTRA (Caso B cruzado).
 *
 * NRs vazios/inválidos recebem a categoria 'novo' (ou null conforme o caller).
 *
 * Essa função é pura em relação ao banco: recebe por injeção as duas
 * funções de consulta para ser fácil de testar.
 */

import type { DiretoExtraConfig } from './direto_extra.service';
import { resolverDiretoExtraAtivo } from './direto_extra.service';

/** Categoria atribuída a cada NR no lote. */
export type CategoriaImport =
  | 'novo'
  | 'disponivel'
  | 'duplicado'
  | 'extra'
  | 'direto';

/** Registro bruto que entra na classificação. Genérico para acomodar
 *  tanto Bookplay (campo `nr_cliente`) quanto PaguePlay (`instituicao`). */
export interface NrImportInput {
  /** Índice original do registro (para casar com o preview). */
  linhaOriginal: number;
  /** Valor do NR já trimado. Pode ser vazio — nesse caso sai 'novo'. */
  nr: string;
}

export interface DuplicadoInfo {
  acordoId:     string;
  operadorId:   string;
  operadorNome: string;
  /**
   * Setor do operador dono do NR. Quando preenchido, a classificação
   * usa este valor direto, sem depender do callback `resolverDadosOperador`
   * (que sofre RLS do classificador). Preenchido por
   * `verificarNrsDuplicadosEmLote` desde 2026-04-22.
   */
  operadorSetorId?:  string | null;
  /** Equipe do operador dono do NR. Ver nota acima. */
  operadorEquipeId?: string | null;
}

export interface ClassificacaoNR {
  linhaOriginal: number;
  nr:            string;
  categoria:     CategoriaImport;
  /** Dados do vínculo existente (quando categoria ∈ {duplicado, extra, direto}). */
  donoAtual?:    DuplicadoInfo;
  /** Para 'direto'/'extra': se o operador atual tem lógica ativa. */
  operadorTemLogica?:    boolean;
  /** Para 'direto'/'extra': se o operador dono tem lógica ativa. */
  donoTemLogica?:        boolean;
  /** Para 'duplicado' bloqueado: true quando precisa de autorização de líder. */
  precisaAutorizacao?:   boolean;
}

export interface ClassificarParams {
  /** Lista de NRs a classificar (com linha original para casar no preview). */
  registros: NrImportInput[];

  /** ID do operador que está importando a planilha. */
  operadorAtualId: string;

  /** Setor do operador atual — para resolver Direto/Extra por precedência. */
  operadorAtualSetorId: string | null | undefined;

  /** Equipe do operador atual — idem. */
  operadorAtualEquipeId: string | null | undefined;

  /** Todas as configs de direto_extra disponíveis no tenant/escopo visível. */
  configsDiretoExtra: DiretoExtraConfig[];

  /**
   * Map devolvido por `verificarNrsDuplicadosEmLote`:
   *   nr (trimado) → { acordoId, operadorId, operadorNome }
   */
  duplicados: Map<string, DuplicadoInfo>;

  /**
   * Função injetada que resolve setor/equipe de um operador dono do NR
   * para avaliar se ele tem lógica Direto/Extra ativa. Se omitida, a
   * classificação assume que NENHUM outro operador tem lógica ativa.
   *
   * Retorna null quando o operador não foi encontrado.
   */
  resolverDadosOperador?: (operadorId: string) => Promise<{
    setorId:  string | null;
    equipeId: string | null;
  } | null>;
}

/**
 * Classifica cada registro do lote.
 *
 * Regra:
 *  - Se NR ausente → 'novo'.
 *  - Se não há duplicado → 'novo'.
 *  - Se duplicado é do próprio operador atual → marcamos como 'duplicado'
 *    (o caller deve remover/alertar — NÃO tentar criar; o fluxo existente
 *    de `confirmarImportacao` já descarta esses casos antes).
 *  - Se operador atual tem lógica → 'extra'.
 *  - Senão, se operador dono tem lógica → 'direto' (caso B cruzado).
 *  - Senão → 'duplicado' com precisaAutorizacao=true.
 */
export async function classificarNrsImportados(
  params: ClassificarParams,
): Promise<ClassificacaoNR[]> {
  const {
    registros,
    operadorAtualId,
    operadorAtualSetorId,
    operadorAtualEquipeId,
    configsDiretoExtra,
    duplicados,
    resolverDadosOperador,
  } = params;

  const atualTemLogica = resolverDiretoExtraAtivo({
    userId:       operadorAtualId,
    userSetorId:  operadorAtualSetorId,
    userEquipeId: operadorAtualEquipeId,
    configs:      configsDiretoExtra,
  });

  // Cache de "operador X tem lógica ativa?" para evitar rodadas redundantes.
  const cacheLogicaOperador = new Map<string, boolean>();

  async function donoTemLogicaAtiva(dup: DuplicadoInfo): Promise<boolean> {
    const donoId = dup.operadorId;
    if (donoId === operadorAtualId) return atualTemLogica;
    if (cacheLogicaOperador.has(donoId)) return cacheLogicaOperador.get(donoId)!;

    // Preferência: usar setor/equipe embutidos no próprio DuplicadoInfo.
    // Assim a classificação NÃO depende de RLS sobre `perfis` no contexto do
    // classificador — corrige bug em que operador Carlos via "duplicado"
    // enquanto admin via "direto" para o mesmo NR.
    let setorId:  string | null | undefined = dup.operadorSetorId;
    let equipeId: string | null | undefined = dup.operadorEquipeId;

    // Fallback (retrocompat): se o DuplicadoInfo não trouxer os campos
    // embutidos, tenta o callback de resolução.
    const precisaFallback =
      setorId === undefined && equipeId === undefined;

    if (precisaFallback) {
      if (!resolverDadosOperador) {
        cacheLogicaOperador.set(donoId, false);
        return false;
      }
      const dados = await resolverDadosOperador(donoId);
      if (!dados) {
        cacheLogicaOperador.set(donoId, false);
        return false;
      }
      setorId  = dados.setorId;
      equipeId = dados.equipeId;
    }

    const ativo = resolverDiretoExtraAtivo({
      userId:       donoId,
      userSetorId:  setorId  ?? null,
      userEquipeId: equipeId ?? null,
      configs:      configsDiretoExtra,
    });
    cacheLogicaOperador.set(donoId, ativo);
    return ativo;
  }

  const resultado: ClassificacaoNR[] = [];

  for (const r of registros) {
    const nr = (r.nr ?? '').trim();
    if (!nr) {
      resultado.push({ linhaOriginal: r.linhaOriginal, nr: '', categoria: 'novo' });
      continue;
    }
    const dup = duplicados.get(nr);
    if (!dup) {
      resultado.push({ linhaOriginal: r.linhaOriginal, nr, categoria: 'novo' });
      continue;
    }

    // Duplicado pertence ao próprio operador → devolve 'duplicado' sem autorização.
    // O caller (UI) deve tratar: não faz sentido re-importar o próprio NR.
    if (dup.operadorId === operadorAtualId) {
      resultado.push({
        linhaOriginal: r.linhaOriginal,
        nr,
        categoria: 'duplicado',
        donoAtual: dup,
        operadorTemLogica: atualTemLogica,
        donoTemLogica:     atualTemLogica,
        precisaAutorizacao: false, // próprio operador: nunca precisa de líder
      });
      continue;
    }

    // Dono é outro operador. Precisamos checar lógica dos dois lados.
    if (atualTemLogica) {
      resultado.push({
        linhaOriginal: r.linhaOriginal,
        nr,
        categoria:        'extra',
        donoAtual:        dup,
        operadorTemLogica: true,
      });
      continue;
    }

    const donoLogica = await donoTemLogicaAtiva(dup);
    if (donoLogica) {
      // Caso B cruzado: operador atual vira DIRETO, dono anterior vira EXTRA.
      resultado.push({
        linhaOriginal: r.linhaOriginal,
        nr,
        categoria:     'direto',
        donoAtual:     dup,
        operadorTemLogica: false,
        donoTemLogica:     true,
      });
      continue;
    }

    // Nenhum dos dois tem lógica → bloqueado, precisa autorização.
    resultado.push({
      linhaOriginal: r.linhaOriginal,
      nr,
      categoria:          'duplicado',
      donoAtual:          dup,
      operadorTemLogica:  false,
      donoTemLogica:      false,
      precisaAutorizacao: true,
    });
  }

  return resultado;
}

/** Agrupa a classificação por categoria — útil para exibir totais no preview. */
export function agruparPorCategoria(lista: ClassificacaoNR[]): Record<CategoriaImport, number> {
  const base: Record<CategoriaImport, number> = {
    novo: 0, disponivel: 0, duplicado: 0, extra: 0, direto: 0,
  };
  for (const c of lista) base[c.categoria]++;
  return base;
}
