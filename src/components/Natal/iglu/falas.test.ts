import { describe, expect, it } from 'vitest';
import { CHANCE_DE_INSISTENCIA, criarBaralho, criarRodada, periodoDoDia, REPERTORIO } from './falas';

/** Um sorteio repetível, para o teste não depender da sorte. */
function sorteador(semente: number) {
  let s = semente;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

describe('o baralho do urso', () => {
  it('não repete nada até acabar todas', () => {
    const itens = Array.from({ length: 30 }, (_, i) => i);
    const b = criarBaralho(itens, sorteador(3));
    const tiradas = Array.from({ length: 30 }, () => b.tirar());
    expect(new Set(tiradas).size).toBe(30);
  });

  it('ao recomeçar, não abre com a última que saiu', () => {
    for (let semente = 1; semente < 200; semente++) {
      const b = criarBaralho([1, 2, 3, 4], sorteador(semente));
      const primeira = [b.tirar(), b.tirar(), b.tirar(), b.tirar()];
      expect(b.tirar()).not.toBe(primeira[3]);
    }
  });

  it('a ordem muda de uma rodada para outra', () => {
    const itens = Array.from({ length: 20 }, (_, i) => i);
    const a = criarBaralho(itens, sorteador(5)), b = criarBaralho(itens, sorteador(99));
    const ordemA = itens.map(() => a.tirar()).join(), ordemB = itens.map(() => b.tirar()).join();
    expect(ordemA).not.toBe(ordemB);
  });
});

describe('a conversa do urso', () => {
  it('começa a rodada cumprimentando, conforme a hora', () => {
    expect(periodoDoDia(8)).toBe('manha');
    expect(periodoDoDia(14)).toBe('tarde');
    expect(periodoDoDia(21)).toBe('noite');
    expect(periodoDoDia(3)).toBe('noite');
    const cumprimentosDaTarde = [...REPERTORIO.CUMPRIMENTOS.tarde, ...REPERTORIO.QUALQUER_HORA]
      .map(c => c.map(f => f.split('{nome}').join('Ana')).join('|'));
    for (let semente = 1; semente < 30; semente++) {
      const r = criarRodada('Ana', 14, sorteador(semente));
      expect(cumprimentosDaTarde).toContain(r.proxima('pescando').join('|'));
    }
  });

  it('chama a pessoa pelo nome, e sem nome não deixa «{nome}» escapar', () => {
    const comNome = criarRodada('Ana', 10, sorteador(1));
    const semNome = criarRodada(null, 10, sorteador(1));
    const falas: string[] = [];
    for (let i = 0; i < 200; i++) {
      falas.push(...comNome.proxima('pescando'));
      falas.push(...semNome.proxima('pescando'), ...semNome.proxima('iglu'), ...semNome.proxima('fisgou'));
    }
    expect(falas.some(f => f.includes('Ana'))).toBe(true);
    expect(falas.some(f => f.includes('{nome}'))).toBe(false);
  });

  it('numa rodada, não repete conversa enquanto não acabar o repertório', () => {
    const r = criarRodada('Ana', 10, sorteador(11));
    r.proxima('pescando'); // o cumprimento
    const vistas = new Set<string>();
    // Sem contar as insistências (sorteadas à parte), o repertório de pesca inteiro sai sem repetir.
    let pescas = 0;
    while (pescas < REPERTORIO.PESCANDO.length) {
      const c = r.proxima('pescando').join('|');
      if (REPERTORIO.INSISTENCIA.some(i => i.map(f => f.split('{nome}').join('Ana')).join('|') === c)) continue;
      expect(vistas.has(c)).toBe(false);
      vistas.add(c);
      pescas++;
    }
  });

  it('quem insiste muito às vezes ouve uma reclamação', () => {
    const r = criarRodada('Ana', 10, sorteador(4));
    const insistencias = new Set(REPERTORIO.INSISTENCIA.map(i => i.map(f => f.split('{nome}').join('Ana')).join('|')));
    let ouviu = 0;
    for (let i = 0; i < 80; i++) if (insistencias.has(r.proxima('pescando').join('|'))) ouviu++;
    expect(ouviu).toBeGreaterThan(0);
    expect(ouviu).toBeLessThan(80 * (CHANCE_DE_INSISTENCIA + 0.15));
  });

  it('tem repertório de sobra', () => {
    expect(REPERTORIO.PESCANDO.length).toBeGreaterThanOrEqual(40);
    expect(REPERTORIO.FISGOU.length).toBeGreaterThanOrEqual(10);
    expect(REPERTORIO.IGLU.length).toBeGreaterThanOrEqual(10);
  });
});
