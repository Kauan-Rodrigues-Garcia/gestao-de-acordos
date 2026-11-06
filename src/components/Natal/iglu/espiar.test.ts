import { afterEach, describe, expect, it } from 'vitest';
import { criarRodada, LIMITE_DE_CONVERSAS, REPERTORIO } from './falas';
import { CORTINA_FECHADA_MS, cortinaFechadaAte, fecharCortina, sortearAtividade } from './espiar';

function sorteador(semente: number) {
  let s = semente;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

describe('o limite de conversa do urso', () => {
  it('conversa 10 vezes, se despede na 11ª e depois fica quieto', () => {
    const r = criarRodada('Ana', 10, sorteador(2));
    for (let i = 0; i < LIMITE_DE_CONVERSAS; i++) {
      expect(r.conversar('pescando')).not.toBeNull();
      expect(r.calado).toBe(false);
    }
    const despedidas = new Set(REPERTORIO.CANSOU.map(c => c.map(f => f.split('{nome}').join('Ana')).join('|')));
    expect(despedidas.has((r.conversar('pescando') ?? []).join('|'))).toBe(true);
    expect(r.calado).toBe(true);
    for (let i = 0; i < 5; i++) expect(r.conversar('pescando')).toBeNull();
  });

  it('no iglu, a despedida é a da porta', () => {
    const r = criarRodada(null, 10, sorteador(9));
    for (let i = 0; i < LIMITE_DE_CONVERSAS; i++) r.conversar('iglu');
    const daPorta = new Set(REPERTORIO.CANSOU_IGLU.map(c => c.join('|')));
    expect(daPorta.has((r.conversar('iglu') ?? []).join('|'))).toBe(true);
    expect(r.conversar('iglu')).toBeNull();
  });

  it('o tchauzinho para o trem não gasta o limite', () => {
    const r = criarRodada(null, 10, sorteador(4));
    for (let i = 0; i < 30; i++) r.proxima('trem');
    for (let i = 0; i < LIMITE_DE_CONVERSAS; i++) expect(r.conversar('pescando')).not.toBeNull();
  });
});

describe('espiar pela janela', () => {
  afterEach(() => { localStorage.clear(); });

  it('a cortina fica fechada por cinco minutos', () => {
    expect(cortinaFechadaAte()).toBe(0);
    const ate = fecharCortina(1_000_000);
    expect(ate).toBe(1_000_000 + CORTINA_FECHADA_MS);
    expect(cortinaFechadaAte()).toBe(ate);
  });

  it('duas espiadas seguidas nunca mostram a mesma atividade', () => {
    const s = sorteador(13);
    let antes = sortearAtividade(s);
    for (let i = 0; i < 60; i++) {
      const agora = sortearAtividade(s);
      expect(agora).not.toBe(antes);
      antes = agora;
    }
  });

  it('todas as atividades aparecem', () => {
    const s = sorteador(21);
    const vistas = new Set(Array.from({ length: 200 }, () => sortearAtividade(s)));
    expect(vistas.size).toBe(6);
  });
});
