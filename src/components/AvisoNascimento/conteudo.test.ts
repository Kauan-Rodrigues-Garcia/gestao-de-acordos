import { describe, expect, it } from 'vitest';
import { comDestaque, conteudoDoBanco, escapar } from './conteudo';

describe('conteúdo do livro', () => {
  it('banco vazio ou torto não quebra', () => {
    expect(conteudoDoBanco(null).titulo_capa).toBe('Uma nova história');
    expect(conteudoDoBanco({ paragrafos: 'x', sugestoes: [1, ' ', 'Oi'] })).toMatchObject({ paragrafos: [], sugestoes: ['Oi'] });
  });

  it('texto do banco nunca vira HTML', () => {
    expect(escapar('<img src=x onerror="a">')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;');
    expect(comDestaque('**<b>oi</b>** e <i>')).toBe('<strong>&lt;b&gt;oi&lt;/b&gt;</strong> e &lt;i&gt;');
  });
});
