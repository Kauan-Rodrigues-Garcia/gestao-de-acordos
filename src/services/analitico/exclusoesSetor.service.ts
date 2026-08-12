/**
 * exclusoesSetor.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Quais origens do relatório ficam FORA do acumulado de um setor, por mês —
 * tabela `analitico_exclusoes_setor` (migration 20260812e).
 *
 * Ausência de linha significa "tudo conta", então a tabela vazia reproduz
 * exatamente o comportamento anterior. Tolerante à migration ausente, como
 * `contribuicaoReceptivo.service`: enquanto o SQL não for aplicado, `dbAtiva`
 * volta false, a tela esconde o controle e o acumulado segue somando tudo — em
 * vez de a aba quebrar.
 */
import { supabase } from '@/lib/supabase';
import { ORIGEM_SEM_OPERADOR, type OrigemKey } from './composicaoAcumulado';

const TABELA = 'analitico_exclusoes_setor';

export interface ResultadoExclusoes {
  /** setor_id do card → origens desmarcadas. Setor sem exclusão não aparece. */
  porSetor: Record<string, Set<OrigemKey>>;
  /** false = migration 20260812e pendente; o controle não deve ser exibido. */
  dbAtiva:  boolean;
}

/** Erro de "tabela/coluna não existe" — migration pendente, não falha real. */
function ehMigrationAusente(mensagem: string): boolean {
  return /relation|does not exist|schema cache/i.test(mensagem);
}

interface LinhaExclusao {
  setor_id: string;
  setor_origem_id: string | null;
}

/**
 * Lê as exclusões de TODOS os setores da empresa no mês, numa query só.
 *
 * Uma query para o mês inteiro porque diretoria/admin renderiza vários setores
 * em sequência — uma por setor multiplicaria idas ao banco por nada.
 */
export async function buscarExclusoesSetor(
  empresaId: string,
  mes:       string,   // 'yyyy-MM'
): Promise<ResultadoExclusoes> {
  try {
    const { data, error } = await supabase
      .from(TABELA)
      .select('setor_id, setor_origem_id')
      .eq('empresa_id', empresaId)
      .eq('mes', mes);

    if (error) {
      const pendente = ehMigrationAusente(error.message);
      if (!pendente) console.warn('[exclusoesSetor] erro na leitura:', error.message);
      return { porSetor: {}, dbAtiva: !pendente };
    }

    const porSetor: Record<string, Set<OrigemKey>> = {};
    for (const linha of (data ?? []) as LinhaExclusao[]) {
      // `setor_origem_id` nulo é a origem "sem operador" — ver a migration.
      const chave = linha.setor_origem_id ?? ORIGEM_SEM_OPERADOR;
      (porSetor[linha.setor_id] ??= new Set()).add(chave);
    }
    return { porSetor, dbAtiva: true };
  } catch {
    return { porSetor: {}, dbAtiva: false };
  }
}

/**
 * Grava a composição de UM setor num mês: apaga o que havia e insere as origens
 * desmarcadas.
 *
 * Apagar-e-inserir em vez de diferenciar item a item porque o conjunto é
 * minúsculo (uma origem por setor que apareceu no relatório) e porque o estado
 * final é o que a tela mostra — um diff daria a mesma coisa com mais chance de
 * ficar meio gravado. A trilha de auditoria registra cada linha, então "voltou
 * a incluir" continua tendo dono e hora.
 *
 * @returns `false` cobre migration pendente e recusa da RLS (operador tentando
 *          editar) — quem chama avisa na tela.
 */
export async function salvarExclusoesSetor(params: {
  empresaId:  string;
  setorId:    string;
  mes:        string;
  /** Origens que ficam FORA. Vazio = tudo volta a contar. */
  excluidas:  ReadonlySet<OrigemKey>;
  usuarioId?: string | null;
}): Promise<boolean> {
  const { empresaId, setorId, mes, excluidas, usuarioId } = params;
  try {
    const { error: errDel } = await supabase
      .from(TABELA)
      .delete()
      .eq('empresa_id', empresaId)
      .eq('setor_id', setorId)
      .eq('mes', mes);
    if (errDel) {
      console.warn('[exclusoesSetor] erro ao limpar:', errDel.message);
      return false;
    }

    if (excluidas.size === 0) return true;

    const linhas = [...excluidas].map(chave => ({
      empresa_id:      empresaId,
      setor_id:        setorId,
      mes,
      setor_origem_id: chave === ORIGEM_SEM_OPERADOR ? null : chave,
      excluido_por:    usuarioId ?? null,
    }));

    const { error } = await supabase.from(TABELA).insert(linhas);
    if (error) {
      console.warn('[exclusoesSetor] erro ao gravar:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[exclusoesSetor] exceção ao gravar:', e);
    return false;
  }
}
