/**
 * comemoracaoMidias.grupo.test.ts — os dois campos da biblioteca.
 *
 * Com imagem e GIF no mesmo campo, quem decide o tipo do arquivo é o MIME, não
 * mais a aba onde a pessoa clicou. Errar aqui é o PNG entrando como GIF (e
 * sumindo da grade certa) ou um MP3 sendo aceito no campo visual.
 */
import { describe, it, expect } from 'vitest';
import {
  validarArquivoDoGrupo, mimesDoGrupo, grupoDoTipo, TIPOS_DO_GRUPO,
  LIMITE_BYTES,
} from './comemoracaoMidias.service';

function arquivo(nome: string, tipo: string, bytes = 1024): File {
  const f = new File([new Uint8Array(1)], nome, { type: tipo });
  // `size` é somente-leitura no File; redefinir é a forma de testar o limite
  // sem alocar 10 MB em memória.
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

describe('grupos', () => {
  it('o campo visual junta GIF e imagem; o de som fica sozinho', () => {
    expect([...TIPOS_DO_GRUPO.visual]).toEqual(['gif', 'imagem']);
    expect([...TIPOS_DO_GRUPO.som]).toEqual(['som']);
  });

  it('grupoDoTipo mapeia os três tipos do banco nos dois campos da tela', () => {
    expect(grupoDoTipo('gif')).toBe('visual');
    expect(grupoDoTipo('imagem')).toBe('visual');
    expect(grupoDoTipo('som')).toBe('som');
  });

  it('o accept do campo visual aceita os dois formatos num botão só', () => {
    const accept = mimesDoGrupo('visual');
    for (const m of ['image/gif', 'image/png', 'image/jpeg', 'image/webp']) {
      expect(accept).toContain(m);
    }
    expect(accept).not.toContain('audio/');
  });

  it('o accept de áudio não deixa passar imagem', () => {
    const accept = mimesDoGrupo('som');
    expect(accept).toContain('audio/mpeg');
    expect(accept).not.toContain('image/');
  });
});

describe('validarArquivoDoGrupo', () => {
  it('GIF e PNG caem no campo visual, cada um no seu tipo', () => {
    expect(validarArquivoDoGrupo(arquivo('a.gif', 'image/gif'), 'visual'))
      .toEqual({ tipo: 'gif', erro: null });
    expect(validarArquivoDoGrupo(arquivo('a.png', 'image/png'), 'visual'))
      .toEqual({ tipo: 'imagem', erro: null });
    expect(validarArquivoDoGrupo(arquivo('a.jpg', 'image/jpeg'), 'visual'))
      .toEqual({ tipo: 'imagem', erro: null });
  });

  it('MP3 no campo visual é recusado com a mensagem do campo', () => {
    // Não "use a aba imagem": as abas deixaram de existir.
    const r = validarArquivoDoGrupo(arquivo('a.mp3', 'audio/mpeg'), 'visual');
    expect(r.tipo).toBeNull();
    expect(r.erro).toMatch(/GIF, PNG, JPG ou WEBP/);
  });

  it('imagem no campo de áudio é recusada', () => {
    const r = validarArquivoDoGrupo(arquivo('a.png', 'image/png'), 'som');
    expect(r.tipo).toBeNull();
    expect(r.erro).toMatch(/MP3, WAV ou OGG/);
  });

  it('formato desconhecido é recusado', () => {
    const r = validarArquivoDoGrupo(arquivo('a.pdf', 'application/pdf'), 'visual');
    expect(r.tipo).toBeNull();
    expect(r.erro).toBeTruthy();
  });

  it('acima do limite é recusado mesmo sendo do tipo certo', () => {
    const r = validarArquivoDoGrupo(arquivo('g.gif', 'image/gif', LIMITE_BYTES + 1), 'visual');
    expect(r.tipo).toBeNull();
    expect(r.erro).toMatch(/limite/i);
  });

  it('exatamente no limite passa', () => {
    expect(validarArquivoDoGrupo(arquivo('g.gif', 'image/gif', LIMITE_BYTES), 'visual').tipo)
      .toBe('gif');
  });
});
