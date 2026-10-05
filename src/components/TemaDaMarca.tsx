/**
 * DesfazTemaDaMarca — devolve, uma vez só, o tema que a marca escolheu sozinha.
 *
 * Entre 03 e 04/10/2026 este arquivo punha o TEMA Verde em quem estava num
 * setor de Marília (e, por sobra de sessão, em gente da BookPlay também). Era
 * um engano: a cor da marca nunca foi um tema. A PaguePlay sempre teve os
 * temas de sempre (Claro, Escuro...) com os destaques em verde — o
 * `data-tenant`, que agora segue a pessoa (ver `TenantThemeApplier`, App.tsx).
 * O tema Verde é uma escolha do menu, como o Azul e o Rosa.
 *
 * Quem ficou com o Verde nesses dias volta para o Claro — que já vem no tom da
 * marca dele. Roda uma vez por navegador (marca em `localStorage`); quem
 * escolher o Verde de novo no menu fica com ele.
 */
import { useEffect } from 'react';
import { useTheme } from 'next-themes';

const CHAVE = 'tema-da-marca-desfeito';

export function DesfazTemaDaMarca(): null {
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (!theme) return;
    try {
      if (localStorage.getItem(CHAVE)) return;
      if (theme === 'verde') setTheme('light');
      localStorage.setItem(CHAVE, '1');
    } catch { /* sem armazenamento: não há o que desfazer */ }
  }, [theme, setTheme]);
  return null;
}
