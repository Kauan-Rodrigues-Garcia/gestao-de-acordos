/**
 * contribuicaoReceptivo.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Contribuição Receptivo por setor/mês (BookPlay) — tabela
 * `contribuicao_receptivo` (migration 20260730a).
 *
 * Antes o valor vivia em `localStorage`, então existia só no navegador de quem
 * digitou: dois líderes do mesmo setor viam números diferentes e trocar de
 * máquina zerava o card. Agora é uma linha por (empresa, setor, mês),
 * compartilhada.
 *
 * Tolerante à migration ausente, como `metasConfig.service`: enquanto o SQL não
 * for aplicado, `dbAtiva` volta false e a tela cai no localStorage antigo — o
 * card continua funcionando exatamente como antes em vez de ficar vazio.
 *
 * ## O valor passou a vir do 59 (14/09/2026)
 *
 * A contribuição é o `Integral` que o Receptivo cobra PARA outro setor. O 59
 * traz esse dinheiro, e desde a sincronização do 59 ele não é mais digitado:
 * nos meses com lote do 59 o acumulado sai de `buscarIntegralRecebidoPorSetor`,
 * e o que estiver gravado em `acumulado` na tabela é ignorado — somar os dois
 * dobraria a contribuição. A tabela continua guardando a META, a única parte
 * que o líder ainda escolhe.
 *
 * Mês SEM lote do 59 (os anteriores à troca de fonte) segue com o valor
 * digitado: é o que valia naquele mês, e reescrevê-lo mudaria o passado.
 */
import { supabase } from '@/lib/supabase';
import { buscarIntegralRecebidoPorSetor } from '@/services/mestre/diretoriaSetores.service';
import type { EscopoAnalitico } from './escopoAnalitico';

export interface ContribuicaoReceptivo {
  /** O que o card mostra e o que soma no card do setor. */
  acumulado: number;
  /** Meta de contribuição, digitada pelo líder. Não soma em lugar nenhum. */
  meta:      number;
  /** De onde veio o acumulado: do relatório 59 ou do valor digitado (mês sem 59). */
  origem?:   'relatorio_59' | 'manual';
}

/**
 * O card do Receptivo só aparece quando tem valor para mostrar.
 *
 * Pedido de 14/09/2026, em duas etapas. Primeiro: todo setor mostrava um card
 * zerado, inclusive os que não recebem nada do Receptivo. Depois, com o valor
 * vindo do 59: o card aparece quando existe contribuição, e só então — a meta
 * sozinha não o faz aparecer, e o botão «Adicionar Contribuição Receptivo» saiu.
 */
export function receptivoPreenchido(dados: ContribuicaoReceptivo | null | undefined): boolean {
  return !!dados && (Number(dados.acumulado) || 0) > 0;
}

/**
 * Quanto do Receptivo entra no acumulado que a tela está mostrando.
 *
 * ## O erro que esta função existe para não deixar acontecer
 *
 * O valor do card é do SETOR — digitado à mão, sem dono. O painel somava por
 * cima sempre que o escopo era 'setor' ou 'empresa'. Só que o escopo do
 * dashboard NÃO diz de quem são os dados: para um operador comum ele fica
 * travado no setor DELE (`setorTravado`), enquanto a RPC devolve apenas as
 * linhas dele (`fn_analitico_dashboard_mes`: operador → próprias linhas,
 * líder+ → empresa).
 *
 * O resultado era o operador ver "R$ x recebido + R$ 3.936,55 do receptivo" no
 * próprio total acumulado — dinheiro do setor inteiro creditado a uma pessoa.
 *
 * Daí `veDadosDeOutros`: o Receptivo só soma quando a tela está de fato
 * mostrando um AGREGADO (líder+ olhando o setor). Não é uma questão de
 * permissão — o operador pode saber quanto o setor fez —, é de a quem o número
 * está sendo atribuído.
 *
 * ## A empresa não soma (14/09/2026)
 *
 * A contribuição é o Integral que o Receptivo cobrou PARA outro setor, e esse
 * dinheiro já está no total do próprio Receptivo — que está no total da
 * empresa. Somar no setor que recebeu é a regra; somar de novo na empresa
 * contaria a mesma cobrança duas vezes. É a regra do total da empresa no Painel
 * Diretoria, que também fica «sem a 2ª perna do Integral».
 */
export function receptivoDoEscopo(params: {
  escopo:   EscopoAnalitico | null;
  porSetor: Record<string, number>;
  /** true = a tela mostra dados de mais gente que o próprio usuário (líder+). */
  veDadosDeOutros: boolean;
}): number {
  const { escopo, porSetor, veDadosDeOutros } = params;
  if (!escopo || !veDadosDeOutros) return 0;
  // Empresa: já está no total do Receptivo (ver acima). Equipe ou um operador:
  // o valor não é daquele conjunto.
  if (escopo.tipo === 'setor') return Number(porSetor[escopo.setorId]) || 0;
  return 0;
}

export interface ResultadoContribuicoes {
  /** setor_id → valores. Setor sem linha no banco nem valor no 59 não aparece. */
  porSetor: Record<string, ContribuicaoReceptivo>;
  /** false = migration 20260730a ainda não aplicada; use o fallback local. */
  dbAtiva:  boolean;
  /** true = o acumulado veio do 59; a tela não oferece mais editá-lo. */
  do59:     boolean;
}

/** Erro de "tabela/coluna não existe" — migration pendente, não falha real. */
function ehMigrationAusente(mensagem: string): boolean {
  return /relation|does not exist|schema cache/i.test(mensagem);
}

/** A tabela: meta sempre; acumulado só vale em mês sem 59. */
async function lerTabela(
  empresaId: string, mes: string,
): Promise<{ linhas: Record<string, ContribuicaoReceptivo>; dbAtiva: boolean }> {
  try {
    const { data, error } = await supabase
      .from('contribuicao_receptivo')
      .select('setor_id, acumulado, meta')
      .eq('empresa_id', empresaId)
      .eq('mes', mes);

    if (error) {
      const pendente = ehMigrationAusente(error.message);
      if (!pendente) console.warn('[contribuicaoReceptivo] erro na leitura:', error.message);
      return { linhas: {}, dbAtiva: !pendente };
    }

    const linhas: Record<string, ContribuicaoReceptivo> = {};
    for (const linha of (data ?? []) as { setor_id: string; acumulado: number | string; meta: number | string }[]) {
      linhas[linha.setor_id] = {
        // NUMERIC volta como string no postgres-js — Number() sempre.
        acumulado: Number(linha.acumulado) || 0,
        meta:      Number(linha.meta)      || 0,
        origem:    'manual',
      };
    }
    return { linhas, dbAtiva: true };
  } catch {
    return { linhas: {}, dbAtiva: false };
  }
}

/**
 * As contribuições de TODOS os setores da empresa no mês.
 *
 * Uma leitura para o mês inteiro (em vez de uma por setor) porque a aba
 * renderiza vários setores em sequência para admin/diretoria sem setor. As duas
 * fontes — a tabela e o 59 — vão juntas.
 */
export async function buscarContribuicoesReceptivo(
  empresaId: string,
  mes:       string,
): Promise<ResultadoContribuicoes> {
  const [tabela, do59] = await Promise.all([
    lerTabela(empresaId, mes),
    buscarIntegralRecebidoPorSetor(empresaId, mes),
  ]);

  if (!do59) return { porSetor: tabela.linhas, dbAtiva: tabela.dbAtiva, do59: false };

  // Mês com 59: o acumulado é o do relatório, para todo setor. O digitado não
  // volta a somar nem onde o 59 não trouxe nada.
  const porSetor: Record<string, ContribuicaoReceptivo> = {};
  for (const [sid, linha] of Object.entries(tabela.linhas)) {
    porSetor[sid] = { acumulado: do59[sid] ?? 0, meta: linha.meta, origem: 'relatorio_59' };
  }
  for (const [sid, valor] of Object.entries(do59)) {
    if (!porSetor[sid]) porSetor[sid] = { acumulado: valor, meta: 0, origem: 'relatorio_59' };
  }
  return { porSetor, dbAtiva: tabela.dbAtiva, do59: true };
}

/**
 * Grava só a META de contribuição — o lápis do card (14/09/2026).
 *
 * O acumulado vem do 59 e não é mais digitado. O upsert NÃO leva a coluna
 * `acumulado`: na linha nova ela nasce 0 (DEFAULT), e na existente o valor
 * antigo fica como estava — é o registro dos meses de antes do 59.
 */
export async function salvarMetaContribuicaoReceptivo(params: {
  empresaId:      string;
  setorId:        string;
  mes:            string;
  meta:           number;
  atualizadoPor?: string | null;
}): Promise<boolean> {
  const { empresaId, setorId, mes, meta, atualizadoPor } = params;
  try {
    const { error } = await supabase
      .from('contribuicao_receptivo')
      .upsert(
        {
          empresa_id:     empresaId,
          setor_id:       setorId,
          mes,
          meta,
          atualizado_por: atualizadoPor ?? null,
        },
        { onConflict: 'empresa_id,setor_id,mes' },
      );
    if (error) {
      console.warn('[contribuicaoReceptivo] erro ao salvar a meta:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[contribuicaoReceptivo] exceção ao salvar a meta:', e);
    return false;
  }
}

/**
 * Grava a contribuição do setor no mês (cria ou atualiza).
 *
 * Do tempo em que o acumulado era digitado. A tela não usa mais — ver
 * `salvarMetaContribuicaoReceptivo`.
 *
 * Upsert pela UNIQUE (empresa_id, setor_id, mes): dois líderes salvando ao mesmo
 * tempo resultam numa linha só, a última vence — em vez de duas linhas
 * duplicadas somando errado no card do setor.
 *
 * @returns `true` se gravou. `false` cobre tanto migration pendente quanto
 *          recusa da RLS (operador tentando editar) — quem chama avisa na tela.
 */
export async function salvarContribuicaoReceptivo(params: {
  empresaId:      string;
  setorId:        string;
  mes:            string;
  acumulado:      number;
  meta:           number;
  atualizadoPor?: string | null;
}): Promise<boolean> {
  const { empresaId, setorId, mes, acumulado, meta, atualizadoPor } = params;
  try {
    const { error } = await supabase
      .from('contribuicao_receptivo')
      .upsert(
        {
          empresa_id:     empresaId,
          setor_id:       setorId,
          mes,
          acumulado,
          meta,
          atualizado_por: atualizadoPor ?? null,
        },
        { onConflict: 'empresa_id,setor_id,mes' },
      );

    if (error) {
      console.warn('[contribuicaoReceptivo] erro ao salvar:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[contribuicaoReceptivo] exceção ao salvar:', e);
    return false;
  }
}
