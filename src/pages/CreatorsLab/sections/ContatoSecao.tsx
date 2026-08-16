/**
 * ContatoSecao — os canais, vindos do arquivo de configuração.
 *
 * Nenhum link é escrito aqui. O que não estiver em `creators.config.ts` aparece
 * como pendência — link falso é pior que link ausente, porque parece real.
 */
import { useCreators } from '../theme/CreatorsProvider';
import { SecaoLab, Pendente } from '../components/SecaoLab';
import { CRIADORES, type Criador } from '../creators.config';

/** Monta o href certo para cada canal. */
function href(canal: string, valor: string): string {
  if (canal === 'whatsapp') return `https://wa.me/${valor.replace(/\D/g, '')}`;
  if (canal === 'email')    return `mailto:${valor}`;
  return valor.startsWith('http') ? valor : `https://${valor}`;
}

const CANAIS: { chave: keyof Criador['contato']; rotulo: string; icone: string }[] = [
  { chave: 'whatsapp', rotulo: 'WhatsApp', icone: '💬' },
  { chave: 'github',   rotulo: 'GitHub',   icone: '⌥' },
  { chave: 'email',    rotulo: 'E-mail',   icone: '✉' },
  { chave: 'linkedin', rotulo: 'LinkedIn', icone: 'in' },
];

export function ContatoSecao() {
  const { tokens } = useCreators();
  const arcade = tokens.id === 'arcade';

  return (
    <SecaoLab
      id="contato"
      rotulo={tokens.vocab.contato}
      titulo={arcade ? 'CONTINUE?' : 'ESTABLISH CONNECTION'}
      descricao={arcade ? 'Insira uma ficha para continuar.' : 'Canal aberto dos dois lados.'}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {CRIADORES.map((c, i) => {
          const disponiveis = CANAIS.filter(ca => !!c.contato[ca.chave]);
          return (
            <div key={c.id} className="creators-lab__painel p-5">
              <p className="creators-lab__rotulo" style={{ color: tokens.cores.secundaria }}>
                {tokens.vocab.sujeito(i + 1)}
              </p>
              <h3 className="mt-1 text-xl font-bold" style={{ color: tokens.cores.primaria }}>
                {c.nome.toUpperCase()}
              </h3>

              {disponiveis.length === 0 ? (
                <div className="mt-4">
                  <Pendente oQue={`contatos do ${c.nome}`} />
                  <p className="mt-2 text-xs" style={{ color: tokens.cores.textoSuave }}>
                    Preencha <code className="creators-lab__mono">contato</code> em{' '}
                    <code className="creators-lab__mono">creators.config.ts</code>.
                  </p>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {disponiveis.map(ca => (
                    <a
                      key={ca.chave}
                      href={href(ca.chave, c.contato[ca.chave]!)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="creators-lab__btn no-underline"
                      aria-label={`${ca.rotulo} de ${c.nome}`}
                    >
                      <span aria-hidden>{ca.icone}</span>
                      <span className="ml-1.5">{ca.rotulo}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="creators-lab__mono mt-5 text-center text-[.65rem] tracking-[.2em]"
         style={{ color: tokens.cores.textoSuave }}>
        {arcade ? '● ● ● INSERT COIN TO CONTINUE ● ● ●' : 'TRANSMISSION CHANNEL READY'}
      </p>
    </SecaoLab>
  );
}
