/**
 * SecretTerminal — terminal simulado.
 *
 * Nada é executado: a interpretação vive em `lib/terminal.ts`, que é uma lista
 * branca de texto para resposta. Ver lá o porquê de a regra ser essa.
 *
 * O foco NÃO é preso aqui: Tab sai do terminal normalmente, como manda a
 * acessibilidade. Quem quiser sair só continua tabulando.
 */
import { useEffect, useRef, useState } from 'react';
import { useCreators } from '../theme/CreatorsProvider';
import { SecaoLab } from '../components/SecaoLab';
import { interpretar, completar, type LinhaTerminal } from '../lib/terminal';
import type { TemaCreators } from '../theme/themes';

const BOAS_VINDAS: LinhaTerminal[] = [
  { tipo: 'destaque', texto: 'GDA TERMINAL v1.0' },
  { tipo: 'saida', texto: 'digite "help" para começar.' },
];

export function SecretTerminal({
  aoSair, aoTrocarTema, aoMatrix, aoAbrirConquistas,
}: {
  aoSair: () => void;
  aoTrocarTema: (t: TemaCreators) => void;
  aoMatrix: () => void;
  aoAbrirConquistas: () => void;
}) {
  const { tokens, tema, registrar, progresso } = useCreators();

  /*
   * O que o terminal sabe sobre quem digita. Hoje é uma coisa só: se a pessoa
   * zerou o fliperama, porque o comando `premio` só responde a ela — e o Tab
   * também precisa saber, senão entrega o segredo ao completar.
   */
  const contexto = { venceuFliperama: progresso.segredoArcade };

  const [linhas, setLinhas] = useState<LinhaTerminal[]>(BOAS_VINDAS);
  const [entrada, setEntrada] = useState('');
  const [historico, setHistorico] = useState<string[]>([]);
  const [posHist, setPosHist] = useState(-1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Rola para o fim a cada resposta.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [linhas]);

  function enviar() {
    const cru = entrada.trim();
    if (!cru) return;

    const r = interpretar(cru, contexto);
    const comando = cru.toLowerCase().split(/\s+/)[0];
    registrar({ comandosUsados: [comando] });

    setHistorico(h => [cru, ...h].slice(0, 30));
    setPosHist(-1);
    setEntrada('');

    if (r.efeito?.tipo === 'limpar') { setLinhas([]); return; }

    setLinhas(l => [...l, { tipo: 'entrada', texto: `C:\\CREATORS> ${cru}` }, ...r.linhas]);

    switch (r.efeito?.tipo) {
      case 'tema':
        // `theme` sozinho alterna; os comandos nomeados forçam um lado.
        aoTrocarTema(comando === 'theme'
          ? (tema === 'cyberpunk' ? 'arcade' : 'cyberpunk')
          : r.efeito.tema);
        break;
      case 'matrix':      aoMatrix(); break;
      case 'conquistas':  aoAbrirConquistas(); break;
      case 'sair':        window.setTimeout(aoSair, 500); break;
    }
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); enviar(); return; }

    if (e.key === 'Tab') {
      const sugestao = completar(entrada, contexto);
      if (sugestao) { e.preventDefault(); setEntrada(sugestao); }
      return;   // sem sugestão, Tab sai do campo — o foco não fica preso
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const novo = Math.min(posHist + 1, historico.length - 1);
      if (novo >= 0) { setPosHist(novo); setEntrada(historico[novo]); }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const novo = posHist - 1;
      setPosHist(novo);
      setEntrada(novo >= 0 ? historico[novo] : '');
    }
  }

  const cor = (t: LinhaTerminal['tipo']) =>
    t === 'erro' ? tokens.cores.secundaria
    : t === 'destaque' ? tokens.cores.acento
    : t === 'entrada' ? tokens.cores.primaria
    : tokens.cores.textoSuave;

  return (
    <SecaoLab
      id="terminal"
      rotulo={tokens.vocab.terminal}
      titulo={tokens.id === 'arcade' ? 'CHEAT CONSOLE' : 'GDA TERMINAL'}
      descricao="Simulado, e só. Lista branca de comandos — nada é executado de verdade."
    >
      <div className="creators-lab__terminal">
        <div ref={scrollRef} className="creators-lab__terminal-scroll p-4">
          {linhas.map((l, i) => (
            <p key={i} style={{ color: cor(l.tipo) }} className="whitespace-pre-wrap break-words">
              {l.texto || '\u00A0'}
            </p>
          ))}
        </div>
        <div
          className="flex items-center gap-2 border-t px-4 py-2"
          style={{ borderColor: tokens.cores.borda }}
          onClick={e => (e.currentTarget.querySelector('input'))?.focus()}
        >
          <span style={{ color: tokens.cores.primaria }}>C:\CREATORS&gt;</span>
          <input
            value={entrada}
            onChange={e => setEntrada(e.target.value)}
            onKeyDown={aoTeclar}
            spellCheck={false}
            autoComplete="off"
            aria-label="Comando do terminal"
            placeholder="help"
          />
        </div>
      </div>
    </SecaoLab>
  );
}
