import { describe, expect, it } from 'vitest';
import { ErroDoBanco, faltaMigration, mensagemDoErro, montarDoRetrato, resultadosDoRetrato, type RetratoDaVotacao } from './banco';

const retrato: RetratoDaVotacao = {
  votacao: { id: 'v1', titulo: 'Novembro', produto: 'cobranca', estado: 'liberada', aberta_em: null, liberada_em: null },
  perguntas: [{ id: 'q1', emoji: '😄', texto: 'Mais carismático?' }, { id: 'q2', emoji: '🧩', texto: 'Resolve problemas?' }],
  participantes: [
    { id: 'c', nome: 'Carla ', foto: null, perfil: 'lider', setor: 'Play 2' },
    { id: 'a', nome: 'Ana', foto: 'x.png', perfil: 'lider', setor: 'Play 1' },
    { id: 'd', nome: 'Cleber', foto: null, perfil: 'diretoria', setor: null },
  ],
  contagem: [
    { pergunta_id: 'q1', candidato_id: 'a', votos: 2 }, { pergunta_id: 'q1', candidato_id: 'c', votos: 2 },
    { pergunta_id: 'q2', candidato_id: 'd', votos: 3 },
  ],
  desempates: [{ pergunta_id: 'q1', escolhido_id: 'c' }],
};

describe('montarDoRetrato', () => {
  it('ordem alfabética em todas as perguntas; sem setor aparece o cargo', () => {
    const { cedula, pessoas } = montarDoRetrato(retrato);
    expect(cedula.map(c => c.candidatos)).toEqual([['a', 'c', 'd'], ['a', 'c', 'd']]);
    expect(pessoas.get('d')?.setor).toBe('Diretoria');
    expect(pessoas.get('c')?.nome).toBe('Carla');
  });
});

describe('resultadosDoRetrato', () => {
  it('aplica o desempate da diretoria', () => {
    const { cedula } = montarDoRetrato(retrato);
    const [q1, q2] = resultadosDoRetrato(retrato, cedula);
    expect(q1).toMatchObject({ vencedores: ['c'], desempatado: true });
    expect(q2.vencedores).toEqual(['d']);
  });
});

describe('erros', () => {
  it('reconhece banco sem a migration', () => {
    expect(faltaMigration(new ErroDoBanco('Could not find the function public.fn_votacao_lideranca_minha', 'PGRST202'))).toBe(true);
    expect(faltaMigration(new ErroDoBanco('Você já enviou os seus votos.', '22023'))).toBe(false);
  });
  it('tira o prefixo técnico da mensagem', () => {
    expect(mensagemDoErro(new Error('NAO_AUTORIZADO: você não participa desta votação'))).toBe('você não participa desta votação');
  });
});
