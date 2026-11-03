/**
 * aguenta.test.ts — quando o tema de Halloween se recolhe sozinho.
 *
 * O que se fixa: uma carga pesada isolada não para o tema (abrir o Analítico
 * dá um quadro longo e não é máquina fraca), e a máquina sem placa de vídeo é
 * reconhecida tanto pelo nome do renderizador quanto pela falta de WebGL.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { halloweenSufocou, JANELA_SUFOCO_MS, type QuadroLongo } from './aguenta';

const AGORA = 100_000;
const quadros = (n: number, duracao: number, fim = AGORA): QuadroLongo[] =>
  Array.from({ length: n }, (_, i) => ({ fim: fim - i * 100, duracao }));

describe('halloweenSufocou', () => {
  it('uma carga pesada isolada não para o tema', () => {
    expect(halloweenSufocou([{ fim: AGORA, duracao: 2_500 }], AGORA)).toBe(false);
  });

  it('muitas travadas curtas que somam pouco também não', () => {
    expect(halloweenSufocou(quadros(20, 55), AGORA)).toBe(false); // 1,1 s
  });

  it('quadros longos em sequência param', () => {
    expect(halloweenSufocou(quadros(8, 160), AGORA)).toBe(true); // 8 × 160 ms
  });

  it('quadro abaixo de 50 ms não conta', () => {
    expect(halloweenSufocou(quadros(40, 49), AGORA)).toBe(false);
  });

  it('o que caiu fora da janela não conta', () => {
    const antigos = quadros(8, 300, AGORA - JANELA_SUFOCO_MS - 1_000);
    expect(halloweenSufocou(antigos, AGORA)).toBe(false);
  });
});

describe('semPlacaDeVideo', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

  async function comRenderizador(nome: string | null) {
    const gl = nome === null ? null : {
      RENDERER: 0x1f01,
      getExtension: (e: string) => (e === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
      getParameter: () => nome,
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as never);
    const { semPlacaDeVideo } = await import('./aguenta');
    return semPlacaDeVideo();
  }

  it('placa de verdade não para', async () => {
    expect(await comRenderizador('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
  });

  it('SwiftShader é sem placa', async () => {
    expect(await comRenderizador('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(true);
  });

  it('o driver básico do Windows é sem placa', async () => {
    expect(await comRenderizador('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
  });

  it('sem WebGL nenhum é sem placa', async () => {
    expect(await comRenderizador(null)).toBe(true);
  });
});
