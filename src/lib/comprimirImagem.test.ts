import { describe, expect, it } from 'vitest';
import { deveComprimir, medidasAlvo, nomeComExtensao, TAMANHO_SEM_COMPRESSAO } from './comprimirImagem';

describe('a foto do chat encolhida antes de subir', () => {
  it('só foto grande de formato que dá para recodificar', () => {
    const grande = TAMANHO_SEM_COMPRESSAO + 1;
    expect(deveComprimir({ type: 'image/jpeg', size: grande })).toBe(true);
    expect(deveComprimir({ type: 'image/png', size: grande })).toBe(true);
    expect(deveComprimir({ type: 'image/jpeg', size: TAMANHO_SEM_COMPRESSAO })).toBe(false);
    // GIF perderia a animação; SVG e PDF não são foto.
    expect(deveComprimir({ type: 'image/gif', size: grande })).toBe(false);
    expect(deveComprimir({ type: 'image/svg+xml', size: grande })).toBe(false);
    expect(deveComprimir({ type: 'application/pdf', size: grande })).toBe(false);
  });

  it('cabe em 1920 sem distorcer e nunca aumenta', () => {
    expect(medidasAlvo(4000, 3000)).toEqual({ largura: 1920, altura: 1440 });
    expect(medidasAlvo(3000, 4000)).toEqual({ largura: 1440, altura: 1920 });
    expect(medidasAlvo(800, 600)).toEqual({ largura: 800, altura: 600 });
  });

  it('o nome troca a extensão pelo formato novo', () => {
    expect(nomeComExtensao('IMG_2031.PNG', 'image/webp')).toBe('IMG_2031.webp');
    expect(nomeComExtensao('foto.da.festa.jpeg', 'image/jpeg')).toBe('foto.da.festa.jpg');
    expect(nomeComExtensao('sem-extensao', 'image/webp')).toBe('sem-extensao.webp');
  });
});
