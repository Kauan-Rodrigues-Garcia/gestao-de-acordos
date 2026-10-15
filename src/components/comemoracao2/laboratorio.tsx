/**
 * laboratorio.tsx — vitrine do card 2.0, sem banco e sem login.
 *
 * `npm run dev` → http://localhost:8080/lab-comemoracao.html
 *
 * Todos os papéis de parede, todos os arranjos e todas as letras lado a lado,
 * com o MESMO `CardV2` da festa. Serve para avaliar o visual sem montar uma
 * comemoração de verdade. O build de produção leva só o `index.html`.
 */
/* eslint-disable react-refresh/only-export-components -- entrada de página avulsa (como o index.html), não um módulo de componentes. */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import type { PessoaComemoracao } from '@/services/comemoracoes.service';
import { CardV2 } from './CardV2';
import { FONTES, MODELOS, aplicarModelo, designPadrao, type DesignCard } from './design';
import { PAPEIS_DE_PAREDE } from './papeisDeParede';

const PESSOAS: PessoaComemoracao[] = [
  { id: '1', nome: 'Ana Paula', foto_url: null },
  { id: '2', nome: 'João Pedro', foto_url: null },
];

function Card({ design, animar }: { design: DesignCard; animar: number }) {
  return (
    <div className="rounded-[28px] shadow-[0_18px_40px_-16px_rgba(0,0,0,.5)]">
      <CardV2 key={animar} modo={animar ? 'exibicao' : 'editor'} titulo="META BATIDA!"
        mensagem="Ana e João fecharam outubro antes do prazo. Dedicação que inspira o time!"
        homenageados={PESSOAS} design={design} tempoTotalS={animar ? 12 : undefined} />
    </div>
  );
}

function Laboratorio() {
  const [animar, setAnimar] = useState(0);
  const base = { ...designPadrao(), selo: 'META DE OUTUBRO' };

  return (
    <div className="min-h-screen space-y-10 bg-background p-6 text-foreground">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Laboratório · Comemorações 2.0</h1>
        <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setAnimar((n) => n + 1)}>
          Ver animação
        </button>
      </header>

      <section className="space-y-3">
        <h2 className="font-semibold">Papéis de parede ({PAPEIS_DE_PAREDE.length})</h2>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {PAPEIS_DE_PAREDE.map((p) => (
            <figure key={p.id} className="space-y-1.5">
              <Card design={{ ...base, papel: p.id }} animar={animar} />
              <figcaption className="text-xs text-muted-foreground">{p.nome} · {p.tema}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Arranjos</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {MODELOS.map((m) => (
            <figure key={m.id} className="space-y-1.5">
              <Card design={aplicarModelo({ ...base, papel: 'podio' }, m.id)} animar={animar} />
              <figcaption className="text-xs text-muted-foreground">{m.nome}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Letras</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {FONTES.map((f) => (
            <figure key={f.id} className="space-y-1.5">
              <Card design={{ ...base, papel: 'confete', fonte: f.id }} animar={animar} />
              <figcaption className="text-xs text-muted-foreground">{f.nome}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById('lab') as HTMLElement).render(<StrictMode><Laboratorio /></StrictMode>);
