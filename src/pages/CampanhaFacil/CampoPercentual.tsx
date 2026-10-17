/**
 * CampoPercentual — um percentual de «Descontos e cálculos» (15/10/2026).
 *
 * Era um `<input type="number">` de 64 px que normalizava a cada tecla: «12,»
 * virava 12 (a vírgula sumia), apagar virava 0 na hora e o 0 ficava na frente
 * do número seguinte, e as setinhas do navegador cobriam o número. Agora:
 *
 *   - texto livre, com vírgula ou ponto; o valor vale assim que vira número;
 *   - clicar seleciona tudo: é só digitar o número novo;
 *   - Enter confirma, ↑/↓ somam ou tiram 1 (com Shift, 5);
 *   - vazio ao sair vale 0.
 */
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { PERCENTUAL_MAX, lerPercentual, textoAceito, textoDoPercentual } from './percentual';

interface Props {
  valor: number;
  aoMudar: (valor: number) => void;
  rotulo: string;
}

export function CampoPercentual({ valor, aoMudar, rotulo }: Props) {
  const [texto, setTexto] = useState(() => textoDoPercentual(valor));
  const [editando, setEditando] = useState(false);
  /** O clique que deu o foco não pode desfazer a seleção de tudo ao soltar. */
  const acabouDeFocar = useRef(false);

  // Fora da digitação, o campo mostra o valor de verdade (uma configuração
  // aplicada troca todos de uma vez).
  useEffect(() => {
    if (!editando) setTexto(textoDoPercentual(valor));
  }, [valor, editando]);

  function confirmar(n: number) {
    aoMudar(n);
    setTexto(textoDoPercentual(n));
  }

  // O «%» fica dentro do campo, que ocupa a largura toda: na coluna estreita
  // da lateral, campo + «%» ao lado do rótulo não cabiam e o «%» vazava da
  // borda (16/10/2026).
  return (
    <span className="relative flex w-full items-center">
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={`${rotulo} (%)`}
        value={texto}
        onFocus={(e) => { setEditando(true); acabouDeFocar.current = true; e.currentTarget.select(); }}
        onMouseUp={(e) => { if (acabouDeFocar.current) { e.preventDefault(); acabouDeFocar.current = false; } }}
        onChange={(e) => {
          const t = e.target.value;
          if (!textoAceito(t)) return;
          setTexto(t);
          const n = lerPercentual(t);
          if (n !== null) aoMudar(n);
        }}
        onBlur={() => {
          setEditando(false);
          acabouDeFocar.current = false;
          confirmar(lerPercentual(texto) ?? 0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); return; }
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const passo = (e.shiftKey ? 5 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
          const base = lerPercentual(texto) ?? 0;
          confirmar(Math.min(PERCENTUAL_MAX, Math.max(0, Math.round((base + passo) * 100) / 100)));
        }}
        className="h-8 w-full pl-2 pr-6 text-right text-sm font-semibold tabular-nums"
      />
      <span className="pointer-events-none absolute right-2 text-xs text-muted-foreground">%</span>
    </span>
  );
}
