/**
 * TelaComAbas — a moldura das telas que o Mapa de Abas juntou.
 *
 * O que se trava: a aba vem da URL; aba sem permissão não aparece e a URL que
 * a pede cai na primeira liberada; abas da mesma instância dividem UM
 * componente montado (o Controle de Números não pode recarregar a cada troca).
 */
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Hash, Smartphone, Trash2 } from 'lucide-react';
import { TelaComAbas, type AbaDaTela } from './TelaComAbas';

let montagens = 0;
function Contador({ aba }: { aba: string }) {
  const [id] = useState(() => ++montagens);
  return <p>{`conteúdo ${aba} · montagem ${id}`}</p>;
}

function montar(url: string, lixeiraVisivel = true) {
  const abas: AbaDaTela[] = [
    { chave: 'celulares', rotulo: 'Celulares', Icon: Smartphone, visivel: true, instancia: 'n', render: a => <Contador aba={a} /> },
    { chave: 'numeros', rotulo: 'Números', Icon: Hash, visivel: true, instancia: 'n', render: a => <Contador aba={a} /> },
    { chave: 'lixeira', rotulo: 'Lixeira', Icon: Trash2, visivel: lixeiraVisivel, render: () => <p>lixeira</p> },
  ];
  return render(
    <MemoryRouter initialEntries={[url]}>
      <TelaComAbas titulo="Núcleo" Icon={Hash} abas={abas} />
    </MemoryRouter>,
  );
}

describe('<TelaComAbas />', () => {
  it('abre na aba que a URL pede', () => {
    montar('/nucleo?tab=numeros');
    expect(screen.getByText(/conteúdo numeros/)).toBeInTheDocument();
  });

  it('aba sem permissão não aparece, e a URL que a pede cai na primeira liberada', () => {
    montar('/nucleo?tab=lixeira', false);
    expect(screen.queryByRole('button', { name: /Lixeira/ })).not.toBeInTheDocument();
    expect(screen.queryByText('lixeira')).not.toBeInTheDocument();
    expect(screen.getByText(/conteúdo celulares/)).toBeInTheDocument();
  });

  it('abas da mesma instância dividem um componente montado', () => {
    montagens = 0;
    montar('/nucleo?tab=celulares');
    expect(screen.getByText('conteúdo celulares · montagem 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Números/ }));
    // Mesma montagem, outra aba: nada foi recarregado.
    expect(screen.getByText('conteúdo numeros · montagem 1')).toBeInTheDocument();
  });

  it('com uma aba só, a régua some', () => {
    render(
      <MemoryRouter initialEntries={['/x']}>
        <TelaComAbas titulo="Auditoria" Icon={Hash} abas={[
          { chave: 'trilha', rotulo: 'Trilha', Icon: Hash, visivel: true, render: () => <p>trilha</p> },
          { chave: 'uso', rotulo: 'Uso', Icon: Hash, visivel: false, render: () => <p>uso</p> },
        ]} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.getByText('trilha')).toBeInTheDocument();
  });

  it('sem nenhuma aba liberada, diz isso em vez de ficar em branco', () => {
    render(
      <MemoryRouter initialEntries={['/x']}>
        <TelaComAbas titulo="Núcleo" Icon={Hash} abas={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Nenhuma seção de Núcleo/)).toBeInTheDocument();
  });
});
