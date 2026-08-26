import { PERFIL_LABELS } from '@/lib/index';

/**
 * Cargos que podem ser escolhidos como destino de uma nova conversa.
 *
 * Esta lista espelha o CHECK de `perfis.perfil`. O cargo de quem envia não
 * decide nada por si só: cada item abaixo aponta para uma permissão do painel,
 * resolvida pelo cargo e, quando existir, pela exceção individual.
 */
export const CARGOS_ALVO_CHAT = [
  'operador',
  'lider',
  'elite',
  'gerencia',
  'diretoria',
  'ouvidoria',
  'rh',
  'administrador',
  'super_admin',
] as const;

export type CargoAlvoChat = typeof CARGOS_ALVO_CHAT[number];

export const CHAVE_CARGO_CHAT: Record<CargoAlvoChat, string> = {
  operador:      'chat_cargo_operador',
  lider:         'chat_cargo_lider',
  elite:         'chat_cargo_elite',
  gerencia:      'chat_cargo_gerencia',
  diretoria:     'chat_cargo_diretoria',
  ouvidoria:     'chat_cargo_ouvidoria',
  rh:            'chat_cargo_rh',
  administrador: 'chat_cargo_administrador',
  super_admin:   'chat_cargo_super_admin',
};

export function ehCargoAlvoChat(cargo: string): cargo is CargoAlvoChat {
  return (CARGOS_ALVO_CHAT as readonly string[]).includes(cargo);
}

export function cargoDaPermissaoChat(chave: string): CargoAlvoChat | null {
  return CARGOS_ALVO_CHAT.find(cargo => CHAVE_CARGO_CHAT[cargo] === chave) ?? null;
}

export function rotuloCargoChat(cargo: CargoAlvoChat): string {
  return PERFIL_LABELS[cargo] ?? cargo;
}

/**
 * Quais cargos a pessoa logada pode procurar para iniciar conversa.
 *
 * As chamadas literais são deliberadas: além de deixar o contrato auditável,
 * fazem o teste do catálogo provar que todos os nove botões controlam código
 * real — nenhum pode virar uma permissão apenas decorativa.
 */
export function cargosChatLiberados(
  temPermissao: (chave: string) => boolean,
): CargoAlvoChat[] {
  const liberados: CargoAlvoChat[] = [];
  if (temPermissao('chat_cargo_operador')) liberados.push('operador');
  if (temPermissao('chat_cargo_lider')) liberados.push('lider');
  if (temPermissao('chat_cargo_elite')) liberados.push('elite');
  if (temPermissao('chat_cargo_gerencia')) liberados.push('gerencia');
  if (temPermissao('chat_cargo_diretoria')) liberados.push('diretoria');
  if (temPermissao('chat_cargo_ouvidoria')) liberados.push('ouvidoria');
  if (temPermissao('chat_cargo_rh')) liberados.push('rh');
  if (temPermissao('chat_cargo_administrador')) liberados.push('administrador');
  if (temPermissao('chat_cargo_super_admin')) liberados.push('super_admin');
  return liberados;
}
