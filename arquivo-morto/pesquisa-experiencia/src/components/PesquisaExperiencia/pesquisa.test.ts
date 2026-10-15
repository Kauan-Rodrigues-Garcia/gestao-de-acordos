import { describe, expect, it } from 'vitest';
import { primeiroNome, resumirPesquisa, type RespostaPesquisa } from './pesquisa';

const r = (nota: RespostaPesquisa['nota'], setor: string | null, comentario: string | null = null): RespostaPesquisa => ({
  usuario_id: Math.random().toString(36), nome: 'X', cargo: 'Operador', empresa_nome: null,
  setor_id: null, setor_nome: setor, nota, comentario, respondida_em: '2026-10-08T12:00:00Z', comentada_em: null,
});

describe('resumirPesquisa', () => {
  it('conta por nota, comentários e setor (o que mais respondeu primeiro)', () => {
    const s = resumirPesquisa([
      r('boa', 'Conecta Play', 'ótimo'), r('boa', 'Conecta Play'), r('ruim', 'Marília Digital', '  '),
      r('media', null), r('boa', 'Marília Digital'),
    ]);
    expect(s.total).toBe(5);
    expect(s.porNota).toEqual({ ruim: 1, media: 1, boa: 3 });
    // Comentário só com espaços não conta.
    expect(s.comComentario).toBe(1);
    expect(s.porSetor.map(x => [x.setor, x.total])).toEqual([
      ['Conecta Play', 2], ['Marília Digital', 2], ['Sem setor', 1],
    ]);
  });

  it('sem resposta nenhuma', () => {
    expect(resumirPesquisa([])).toEqual({ total: 0, porNota: { ruim: 0, media: 0, boa: 0 }, comComentario: 0, porSetor: [] });
  });
});

describe('primeiroNome', () => {
  it('pega o primeiro nome e tolera vazio', () => {
    expect(primeiroNome('  Ana Paula Souza ')).toBe('Ana');
    expect(primeiroNome(null)).toBe('');
  });
});
