/**
 * AcordoTags.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * O bug que originou o componente: a BookPlay criou a tag "IA VOZ", o acordo
 * salvava `tag_ids` corretamente e nada aparecia na lista — porque o único
 * renderizador vivia dentro da tabela PaguePlay-only do Dashboard. Os testes
 * fixam as duas pontas: id conhecido vira chip, id órfão não quebra a linha.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AcordoTags } from './AcordoTags';

const TAGS = [
  { id: 't1', nome: 'IA VOZ', cor: '#ec4899' },
  { id: 't2', nome: 'SMS',    cor: '#3b82f6' },
];

describe('<AcordoTags />', () => {
  it('não renderiza nada quando tag_ids é null ou vazio', () => {
    const { container: semNada } = render(<AcordoTags tagIds={null} tags={TAGS} />);
    expect(semNada.firstChild).toBeNull();

    const { container: vazio } = render(<AcordoTags tagIds={[]} tags={TAGS} />);
    expect(vazio.firstChild).toBeNull();
  });

  it('renderiza o chip com nome e cor da tag correspondente', () => {
    render(<AcordoTags tagIds={['t1']} tags={TAGS} />);
    const chip = screen.getByText('IA VOZ');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveStyle({ color: '#ec4899' });
  });

  it('renderiza um chip por id, na ordem de tag_ids', () => {
    render(<AcordoTags tagIds={['t2', 't1']} tags={TAGS} />);
    const chips = screen.getAllByTitle(/IA VOZ|SMS/);
    expect(chips.map(c => c.textContent)).toEqual(['SMS', 'IA VOZ']);
  });

  // Tag excluída no Admin depois de já aplicada a um acordo: o id continua no
  // array. Ignorar em silêncio é o que mantém a linha inteira renderizando.
  it('ignora id sem tag correspondente sem derrubar os demais', () => {
    render(<AcordoTags tagIds={['fantasma', 't1']} tags={TAGS} />);
    expect(screen.getByText('IA VOZ')).toBeInTheDocument();
    expect(screen.queryByText('fantasma')).not.toBeInTheDocument();
  });

  it('size="sm" aumenta a fonte do chip', () => {
    render(<AcordoTags tagIds={['t1']} tags={TAGS} size="sm" />);
    expect(screen.getByText('IA VOZ')).toHaveClass('text-[10px]');
  });
});
