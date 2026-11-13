/**
 * Os quebra-nozes dentro do sistema: o palco no pé da janela, em qualquer aba.
 *
 * Fica montado com o tema de Natal ligado e quase não faz nada: conhece a
 * cidade de quem está logado (setor sem cidade não vê ninguém), ouve a
 * configuração (`configuracao.ts`) e dorme até a próxima sessão da agenda
 * (`agenda.ts`) — a chamada das dez, as aparições sorteadas do dia, ou a
 * chamada que o super_admin fez na hora. Como a agenda sai do relógio do Natal
 * e de um sorteio com semente, a cidade inteira vê a mesma coisa no mesmo
 * segundo, sem o banco avisar ninguém.
 *
 * Na hora, baixa o pedaço dos bonecos (`montagem.ts`), lê a foto de cada um e,
 * na chamada das dez, os destaques de ontem (`dados.ts`), monta o espetáculo
 * (`diretor.ts`) e toca. Quem abre a página com o espetáculo no meio entra no
 * ponto em que ele está. Aba escondida não sobe nada; se a pessoa voltar a
 * tempo, entra no meio.
 *
 * O boletim é uma aparição que diz quem mais recebeu na cidade até aquela
 * hora: lê o líder (`dados.ts`) e, se ninguém recebeu ainda, sobe como
 * aparição comum. A hora em que eles sobem vai para o roteiro: é ela que
 * decide entre «bom dia», «boa tarde» e «boa noite».
 *
 * O palco nasce uns segundos ANTES da hora (`ANTECEDENCIA_MS`), escondido: o
 * espetáculo já montado, os bonecos já desenhados, a mesa de som pronta. Na
 * hora, a cidade inteira começa junta e ninguém paga a montagem com o
 * espetáculo andando. No modo leve (`leve`) o mesmo espetáculo sobe em
 * quadrinhos (`quadrinho.ts`): uma pose por fala.
 *
 * Para as 300 pessoas da cidade não baterem no banco no mesmo segundo, a foto
 * e os destaques são lidos antes, num momento sorteado dos minutos que
 * antecedem a sessão.
 *
 * A chamada local (`chamada.ts`: a prévia do `npm run dev` e o «Ver só aqui»
 * do card) sobe só nesta tela, na cidade pedida, e sem destaques de verdade
 * usa os de exemplo.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { conferirRelogioNatal, relogioNatal } from '../musica';
import { diaDoNatal, proximaSessao, type Ajustes, type Sessao, type TipoDeSessao } from './agenda';
import { EVENTO_QUEBRA_NOZES, EVENTO_QUEBRA_NOZES_RESPOSTA, type ChamadaLocal } from './chamada';
import { useConfiguracaoDosQuebraNozes } from './configuracao';
import { cidadeGuardada, fotosDaCidade, lerDestaques, lerElenco, lerLider, tituloDosDestaques } from './dados';
import type { Destaque } from './diretor';
import type { Cidade } from './elenco';
import type { PropsDoPalco } from './Palco';
import { permitirSonsDosQuebraNozes } from './sons';

interface NoPalco {
  chave: string;
  Palco: ComponentType<PropsDoPalco>;
  props: Omit<PropsDoPalco, 'aoTerminar'>;
}

interface Pedido {
  chave: string;
  tipo: TipoDeSessao;
  cidade: Cidade;
  dia: number;
  indice: number;
  /** Quando começou (ms), para entrar no meio; `null` = começa agora. */
  inicio: number | null;
  /** Chamada local: pergunta pela cidade pedida e, sem destaques, usa os de exemplo. */
  local: boolean;
}

/** Com quanta antecedência a foto e os destaques começam a ser lidos. */
const PREPARO_MS = 9 * 60_000;
/** O mais perto da hora que a leitura sorteada pode cair. */
const FOLGA_DO_PREPARO_MS = 45_000;
const ESPIADA_MS = 5 * 60_000;
/** Com quanta antecedência o palco nasce, escondido, para estar pronto na hora. */
const ANTECEDENCIA_MS = 8_000;
/** Enquanto o banco calcula os destaques para outro, tenta de novo. */
const TENTATIVAS_DOS_DESTAQUES = 5;
const ENTRE_TENTATIVAS_MS = 3_000;

const carregarMontagem = () => import('./montagem');
const esperar = (ms: number) => new Promise<void>(ok => window.setTimeout(ok, ms));
/** 'YYYY-MM-DD' em Brasília (UTC−3, sem horário de verão). */
const dataDeBrasilia = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
/** A hora de Brasília, 0 a 23. */
const horaDeBrasilia = (ms: number) => new Date(ms - 3 * 3_600_000).getUTCHours();
const TITULO_DO_BOLETIM = 'Quem mais recebeu até agora';

function responder(texto: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENTO_QUEBRA_NOZES_RESPOSTA, { detail: texto }));
}

async function lerDestaquesComCalma(cidade: Cidade, hoje: string, setorId: string | null, forcarCidade: boolean) {
  for (let i = 0; i < TENTATIVAS_DOS_DESTAQUES; i++) {
    const lidos = await lerDestaques(cidade, hoje, setorId, forcarCidade).catch((): null => null);
    if (lidos) return lidos;
    await esperar(ENTRE_TENTATIVAS_MS);
  }
  return null;
}

/**
 * O número da chamada local, contado neste navegador: os baralhos do roteiro
 * andam uma carta por chamada, e assim um clique nunca repete o anterior.
 * Longe dos números da agenda (0 a 3) e da chamada para todos (100 em diante).
 */
const CHAVE_DAS_LOCAIS = 'natal:quebra-nozes:locais';
function proximaChamadaLocal(): number {
  let n = Math.floor(Date.now() / 1000) % 100_000;
  try {
    n = (Number(localStorage.getItem(CHAVE_DAS_LOCAIS)) || 0) + 1;
    localStorage.setItem(CHAVE_DAS_LOCAIS, String(n));
  } catch { /* sem armazenamento: vale o relógio */ }
  return 1_000_000 + n;
}

/** `null`: ninguém recebeu hoje ainda (ou não deu para saber). */
async function lerLiderComCalma(cidade: Cidade, sessao: string, setorId: string | null, forcarCidade: boolean) {
  for (let i = 0; i < TENTATIVAS_DOS_DESTAQUES; i++) {
    const lido = await lerLider(cidade, sessao, setorId, forcarCidade).catch((): null => null);
    if (lido !== undefined) return lido;
    await esperar(ENTRE_TENTATIVAS_MS);
  }
  return null;
}

export function QuebraNozesNoSistema({ pessoaId, setorId, empresaId, leve = false }: {
  pessoaId: string;
  setorId: string | null;
  empresaId: string | null;
  /** O modo leve deste computador: o espetáculo sobe em quadrinhos. */
  leve?: boolean;
}) {
  const config = useConfiguracaoDosQuebraNozes(empresaId);
  const [cidade, setCidade] = useState<Cidade | null>(() => cidadeGuardada(pessoaId) ?? null);
  const [noPalco, setNoPalco] = useState<NoPalco | null>(null);
  /** Muda quando uma subida não deu em nada: a agenda olha de novo. */
  const [rodada, setRodada] = useState(0);
  const ocupado = useRef(false);
  const feitas = useRef(new Set<string>());
  const preparadas = useRef(new Set<string>());
  const quem = useRef({ pessoaId, setorId, leve });
  quem.current = { pessoaId, setorId, leve };

  useEffect(() => { permitirSonsDosQuebraNozes(config.sons); }, [config.sons]);

  // A cidade: a guardada vale por um dia; sem ela (ou vencida a meia hora das
  // fotos), pergunta ao banco num momento sorteado dos primeiros segundos.
  useEffect(() => {
    let vivo = true;
    conferirRelogioNatal();
    const t = window.setTimeout(() => {
      void lerElenco(pessoaId, quem.current.setorId).then(lido => { if (vivo) setCidade(lido.cidade); });
    }, 2_000 + Math.random() * 13_000);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [pessoaId]);

  const subir = useCallback(async (p: Pedido) => {
    if (ocupado.current) return false;
    ocupado.current = true;
    try {
      const [montagem, lido] = await Promise.all([carregarMontagem(), lerElenco(quem.current.pessoaId, quem.current.setorId)]);
      const elenco = montagem.elencoDaCidade(p.cidade, fotosDaCidade(lido, p.cidade));

      let destaques: Destaque[] = [];
      let titulo: string | undefined;
      let deExemplo = false;
      let lider: Destaque | null = null;
      if (p.tipo === 'boletim') {
        lider = await lerLiderComCalma(p.cidade, p.chave, quem.current.setorId, p.local);
        if (!lider && p.local) {
          lider = { ...montagem.destaquesDeExemplo(p.cidade)[0], feito: '★ na frente hoje' };
          deExemplo = true;
        }
      }
      if (p.tipo === 'parabens') {
        const hoje = dataDeBrasilia(relogioNatal());
        const lidos = await lerDestaquesComCalma(p.cidade, hoje, quem.current.setorId, p.local);
        if (lidos && lidos.destaques.length > 0) {
          destaques = lidos.destaques;
          titulo = tituloDosDestaques(lidos.dia, hoje);
        } else if (p.local) {
          destaques = montagem.destaquesDeExemplo(p.cidade);
          deExemplo = true;
        }
      }

      const quadrinho = quem.current.leve;
      const montado = montagem.montarEspetaculo({
        tipo: p.tipo === 'parabens' ? 'parabens' : 'aparicao',
        cidade: p.cidade, dia: p.dia, indice: p.indice, destaques,
        quando: titulo?.replace(/^Destaques de /, ''),
        hora: horaDeBrasilia(p.inicio ?? relogioNatal()),
        lider,
        nomes: { a: elenco.a, b: elenco.b },
      });
      const espetaculo = quadrinho ? montagem.emQuadrinhos(montado) : montado;
      // Negativo: o palco nasce antes da hora e espera, escondido.
      const desde = p.inicio === null ? 0 : (relogioNatal() - p.inicio) / 1000;
      // Chegou no fim: não vale subir para ver só a saída.
      if (desde > espetaculo.duracao - 6) { ocupado.current = false; setRodada(r => r + 1); return false; }

      if (p.local) {
        const fotos = `${elenco.a.foto ? 'diretor' : '—'}/${elenco.b.foto ? 'head' : '—'}`;
        const lidos = p.tipo === 'parabens' ? ` · destaques: ${deExemplo ? 'de exemplo' : destaques.length ? 'de verdade' : 'nenhum'}`
          : p.tipo === 'boletim' ? ` · quem mais recebeu: ${deExemplo ? 'de exemplo' : 'de verdade'}` : '';
        responder(`${espetaculo.resumo.join(' · ')} · foto: ${fotos}${lidos}`);
      }
      setNoPalco({
        chave: p.chave,
        Palco: montagem.PalcoDosQuebraNozes,
        props: lider
          ? { cidade: p.cidade, elenco, espetaculo, destaques: [lider], titulo: TITULO_DO_BOLETIM, desde, quadrinho }
          : { cidade: p.cidade, elenco, espetaculo, destaques, titulo, desde, quadrinho, comMusica: p.tipo === 'parabens' && destaques.length > 0 },
      });
      return true;
    } catch (erro) {
      ocupado.current = false;
      setRodada(r => r + 1);
      if (p.local) responder(`Não subiu: ${erro instanceof Error ? erro.message : String(erro)}`);
      return false;
    }
  }, []);

  // ── A agenda ──────────────────────────────────────────────────────────────
  const { automaticas, chamada10h, boletim, chamada } = config;
  // Os horários trocados à mão chegam num objeto novo a cada leitura: a agenda só se refaz se eles mudarem de verdade.
  const textoDosAjustes = JSON.stringify(config.ajustes);
  const ajustes = useMemo(() => JSON.parse(textoDosAjustes) as Ajustes, [textoDosAjustes]);
  const palcoLivre = noPalco === null;
  useEffect(() => {
    if (!cidade || !palcoLivre) return;
    let vivo = true;
    let relogio = 0;
    const relogiosDoPreparo: number[] = [];

    /** Lê antes, num momento sorteado, o que a sessão vai precisar. */
    const preparar = (s: Sessao, falta: number) => {
      if (falta > PREPARO_MS || preparadas.current.has(s.chave)) return;
      preparadas.current.add(s.chave);
      const quando = Math.random() * Math.max(0, falta - FOLGA_DO_PREPARO_MS);
      relogiosDoPreparo.push(window.setTimeout(() => {
        if (document.hidden) return;
        void carregarMontagem();
        void lerElenco(quem.current.pessoaId, quem.current.setorId);
        if (s.tipo === 'parabens') void lerDestaques(cidade, dataDeBrasilia(relogioNatal()), quem.current.setorId).catch((): null => null);
        if (s.tipo === 'boletim') void lerLider(cidade, s.chave, quem.current.setorId).catch((): null => null);
      }, quando));
    };

    const planejar = () => {
      window.clearTimeout(relogio);
      if (!vivo || ocupado.current) return;
      const agora = relogioNatal();
      const s = proximaSessao(cidade, agora, { automaticas, chamada10h, boletim, ajustes, chamada }, feitas.current);
      if (!s) { relogio = window.setTimeout(planejar, 6 * ESPIADA_MS); return; }
      const falta = s.inicio - agora;
      if (falta > ANTECEDENCIA_MS) {
        preparar(s, falta);
        relogio = window.setTimeout(planejar, Math.min(falta - ANTECEDENCIA_MS, ESPIADA_MS));
        return;
      }
      // Está para começar (ou já começou): o palco nasce agora e espera a hora.
      // Com a aba escondida não sobe: se a pessoa voltar a tempo, entra no
      // meio; senão a sessão vence sozinha.
      if (document.hidden) { relogio = window.setTimeout(planejar, falta > 0 ? falta : 30_000); return; }
      feitas.current.add(s.chave);
      void subir({ chave: s.chave, tipo: s.tipo, cidade, dia: s.dia, indice: s.indice, inicio: s.inicio, local: false });
    };

    planejar();
    const aoVoltar = () => { if (!document.hidden) planejar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      vivo = false;
      window.clearTimeout(relogio);
      relogiosDoPreparo.forEach(t => window.clearTimeout(t));
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [cidade, automaticas, chamada10h, boletim, ajustes, chamada, palcoLivre, rodada, subir]);

  // ── A chamada local (a prévia e o «Ver só aqui» do card) ───────────────────
  useEffect(() => {
    const chamar = (evento: Event) => {
      const { tipo, cidade: forcada } = (evento as CustomEvent<ChamadaLocal>).detail;
      // Diz a quem chamou que o palco está aqui (ver `chamarQuebraNozes`).
      evento.preventDefault();
      if (ocupado.current) { responder('Já tem um espetáculo no palco.'); return; }
      responder('Subindo…');
      void (async () => {
        const doSetor = forcada ?? (await lerElenco(quem.current.pessoaId, quem.current.setorId).catch((): null => null))?.cidade ?? null;
        // Quem não tem cidade (o super_admin sem setor) não veria ninguém: no
        // teste, vê Birigui.
        const daqui: Cidade = doSetor ?? 'birigui';
        if (!doSetor) responder('Seu setor não tem cidade: mostrando Birigui.');
        const agora = relogioNatal();
        await subir({
          chave: `local:${agora}`, tipo, cidade: daqui,
          dia: diaDoNatal(agora),
          // Cada clique é uma aparição nova: a seguinte dos baralhos, nunca a que acabou de passar.
          indice: proximaChamadaLocal(),
          inicio: null, local: true,
        });
      })();
    };
    window.addEventListener(EVENTO_QUEBRA_NOZES, chamar);
    return () => window.removeEventListener(EVENTO_QUEBRA_NOZES, chamar);
  }, [subir]);

  if (!noPalco) return null;
  const { Palco, props, chave } = noPalco;
  return (
    <Palco
      key={chave}
      {...props}
      comSom={config.sons}
      aoTerminar={() => { ocupado.current = false; setNoPalco(null); }}
    />
  );
}
