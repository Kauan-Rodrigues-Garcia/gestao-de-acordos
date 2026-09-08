import type { Desafio } from '@/services/desafios/types';
import type { ResultadoDesafio } from '@/services/desafios/calcularDesafio';

/** Dados fictícios para conferir as duas apresentações da mesma campanha. */
export const desafioFixture: Desafio = {
  id: 'campanha-teste', empresaId: 'empresa-teste', empresas: [], nome: 'Corrida dos líderes',
  descricao: 'Acompanhe a classificação e os prêmios de cada posição.', premio: null,
  dataInicio: '2026-09-01', dataFim: '2026-09-30', tipo: 'corrida', setorId: null,
  status: 'ativo', midiaUrl: '/campanha-teste.gif', midiaCaminho: null,
  arteUrl: '/arte-teste.png', arteCaminho: null, visibilidade: 'alcance',
  criadoPor: null, criadoPorNome: null, criadoEm: '', atualizadoEm: '',
  regra: {
    versao: 1, metrica: 'valor_recebido', modo: ['individual'], criterioRanking: 'maior_percentual',
    escopoDisputa: 'empresa', premiacao: 'melhor_colocado', metaIndividual: null,
    metasPorOperador: {}, metaEquipe: null, metaColetiva: null,
    participantes: { setores: [], equipes: [], operadores: [], cargos: [], excluidos: [], convidados: [] },
    premios: [
      { posicao: 1, premio: 'Tablet Samsung', icone: '🎁' },
      { posicao: 2, premio: 'Rodízio + acompanhante', icone: '🍽️' },
      { posicao: 3, premio: 'Rodízio + acompanhante', icone: '🍽️' },
      { posicao: 4, premio: 'Almoço especial', icone: '🍴' },
      { posicao: 5, premio: 'Almoço especial', icone: '🍴' },
    ],
    fonteResultado: 'equipe_liderada', fonteMeta: 'projecao_equipe', agregacaoLider: 'equipe_unica',
  },
  visual: {
    tema: 'corrida', icone: 'trophy', mostrarFotos: false, animarUltrapassagem: false,
    comemorarMeta: true, acento: null, midiaNoCard: true, fixarNoMenu: true,
    ajusteMidia: 'cobrir', ajusteArte: 'conter',
  },
};

export function resultadoDesafioFixture(quantidade = 8): ResultadoDesafio {
  const nomes = ['Ana Rodrigues', 'Bruno Nunes', 'Carolina Fernandes', 'Daniel Goncalves', 'Elisa Fonseca', 'Fabio Silva', 'Gabriela Nascimento', 'Helena Ferreira'];
  const individual = Array.from({ length: quantidade }, (_, i) => ({
    pessoa: {
      id: `p${i + 1}`, nome: nomes[i] ?? `Participante ${i + 1}`, usuario: null, fotoUrl: null,
      equipeId: 'equipe-teste', equipeNome: ['Horizonte', 'Conquista', 'Evolução'][i % 3],
      equipesLideradas: ['equipe-teste'], setorId: 'setor-teste', situacao: 'ativo',
      setores: ['setor-teste'], equipes: ['equipe-teste'], perfil: 'lider', empresaId: 'empresa-teste', convidado: false,
    },
    posicao: i + 1, recebido: 16635.31 - i * 300, qtd: 14, meta: 12761.9,
    progresso: 130.35 - i * 3.2, falta: 0, bateuMeta: false,
    paraUltrapassar: i ? 300 : null, nomeAcima: i ? nomes[i - 1] ?? 'Participante' : null,
  }));
  return {
    individual, equipes: [{
      equipeId: 'equipe-teste', equipeNome: 'Horizonte', posicao: 1, recebido: 30000,
      qtd: 20, meta: 20000, metaDerivada: true, falta: 0, progresso: 150,
      bateuMeta: false, concluiram: 0, paraUltrapassar: null, integrantes: individual,
    }],
    totalRecebido: 120000, totalQtd: 120, totalParticipantes: quantidade, totalEquipes: 1,
    metaColetiva: null, faltaColetiva: 0, progressoColetivo: 0,
  };
}
