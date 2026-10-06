/**
 * Os dois controles do topo das telas do app (06/10/2026):
 *
 *   TrocaDeVisao        Eu · Equipe · Setor — quais aparecem depende do cargo
 *                       (`visoesDoCargo`). Cada botão leva à visão; a atual
 *                       fica marcada.
 *   InterruptorUnidade  H.O. | Bruto — só para quem é da regra Cofen.
 *
 * Desenho: docs/superpowers/specs/2026-10-06-app-celular-gerencia-design.md §2.0, §2.5.
 */
import { definirUnidadeApp, type UnidadeApp } from '@/lib/mobile/unidadeApp';
import type { Visao } from '@/lib/mobile/visoes';
import './comum.css';

const ROTULO: Record<Visao, string> = { eu: 'Eu', equipe: 'Equipe', setor: 'Setor' };

export function TrocaDeVisao({ visoes, atual, onEscolher }: {
  visoes: readonly Visao[];
  atual: Visao;
  onEscolher: (v: Visao) => void;
}) {
  if (visoes.length < 2) return null;
  return (
    <div className="v-seg" role="group" aria-label="Visão">
      {visoes.map(v => (
        <button key={v} type="button" aria-pressed={v === atual}
          onClick={() => { if (v !== atual) onEscolher(v); }}>
          {ROTULO[v]}
        </button>
      ))}
    </div>
  );
}

export function InterruptorUnidade({ unidade, visivel }: { unidade: UnidadeApp; visivel: boolean }) {
  if (!visivel) return null;
  return (
    <div className="v-seg v-seg-unidade" role="group" aria-label="Unidade dos valores">
      <button type="button" aria-pressed={unidade === 'ho'} onClick={() => definirUnidadeApp('ho')}>H.O.</button>
      <button type="button" aria-pressed={unidade === 'bruto'} onClick={() => definirUnidadeApp('bruto')}>Bruto</button>
    </div>
  );
}
