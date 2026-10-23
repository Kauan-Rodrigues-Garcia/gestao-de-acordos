/**
 * TesteDoChefe — os botões do «Testar o Cavalo da Guerra só na minha tela», no
 * card da Corrida (23/10/2026). O mesmo jeito do teste da chefona da Bruxa:
 * solta o chefe direto na página, sem corrida e sem banco, e comanda o que
 * acontece (o anjo, tirar vida, finalizar, fugir, os robôs e cada ataque).
 */
import { useState } from 'react';
import { Bot, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GUERRA, vidaDoChefe } from './regras';
import {
  arrancarDoChefeDeTeste, curarChefeDeTeste, finalizarChefeDeTeste, forcarAtaqueDeTeste, fugirChefeDeTeste,
  limparChefeDeTeste, robosNoTeste, soltarChefeDeTeste, useChefeDeTeste,
} from './ensaioDoChefe';
import type { AtaqueDoChefe } from './palcoGuerra.js';

/** A vida do teste: a de tantas pessoas atacando (a mesma conta da corrida de verdade). */
const VIDAS = [1, 10, 30, GUERRA.maxPessoas];
const ATAQUES: Array<[AtaqueDoChefe, string]> = [['cabecada', '💥 Cabeçada'], ['investida', '🔥 Investida'], ['sopro', '🔥 Sopro'], ['invocar', '🐎 Cavalos de fogo'], ['cavaleiros', '☠ Quatro Cavaleiros']];

export function TesteDoChefe() {
  const teste = useChefeDeTeste();
  const [pessoas, setPessoas] = useState(VIDAS[1]);
  const vivo = !!teste && !teste.estado.caiu_em;
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold"><Swords className="h-3.5 w-3.5 text-destructive" /> Testar o Cavalo da Guerra só na minha tela</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        O chefe da Guerra na Corrida aparece direto na página, só para você: a vida mora nesta aba, nada vai para o banco e ninguém
        recebe aviso. Dá para andar pelo Gestão com ele (em Acordos e no Dashboard dá para ver a cabeçada, o fogo e os cavaleiros).
        O seu clique fora dele continua sendo clique: só o operador fica com a tela presa na briga.
      </p>
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Vida do chefe de teste">
        {VIDAS.map(n => (
          <button key={n} type="button" role="radio" aria-checked={pessoas === n} onClick={() => setPessoas(n)}
            className={cn('rounded-md border px-2 py-1 text-[11px] transition-colors', pessoas === n ? 'border-destructive bg-destructive/10 font-semibold text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
            {n} {n === 1 ? 'pessoa' : 'pessoas'} <span className="tabular-nums opacity-70">{vidaDoChefe(n)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => soltarChefeDeTeste(pessoas, 3)}><Swords className="h-3.5 w-3.5" /> Soltar o chefe</Button>
        {teste && (
          <>
            <Button size="sm" variant="ghost" aria-pressed={teste.robos} disabled={!vivo} onClick={() => robosNoTeste(!teste.robos)} className="gap-1.5">
              <Bot className="h-3.5 w-3.5" /> {teste.robos ? 'Parar os robôs' : 'Robôs atirando'}
            </Button>
            <Button size="sm" variant="ghost" disabled={!vivo} onClick={curarChefeDeTeste}>😇 Anjo (cura)</Button>
            <Button size="sm" variant="ghost" disabled={!vivo} onClick={() => arrancarDoChefeDeTeste(0.3)}>Tirar 30%</Button>
            <Button size="sm" variant="ghost" disabled={!vivo} onClick={finalizarChefeDeTeste}>Finalizar</Button>
            <Button size="sm" variant="ghost" disabled={!vivo} onClick={fugirChefeDeTeste}>Fugir</Button>
            <Button size="sm" variant="ghost" onClick={limparChefeDeTeste}>Limpar</Button>
          </>
        )}
      </div>
      {teste && vivo && (
        <div className="flex flex-wrap gap-1.5">
          {ATAQUES.map(([tipo, rotulo]) => <Button key={tipo} size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => forcarAtaqueDeTeste(tipo)}>{rotulo}</Button>)}
        </div>
      )}
    </div>
  );
}
