/**
 * depois.ts — montar em etapas (pedido de 06/10/2026): as camadas pesadas da cena
 * (chuva, água no vidro) entram um instante depois do fundo, para a montagem não
 * cair inteira num quadro só — num computador fraco isso congelava a página bem
 * quando o tema começava a entrar. Elas seguem a música, que acabou de começar:
 * o atraso não aparece.
 */
import { useEffect, useState } from 'react';

/** `true` depois de `ms` milissegundos montado. */
export function useDepois(ms: number): boolean {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setPronto(true), ms);
    return () => window.clearTimeout(t);
  }, [ms]);
  return pronto;
}
