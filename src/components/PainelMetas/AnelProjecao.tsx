/**
 * AnelProjecao — a projeção do mês desenhada como anel, dentro do card que já
 * existe.
 *
 * ## O que mudou, e o que não
 *
 * O card «Projeção» dizia «85%» em texto e nada mais. O número estava certo e
 * ilegível de relance: ao lado de três cards de dinheiro, um percentual solto
 * na mesma tipografia dos R$ some. O anel dá ao número a forma que ele tem —
 * uma fração de um todo — sem mudar uma linha da conta, que segue em
 * `calcularProjecao` e chega aqui pronta.
 *
 * ## Por que não é o `DonutChart` do AnalyticsPanel
 *
 * Aquele donut é recharts com `ResponsiveContainer`, dimensionado para os 180px
 * do `CardMetaDonut`. Aqui o anel tem 84px e vive DENTRO de um card de métrica:
 * carregar um gráfico com escala, tooltip e medição de container para desenhar
 * dois arcos é peso que a tela paga em cada render. São dois `<circle>`.
 *
 * ## Por que a animação é CSS, e não `framer-motion`
 *
 * O traço nasceu animado por `motion.circle`, e isso punha o valor FINAL fora
 * do DOM até o quadro seguinte: quem lesse o anel — um teste, um leitor de
 * tela, um print — pegava o estado inicial, um anel vazio. A transição em CSS
 * escreve o valor certo já no primeiro render e anima as MUDANÇAS (trocar de
 * mês, trocar de escopo), que é quando o movimento informa alguma coisa. De
 * graça vem `prefers-reduced-motion`, que o `framer-motion` aqui ignorava.
 *
 * ## O anel e o texto medem coisas diferentes de propósito
 *
 * O ARCO tem teto em 100% — passar de uma volta desenharia um anel cheio que
 * não se distingue de outro anel cheio. O NÚMERO no centro não tem teto: quem
 * está em 140% do esperado precisa ler 140%. É a mesma decisão do `DonutChart`
 * irmão, para os dois anéis do painel se lerem da mesma forma.
 *
 * A cor sai de `corProjecao` — a paleta dos quartis, a mesma que o card já
 * usava na borda e no número. O anel não inventa régua nova; veste a que a
 * linha inteira do painel já fala.
 */

/** Raio do círculo no sistema de coordenadas do SVG (viewBox 100×100). */
const RAIO = 42;
const PERIMETRO = 2 * Math.PI * RAIO;

export interface AnelProjecaoProps {
  /** A projeção em %, como sai de `calcularProjecao`. Pode passar de 100. */
  pct: number;
  /** Cor do arco — `corProjecao(pct)`, resolvida por quem chama. */
  cor: string;
  /** Lado do anel em px. */
  tamanho?: number;
}

export function AnelProjecao({ pct, cor, tamanho = 84 }: AnelProjecaoProps) {
  // O arco fecha em uma volta; o número no centro continua livre.
  const doArco = Math.max(0, Math.min(pct, 100));
  const vazio = PERIMETRO * (1 - doArco / 100);

  return (
    <div
      className="relative shrink-0"
      style={{ width: tamanho, height: tamanho }}
      role="img"
      aria-label={`Projeção: ${pct}% do esperado até hoje`}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full -rotate-90"
        aria-hidden="true"
      >
        {/* A trilha. `currentColor` a 12% acompanha o tema sem uma cor fixa
            que sumiria no escuro ou brigaria no claro. */}
        <circle
          cx="50" cy="50" r={RAIO}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          className="text-muted-foreground/20"
        />
        <circle
          cx="50" cy="50" r={RAIO}
          fill="none"
          stroke={cor}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={PERIMETRO}
          style={{
            strokeDashoffset: vazio,
            transition: 'stroke-dashoffset 700ms ease-out, stroke 300ms linear',
          }}
          className="motion-reduce:transition-none"
        />
      </svg>

      {/* O percentual vive FORA do SVG: assim herda a fonte tabular do painel e
          escala com o tema, em vez de virar um `<text>` que ignora as duas. */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span
          className="text-lg font-bold leading-none tabular-nums tracking-tight"
          style={{ color: cor }}
        >
          {pct}%
        </span>
      </div>
    </div>
  );
}
