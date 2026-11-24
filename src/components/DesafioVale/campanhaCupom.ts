/**
 * Os Cupons do Pix na aba Pix Automático (23/11/2026): qual desafio está com
 * os cupons ligados para quem olha, de quais setores, e a cor da linha.
 *
 * O cupom é do SETOR DA LINHA, não do setor de quem olha (correção de
 * 23/11/2026): o super_admin e a gerência viam os Pix da Jornada — que não
 * participa — em laranja com a etiqueta CUPOM, porque a regra perguntava só
 * «o desafio está no ar para mim?». Agora cada Pix pergunta se o setor dele
 * participa e tem a 2ª parte pelo Pix (a Manutenção é ranking, fica fora).
 */
import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useDesafioVale } from '@/hooks/useDesafioVale';
import type { DesafioVale, SetorNoVale } from '@/services/desafioVale/desafioVale.service';
import { pixNoPeriodoDoCupom, regraDoSetor } from '@/services/desafioVale/regras';

export interface CampanhaCupom {
  d: DesafioVale;
  /** Os setores cujos Pix do período contam para o cupom. */
  setores: ReadonlySet<string>;
}

/**
 * Os setores com cupom pelo Pix. Quem vê todos recebe a lista dos que
 * participam (`d.setores`); o líder e o operador, só o próprio (`meu_setor`).
 */
export function setoresDoCupom(d: Pick<DesafioVale, 'setores' | 'meu_setor'>): Set<string> {
  const lista: SetorNoVale[] = d.setores ?? (d.meu_setor ? [d.meu_setor] : []);
  return new Set(lista.filter(s => s.participa && regraDoSetor(s) === 'pix').map(s => s.setor_id));
}

/** O desafio com os cupons ligados e os setores deles, ou `null`. Usa a mesma consulta da barra de cima. */
export function useCampanhaCupom(): CampanhaCupom | null {
  const { perfil } = useAuth();
  const { data } = useDesafioVale(!!perfil?.id);
  return useMemo(() => {
    if (!data || !data.cupom_ativo || !data.cupom_inicio || !data.cupom_fim) return null;
    const setores = setoresDoCupom(data);
    return setores.size ? { d: data, setores } : null;
  }, [data]);
}

/** O Pix é da campanha: registrado no período e de um setor com cupom pelo Pix. */
export function pixDaCampanha(
  c: CampanhaCupom | null | undefined, criadoEm: string, setorDaLinha: string | null,
): boolean {
  return !!c && !!setorDaLinha && c.setores.has(setorDaLinha) && pixNoPeriodoDoCupom(criadoEm, c.d);
}

/** As classes da linha da tabela que é da campanha (a laranja do cupom). */
export const CLASSE_LINHA_CUPOM = 'bg-orange-400/[0.08] shadow-[inset_4px_0_0_0_#fb923c] hover:bg-orange-400/[0.14]';
