import { describe, expect, it } from 'vitest';
import { montarParticipantes, motivoDeConta, type LinhaPerfil } from './participantes';

describe('motivoDeConta', () => {
  it.each(['Suporte Play 2', 'Lider Supervisor', 'Líder Supervisão', 'TESTE', 'Admin Birigui', 'Play 5', 'Conta Receptivo'])(
    '«%s» é conta, não pessoa', nome => expect(motivoDeConta(nome)).not.toBeNull());

  it.each(['Oton Colecao', 'Ana Paula Souza', 'Érica Silva', 'Tiago Playmaker'])(
    '«%s» é pessoa', nome => expect(motivoDeConta(nome)).toBeNull());

  it('diz o porquê', () => {
    expect(motivoDeConta('Suporte Play 2')).toBe('tem número no nome');
    expect(motivoDeConta('Lider Supervisor')).toBe('«lider» no nome');
  });
});

const empresas = [
  { id: 'eB', nome: 'BookPlay', slug: 'bookplay', produto: 'cobranca' },
  { id: 'eP', nome: 'PaguePlay', slug: 'pagueplay', produto: 'cobranca' },
  { id: 'eV', nome: 'Comercial', slug: 'comercial', produto: 'comercial' },
];
const cidades = [{ id: 'cBir', nome: 'Birigui' }, { id: 'cMar', nome: 'Marília' }];
const setores = [
  { id: 's1', nome: 'Play 1', cidade_id: 'cBir', empresa_id: 'eB', ativo: true },
  // Conecta Play: empresa PaguePlay, cidade Marília → marca PaguePlay.
  { id: 's2', nome: 'Conecta Play', cidade_id: 'cMar', empresa_id: 'eP', ativo: true },
  // Setor da BookPlay em Marília: a marca é pela cidade, não pela empresa.
  { id: 's3', nome: 'Play 10', cidade_id: 'cMar', empresa_id: 'eB', ativo: true },
  { id: 's4', nome: 'Vendas 1', cidade_id: 'cBir', empresa_id: 'eV', ativo: true },
  { id: 's5', nome: 'Velho', cidade_id: 'cBir', empresa_id: 'eB', ativo: false },
];
const p = (id: string, setor_id: string | null, extra: Partial<LinhaPerfil> = {}): LinhaPerfil => ({
  id, nome: `Pessoa ${id}`, foto_url: null, perfil: 'lider', ativo: true, arquivado: false, situacao: null, robo: false, setor_id, ...extra,
});

describe('montarParticipantes', () => {
  const { pessoas, grupos } = montarParticipantes([
    p('a', 's1'), p('b', 's2'), p('c', 's3'), p('d', 's4'),
    p('semSetor', null), p('robo', 's1', { robo: true }), p('saiu', 's1', { situacao: 'desligado' }),
    p('arquivado', 's1', { arquivado: true }), p('setorVelho', 's5'),
  ], setores, empresas, cidades);

  it('marca pela cidade e produto pela empresa; Vendas fica no grupo próprio', () => {
    const de = (id: string) => pessoas.find(x => x.id === id)!;
    expect(de('a')).toMatchObject({ grupo: 'marca:bookplay', produto: 'cobranca', setor: 'Play 1' });
    expect(de('b')).toMatchObject({ grupo: 'marca:pagueplay', produto: 'cobranca' });
    expect(de('c')).toMatchObject({ grupo: 'marca:pagueplay', produto: 'cobranca' });
    expect(de('d')).toMatchObject({ grupo: 'empresa:eV', produto: 'comercial' });
  });

  it('fica de fora: robô, desligado, arquivado; setor inativo e sem setor viram «Sem setor»', () => {
    expect(pessoas.map(x => x.id).sort()).toEqual(['a', 'b', 'c', 'd', 'semSetor', 'setorVelho']);
    expect(pessoas.find(x => x.id === 'semSetor')).toMatchObject({ setorId: null, setor: 'Sem setor' });
  });

  it('sem setor leva a empresa do perfil (a diretoria, por exemplo)', () => {
    const { pessoas: so } = montarParticipantes([p('dir', null, { perfil: 'diretoria', empresa_id: 'eB' })], setores, empresas, cidades);
    expect(so[0]).toMatchObject({ setorId: null, empresa: 'BookPlay', produto: 'cobranca', perfil: 'diretoria' });
  });

  it('grupos: BookPlay, PaguePlay e depois as outras empresas', () => {
    expect(grupos.map(g => g.rotulo)).toEqual(['BookPlay · Birigui', 'PaguePlay · Marília', 'Comercial']);
    expect(grupos[1].setores.map(s => s.nome)).toEqual(['Conecta Play', 'Play 10']);
  });

  it('não muda o nome do cadastro', () => {
    const { pessoas: so } = montarParticipantes([p('x', 's1', { nome: '  Oton Colecao ' })], setores, empresas, cidades);
    expect(so[0].nome).toBe('Oton Colecao');
  });
});
