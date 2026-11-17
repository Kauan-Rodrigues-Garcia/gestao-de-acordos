/**
 * Peça: a pesquisa de experiência, encenada.
 *
 * A pergunta e as três carinhas, como eram. Na época a resposta era gravada,
 * uma vez por pessoa; aqui ela não vai para lugar nenhum — dá para escolher,
 * trocar e escolher de novo.
 */
import { useState } from 'react';
import { useCreators } from '../../theme/CreatorsProvider';

const CARINHAS = [
  { id: 'ruim',     rosto: '😕', rotulo: 'Ruim' },
  { id: 'ok',       rosto: '🙂', rotulo: 'Tá ok' },
  { id: 'curtindo', rosto: '😄', rotulo: 'Tô curtindo' },
] as const;

export default function PecaPesquisa() {
  const { tokens } = useCreators();
  const c = tokens.cores;
  const [escolha, setEscolha] = useState<string | null>(null);

  return (
    <div className="creators-lab__painel p-4" style={{ maxWidth: '22rem' }}>
      <p className="text-sm font-bold" style={{ color: c.texto }}>
        Como tá sendo usar o Gestão de Acordos?
      </p>

      <div className="mt-3 flex gap-2" role="group" aria-label="Carinhas da pesquisa">
        {CARINHAS.map(k => (
          <button
            key={k.id}
            type="button"
            className="creators-lab__carinha"
            aria-pressed={escolha === k.id}
            onClick={() => setEscolha(escolha === k.id ? null : k.id)}
          >
            <span aria-hidden="true">{k.rosto}</span>
            {k.rotulo}
          </button>
        ))}
      </div>

      <p className="creators-lab__mono mt-3 text-[.66rem]" style={{ color: c.textoSuave }} aria-live="polite">
        {escolha
          ? 'Anotado em lugar nenhum: esta é só a encenação.'
          : 'Escolha uma. Nada é gravado.'}
      </p>
    </div>
  );
}
