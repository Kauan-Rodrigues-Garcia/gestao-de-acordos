/**
 * Escopos de dados pertencem à aba que os consome.
 *
 * Manter o mapeamento centralizado evita que uma permissão do Dashboard volte
 * a liberar, por acidente, Acordos, Pix, Tickets ou Lixeira.
 */
export type AbaComEscopo =
  | 'dashboard'
  | 'acordos'
  | 'pix_automatico'
  | 'lixeira'
  | 'tickets';

export type NivelEscopo = 'individual' | 'equipe' | 'setor' | 'todos_setores';

type TemPermissao = (permissao: string) => boolean;

export const PERMISSOES_ESCOPO = {
  dashboard: {
    individual: { permissao: 'dashboard_escopo_individual' },
    equipe: { permissao: 'dashboard_escopo_equipe' },
    setor: { permissao: 'dashboard_escopo_setor' },
    todos_setores: { permissao: 'dashboard_escopo_todos_setores' },
  },
  acordos: {
    individual: { permissao: 'acordos_escopo_individual' },
    equipe: { permissao: 'acordos_escopo_equipe' },
    setor: { permissao: 'acordos_escopo_setor' },
    todos_setores: { permissao: 'acordos_escopo_todos_setores' },
  },
  pix_automatico: {
    individual: { permissao: 'pix_escopo_individual' },
    equipe: { permissao: 'pix_escopo_equipe' },
    setor: { permissao: 'pix_escopo_setor' },
    todos_setores: { permissao: 'pix_escopo_empresa' },
  },
  lixeira: {
    individual: { permissao: 'lixeira_escopo_individual' },
    equipe: { permissao: 'lixeira_escopo_equipe' },
    setor: { permissao: 'lixeira_escopo_setor' },
    todos_setores: { permissao: 'lixeira_escopo_todos_setores' },
  },
  tickets: {
    individual: { permissao: 'tickets_escopo_individual' },
    equipe: { permissao: 'tickets_escopo_equipe' },
    setor: { permissao: 'tickets_escopo_setor' },
  },
} as const;

const ORDEM_ESCOPO: NivelEscopo[] = ['individual', 'equipe', 'setor', 'todos_setores'];

export function temEscopo(
  aba: AbaComEscopo,
  nivel: NivelEscopo,
  temPermissao: TemPermissao,
): boolean {
  const meta = PERMISSOES_ESCOPO[aba][nivel as keyof (typeof PERMISSOES_ESCOPO)[typeof aba]];
  return !!meta && temPermissao(meta.permissao);
}

export function escoposPermitidos(
  aba: AbaComEscopo,
  temPermissao: TemPermissao,
): NivelEscopo[] {
  return ORDEM_ESCOPO.filter(nivel => temEscopo(aba, nivel, temPermissao));
}

export function maiorEscopoPermitido(
  aba: AbaComEscopo,
  temPermissao: TemPermissao,
): NivelEscopo | null {
  return [...escoposPermitidos(aba, temPermissao)].pop() ?? null;
}
