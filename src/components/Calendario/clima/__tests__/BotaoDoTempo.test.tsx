import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { paletaGibi } from '@/lib/calendarioGibi';
import { TEMAS } from '@/lib/calendarioSetor';
import { BotaoDoTempo, type ClimaDoBotao } from '../BotaoDoTempo';

const CLIMA: ClimaDoBotao = {
  condicao: 'chuva', noite: false, temp: 24, estacao: 'primavera', variante: 0,
  resumo: 'Birigui: 24°, chuva, máx 27° mín 15°',
};

function ComEstado() {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <span>fora</span>
      <BotaoDoTempo
        paleta={paletaGibi(TEMAS[0], false)}
        clima={CLIMA}
        aberto={aberto}
        onAlternar={() => setAberto(v => !v)}
        onFechar={() => setAberto(false)}
      >
        <p>card do tempo</p>
      </BotaoDoTempo>
    </div>
  );
}

describe('BotaoDoTempo', () => {
  it('mostra a temperatura e diz o tempo no rótulo', () => {
    render(<ComEstado />);
    const botao = screen.getByRole('button');
    expect(botao).toHaveTextContent('24°');
    expect(botao).toHaveAttribute('aria-label', expect.stringContaining('Birigui: 24°, chuva'));
    expect(botao).toHaveAttribute('aria-expanded', 'false');
  });

  it('o clique abre só o card do tempo; Esc e clique fora fecham', () => {
    render(<ComEstado />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toHaveTextContent('card do tempo');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button'));
    fireEvent.pointerDown(screen.getByText('fora'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
