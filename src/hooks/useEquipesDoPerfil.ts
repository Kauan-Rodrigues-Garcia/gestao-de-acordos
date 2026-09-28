/**
 * useEquipesDoPerfil — «qual é a minha equipe?», respondido do jeito certo.
 *
 * O líder mora em `equipe_lideres`, e não em `perfis.equipe_id` (vazio em 33
 * dos 50 líderes ativos em 28/09/2026). Toda tela que lia o cadastro deixava o
 * líder «sem equipe». Este hook junta os dois com a regra de
 * `equipesDoPerfil` — a mesma de `fn_equipes_de_alcance`/`fn_equipe_principal`
 * no banco.
 *
 *   principal — para o que aceita uma só (config de Direto/Extra, comissão,
 *               meta da equipe, carimbo de solicitação).
 *   todas     — para recortar por «as minhas equipes».
 *
 * Sob teste, um `useAuth` simulado sem `equipesLideradas` cai no cadastro, que
 * é o comportamento de antes.
 */
import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { equipesDoPerfil, type EquipesDoPerfil } from '@/services/equipes/equipeDoLider';

const NENHUMA: string[] = [];

export function useEquipesDoPerfil(): EquipesDoPerfil {
  const { perfil, equipesLideradas } = useAuth();
  const cargo = perfil?.perfil ?? null;
  const cadastro = (perfil as { equipe_id?: string | null } | null)?.equipe_id ?? null;
  const lideradas = equipesLideradas ?? NENHUMA;
  return useMemo(() => equipesDoPerfil(cargo, cadastro, lideradas), [cargo, cadastro, lideradas]);
}
