/**
 * useChartColors — resolve CSS custom properties do tema em tempo real.
 * Recharts renderiza em SVG: atributos como `tick.fill` e `stroke` NÃO
 * aceitam `hsl(var(--x))` como valor SVG. Este hook lê o valor computado
 * via getComputedStyle e devolve strings de cor resolvidas, que atualizam
 * automaticamente quando o tema muda (dark, dark-grey, deep-blue…).
 *
 * IMPORTANTE: as CSS vars do projeto já vêm com o wrapper de função cromática
 * (ex: `--muted-foreground: oklch(0.65 0.03 220);`) — getComputedStyle
 * devolve a string completa "oklch(...)". Se ainda assim receber só os
 * canais "0.65 0.03 220", envolvemos em oklch(). A heurística abaixo
 * trata ambos os formatos.
 */
import { useState, useEffect } from 'react';

/** Normaliza o valor retornado por getPropertyValue para uma cor CSS válida.
 *  Aceita: "oklch(...)"/"hsl(...)"/"rgb(...)"/"#rrggbb"/apenas canais "l c h". */
function normalizarCor(raw: string, fallback = '#94a3b8'): string {
  const v = raw.trim();
  if (!v) return fallback;
  // Já é função cromática completa ou hex
  if (/^(oklch|oklab|hsl|hsla|rgb|rgba|color|lab|lch)\(/i.test(v)) return v;
  if (v.startsWith('#')) return v;
  // Apenas canais (ex: "0.65 0.03 220" ou "220 15% 50%"): assume oklch
  return `oklch(${v})`;
}

/**
 * Converte qualquer cor CSS para `rgb(r, g, b)` ou `rgba(r, g, b, a)`.
 *
 * Motivação: atributos SVG (`fill`, `stroke`) em alguns engines de renderização
 * — especialmente através do Recharts — ignoram funções de cor modernas como
 * `oklch(...)` e `color-mix(...)`. A única forma 100% compatível é usar
 * `rgb()`/`rgba()`/`#rrggbb`. O browser já sabe converter qualquer cor CSS
 * válida — basta atribuir a um elemento e ler de volta via getComputedStyle.
 */
function toRgbCompativelComSvg(cor: string, fallback = '#1f2937'): string {
  if (typeof document === 'undefined') return fallback;
  try {
    // Atalho: hex e rgb() já funcionam em SVG
    if (cor.startsWith('#') || /^rgba?\(/i.test(cor)) return cor;

    const probe = document.createElement('span');
    probe.style.color = cor;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color; // sempre "rgb(r,g,b)" ou "rgba(..)"
    document.body.removeChild(probe);
    if (computed && /^rgba?\(/.test(computed)) return computed;
    return fallback;
  } catch {
    return fallback;
  }
}

/** Resolve uma lista de CSS var names → valores computados de cor */
export function useChartColors(vars: string[]): Record<string, string> {
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    function resolve() {
      const resolved: Record<string, string> = {};
      const style = getComputedStyle(document.documentElement);
      for (const v of vars) {
        const normalizada = normalizarCor(style.getPropertyValue(v));
        resolved[v] = toRgbCompativelComSvg(normalizada, '#94a3b8');
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
 *
 * Eixo (tickColor): usa --foreground (não --muted-foreground) para garantir
 *   contraste forte em todos os temas escuros. O usuário reportou que
 *   os labels dos eixos X/Y ficavam "apagados" nos temas Escuro/Azul/Cinza
 *   porque --muted-foreground ali tem luminosidade ~0.62-0.65, próxima do
 *   fundo do card (que é um muted escuro). --foreground fica em ~0.92-0.93,
 *   garantindo legibilidade.
 * Grid: --border com opacidade baixa para não dominar.
 */
export function useAxisColors() {
  const [tickColor, setTickColor] = useState('#1f2937');
  const [gridColor, setGridColor] = useState('rgba(148,163,184,0.3)');

  useEffect(() => {
    function resolve() {
      const style = getComputedStyle(document.documentElement);

      // Para ticks do eixo, usar --foreground (contraste alto). Fallback: --muted-foreground.
      const fgRaw = style.getPropertyValue('--foreground').trim() ||
                    style.getPropertyValue('--muted-foreground').trim();
      if (fgRaw) {
        const normalizada = normalizarCor(fgRaw, '#1f2937');
        setTickColor(toRgbCompativelComSvg(normalizada, '#1f2937'));
      }

      // Grid: --border com opacidade baixa. Convertemos para rgba (SVG-safe).
      const borderRaw = style.getPropertyValue('--border').trim();
      if (borderRaw) {
        const borderNorm = normalizarCor(borderRaw, '#94a3b8');
        const borderRgb  = toRgbCompativelComSvg(borderNorm, '#94a3b8'); // "rgb(r,g,b)" ou "#..."
        // Transforma em rgba(r,g,b,0.4) para ter grid suave
        const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(borderRgb);
        if (m) {
          setGridColor(`rgba(${m[1]}, ${m[2]}, ${m[3]}, 0.4)`);
        } else {
          setGridColor(borderRgb); // fallback: usa a cor sólida (melhor que nada)
        }
      }
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
