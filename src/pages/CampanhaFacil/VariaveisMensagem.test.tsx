import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { insertVariable } from './VariaveisMensagem';

/**
 * Inserir uma variável não pode levar a tela para o fim do texto (15/10/2026:
 * «sempre desce pra baixo»).
 */
describe('insertVariable', () => {
  function caixa(texto: string, cursor: number, rolagem: number) {
    const el = document.createElement('textarea');
    el.value = texto;
    document.body.appendChild(el);
    el.setSelectionRange(cursor, cursor);
    el.scrollTop = rolagem;
    const ref = createRef<HTMLTextAreaElement>() as { current: HTMLTextAreaElement | null };
    ref.current = el;
    // O `setValue` do React troca o value da caixa — e o cursor vai para o fim.
    const setValue = vi.fn((v: string) => { el.value = v; el.scrollTop = 9999; });
    return { el, ref, setValue };
  }

  it('põe a variável onde estava o cursor e deixa o cursor logo depois', () => {
    const { el, ref, setValue } = caixa('Olá , tudo bem?', 4, 0);
    insertVariable(ref as never, el.value, setValue, 'nome');
    expect(setValue).toHaveBeenCalledWith('Olá {{nome}}, tudo bem?');
    expect(el.selectionStart).toBe(4 + '{{nome}}'.length);
  });

  it('a caixa volta à rolagem de antes e o foco não rola a janela', () => {
    const { el, ref, setValue } = caixa('linha\n'.repeat(80), 30, 120);
    const foco = vi.spyOn(el, 'focus');
    insertVariable(ref as never, el.value, setValue, 'quitacao');
    expect(el.scrollTop).toBe(120);
    expect(foco).toHaveBeenCalledWith({ preventScroll: true });
  });
});
