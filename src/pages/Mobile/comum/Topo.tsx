/**
 * Os dois controles do topo das telas do app (06/10/2026):
 *
 *   TrocaDeVisao        Eu · Equipe · Setor — quais aparecem depende do cargo
 *                       (`visoesDoCargo`). Cada botão leva à visão; a atual
 *                       fica marcada.
 *   InterruptorUnidade  H.O. | Bruto — só para quem é da regra Cofen.
 *
 * Os dois tinham o mesmo desenho, lado a lado, e liam como UM controle só com
 * cinco opções (Cleber, 08/10/2026). Agora a visão é a régua larga da linha,
 * com ícone e o marcador que desliza; a unidade é miúda, embaixo à direita, com
 * o rótulo «Valores em» — é um ajuste de leitura, não um lugar para ir.
 *
 * Desenho: docs/superpowers/specs/2026-10-06-app-celular-gerencia-design.md §2.0, §2.5.
 */
import type { CSSProperties } from 'react';
import { Building2, UserRound, Users, type LucideIcon } from 'lucide-react';
import { definirUnidadeApp, type UnidadeApp } from '@/lib/mobile/unidadeApp';
import type { Visao } from '@/lib/mobile/visoes';
import './comum.css';

const ROTULO: Record<Visao, string> = { eu: 'Eu', equipe: 'Equipe', setor: 'Setor' };
const ICONE: Record<Visao, LucideIcon> = { eu: UserRound, equipe: Users, setor: Building2 };

export function TrocaDeVisao({ visoes, atual, onEscolher }: {
  visoes: readonly Visao[];
  atual: Visao;
  onEscolher: (v: Visao) => void;
}) {
  if (visoes.length < 2) return null;
  // O marcador branco é um só, e desliza até a posição da visão atual.
  const posicao = Math.max(0, visoes.indexOf(atual));
  const estilo = { '--n': visoes.length, '--i': posicao } as CSSProperties;
  return (
    <div className="v-visoes" role="group" aria-label="Visão" style={estilo}>
      {visoes.map(v => {
        const Icone = ICONE[v];
        return (
          <button key={v} type="button" aria-pressed={v === atual}
            onClick={() => { if (v !== atual) onEscolher(v); }}>
            <Icone aria-hidden="true" />
            {ROTULO[v]}
          </button>
        );
      })}
    </div>
  );
}

export function InterruptorUnidade({ unidade, visivel }: { unidade: UnidadeApp; visivel: boolean }) {
  if (!visivel) return null;
  return (
    <div className="v-unidade">
      <span aria-hidden="true">Valores em</span>
      <div className="v-seg v-seg-unidade" role="group" aria-label="Unidade dos valores">
        <button type="button" aria-pressed={unidade === 'ho'} onClick={() => definirUnidadeApp('ho')}>H.O.</button>
        <button type="button" aria-pressed={unidade === 'bruto'} onClick={() => definirUnidadeApp('bruto')}>Bruto</button>
      </div>
    </div>
  );
}
