/**
 * useChartColors — resolve CSS custom properties do tema em tempo real.
 * Recharts renderiza em SVG: atributos como `tick.fill` e `stroke` NÃO
 * aceitam `hsl(var(--x))` como valor SVG. Este hook lê o valor computado
 * via getComputedStyle e devolve strings de cor resolvidas, que atualizam
 * automaticamente quando o tema muda (dark, dark-grey, deep-blue…).
 */
import { useState, useEffect } from 'react';

function getCSSVar(name: string): string {
  if (typeof window === 'undefined') return '#888';
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!raw) return '#888';
  // Se já vier como oklch/hex/rgb, usa direto
  return `oklch(${raw})`.startsWith('oklch(oklch') ? raw : `oklch(${raw})`;
}

/** Resolve uma lista de CSS var names → valores computados de cor */
export function useChartColors(vars: string[]): Record<string, string> {
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    function resolve() {
      const resolved: Record<string, string> = {};
      for (const v of vars) {
        const raw = getComputedStyle(document.documentElement)
          .getPropertyValue(v)
          .trim();
        // raw vem sem o nome da função, ex: "0.65 0.03 220" para oklch
        // Precisamos montar a cor completa ou usar como canal oklch
        resolved[v] = raw ? `oklch(${raw})` : '#94a3b8';
      }
      setColors(resolved);
    }

    resolve();

    // Observa mudanças de classe no <html> (troca de tema)
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-tenant'],
    });

    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return colors;
}

/**
 * Hook simplificado: retorna as cores mais usadas nos gráficos,
 * resolvidas a partir das CSS vars do tema ativo.
 */
export function useAxisColors() {
  const [tickColor, setTickColor] = useState('#94a3b8');
  const [gridColor, setGridColor] = useState('rgba(148,163,184,0.2)');

  useEffect(() => {
    function resolve() {
      const el = document.documentElement;
      const style = getComputedStyle(el);

      // --muted-foreground: canal oklch ex "0.65 0.03 220"
      const mutedFg = style.getPropertyValue('--muted-foreground').trim();
      if (mutedFg) setTickColor(`oklch(${mutedFg})`);

      // --border: canal oklch, usamos com opacidade baixa para grid
      const border = style.getPropertyValue('--border').trim();
      if (border) setGridColor(`oklch(${border} / 0.5)`);
    }

    resolve();

    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-tenant'],
    });

    return () => observer.disconnect();
  }, []);

  return { tickColor, gridColor };
}
