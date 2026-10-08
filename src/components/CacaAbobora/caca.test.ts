import { describe, expect, it } from 'vitest';
import {
  FAIXA_MS, aboboraNaTela, faixaNaTela, formatarTempo, juntarRodada, nomeCurto, normalizarRodada,
  type EstadoCaca, type RodadaAbobora,
} from './caca';

const AGORA = Date.parse('2026-10-05T15:00:00Z');

function rodada(p: Partial<RodadaAbobora> = {}): RodadaAbobora {
  return {
    id: 1, dia: '2026-10-05', solta_em: '2026-10-05T14:59:00Z', expira_em: '2026-10-05T15:14:00Z',
    semente: 42, origem: 'sorteio', situacao: 'solta',
    achada_em: null, achada_por: null, achada_por_nome: null, achada_por_foto: null, ms: null,
    mais_rapida_do_dia: false, zumbi: 3, headshot: false, headshot_mais_rapido_do_dia: false, ...p,
  };
}
const achada = (p: Partial<RodadaAbobora> = {}) => rodada({
  situacao: 'achada', achada_em: '2026-10-05T14:59:04Z', achada_por: 'u1',
  achada_por_nome: 'Ana Paula Silva', ms: 4213, ...p,
});
const VAZIO: EstadoCaca = { rodada: null, faixaAte: 0 };

describe('juntarRodada', () => {
  it('a abóbora solta aparece e não abre faixa', () => {
    const e = juntarRodada(VAZIO, rodada(), true, AGORA);
    expect(aboboraNaTela(e, AGORA)).toBe(true);
    expect(faixaNaTela(e, AGORA)).toBe(false);
  });

  it('achada ao vivo: a faixa passa 10 min contados deste computador', () => {
    const e = juntarRodada(juntarRodada(VAZIO, rodada(), true, AGORA), achada(), true, AGORA);
    expect(aboboraNaTela(e, AGORA)).toBe(false);
    expect(e.faixaAte).toBe(AGORA + FAIXA_MS);
    expect(faixaNaTela(e, AGORA + FAIXA_MS - 1)).toBe(true);
    expect(faixaNaTela(e, AGORA + FAIXA_MS)).toBe(false);
  });

  it('quem entra no meio pega só o resto da faixa', () => {
    const e = juntarRodada(VAZIO, achada(), false, AGORA);
    expect(e.faixaAte).toBe(Date.parse('2026-10-05T14:59:04Z') + FAIXA_MS);
  });

  it('o aviso repetido da mesma achada não reinicia a faixa', () => {
    const e1 = juntarRodada(VAZIO, achada(), true, AGORA);
    const e2 = juntarRodada(e1, achada(), true, AGORA + 60_000);
    expect(e2).toBe(e1);
  });

  it('aviso atrasado de rodada antiga é ignorado', () => {
    const e1 = juntarRodada(VAZIO, rodada({ id: 5 }), true, AGORA);
    expect(juntarRodada(e1, achada({ id: 4 }), true, AGORA)).toBe(e1);
  });

  it('a mesma rodada não volta a «solta» depois de achada', () => {
    const e1 = juntarRodada(VAZIO, achada(), true, AGORA);
    expect(juntarRodada(e1, rodada(), true, AGORA)).toBe(e1);
  });

  it('sumiu: some a abóbora e não há faixa', () => {
    const e = juntarRodada(juntarRodada(VAZIO, rodada(), true, AGORA), rodada({ situacao: 'sumiu' }), true, AGORA);
    expect(aboboraNaTela(e, AGORA)).toBe(false);
    expect(faixaNaTela(e, AGORA)).toBe(false);
  });

  it('o aviso de «sumiu» perdido: a abóbora sai sozinha 5 min depois do prazo do banco', () => {
    const e = juntarRodada(VAZIO, rodada(), true, AGORA);
    const fim = Date.parse('2026-10-05T15:14:00Z');
    expect(aboboraNaTela(e, fim + 4 * 60_000)).toBe(true);
    expect(aboboraNaTela(e, fim + 5 * 60_000)).toBe(false);
  });
});

describe('normalizarRodada', () => {
  it('lê a linha que o banco manda no Broadcast', () => {
    const r = normalizarRodada({
      id: '7', dia: '2026-10-05', solta_em: 'a', expira_em: 'b', semente: 9, origem: 'teste',
      situacao: 'achada', achada_em: 'c', achada_por: 'u', achada_por_nome: 'Kaio', achada_por_foto: '',
      ms: '1500', mais_rapida_do_dia: true,
    });
    expect(r).toMatchObject({ id: 7, origem: 'teste', situacao: 'achada', ms: 1500, mais_rapida_do_dia: true });
    // Foto vazia = sem foto: a faixa mostra só o nome.
    expect(r?.achada_por_foto).toBeNull();
  });

  it('lê o zumbi e o headshot; linha de antes da migration nova vem sem eles', () => {
    const nova = normalizarRodada({
      id: 8, solta_em: 'a', expira_em: 'b', semente: 9, situacao: 'achada', zumbi: 5,
      headshot: true, headshot_mais_rapido_do_dia: true,
    });
    expect(nova).toMatchObject({ zumbi: 5, headshot: true, headshot_mais_rapido_do_dia: true });
    const antiga = normalizarRodada({ id: 7, solta_em: 'a', expira_em: 'b', semente: 9 });
    expect(antiga).toMatchObject({ zumbi: null, headshot: false, headshot_mais_rapido_do_dia: false });
  });

  it('o headshot que chega depois atualiza a mesma rodada', () => {
    const e1 = juntarRodada(VAZIO, achada(), true, AGORA);
    const e2 = juntarRodada(e1, achada({ headshot: true }), true, AGORA + 1000);
    expect(e2).not.toBe(e1);
    expect(e2.rodada?.headshot).toBe(true);
    expect(e2.faixaAte).toBe(e1.faixaAte);
  });

  it('lixo não vira rodada', () => {
    expect(normalizarRodada(null)).toBeNull();
    expect(normalizarRodada({ id: 'x' })).toBeNull();
  });
});

describe('formatarTempo e nomeCurto', () => {
  it('segundos com milésimos até um minuto; depois minutos', () => {
    expect(formatarTempo(4213)).toBe('4,213 s');
    expect(formatarTempo(187_000)).toBe('3 min 07 s');
    expect(formatarTempo(null)).toBe('—');
  });

  it('primeiro e último nome', () => {
    expect(nomeCurto('Ana Paula Moura Silva')).toBe('Ana Silva');
    expect(nomeCurto('Kaio Gomes')).toBe('Kaio Gomes');
    expect(nomeCurto('  ')).toBe('Alguém');
  });
});
