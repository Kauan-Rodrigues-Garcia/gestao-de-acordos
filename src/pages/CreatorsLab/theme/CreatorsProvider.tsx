/**
 * CreatorsProvider — o único estado global do Creators Lab.
 * ─────────────────────────────────────────────────────────────────────────────
 * Guarda só o que precisa ser compartilhado entre seções distantes: tema, som,
 * movimento, progresso e conquistas. Card aberto, campo de formulário e afins
 * continuam sendo estado local de cada componente — subir tudo para cá seria
 * transformar uma página em um banco de dados.
 *
 * As variáveis CSS do tema são aplicadas no elemento raiz do Lab, nunca em
 * `:root`. É isso que impede o Cyberpunk de vazar para o Dashboard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## Movimento: a preferência do sistema SUGERE, não manda
 *
 * O Lab abria sem animação nenhuma em duas máquinas do trabalho, e ninguém
 * tinha configurado acessibilidade nenhuma. A causa: o Windows 10/11 tem
 * "Efeitos de animação" em Acessibilidade > Efeitos visuais, e imagem
 * corporativa costuma vir com isso DESLIGADO para economizar máquina. Com ele
 * desligado o navegador responde `prefers-reduced-motion: reduce`, e o Lab —
 * que obedecia cegamente — virava uma página parada.
 *
 * Um sistema de trabalho deve obedecer essa preferência sem discutir, e o
 * Gestão continua obedecendo. O Lab não: é uma área escondida que a pessoa
 * procurou e abriu de propósito, e a decisão passa a ser dela.
 *
 *   • padrão: movimento COMPLETO, em qualquer máquina;
 *   • o botão na barra reduz a qualquer momento, e a escolha fica guardada;
 *   • quando o sistema pede redução e ninguém escolheu ainda, aparece UM aviso
 *     oferecendo o modo reduzido — oferta, não imposição.
 *
 * O CSS acompanha: `data-movimento="reduzido"` no elemento raiz, nunca uma
 * `@media (prefers-reduced-motion)`, que ignoraria a escolha da pessoa.
 */
import {
  createContext, useContext, useState, useCallback, useMemo, useEffect, useRef,
  type ReactNode,
} from 'react';
import { TEMAS, type TemaCreators, type TokensTema } from './themes';
import {
  conquistasDesbloqueadas, mesclarProgresso, normalizarProgresso, novasConquistas,
  PROGRESSO_VAZIO, type IdConquista, type Progresso,
} from '../lib/conquistas';
import { buscarProgressoLab, salvarProgressoLab } from '@/services/creatorsLab.service';

const CHAVE_PROGRESSO = 'creatorsLab:progresso';
const CHAVE_TEMA      = 'creatorsLab:tema';
const CHAVE_SOM       = 'creatorsLab:som';
const CHAVE_MOVIMENTO = 'creatorsLab:movimento';

/** Espera antes de mandar o progresso ao banco. */
const ESPERA_GRAVACAO_MS = 1200;

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
  /** Movimento reduzido — decisão da PESSOA, não do sistema operacional. */
  movimentoReduzido: boolean;
  alternarMovimento: () => void;
  /** O sistema pede redução e ninguém decidiu ainda: cabe oferecer uma vez. */
  ofertaReduzirMovimento: boolean;
  /** Fecha a oferta sem mudar nada. */
  recusarOferta: () => void;
  /** O progresso veio do banco (e não só do navegador). */
  progressoNaConta: boolean;
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

/** A escolha de movimento já feita antes, ou `null` se nunca houve uma. */
function movimentoEscolhido(): boolean | null {
  try {
    const cru = localStorage.getItem(CHAVE_MOVIMENTO);
    if (cru === 'reduzido') return true;
    if (cru === 'completo') return false;
    return null;
  } catch { return null; }
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

  /*
   * Movimento. Começa pela escolha guardada; sem escolha, COMPLETO — ver o
   * cabeçalho deste arquivo para o porquê de não perguntar ao sistema aqui.
   */
  const [movimentoReduzido, setMovimentoReduzido] = useState(
    () => movimentoEscolhido() ?? false,
  );
  const [sistemaPedeReduzir, setSistemaPedeReduzir] = useState(false);
  const [ofertaRecusada, setOfertaRecusada] = useState(false);
  /* Lido UMA vez, na montagem. Reler a cada render transformaria um acesso a
     disco numa consulta de layout — e o valor não muda sem passar por aqui. */
  const [escolhaPrevia] = useState(movimentoEscolhido);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const aplicar = () => setSistemaPedeReduzir(mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, []);

  const alternarMovimento = useCallback(() => {
    setMovimentoReduzido(v => {
      const novo = !v;
      try { localStorage.setItem(CHAVE_MOVIMENTO, novo ? 'reduzido' : 'completo'); }
      catch { /* modo privado */ }
      return novo;
    });
    setOfertaRecusada(true);
  }, []);

  const recusarOferta = useCallback(() => {
    setOfertaRecusada(true);
    // Recusar TAMBÉM é uma escolha: guardada, o aviso não volta na próxima
    // visita. Sem isto, quem usa uma máquina com animação desligada veria a
    // mesma oferta toda vez que entrasse.
    try { localStorage.setItem(CHAVE_MOVIMENTO, 'completo'); } catch { /* modo privado */ }
  }, []);

  const ofertaReduzirMovimento =
    sistemaPedeReduzir && !ofertaRecusada && escolhaPrevia === null;

  /*
   * Sincronização com o banco.
   *
   * `hidratado` existe para não gravar por cima do que já está lá: o `upsert`
   * substitui a linha inteira, então salvar antes de ter lido o remoto
   * apagaria o progresso de quem abriu num navegador limpo.
   */
  const [progressoNaConta, setProgressoNaConta] = useState(false);
  const hidratadoRef = useRef(false);

  useEffect(() => {
    let vivo = true;

    (async () => {
      const remoto = await buscarProgressoLab();
      if (!vivo) return;

      if (remoto) {
        const doBanco = normalizarProgresso(remoto.progresso);
        setProgresso(local => {
          const juntos = mesclarProgresso(local, doBanco);
          gravar(CHAVE_PROGRESSO, juntos);
          desbloqueadasRef.current = conquistasDesbloqueadas(juntos);
          return juntos;
        });
        setProgressoNaConta(true);
      }

      // Libera a gravação mesmo quando não veio nada: a tabela pode não
      // existir ainda, e nesse caso o Lab segue em localStorage — mas se
      // existir e a pessoa for nova, a primeira gravação precisa acontecer.
      hidratadoRef.current = true;
    })();

    return () => { vivo = false; };
  }, []);

  // Gravação com espera: mexer em cinco coisas seguidas vira uma requisição,
  // não cinco.
  useEffect(() => {
    if (!hidratadoRef.current) return;
    const t = setTimeout(() => {
      salvarProgressoLab(progresso).then(ok => { if (ok) setProgressoNaConta(true); });
    }, ESPERA_GRAVACAO_MS);
    return () => clearTimeout(t);
  }, [progresso]);

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
    fila, avisou,
    movimentoReduzido, alternarMovimento, ofertaReduzirMovimento, recusarOferta,
    progressoNaConta,
  }), [tema, trocarTema, somLigado, alternarSom, progresso, registrar,
       desbloqueadas, fila, avisou, movimentoReduzido, alternarMovimento,
       ofertaReduzirMovimento, recusarOferta, progressoNaConta]);

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
