/**
 * pixTelaComum.ts — o que as partes da tela do Pix automático dividem.
 *
 * Constantes, tipos e auxiliares que moravam no alto de `PixAutomatico.tsx`
 * até a tela ser dividida em sub-abas com arquivo próprio (30/10/2026).
 */
import { supabase } from '@/lib/supabase';
import type {
  PixAutoAcordo, PixAutoConfig, PixAutoSaldo, PixAutoStatus, PixLogItem,
  PixPremiacaoPagamento, DonoDeNrPix,
} from '@/services/pix_automatico.service';
import type { OperadorInfo, VinculoDeClone } from './pixAutomaticoView';

/**
 * Dois mapas de dono de NR têm o mesmo conteúdo?
 *
 * `fetchDonosDeNrPix` devolve um mapa novo a cada leitura, e a aba recarrega
 * depois de toda ação. Guardar o objeto novo faria re-renderizar quem depende
 * dele — o formulário de registro — com exatamente os mesmos NRs e donos
 * dentro.
 *
 * Compara só o `operadorId`: é o que decide o caminho («é meu» × «é de outro»).
 * Nome e setor mudam de lugar sem mudar a decisão.
 */
export function donosIguais(
  a: Map<string, DonoDeNrPix[]>,
  b: Map<string, DonoDeNrPix[]>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [nr, donos] of a) {
    const outros = b.get(nr);
    if (!outros || outros.length !== donos.length) return false;
    if (donos.some((d, i) => d.operadorId !== outros[i].operadorId || d.mes !== outros[i].mes)) return false;
  }
  return true;
}

/**
 * Equipe com o setor a que pertence.
 *
 * O `setor_id` não é enfeite: a consulta traz as equipes da EMPRESA para quem
 * enxerga mais de um setor, e sem ele não há como responder «quais são as
 * equipes do Play 3» depois que a lista já chegou.
 */
export interface EquipeComSetor { id: string; nome: string; setor_id: string | null }

/**
 * Os clones da empresa, cada um com o setor da equipe e o do cadastro.
 *
 * Numa ida só, pelos dois vínculos da tabela: as consultas de equipes e perfis
 * da tela vêm presas ao setor do líder e não dizem onde a pessoa dele foi
 * clonada. Falha aqui não derruba a aba: sem clones, vale só o carimbo, que é
 * o comportamento de antes.
 *
 * O vínculo é apontado pela coluna, não pelo nome da FK: na fase 7 a tabela
 * vira view de `equipe_membros` e as FKs antigas deixam de valer para ela.
 */
export async function lerVinculosDeClone(empresaId: string): Promise<VinculoDeClone[]> {
  const { data, error } = await supabase
    .from('equipe_operadores_clones')
    .select('operador_id, equipe_id, equipe:equipes!equipe_id(setor_id), '
      + 'operador:perfis!operador_id(setor_id)')
    .eq('empresa_id', empresaId);
  if (error) {
    console.warn('[PixAutomatico] clones:', error.message);
    return [];
  }
  type Linha = {
    operador_id: string; equipe_id: string;
    equipe: { setor_id: string | null } | null;
    operador: { setor_id: string | null } | null;
  };
  return ((data ?? []) as unknown as Linha[]).map(l => ({
    operador_id:       l.operador_id,
    equipe_id:         l.equipe_id,
    setor_da_equipe:   l.equipe?.setor_id ?? null,
    setor_do_cadastro: l.operador?.setor_id ?? null,
  }));
}

/** Mesmo conteúdo — para não redesenhar a tela a cada `carregar`. */
export function mapasDeSetoresIguais(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(k => b[k] && a[k].length === b[k].length && a[k].every((s, i) => s === b[k][i]));
}

/**
 * «Todos os setores» ESCOLHIDO, que não é o mesmo que ninguém ter escolhido.
 *
 * `filtroSetor` guardava `''` para os dois casos, e enquanto «todos» era o
 * padrão isso bastava. Agora a aba abre num setor — ver `setorFoco` —, e sem
 * separar as duas coisas quem escolhesse «todos» voltaria ao setor padrão no
 * render seguinte, sem entender por que o clique não pegou.
 */
export const TODOS_SETORES = '__todos__';

/**
 * O rascunho dos campos digitados (formulário, edição de linha, config do
 * setor): lembrado entre montagens, mas só em memória. Atravessa a troca de
 * sub-aba e a ida a outra tela, como os filtros; não atravessa o F5, como
 * nunca atravessou. Some no logout, junto com o resto do depósito.
 */
export const SO_MEMORIA = { persistir: false } as const;

/**
 * A última resposta da aba, guardada para a volta não custar um esqueleto.
 *
 * Só o que a tela PINTA. Nada de estado de edição, seleção ou carregamento:
 * reabrir com um diálogo pela metade seria pior que reabrir vazio.
 */
/**
 * Setor como a aba guarda: o nome, e `ativo`/`tipo` para a barra saber quem
 * fica fora do filtro (ver `lib/setoresDosFiltros`). A lista inteira continua
 * servindo de mapa de nomes — a linha antiga de um setor inativo segue com
 * nome na tabela.
 */
export interface SetorDaAba { id: string; nome: string; ativo?: boolean | null; tipo?: string | null }

export interface InstantaneoPix {
  itens: PixAutoAcordo[];
  configs: Record<string, PixAutoConfig>;
  operadores: OperadorInfo[];
  equipes: EquipeComSetor[];
  setores: SetorDaAba[];
  saldos: PixAutoSaldo[];
  pagamentos: PixPremiacaoPagamento[];
  /** Sem ele, a linha compartilhada sumiria da tabela até a releitura. */
  setoresDaPessoa?: Record<string, string[]>;
}

export const STATUS_INFO: Record<PixAutoStatus, { label: string; cls: string }> = {
  pendente:    { label: 'Pendente',    cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-500 border-sky-500/30' },
  aprovado:    { label: 'Aprovado',    cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/30' },
  desaprovado: { label: 'Desaprovado', cls: 'bg-red-500/10 text-red-500 border-red-500/30' },
};

export function fmtPct(pct: number): string {
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
}

/** Rótulo curto de cada ação do log. */
export const PIX_LOG_LABEL: Record<PixLogItem['acao'], string> = {
  registrado:         'Registro',
  restaurado:         'Restauro',
  editado:            'Edição',
  aprovado:           'Aprovado',
  desaprovado:        'Desaprovado',
  voltou_pendente:    'Pendente',
  pago:               'Pago',
  pagamento_desfeito: 'Desfeito',
  excluido:           'Excluído',
  nr_mantido:         'NR mantido',
};

/**
 * Cor por ação. Mesma paleta dos botões da tabela: aprovar é verde, desaprovar
 * e excluir são vermelhos, pagar é o teal do botão "Pagar". Quem já usa a aba
 * lê o histórico sem aprender uma legenda nova.
 */
export const PIX_LOG_ESTILO: Record<PixLogItem['acao'], string> = {
  registrado:         'border-border text-muted-foreground',
  restaurado:         'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  editado:            'border-primary/30 bg-primary/10 text-primary',
  aprovado:           'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  desaprovado:        'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  voltou_pendente:    'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  pago:               'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400',
  pagamento_desfeito: 'border-border text-muted-foreground',
  excluido:           'border-destructive/40 bg-destructive/10 text-destructive',
  nr_mantido:         'border-primary/30 bg-primary/10 text-primary',
};
