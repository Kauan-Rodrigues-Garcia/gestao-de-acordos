/**
 * CreatorsProvider — o único estado global do Creators Lab.
 * ─────────────────────────────────────────────────────────────────────────────
 * Guarda só o que precisa ser compartilhado entre seções distantes: tema, som,
 * progresso e conquistas. Card aberto, campo de formulário e afins continuam
 * sendo estado local de cada componente — subir tudo para cá seria transformar
 * uma página em um banco de dados.
 *
 * As variáveis CSS do tema são aplicadas no elemento raiz do Lab, nunca em
 * `:root`. É isso que impede o Cyberpunk de vazar para o Dashboard.
 */
import {
  createContext, useContext, useState, useCallback, useMemo, useEffect, useRef,
  type ReactNode,
} from 'react';
import { TEMAS, type TemaCreators, type TokensTema } from './themes';
import {
  conquistasDesbloqueadas, novasConquistas, PROGRESSO_VAZIO,
  type IdConquista, type Progresso,
} from '../lib/conquistas';

const CHAVE_PROGRESSO = 'creatorsLab:progresso';
const CHAVE_TEMA      = 'creatorsLab:tema';
const CHAVE_SOM       = 'creatorsLab:som';

interface ContextoCreators {
  tema: TemaCreators;
  tokens: TokensTema;
  trocarTema: (t: TemaCreators) => void;
  somLigado: boolean;
  alternarSom: () => void;
  progresso: Progresso;
  /** Registra um avanço. Conquistas novas viram fila de aviso sozinhas. */
  registrar: (mudanca: Partial<Progresso>) => void;
  desbloqueadas: Set<IdConquista>;
  /** Conquistas ainda não mostradas — a UI consome e chama `avisou`. */
  fila: IdConquista[];
  avisou: (id: IdConquista) => void;
  /** Movimento reduzido pedido pelo sistema operacional. */
  movimentoReduzido: boolean;
}

const Ctx = createContext<ContextoCreators | null>(null);

/** Lê JSON do localStorage sem deixar um valor corrompido derrubar a página. */
function lerJson<T>(chave: string, padrao: T): T {
  try {
    const cru = localStorage.getItem(chave);
    return cru ? { ...padrao, ...JSON.parse(cru) as object } as T : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown): void {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* cota cheia */ }
}

export function CreatorsProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<TemaCreators>(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_TEMA);
      return salvo === 'arcade' || salvo === 'cyberpunk' ? salvo : 'cyberpunk';
    } catch { return 'cyberpunk'; }
  });

  const [somLigado, setSomLigado] = useState(() => {
    // Desligado por padrão, como manda o bom senso e a política de autoplay.
    try { return localStorage.getItem(CHAVE_SOM) === 'true'; } catch { return false; }
  });

  const [progresso, setProgresso] = useState<Progresso>(
    () => lerJson(CHAVE_PROGRESSO, PROGRESSO_VAZIO),
  );

  const [fila, setFila] = useState<IdConquista[]>([]);
  const desbloqueadasRef = useRef(conquistasDesbloqueadas(progresso));

  const [movimentoReduzido, setMovimentoReduzido] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const aplicar = () => setMovimentoReduzido(mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, []);

  const registrar = useCallback((mudanca: Partial<Progresso>) => {
    setProgresso(anterior => {
      // Listas acumulam sem repetir; números e booleanos são substituídos.
      const novo: Progresso = { ...anterior, ...mudanca };
      for (const chave of ['temasVistos', 'itensAbertos', 'comandosUsados', 'experimentosUsados'] as const) {
        if (mudanca[chave]) {
          novo[chave] = [...new Set([...anterior[chave], ...mudanca[chave]!])];
        }
      }

      const antes  = desbloqueadasRef.current;
      const depois = conquistasDesbloqueadas(novo);
      const caiu   = novasConquistas(antes, depois);
      if (caiu.length) {
        desbloqueadasRef.current = depois;
        setFila(f => [...f, ...caiu]);
      }

      gravar(CHAVE_PROGRESSO, novo);
      return novo;
    });
  }, []);

  const trocarTema = useCallback((t: TemaCreators) => {
    setTema(t);
    gravar(CHAVE_TEMA, t);
    registrar({ temasVistos: [t] });
  }, [registrar]);

  const alternarSom = useCallback(() => {
    setSomLigado(v => { gravar(CHAVE_SOM, !v); return !v; });
  }, []);

  const avisou = useCallback((id: IdConquista) => {
    setFila(f => f.filter(x => x !== id));
  }, []);

  const desbloqueadas = useMemo(() => conquistasDesbloqueadas(progresso), [progresso]);

  const valor = useMemo<ContextoCreators>(() => ({
    tema, tokens: TEMAS[tema], trocarTema,
    somLigado, alternarSom,
    progresso, registrar, desbloqueadas,
    fila, avisou, movimentoReduzido,
  }), [tema, trocarTema, somLigado, alternarSom, progresso, registrar,
       desbloqueadas, fila, avisou, movimentoReduzido]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useCreators(): ContextoCreators {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCreators precisa estar dentro de <CreatorsProvider>');
  return ctx;
}

/** Atalho: só os rótulos do tema ativo. */
export function useVocab() {
  return useCreators().tokens.vocab;
}
