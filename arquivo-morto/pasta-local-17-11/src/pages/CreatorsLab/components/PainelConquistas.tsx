/**
 * PainelConquistas — a lista de conquistas, como conteúdo de janela.
 *
 * Era um modal por cima da página; agora é o que o programa Conquistas mostra.
 * O painel lista tudo; as secretas aparecem como `🔒 ???` até caírem — mostrar
 * o nome de uma conquista secreta estraga o que ela tem de secreta.
 */
import { useCreators } from '../theme/CreatorsProvider';
import { CONQUISTAS } from '../lib/conquistas';

export function PainelConquistas() {
  const { tokens, desbloqueadas, progressoNaConta } = useCreators();
  const total = CONQUISTAS.length;
  const feitas = desbloqueadas.size;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="creators-lab__rotulo" style={{ color: tokens.cores.secundaria }}>
          {tokens.vocab.rotuloSecao(tokens.vocab.conquistas)}
        </p>
        <p className="creators-lab__mono text-xs" style={{ color: tokens.cores.textoSuave }}>
          {feitas} / {total}
        </p>
      </div>

      <div className="creators-lab__barra mb-5">
        <span style={{ width: `${(feitas / total) * 100}%` }} />
      </div>

      <ul className="space-y-2">
        {CONQUISTAS.map(c => {
          const feita = desbloqueadas.has(c.id);
          const escondida = c.secreta && !feita;
          return (
            <li
              key={c.id}
              className="flex items-start gap-3 p-3"
              style={{
                border: `1px solid ${feita ? tokens.cores.primaria : tokens.cores.borda}`,
                borderRadius: tokens.raio,
                opacity: feita ? 1 : 0.55,
              }}
            >
              <span className="text-xl" aria-hidden>{escondida ? '🔒' : c.icone}</span>
              <div>
                <p className="text-sm font-bold"
                   style={{ color: feita ? tokens.cores.acento : tokens.cores.textoSuave }}>
                  {escondida ? '???' : c.titulo}
                </p>
                <p className="text-xs" style={{ color: tokens.cores.textoSuave }}>
                  {escondida ? 'ainda não descoberta' : c.descricao}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="creators-lab__mono mt-5 text-[.64rem]" style={{ color: tokens.cores.textoSuave }}>
        {progressoNaConta
          ? 'Guardado na sua conta: vale em qualquer computador.'
          : 'Guardado só neste navegador, por enquanto.'}
      </p>
    </div>
  );
}
