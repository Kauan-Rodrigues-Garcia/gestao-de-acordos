import { describe, expect, it } from 'vitest';
import {
  empresaDeOrigem, empresaDoDestino, grupoDoSetor, gruposDeDestino, setoresDeVariasEmpresas,
} from './empresasDaTransferencia';
import { tipoDaTransferencia } from '@/services/admin/transferenciaUsuario.service';

const BOOKPLAY = 'emp-bookplay';
const PAGUEPLAY = 'emp-pagueplay';

describe('empresasDaTransferencia', () => {
  it('Play 5 (BookPlay) → Conecta Play (PaguePlay) na lista única é troca de EMPRESA', () => {
    // A tela está na BookPlay e o campo Empresa ficou nela; o setor é da PaguePlay.
    const origem = empresaDeOrigem({ empresa_id: BOOKPLAY }, BOOKPLAY);
    const destino = empresaDoDestino({ empresa_id: PAGUEPLAY }, BOOKPLAY, BOOKPLAY);
    expect(destino).toBe(PAGUEPLAY);
    expect(tipoDaTransferencia({
      perfilId: 'p', nome: 'Layane', origemEmpresaId: origem, origemSetorId: 'play-5',
      origemEquipeId: null, destinoEmpresaId: destino, destinoSetorId: 'conecta',
    })).toBe('empresa');
  });

  it('a origem é a empresa do perfil, não a da tela', () => {
    expect(empresaDeOrigem({ empresa_id: PAGUEPLAY }, BOOKPLAY)).toBe(PAGUEPLAY);
    expect(empresaDeOrigem({}, BOOKPLAY)).toBe(BOOKPLAY);
  });

  it('setor da mesma empresa continua troca de setor', () => {
    expect(empresaDoDestino({ empresa_id: BOOKPLAY }, BOOKPLAY, BOOKPLAY)).toBe(BOOKPLAY);
  });

  it('sem setor escolhido, vale o campo Empresa e depois a tela', () => {
    expect(empresaDoDestino(null, PAGUEPLAY, BOOKPLAY)).toBe(PAGUEPLAY);
    expect(empresaDoDestino(undefined, '', BOOKPLAY)).toBe(BOOKPLAY);
  });

  it('só marca a lista como mista quando há duas empresas', () => {
    expect(setoresDeVariasEmpresas([{ empresa_id: BOOKPLAY }, { empresa_id: BOOKPLAY }])).toBe(false);
    expect(setoresDeVariasEmpresas([{ empresa_id: BOOKPLAY }, { empresa_id: PAGUEPLAY }])).toBe(true);
  });
});

describe('gruposDeDestino — o destino pela marca, não pela empresa (19/10/2026)', () => {
  const BP = 'emp-bookplay', PP = 'emp-pagueplay', COM = 'emp-comercial';
  const cidades = [{ id: 'c-bir', nome: 'Birigui' }, { id: 'c-mar', nome: 'Marília' }];
  const empresas = [{ id: BP, nome: 'BookPlay' }, { id: PP, nome: 'PaguePlay' }, { id: COM, nome: 'Comercial' }];
  const setor = (id: string, nome: string, empresa_id: string, cidade_id: string | null) =>
    ({ id, nome, empresa_id, cidade_id });
  const setores = [
    setor('play5', 'Play 5', BP, 'c-bir'),
    setor('mix', 'Play Mix Marília', BP, 'c-mar'),
    setor('conecta', 'Conecta Play', PP, 'c-mar'),
    setor('night', 'Play Night', BP, 'c-bir'),
    setor('vendas', 'Vendas', COM, null),
  ];

  it('BookPlay = setores de Birigui; PaguePlay = os de Marília, de qualquer empresa e com o Conecta Play', () => {
    const g = gruposDeDestino(setores, cidades, empresas);
    expect(g.map(x => x.chave)).toEqual(['marca:bookplay', 'marca:pagueplay', `empresa:${COM}`]);
    expect(g[0].setores.map(s => s.id)).toEqual(['play5', 'night']);
    expect(g[1].setores.map(s => s.id)).toEqual(['conecta', 'mix']);
    expect(g[2].rotulo).toBe('Comercial · sem cidade');
  });

  it('grupo vazio não aparece, e o grupo de um setor é achado pelo id', () => {
    const g = gruposDeDestino(setores.filter(s => s.cidade_id !== 'c-mar'), cidades, empresas);
    expect(g.some(x => x.chave === 'marca:pagueplay')).toBe(false);
    expect(grupoDoSetor(g, 'vendas')).toBe(`empresa:${COM}`);
    expect(grupoDoSetor(g, 'nao-existe')).toBeNull();
    expect(grupoDoSetor(g, null)).toBeNull();
  });
});
