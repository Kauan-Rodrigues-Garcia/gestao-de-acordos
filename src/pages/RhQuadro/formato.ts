/** formato.ts — rótulos, cores e textos do Quadro de Pessoal (sem componente). */
import { PERFIL_LABELS } from '@/lib/index';
import { lugarDaPessoa, type GrupoCargo, type Pessoa, type Quadro } from '@/services/rh/quadroPessoal';

export const rotuloCargo = (cargo: string): string => PERFIL_LABELS[cargo] ?? cargo;

export const GRUPO_META: Record<GrupoCargo, { rotulo: string; um: string; cor: string }> = {
  operador:  { rotulo: 'Operadores', um: 'Operador',  cor: 'bg-primary' },
  lider:     { rotulo: 'Líderes',    um: 'Líder',     cor: 'bg-info' },
  elite:     { rotulo: 'Elite',      um: 'Elite',     cor: 'bg-success' },
  gerencia:  { rotulo: 'Gerência',   um: 'Gerência',  cor: 'bg-warning' },
  diretoria: { rotulo: 'Diretoria',  um: 'Diretoria', cor: 'bg-foreground/60' },
  outros:    { rotulo: 'Outros',     um: 'Outro',     cor: 'bg-muted-foreground/35' },
};

export function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
}

export interface LugarTexto { setor: string; equipe: string | null; subgrupo: string | null }

export function lugarTexto(quadro: Quadro, pessoa: Pessoa): LugarTexto {
  const { setor, equipe } = lugarDaPessoa(quadro, pessoa);
  return {
    setor: setor?.nome ?? 'Sem setor',
    equipe: equipe?.nome ?? (setor ? 'Sem equipe' : null),
    subgrupo: equipe?.subgrupos.find(s => s.id === pessoa.subgrupoId)?.nome ?? null,
  };
}
