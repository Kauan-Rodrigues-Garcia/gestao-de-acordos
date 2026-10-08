import { describe, expect, it } from 'vitest';
import {
  empresaDeOrigem, empresaDoDestino, setoresDeVariasEmpresas,
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
