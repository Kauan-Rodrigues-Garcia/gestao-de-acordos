import { describe, expect, it, vi } from 'vitest';
import { createRef, useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { RealceDeVariavel, VariableChips, insertVariable, variaveisUsadas } from './VariaveisMensagem';

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

/**
 * O botão da variável que já está na mensagem fica preenchido, e o mouse nele
 * realça onde ela foi usada (20/10/2026).
 */
describe('variável já usada na mensagem', () => {
  it('lê as variáveis como o renderTemplate, com espaço e sem diferença de caixa', () => {
    expect([...variaveisUsadas('Oi {{primeiro_nome}}, {{ juncao }} ou {{JUNCAO_12x}}')].sort())
      .toEqual(['juncao', 'juncao_12x', 'primeiro_nome']);
  });

  it('o botão da usada fica preenchido; o mouse avisa qual realçar e, ao sair, nenhuma', () => {
    const onRealcar = vi.fn();
    render(<VariableChips texto="Olá {{nome}}" onInsert={() => {}} onRealcar={onRealcar} />);
    const usada = screen.getByRole('button', { name: 'Nome completo' });
    const livre = screen.getByRole('button', { name: 'Primeiro nome' });
    expect(usada.className).toContain('bg-foreground/80');
    expect(livre.className).not.toContain('bg-foreground/80');
    fireEvent.mouseEnter(usada);
    expect(onRealcar).toHaveBeenLastCalledWith('nome');
    fireEvent.mouseLeave(usada);
    expect(onRealcar).toHaveBeenLastCalledWith(null);
  });

  function Caixa({ texto, variavel }: { texto: string; variavel: string | null }) {
    const ref = useRef<HTMLTextAreaElement>(null);
    return (
      <div className="relative">
        <textarea ref={ref} defaultValue={texto} />
        <RealceDeVariavel alvo={ref} texto={texto} variavel={variavel} />
      </div>
    );
  }

  it('realça todas as ocorrências, e só as dela', () => {
    const { container } = render(<Caixa texto="{{juncao}} em 12x de {{juncao_12x}}, ou {{ juncao }}" variavel="juncao" />);
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['{{juncao}}', '{{ juncao }}']);
  });

  it('sem variável, ou com uma que o texto não usa, não desenha nada', () => {
    expect(render(<Caixa texto="{{nome}}" variavel={null} />).container.querySelector('mark')).toBeNull();
    expect(render(<Caixa texto="{{nome}}" variavel="cpf" />).container.querySelector('[aria-hidden]')).toBeNull();
  });
});
