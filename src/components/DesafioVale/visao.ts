/**
 * Visões de teste do Desafio do Vale (23/11/2026): o super_admin abre a
 * gaveta «como» outra pessoa — operador ou líder de um setor, ou a gerência —,
 * num dia simulado, com um % do setor simulado e com o fechamento confirmado
 * ou não. Só muda o que a gaveta MOSTRA: nada é gravado.
 *
 * Fora da tela /desafio-vale não há provedor, e tudo é o real de quem olha.
 */
import { createContext, useContext, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAlcanceNoDesafio, type AlcanceNoDesafio } from '@/hooks/useEquipeNoDesafio';
import { hojeEmSaoPaulo } from '@/services/desafioCobranca/regras';
import type { DesafioVale, SetorNoVale } from '@/services/desafioVale/desafioVale.service';
import type { Ficticio } from '@/services/desafioVale/ficticio';
import type { EscolhaDeTema } from './temasVale';

export interface VisaoSimulada {
  /** Ver como esta pessoa (as médias e os cupons dela). */
  pessoa?: { id: string; nome: string; setor_id: string | null } | null;
  /** O setor da visão (para o líder sem pessoa escolhida). */
  setorId?: string | null;
  /** 'nenhum' = operador; 'setor' = líder; 'todos_setores' = gerência. */
  alcance?: AlcanceNoDesafio;
  /** O dia simulado (YYYY-MM-DD). */
  hoje?: string;
  /** O % do setor simulado. `undefined` = o real. */
  pct?: number;
  /** Fechamento simulado. `undefined` = o real. */
  fechado?: boolean;
  /** Todos os setores do desafio (o detalhe do super_admin). */
  setores?: SetorNoVale[];
  /** Dados fictícios: médias e cupons de mentira, e um time fictício na aba Equipes. */
  ficticio?: Ficticio | null;
  /** Começar pela abertura (a arte da campanha). */
  abertura?: boolean;
  /** O tema da gaveta: o automático (o de quem olha) ou um dos três. */
  tema?: EscolhaDeTema;
}

export const VisaoDoValeContext = createContext<VisaoSimulada | null>(null);

export interface VisaoDoVale {
  simulando: boolean;
  operadorId: string | null;
  operadorNome: string | null;
  setorId: string | null;
  hoje: string;
  alcance: AlcanceNoDesafio;
  /** Dados fictícios ligados (só na visão de teste). */
  ficticio: Ficticio | null;
  /** Na visão de teste: começa pela abertura? `null` = o real (uma vez por pessoa). */
  abertura: boolean | null;
  /** O tema forçado na visão de teste (`auto` = o de quem olha). */
  tema: EscolhaDeTema;
  /** O desafio como esta visão o enxerga (setor, % e fechamento trocados). */
  aplicar: (d: DesafioVale) => DesafioVale;
}

export function useVisaoDoVale(): VisaoDoVale {
  const sim = useContext(VisaoDoValeContext);
  const { perfil } = useAuth();
  const alcanceReal = useAlcanceNoDesafio();
  return useMemo<VisaoDoVale>(() => {
    const hojeReal = hojeEmSaoPaulo();
    if (!sim) {
      return {
        simulando: false,
        operadorId: perfil?.id ?? null,
        operadorNome: perfil?.nome ?? null,
        setorId: perfil?.setor_id ?? null,
        hoje: hojeReal,
        alcance: alcanceReal,
        ficticio: null,
        abertura: null,
        tema: 'auto',
        aplicar: (d) => d,
      };
    }
    const setorId = sim.pessoa?.setor_id ?? sim.setorId ?? null;
    const comPct = (s: SetorNoVale): SetorNoVale =>
      sim.pct === undefined ? s : { ...s, pct: sim.pct, origem: 'manual', pct_manual: sim.pct };
    return {
      simulando: true,
      operadorId: sim.pessoa?.id ?? null,
      operadorNome: sim.pessoa?.nome ?? null,
      setorId,
      hoje: sim.hoje ?? hojeReal,
      alcance: sim.alcance ?? 'nenhum',
      ficticio: sim.ficticio ?? null,
      abertura: !!sim.abertura,
      tema: sim.tema ?? 'auto',
      aplicar: (d) => {
        const todos = sim.setores ?? d.setores ?? [];
        const doSetor = todos.find(s => s.setor_id === setorId) ?? null;
        return {
          ...d,
          setores: todos.map(comPct),
          meu_setor: doSetor ? comPct(doSetor) : null,
          // O resultado gravado é o do super_admin, não o da pessoa simulada.
          meu_resultado: null,
          fechado_em: sim.fechado === undefined ? d.fechado_em : sim.fechado ? (d.fechado_em ?? new Date().toISOString()) : null,
          super_admin: false,
          previa: d.previa,
        };
      },
    };
  }, [sim, perfil?.id, perfil?.nome, perfil?.setor_id, alcanceReal]);
}
