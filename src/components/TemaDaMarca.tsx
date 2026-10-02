/**
 * TemaDaMarca — põe o tema da marca da pessoa ao entrar: Birigui (BookPlay)
 * no azul, Marília (PaguePlay) no verde. Ver `lib/marca.ts`.
 *
 * Só troca entre os temas claros e só quando a marca chega ou muda: quem
 * escolheu um tema escuro continua nele, e quem trocar o tema no menu fica com
 * a escolha até a próxima entrada.
 */
import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import type { Marca } from '@/lib/marca';
import { ehTemaEscuro } from '@/lib/temas';

export function TemaDaMarca({ marca }: { marca: Marca | null }): null {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const tema = marca?.tema;

  useEffect(() => {
    if (!tema || ehTemaEscuro(resolvedTheme)) return;
    if (theme !== tema) setTheme(tema);
    // Só quando a marca muda; o tema escolhido depois no menu fica.
  }, [tema]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
