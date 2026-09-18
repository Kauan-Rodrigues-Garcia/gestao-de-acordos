import { useEffect, useState } from 'react';

/**
 * O valor, com atraso: só acompanha depois de `esperaMs` sem mudar.
 *
 * Para campo de busca que vira consulta. Sem isto, «joão silva» são dez
 * consultas — uma por tecla — e cada uma roda até o fim no banco: a resposta
 * de uma tecla velha descartada no navegador não cancela nada lá dentro. Na
 * lista de acordos cada tecla eram duas (hoje + resto, com `count: 'exact'`) e
 * um `ilike '%…%'` em quatro colunas.
 *
 * O valor inicial vale na hora: busca que chega pela URL não espera.
 */
export function useValorComEspera<T>(valor: T, esperaMs = 350): T {
  const [atrasado, setAtrasado] = useState(valor);

  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), esperaMs);
    return () => clearTimeout(t);
  }, [valor, esperaMs]);

  return atrasado;
}
