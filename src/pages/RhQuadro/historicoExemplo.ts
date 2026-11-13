/**
 * historicoExemplo.ts — dados inventados para a prévia do Histórico do mês.
 *
 * Só em desenvolvimento (`?previa=historico`): deixa ver a tela antes da
 * migration estar no banco. Nomes fictícios; nada aqui é gente real.
 */
import type { EventoRh } from '@/services/rh/historicoMes';

const B = 'Birigui';
const M = 'Marília';
const s = (id: string, nome: string, cidade: string) => ({ id, nome, cidade });
const PLAY1 = s('s1', 'Play 1', B);
const PLAY2 = s('s2', 'Play 2', B);
const PLAY5 = s('s5', 'Play 5', B);
const MIX = s('s9', 'Play Mix Marília', M);
const NIGHT = s('s8', 'Play Night', M);

type Setor = ReturnType<typeof s>;

function ev(p: Partial<EventoRh> & Pick<EventoRh, 'tipo' | 'dia' | 'pessoa_nome'>, de: Setor | null, para: Setor): EventoRh {
  return {
    pessoa_id: null, cargo: 'operador', empresa_id: null,
    setor_de_id: de?.id ?? null, setor_de_nome: de?.nome ?? null, cidade_de: de?.cidade ?? null,
    setor_para_id: para.id, setor_para_nome: para.nome, cidade_para: para.cidade,
    valor_de: null, valor_para: null, sentido: null,
    ausencia_tipo: null, ausencia_rotulo: null, inicio: null, fim: null,
    feito_por: 'Gestão Exemplo',
    ...p,
  };
}

export function historicoDeExemplo(mes: string): EventoRh[] {
  const d = (dia: number) => `${mes}-${String(dia).padStart(2, '0')}`;
  return [
    ev({ tipo: 'transferencia', dia: d(3), pessoa_nome: 'Ana Exemplo' }, PLAY1, PLAY5),
    ev({ tipo: 'transferencia', dia: d(5), pessoa_nome: 'Bruno Teste', cargo: 'lider' }, MIX, PLAY2),
    ev({ tipo: 'transferencia', dia: d(11), pessoa_nome: 'Carla Fictícia' }, PLAY2, PLAY1),
    ev({ tipo: 'transferencia', dia: d(12), pessoa_nome: 'Diego Modelo' }, NIGHT, MIX),
    ev({ tipo: 'cargo', dia: d(10), pessoa_nome: 'Elaine Prévia', cargo: 'lider', valor_de: 'operador', valor_para: 'lider', sentido: 'promocao' }, PLAY1, PLAY1),
    ev({ tipo: 'cargo', dia: d(15), pessoa_nome: 'Fábio Amostra', cargo: 'operador', valor_de: 'lider', valor_para: 'operador', sentido: 'rebaixamento' }, MIX, MIX),
    ev({ tipo: 'desligamento', dia: d(4), pessoa_nome: 'Gustavo Demo', valor_de: 'ativo', valor_para: 'desligado' }, PLAY2, PLAY2),
    ev({ tipo: 'desligamento', dia: d(9), pessoa_nome: 'Helena Ilustra', valor_de: 'ferias', valor_para: 'desligado' }, NIGHT, NIGHT),
    ev({ tipo: 'reativacao', dia: d(6), pessoa_nome: 'Igor Simulado', valor_de: 'desligado', valor_para: 'ativo' }, PLAY5, PLAY5),
    ev({ tipo: 'afastamento', dia: d(1), pessoa_nome: 'Juliana Rascunho', ausencia_tipo: 'inss', ausencia_rotulo: 'INSS', inicio: '2026-10-20', fim: '9999-12-31' }, PLAY1, PLAY1),
    ev({ tipo: 'afastamento', dia: d(8), pessoa_nome: 'Kleber Esboço', ausencia_tipo: 'atestado', ausencia_rotulo: 'Atestado', inicio: d(8), fim: d(10) }, MIX, MIX),
    ev({ tipo: 'ferias', dia: d(17), pessoa_nome: 'Larissa Molde', ausencia_tipo: 'ferias', ausencia_rotulo: 'Férias', inicio: d(17), fim: d(30) }, PLAY2, PLAY2),
    ev({ tipo: 'ferias', dia: d(1), pessoa_nome: 'Marcos Protótipo', ausencia_tipo: 'ferias', ausencia_rotulo: 'Férias', inicio: '2026-10-25', fim: d(8) }, NIGHT, NIGHT),
    ev({ tipo: 'entrada', dia: d(3), pessoa_nome: 'Natália Nova' }, null, PLAY5),
    ev({ tipo: 'entrada', dia: d(3), pessoa_nome: 'Otávio Novo' }, null, MIX),
    ev({ tipo: 'troca_equipe', dia: d(7), pessoa_nome: 'Paula Troca', valor_de: 'Equipe Águia', valor_para: 'Equipe Falcão' }, PLAY1, PLAY1),
    ev({ tipo: 'troca_equipe', dia: d(14), pessoa_nome: 'Rafael Troca', valor_de: null, valor_para: 'Equipe Lince' }, MIX, MIX),
  ];
}
