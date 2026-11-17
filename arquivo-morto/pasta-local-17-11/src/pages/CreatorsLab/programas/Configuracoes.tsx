/**
 * Programa: Configurações — aparência e movimento.
 *
 * A troca de sistema mora aqui (e no comando `theme` do terminal). A escolha
 * de movimento também está na barra de tarefas, sempre à vista; aqui ela vem
 * com a explicação.
 */
import type { CSSProperties } from 'react';
import { SecaoLab } from '../components/SecaoLab';
import { EscolhaAparencia } from '../desktop/EscolhaAparencia';
import { useCreators } from '../theme/CreatorsProvider';

export default function ProgramaConfiguracoes() {
  const { tokens, tema, trocarTema, movimentoReduzido, alternarMovimento } = useCreators();
  const c = tokens.cores;

  return (
    <>
      <SecaoLab
        id="aparencia"
        rotulo={tokens.vocab.programas.configuracoes}
        titulo={tokens.vocab.aparencia}
        descricao="Os mesmos programas, em três sistemas. A escolha fica guardada neste navegador."
      >
        <div
          style={{
            '--creator-escolha-titulo': c.texto,
            '--creator-escolha-texto': c.textoSuave,
          } as CSSProperties}
        >
          <EscolhaAparencia atual={tema} aoEscolher={trocarTema} />
        </div>
      </SecaoLab>

      <SecaoLab
        id="movimento"
        rotulo={tokens.vocab.programas.configuracoes}
        titulo="Movimento"
        descricao="Aqui quem decide é você, não o sistema operacional do computador."
      >
        <div className="creators-lab__painel p-5">
          <p className="text-sm" style={{ color: c.texto }}>
            As animações estão <strong>{movimentoReduzido ? 'reduzidas' : 'ligadas'}</strong>.
          </p>
          <p className="mt-1 text-xs" style={{ color: c.textoSuave }}>
            Reduzidas, nada pisca, treme ou varre a tela, e a inicialização vira
            uma passagem simples. O botão <span aria-hidden>◉ / ◐</span> da barra
            de tarefas faz a mesma coisa.
          </p>
          <button
            className="creators-lab__btn mt-4"
            onClick={alternarMovimento}
            aria-pressed={movimentoReduzido}
          >
            {movimentoReduzido ? 'ligar animações' : 'reduzir animações'}
          </button>
        </div>
      </SecaoLab>
    </>
  );
}
