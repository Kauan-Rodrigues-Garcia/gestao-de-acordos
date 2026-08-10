/**
 * volume.test.ts
 *
 * Errar aqui é som no talo em cima de quem está em ligação — o motivo de as
 * três regras existirem.
 */
import { describe, it, expect } from 'vitest';
import {
  VOLUME_PADRAO, VOLUME_AVISO, VOLUME_SETOR,
  volumeTravado, volumeEfetivo, volumeAtrapalha,
} from './volume';

describe('padrão', () => {
  it('nasce em 25%, não no volume cheio', () => {
    expect(VOLUME_PADRAO).toBe(25);
  });

  it('o padrão não dispara o aviso — senão ele viraria paisagem', () => {
    expect(volumeAtrapalha(VOLUME_PADRAO)).toBe(false);
  });
});

describe('aviso a partir de 60%', () => {
  it('avisa no limite e acima dele', () => {
    expect(volumeAtrapalha(VOLUME_AVISO)).toBe(true);
    expect(volumeAtrapalha(100)).toBe(true);
  });

  it('não avisa abaixo', () => {
    expect(volumeAtrapalha(VOLUME_AVISO - 5)).toBe(false);
    expect(volumeAtrapalha(0)).toBe(false);
  });
});

describe('meta de setor trava o volume', () => {
  it('só o alvo setor trava', () => {
    expect(volumeTravado('setor')).toBe(true);
    expect(volumeTravado('equipe')).toBe(false);
    expect(volumeTravado('operadores')).toBe(false);
  });

  it('travado, vale o teto, não o que a pessoa arrastou', () => {
    expect(volumeEfetivo(100, 'setor')).toBe(VOLUME_SETOR);
    expect(volumeEfetivo(0,   'setor')).toBe(VOLUME_SETOR);
  });

  it('sem trava, vale o escolhido', () => {
    expect(volumeEfetivo(80, 'equipe')).toBe(80);
    expect(volumeEfetivo(80, 'operadores')).toBe(80);
  });

  it('o valor escolhido sobrevive à ida e volta pelo alvo setor', () => {
    // Deriva, não sobrescreve: quem escolheu 80, foi ver Setor e voltou não
    // perde os 80.
    const escolhido = 80;
    expect(volumeEfetivo(escolhido, 'setor')).toBe(VOLUME_SETOR);
    expect(volumeEfetivo(escolhido, 'operadores')).toBe(escolhido);
  });

  it('o teto do setor não dispara o aviso', () => {
    expect(volumeAtrapalha(VOLUME_SETOR)).toBe(false);
  });
});
