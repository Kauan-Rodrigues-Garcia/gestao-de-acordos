import { describe, expect, it } from 'vitest';
import {
  conferirPlanilha, detectarColunas, linhasDaPlanilha, montarQuadro, pessoasPorCidade, recortarPorCidade, setoresDoQuadro,
  type DadosBrutos, type PessoaBruta,
} from './quadroPessoal';

const HOJE = new Date('2026-10-20T12:00:00Z');
const rotulo = (c: string) => ({ operador: 'Operador', lider: 'Líder', gerencia: 'Gerência' }[c] ?? c);

function pessoa(id: string, nome: string, over: Partial<PessoaBruta> = {}): PessoaBruta {
  return {
    id, nome, email: `${id}@x.com`, perfil: 'operador', setor_id: 's1', equipe_id: 'e1',
    situacao: 'ativo', criado_em: '2026-01-01T00:00:00Z', ...over,
  };
}

function dados(over: Partial<DadosBrutos> = {}): DadosBrutos {
  return {
    setores: [
      { id: 's1', nome: 'Receptivo', ativo: true, cidade_id: 'c1', regra: 'nosso_produto' },
      { id: 's2', nome: 'Play 3', ativo: true, cidade_id: 'c2', regra: 'cofen' },
      { id: 's3', nome: 'Play 4', ativo: false },
      { id: 's4', nome: 'Núcleo de Inteligência e Gestão', ativo: true, tipo: 'nucleo' },
      { id: 's5', nome: 'Setor de teste', ativo: true },
    ],
    cidades: [{ id: 'c1', nome: 'Birigui' }, { id: 'c2', nome: 'Marília' }],
    equipes: [
      { id: 'e1', nome: 'Equipe Ana', setor_id: 's1' },
      { id: 'e2', nome: 'Equipe Bia', setor_id: 's1', treinamento: true },
      { id: 'e3', nome: 'Conecta', setor_id: 's2' },
    ],
    pessoas: [
      pessoa('ana', 'Ana Líder', { perfil: 'lider', equipe_id: null }),
      pessoa('joao', 'João Silva'),
      pessoa('maria', 'Maria Souza', { equipe_id: 'e2', situacao: 'ferias', ferias_ate: '2026-10-30' }),
      pessoa('solto', 'Pedro Solto', { equipe_id: null }),
      pessoa('novo', 'Novo Cadastro', { setor_id: 's2', equipe_id: 'e3', criado_em: '2026-10-15T00:00:00Z' }),
      pessoa('perdido', 'Sem Lugar', { setor_id: 's3', equipe_id: null }),
      pessoa('adm', 'Conta Admin', { perfil: 'administrador' }),
      pessoa('saiu', 'Saiu Já', { arquivado: true }),
      pessoa('desl', 'Desligado', { situacao: 'desligado' }),
    ],
    lideres: [{ equipe_id: 'e1', lider_id: 'ana' }],
    subgrupos: [],
    clones: [],
    ...over,
  };
}

describe('setoresDoQuadro', () => {
  it('tira inativo e teste, e mantém o Núcleo', () => {
    expect(setoresDoQuadro(dados().setores).map(s => s.id)).toEqual(['s1', 's2', 's4']);
  });
});

describe('montarQuadro', () => {
  const q = montarQuadro(dados(), HOJE);

  it('deixa de fora contas de sistema, arquivados e desligados', () => {
    const ids = q.todas.map(p => p.id);
    expect(ids).not.toContain('adm');
    expect(ids).not.toContain('saiu');
    expect(ids).not.toContain('desl');
    expect(q.numeros.pessoas).toBe(6);
  });

  it('o líder fica acima da equipe e não conta como «sem equipe»', () => {
    const receptivo = q.setores.find(s => s.id === 's1')!;
    const e1 = receptivo.equipes.find(e => e.id === 'e1')!;
    expect(e1.lideres.map(l => l.id)).toEqual(['ana']);
    expect(e1.membros.map(m => m.id)).toEqual(['joao']);
    expect(receptivo.semEquipe.map(p => p.id)).toEqual(['solto']);
    expect(receptivo.numeros.lideres).toBe(1);
    expect(q.local.get('ana')).toEqual({ setorId: 's1', equipeId: 'e1' });
  });

  it('quem está num setor desativado cai em «Sem setor»', () => {
    expect(q.semSetor.map(p => p.id)).toEqual(['perdido']);
  });

  it('cidade e marca vêm do setor; regra só quando conhecida', () => {
    const receptivo = q.setores.find(s => s.id === 's1')!;
    const play3 = q.setores.find(s => s.id === 's2')!;
    expect(receptivo.cidade).toMatchObject({ nome: 'Birigui', marca: 'BookPlay' });
    expect(play3.cidade).toMatchObject({ nome: 'Marília', marca: 'PaguePlay' });
    expect(play3.regra).toBe('Cofen');
    expect(q.cidades.at(-1)?.nome).toBe('Sem cidade');
  });

  it('férias e novos (30 dias) são contados', () => {
    expect(q.numeros.emFerias).toBe(1);
    expect(q.numeros.novatos).toBe(1);
  });

  it('respeita a ordem que o admin arrastou', () => {
    const outra = montarQuadro(dados({ ordemSetores: ['s2', 's1'] }), HOJE);
    expect(outra.setores.map(s => s.id)).toEqual(['s2', 's1', 's4']);
  });
});

describe('várias empresas (a visão do produto RH)', () => {
  const base = dados();
  const q = montarQuadro({
    ...base,
    setores: base.setores.map(s => ({ ...s, empresa_nome: s.id === 's2' ? 'PaguePlay' : 'BookPlay' })),
  }, HOJE);

  it('cada setor sabe de que empresa é, e o quadro lista as empresas', () => {
    expect(q.setores.find(s => s.id === 's2')!.empresa).toBe('PaguePlay');
    expect(q.empresas.sort()).toEqual(['BookPlay', 'PaguePlay']);
  });

  it('a planilha ganha a coluna Empresa só quando junta mais de uma', () => {
    expect(linhasDaPlanilha(q, rotulo).Resumo[0]).toHaveProperty('Empresa');
    expect(linhasDaPlanilha(montarQuadro(base, HOJE), rotulo).Resumo[0]).not.toHaveProperty('Empresa');
  });
});

describe('linhasDaPlanilha', () => {
  const q = montarQuadro(dados(), HOJE);

  it('tem as três abas e põe todo mundo uma vez na aba Pessoas', () => {
    const p = linhasDaPlanilha(q, rotulo);
    expect(p.Resumo).toHaveLength(3);
    expect(p.Equipes).toHaveLength(3);
    expect(p.Pessoas.map(l => l.Nome).sort()).toEqual(q.todas.map(x => x.nome).sort());
    const joao = p.Pessoas.find(l => l.Nome === 'João Silva')!;
    expect(joao).toMatchObject({ Setor: 'Receptivo', Equipe: 'Equipe Ana', 'Líder da equipe': 'Ana Líder', Cargo: 'Operador' });
  });

  it('recorta por setor sem trazer o «Sem setor»', () => {
    const p = linhasDaPlanilha(q, rotulo, new Set(['s2']));
    expect(p.Pessoas.map(l => l.Nome)).toEqual(['Novo Cadastro']);
  });
});

describe('conferência', () => {
  const q = montarQuadro(dados(), HOJE);

  it('reconhece cabeçalhos com acento e sinônimos', () => {
    expect(detectarColunas(['Colaborador', 'E-mail', 'Departamento', 'Time', 'Função'])).toEqual({
      nome: 'Colaborador', email: 'E-mail', setor: 'Departamento', equipe: 'Time', cargo: 'Função',
    });
  });

  it('a planilha exportada hoje confere inteira com o sistema', () => {
    const c = conferirPlanilha(q, linhasDaPlanilha(q, rotulo).Pessoas, rotulo);
    expect(c.contagem).toEqual({ igual: q.todas.length, diferente: 0, so_planilha: 0, so_sistema: 0 });
  });

  it('acha quem mudou, quem não existe e quem falta', () => {
    const c = conferirPlanilha(q, [
      { Nome: 'joão silva', Setor: 'Receptivo', Equipe: 'Equipe Bia' },
      { Nome: 'Fulano Inexistente', Setor: 'Receptivo' },
      { Nome: 'Maria Souza', Setor: 'RECEPTIVO', Equipe: 'Equipe Bia' },
    ], rotulo);
    const por = (n: string) => c.itens.find(i => i.nome.toLowerCase() === n.toLowerCase())!;
    expect(por('João Silva').tipo).toBe('diferente');
    expect(por('João Silva').diferencas).toEqual([{ campo: 'equipe', planilha: 'Equipe Bia', sistema: 'Equipe Ana' }]);
    expect(por('Fulano Inexistente').tipo).toBe('so_planilha');
    expect(por('Maria Souza').tipo).toBe('igual');
    // Só o Receptivo foi mencionado: o Play 3 não é acusado de faltar.
    const faltam = c.itens.filter(i => i.tipo === 'so_sistema').map(i => i.pessoa!.id).sort();
    expect(faltam).toEqual(['ana', 'solto']);
  });

  it('casa por e-mail antes do nome', () => {
    const c = conferirPlanilha(q, [{ Nome: 'Outro Nome', 'E-mail': 'JOAO@x.com', Setor: 'Receptivo' }], rotulo);
    expect(c.itens[0]).toMatchObject({ tipo: 'igual', nome: 'João Silva' });
  });

  it('«Sem equipe» escrito é o mesmo que célula vazia', () => {
    const c = conferirPlanilha(q, [{ Nome: 'Pedro Solto', Setor: 'Receptivo', Equipe: 'Sem equipe' }], rotulo);
    expect(c.itens[0].tipo).toBe('igual');
  });
});

describe('setor alternativo, crachá e situação (13/11/2026)', () => {
  const base = dados({
    setores: [
      { id: 's1', nome: 'Receptivo', ativo: true, cidade_id: 'c1' },
      { id: 'alt', nome: 'Marília Digital', ativo: true, cidade_id: 'c2', alternativo: true },
    ],
    equipes: [
      { id: 'e1', nome: 'Equipe Ana', setor_id: 's1' },
      { id: 'ea', nome: 'Digital A', setor_id: 'alt' },
    ],
    pessoas: [
      pessoa('joao', 'João Silva'),
      pessoa('bia', 'Bia Afastada', { situacao: 'afastado' }),
      pessoa('dona', 'Dona do Digital', { setor_id: 'alt', equipe_id: 'ea' }),
    ],
    lideres: [],
    clones: [{ equipe_id: 'ea', operador_id: 'joao' }, { equipe_id: 'ea', operador_id: 'bia' }],
    crachas: { joao: '1234', dona: ' ' },
  });
  const q = montarQuadro(base, HOJE);
  const alt = q.setores.find(s => s.id === 'alt')!;

  it('o alternativo traz os clones com o setor de origem, à parte do cadastro', () => {
    expect(alt.alternativo).toBe(true);
    expect(alt.clones.map(c => [c.pessoa.nome, c.origem, c.equipes])).toEqual([
      ['Bia Afastada', 'Receptivo', ['Digital A']],
      ['João Silva', 'Receptivo', ['Digital A']],
    ]);
    expect(alt.numeros.clones).toBe(2);
    // O número do setor é do cadastro: o clone já conta na origem.
    expect(alt.numeros.pessoas).toBe(1);
    expect(q.numeros.pessoas).toBe(3);
  });

  it('crachá vazio conta como sem crachá; afastado é contado', () => {
    expect(q.todas.find(p => p.id === 'joao')?.cracha).toBe('1234');
    expect(q.todas.find(p => p.id === 'dona')?.cracha).toBeNull();
    expect(q.numeros.semCracha).toBe(2);
    expect(q.numeros.afastados).toBe(1);
  });

  it('recortarPorCidade deixa só a cidade e refaz os números, mas a busca continua inteira', () => {
    const marilia = recortarPorCidade(q, 'marilia');
    expect(marilia.setores.map(s => s.id)).toEqual(['alt']);
    expect(marilia.numeros.pessoas).toBe(1);
    expect(marilia.numeros.clones).toBe(2);
    expect(marilia.semSetor).toEqual([]);
    expect(marilia.todas).toHaveLength(3);
    expect(recortarPorCidade(q, null)).toBe(q);
    expect(Object.fromEntries(pessoasPorCidade(q))).toEqual({ birigui: 2, marilia: 1 });
  });
});
