/**
 * SangueDoMenu — a aba selecionada do menu ganha uma linha de sangue na borda
 * de baixo, que escorre e pinga.
 *
 * Ao montar (abrir a tela), o sangue corre da esquerda para a direita pela
 * borda; depois, em três ou quatro pontos, filetes descem devagar — primeiro
 * lentos, depois soltando — com uma gota gorda na ponta. De tempos em tempos
 * uma gota se solta da ponta e cai, esticando, até sumir.
 *
 * Cor de objeto (vermelho-sangue com brilho úmido): lê sobre a aba em qualquer
 * tema. Carregado sob demanda pelo `Layout`, com a própria folha de estilo:
 * quem não vê o Halloween não baixa nada disto.
 */
import { useMemo, type CSSProperties } from 'react';
import './sangue.css';

const acaso = (min: number, max: number) => min + Math.random() * (max - min);

type Filete = { x: number; largura: number; comprimento: number; atraso: number; duracao: number; pingaCada: number; pingaAtraso: number };

/** Sorteia os filetes: espalhados, sem dois colados. */
function sortearFiletes(quantos: number): Filete[] {
  const xs: number[] = [];
  let tentativas = 0;
  while (xs.length < quantos && tentativas++ < 50) {
    const x = acaso(10, 90);
    if (xs.every(o => Math.abs(o - x) > 14)) xs.push(x);
  }
  return xs.sort((a, b) => a - b).map((x, i) => {
    const grande = i === Math.floor(xs.length / 2);
    return {
      x,
      largura: acaso(2.2, 3.4) + (grande ? 0.6 : 0),
      comprimento: grande ? acaso(14, 20) : acaso(5, 12),
      atraso: 0.55 + acaso(0, 0.9),
      duracao: acaso(1.8, 3.2),
      pingaCada: acaso(3.2, 6),
      pingaAtraso: acaso(0.5, 2.5),
    };
  });
}

export default function SangueDoMenu({ estreita = false }: { estreita?: boolean }) {
  const filetes = useMemo(() => sortearFiletes(estreita ? 2 : Math.random() < 0.5 ? 3 : 4), [estreita]);

  return (
    <span className="hw-sangue" aria-hidden="true">
      {/* A borda: uma faixa de sangue com a beirada de cima irregular. */}
      <svg className="hw-sangue-borda" viewBox="0 0 200 8" preserveAspectRatio="none">
        <defs>
          <linearGradient id="hw-sangue-cor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5c0008" />
            <stop offset=".55" stopColor="#9b0716" />
            <stop offset="1" stopColor="#6e000c" />
          </linearGradient>
        </defs>
        <path
          d="M0 6.2 C 10 2.4, 24 1.6, 40 2.2 S 66 1.4, 84 2 S 116 2.8, 132 1.8 S 166 1.6, 184 2.4 S 196 3.6, 200 5.6 C 188 6.6, 176 5.4, 160 6.4 S 128 7.6, 112 6.2 S 80 5.4, 64 6.8 S 30 7.4, 18 6.4 S 4 6.6, 0 6.2 Z"
          fill="url(#hw-sangue-cor)"
        />
        {/* O brilho úmido, uma linha fina logo abaixo da beirada. */}
        <path
          d="M8 3.6 C 22 2.8, 34 3.2, 48 3 S 80 2.6, 96 3.1 S 128 3.4, 146 2.8 S 176 2.9, 192 3.6"
          fill="none" stroke="rgba(255,190,190,.35)" strokeWidth=".7" strokeLinecap="round"
        />
      </svg>

      {filetes.map((f, i) => (
        <span
          key={i}
          className="hw-sangue-filete"
          style={{
            left: `${f.x}%`,
            ['--largura' as string]: `${f.largura}px`,
            ['--comprimento' as string]: `${f.comprimento}px`,
            ['--atraso' as string]: `${f.atraso}s`,
            ['--duracao' as string]: `${f.duracao}s`,
            ['--pinga-cada' as string]: `${f.pingaCada}s`,
            ['--pinga-atraso' as string]: `${f.atraso + f.duracao + f.pingaAtraso}s`,
          } as CSSProperties}
        >
          <span className="hw-sangue-ponta" />
          <span className="hw-sangue-gota" />
        </span>
      ))}
    </span>
  );
}
