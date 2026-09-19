/**
 * src/lib/cargos-ordem.ts — a hierarquia de exibição dos cargos.
 *
 * Pedido de 19/09/2026 para a aba Usuários: «cada setor agora terá uma
 * separação por cargo, gerentes aparecem primeiro, depois líderes, elite,
 * operação por último». A lista de um setor era uma fileira única em ordem
 * alfabética, e achar o gerente no meio de quarenta operadores era rolar.
 *
 * É ORDEM DE LEITURA, não regra de acesso: quem vê o quê continua saindo do
 * painel de permissões. Cargo que não está aqui (um novo, criado amanhã) cai
 * num bloco próprio antes da operação — aparecer no lugar errado é melhor que
 * sumir da lista.
 */
import { PERFIL_LABELS } from '@/lib/index';

export interface BlocoDeCargo {
  /** Chave estável do bloco — o cargo, ou `administracao` para os dois de admin. */
  chave: string;
  /** Rótulo do cabeçalho do bloco, no plural quando cabe. */
  rotulo: string;
  /** O cargo que dá a cor do bloco (`PERFIL_COLORS`). */
  cargo: string;
}

/** Da cúpula para a operação. A operação é sempre a última. */
const BLOCOS: (BlocoDeCargo & { cargos: string[] })[] = [
  { chave: 'administracao', rotulo: 'Administração', cargo: 'administrador', cargos: ['super_admin', 'administrador'] },
  { chave: 'diretoria',     rotulo: 'Diretoria',      cargo: 'diretoria',     cargos: ['diretoria'] },
  { chave: 'gerencia',      rotulo: 'Gerência',       cargo: 'gerencia',      cargos: ['gerencia'] },
  { chave: 'lider',         rotulo: 'Líderes',        cargo: 'lider',         cargos: ['lider'] },
  { chave: 'elite',         rotulo: 'Elite',          cargo: 'elite',         cargos: ['elite'] },
  { chave: 'ouvidoria',     rotulo: 'Ouvidoria',      cargo: 'ouvidoria',     cargos: ['ouvidoria'] },
  { chave: 'assistente_adm', rotulo: 'Assistente ADM', cargo: 'assistente_adm', cargos: ['assistente_adm'] },
  { chave: 'rh',            rotulo: 'RH',             cargo: 'rh',            cargos: ['rh'] },
  { chave: 'operador',      rotulo: 'Operação',       cargo: 'operador',      cargos: ['operador'] },
];

const POSICAO = new Map<string, number>();
BLOCOS.forEach((b, i) => b.cargos.forEach(c => POSICAO.set(c, i)));
/** Cargo desconhecido: logo antes da operação. */
const POSICAO_DESCONHECIDO = BLOCOS.length - 1.5;

function blocoDoCargo(cargo: string): BlocoDeCargo & { posicao: number } {
  const i = POSICAO.get(cargo);
  if (i !== undefined) {
    const { chave, rotulo, cargo: cor } = BLOCOS[i];
    return { chave, rotulo, cargo: cor, posicao: i };
  }
  return { chave: cargo, rotulo: PERFIL_LABELS[cargo] ?? cargo, cargo, posicao: POSICAO_DESCONHECIDO };
}

/**
 * As pessoas de um setor, separadas por cargo na ordem da hierarquia, e em
 * ordem alfabética dentro de cada bloco. Bloco vazio não aparece.
 */
export function separarPorCargo<T extends { perfil: string; nome: string }>(
  pessoas: T[],
): (BlocoDeCargo & { pessoas: T[] })[] {
  const porChave = new Map<string, BlocoDeCargo & { posicao: number; pessoas: T[] }>();
  for (const p of pessoas) {
    const bloco = blocoDoCargo(p.perfil);
    const atual = porChave.get(bloco.chave);
    if (atual) atual.pessoas.push(p);
    else porChave.set(bloco.chave, { ...bloco, pessoas: [p] });
  }
  return [...porChave.values()]
    .sort((a, b) => a.posicao - b.posicao || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
    .map(({ chave, rotulo, cargo, pessoas: lista }) => ({
      chave, rotulo, cargo,
      pessoas: [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    }));
}
