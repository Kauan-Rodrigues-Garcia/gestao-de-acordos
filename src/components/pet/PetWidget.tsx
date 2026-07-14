/**
 * PetWidget — o mascote no canto inferior direito da tela.
 * - Admin/super_admin: modo completo (alimentar, dormir, roupas).
 * - Demais cargos: ciclo automático de 5 min dormindo / 5 min acordado
 *   (sincronizado pelo relógio — todos veem a mesma fase) e quartinho
 *   em modo teaser ("Em breve").
 * - Acordado e de boa (qualquer cargo): passeia pelo rodapé parando em
 *   pontos aleatórios, dá pulinhos, e de vez em quando acontece um evento
 *   aleatório: videogame, borboleta, moedinha, espreguiçada, escada,
 *   pescaria, carrinho de controle remoto, dancinha ou marshmallow na fogueira.
 * - Quando o usuário marca um acordo/parcela como pago (petEvents), a Aura
 *   comemora com confete e balãozinho — mesmo se estiver dormindo.
 * - Vida própria: pupilas seguem o mouse; passar o mouse por cima 1x →
 *   surpresa e feliz, várias vezes → tontinha; pescaria multi-fase com final
 *   aleatório; bocejo/espirro; ritmo do dia (manhã espreguiça, sexta dança);
 *   balõezinhos contextuais raros; 5 min sem atividade → cochila em pé.
 * - Botão no quartinho desativa o pet: vira um iconezinho fixo e parado no
 *   canto (clicável para reabrir o menu e reativar). Preferência local.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import './pet.css';
import {
  usePetHabilitado, usePetInterativo, usePetDoTenant, usePetMinimizado,
  lerUltimaComida, salvarUltimaComida,
  type PetHumor, type PetRoupa, type PetCena, type PetMicro, type PetPescaFase,
} from './petConfig';
import { PET_EVENTO_COMEMORAR, celebrarPetAcordoPago } from './petEvents';
import { usePetClima, type PetClima } from './usePetClima';
import { usePetEstado } from './usePetEstado';
import { PetAura } from './PetAura';
import { PetRolo } from './PetRolo';
import { PetQuartinho } from './PetQuartinho';

type PetEvento =
  | 'nenhum' | 'jogando' | 'borboleta' | 'moeda' | 'espreguica' | 'escada'
  | 'pesca' | 'carrinho' | 'danca' | 'marshmallow';
type EscadaFase = 'nenhuma' | 'subindo' | 'topo' | 'descendo';
/** Reação ao mouse por cima: 1 passada → surpresa+feliz; várias → tontinha. */
type Reacao = 'nenhuma' | 'surpresa' | 'feliz' | 'tonta';

/** Área do passeio: até ALCANCE px à esquerda do canto. */
const ALCANCE = 190;
/** Velocidade da caminhada em px/s. */
const VELOCIDADE = 45;
/** Ciclo do teaser: 5 min acordado, 5 min dormindo (pelo relógio). */
const FASE_MS = 5 * 60_000;
/** Comemoração de acordo pago (confete + balãozinho). */
const COMEMORACAO_MS = 4_500;
/** Sem atividade (mouse/teclado) por esse tempo → cochilo em pé. */
const COCHILO_MS = 5 * 60_000;
/** Duração dos balõezinhos de frase contextual. */
const FRASE_MS = 3_200;
/** Escada: altura da subida (px) e deriva pra acompanhar a inclinação. */
const ESCADA_ALTURA = 230;
const ESCADA_DERIVA_X = -16;
const ESCADA_SUBIDA_S = 7;

/** Eventos aleatórios: duração e peso do sorteio (peso maior = mais comum). */
const EVENTOS: { tipo: Exclude<PetEvento, 'nenhum'>; duracaoMs: number; peso: number }[] = [
  { tipo: 'jogando',     duracaoMs: 30_000, peso: 3 },
  { tipo: 'borboleta',   duracaoMs: 14_000, peso: 2 },
  { tipo: 'moeda',       duracaoMs: 8_000,  peso: 2 },
  { tipo: 'espreguica',  duracaoMs: 2_600,  peso: 2 },
  { tipo: 'escada',      duracaoMs: 18_500, peso: 2 },
  { tipo: 'pesca',       duracaoMs: 26_000, peso: 2 },
  { tipo: 'carrinho',    duracaoMs: 16_000, peso: 2 },
  { tipo: 'danca',       duracaoMs: 12_000, peso: 2 },
  { tipo: 'marshmallow', duracaoMs: 22_000, peso: 2 },
];

/** Sorteio com "ritmo do dia": de manhã espreguiça mais, na sexta dança mais. */
function sortearEvento() {
  const agora = new Date();
  const pesos = EVENTOS.map(e => {
    let peso = e.peso;
    if (e.tipo === 'danca' && agora.getDay() === 5) peso = 4;        // sextou!
    if (e.tipo === 'espreguica' && agora.getHours() < 10) peso = 4;  // manhãzinha
    return { ...e, peso };
  });
  const total = pesos.reduce((s, e) => s + e.peso, 0);
  let r = Math.random() * total;
  for (const e of pesos) {
    r -= e.peso;
    if (r <= 0) return e;
  }
  return pesos[0];
}

/** Micro-animação ocasional: pulinho, bocejo (mais no fim do dia), espirro… */
function sortearMicro(): { tipo: PetMicro; duracaoMs: number } {
  const h = new Date().getHours();
  const opcoes: { tipo: PetMicro; duracaoMs: number; peso: number }[] = [
    { tipo: 'pulinho',    duracaoMs: 950,   peso: 5 },
    { tipo: 'bocejo',     duracaoMs: 2_200, peso: h >= 17 || h < 7 ? 4 : 1.5 },
    { tipo: 'espirro',    duracaoMs: 1_300, peso: 1 },
    { tipo: 'espreguica', duracaoMs: 2_600, peso: h < 10 ? 3 : 1 },
  ];
  const total = opcoes.reduce((s, o) => s + o.peso, 0);
  let r = Math.random() * total;
  for (const o of opcoes) {
    r -= o.peso;
    if (r <= 0) return o;
  }
  return opcoes[0];
}

/** Balõezinhos contextuais: hora, dia da semana, clima e memória de comida. */
function sortearFrase(interativo: boolean, clima: PetClima): string {
  const agora = new Date();
  const h = agora.getHours();
  const dia = agora.getDay();
  const pool: string[] = ['oii! 👋', 'tô de olho 👀', 'lalala~ 🎵'];
  if (h >= 6 && h < 11)  pool.push('bom dia! ☀️', 'cadê meu café? ☕');
  if (h >= 11 && h < 14) pool.push('que fome… 🍽️');
  if (h >= 17)           pool.push('que dia longo… 🥱', 'já tá acabando! 🌆');
  if (dia === 5) pool.push('sextou! 🎉', 'bora dançar? 💃');
  if (dia === 1) pool.push('segundou! 💪');
  if (clima === 'chuva')      pool.push('adoro chuvinha… 🌧️', 'menos mal que tenho guarda-chuva ☂️');
  if (clima === 'tempestade') pool.push('ai, trovão! ⚡😨');
  if (clima === 'calor')      pool.push('que calorão! 🥵', 'picolé salva vidas 🍧');
  if (clima === 'frio')       pool.push('friozinho bom 🧣', 'brrr… ❄️', 'chocolate quente ☕');
  if (clima === 'vento')      pool.push('olha o vento! 🍃', 'segura as orelhas! 💨');
  const ultima = lerUltimaComida();
  if (ultima) {
    const horas = (Date.now() - ultima.ts) / 3_600_000;
    if (horas >= 20 && horas <= 48) pool.push(`${ultima.nome.toLowerCase()}… que saudade 😋`);
    if (interativo && horas > 8 && horas < 20) pool.push('tô com fominha… 🍎');
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function faseAcordadaAgora(): boolean {
  return Math.floor(Date.now() / FASE_MS) % 2 === 0;
}

export function PetWidget() {
  const habilitado  = usePetHabilitado();
  const interativo  = usePetInterativo();
  const pet         = usePetDoTenant();
  const estado      = usePetEstado(interativo);
  const { atual: climaAtual, cidade: cidadeClima, setCidade: setCidadeClima } = usePetClima();

  const [aberto, setAberto] = useState(false);
  const [minimizado, setMinimizado] = usePetMinimizado();
  const [humor,  setHumor]  = useState<PetHumor>('idle');   // modo interativo
  const [micro,  setMicro]  = useState<PetMicro>('none');
  const [roupa,  setRoupa]  = useState<PetRoupa>('nenhuma');
  const [evento, setEvento] = useState<PetEvento>('nenhum');
  const [comemorando, setComemorando] = useState(false);
  const [moedaGanha, setMoedaGanha]   = useState<number | null>(null);
  const [acordadoTeaser, setAcordadoTeaser] = useState(faseAcordadaAgora);

  // ── Vida própria ───────────────────────────────────────────────────────
  const [reacao,     setReacao]     = useState<Reacao>('nenhuma');       // hover
  const [pescaFase,  setPescaFase]  = useState<PetPescaFase>('espera');  // pescaria
  const [cochilando, setCochilando] = useState(false);                   // inatividade
  const [frase,      setFrase]      = useState<string | null>(null);     // balõezinho
  const [olhar,      setOlhar]      = useState({ x: 0, y: 0 });          // pupilas → mouse
  const reacaoRef = useRef<Reacao>('nenhuma');
  reacaoRef.current = reacao;
  const cochilandoRef = useRef(false);
  cochilandoRef.current = cochilando;
  const reacaoTimeoutsRef = useRef<number[]>([]);
  const hoverTsRef = useRef<number[]>([]);
  const petBtnRef = useRef<HTMLButtonElement | null>(null);

  // ── Passeio pelo rodapé ────────────────────────────────────────────────
  const [x,       setX]       = useState(0);   // deslocamento (negativo = esquerda)
  const [durMove, setDurMove] = useState(0);   // duração da transição (s)
  const [movendo, setMovendo] = useState(false);
  const [dir,     setDir]     = useState<1 | -1>(1);
  const xRef       = useRef(0);
  const movendoRef = useRef(false);
  movendoRef.current = movendo;

  // ── Escada (evento): subida vertical no cantinho ───────────────────────
  const [y,          setY]          = useState(0);   // deslocamento vertical (negativo = sobe)
  const [durY,       setDurY]       = useState(0);
  const [escadaFase, setEscadaFase] = useState<EscadaFase>('nenhuma');

  // Humor efetivo: interativo usa o humor manual; teaser segue o ciclo 5/5.
  // A comemoração passa por cima de tudo (até do sono — boa notícia acorda!).
  // Depois vêm o cochilo por inatividade e as reações ao mouse.
  const humorBase: PetHumor = interativo
    ? humor
    : (acordadoTeaser ? 'idle' : 'dormindo');
  const humorEfetivo: PetHumor =
    comemorando ? 'comemorando'
    : humorBase === 'idle' && cochilando ? 'dormindo'
    : humorBase === 'idle' && reacao === 'tonta' ? 'tonta'
    : humorBase === 'idle' && reacao === 'surpresa' ? 'surpresa'
    : humorBase === 'idle' && reacao === 'feliz' ? 'feliz'
    : humorBase === 'idle' && evento === 'jogando' ? 'jogando'
    : humorBase === 'idle' && evento === 'pesca' ? 'pescando'
    : humorBase === 'idle' && evento === 'danca' ? 'dancando'
    : humorBase === 'idle' && evento === 'marshmallow' ? 'assando'
    : humorBase;
  const cena: PetCena =
    comemorando ? 'confete'
    : humorBase !== 'idle' ? 'nenhuma'
    : evento === 'borboleta' ? 'borboleta'
    : evento === 'moeda' ? 'moeda'
    : evento === 'carrinho' ? 'carrinho'
    : escadaFase === 'topo' ? 'aceno'
    : 'nenhuma';
  const microEfetivo: PetMicro =
    humorEfetivo === 'idle' && evento === 'espreguica' ? 'espreguica' : micro;
  const emEvento = evento !== 'nenhum' || comemorando;

  // Semeia roupa/sono a partir do estado carregado (banco ou localStorage).
  // Reaplica sempre que o estado inicial chegar/mudar, ATÉ o usuário mexer
  // (trocar roupa ou alternar sono) — assim a roupa salva no banco nunca é
  // atropelada por uma semeadura precoce com 'nenhuma' durante o login.
  const usuarioMexeuRef = useRef(false);
  useEffect(() => {
    if (!interativo || !estado.carregado || usuarioMexeuRef.current) return;
    setRoupa(estado.roupaInicial);
    if (estado.dormindoInicial) setHumor('dormindo');
  }, [interativo, estado.carregado, estado.roupaInicial, estado.dormindoInicial]);

  // Ciclo 5/5 do teaser — checa a fase do relógio a cada 10s
  useEffect(() => {
    if (interativo) return;
    const t = setInterval(() => setAcordadoTeaser(faseAcordadaAgora()), 10_000);
    return () => clearInterval(t);
  }, [interativo]);

  // Comemoração: acordo/parcela marcado como pago em qualquer tela
  useEffect(() => {
    let dentro: ReturnType<typeof setTimeout> | null = null;
    const comemorar = () => {
      setComemorando(true);
      if (dentro) clearTimeout(dentro);
      dentro = setTimeout(() => setComemorando(false), COMEMORACAO_MS);
    };
    window.addEventListener(PET_EVENTO_COMEMORAR, comemorar);
    return () => {
      window.removeEventListener(PET_EVENTO_COMEMORAR, comemorar);
      if (dentro) clearTimeout(dentro);
    };
  }, []);

  // Micro-animação alternada enquanto está "de boa" parada: pulinho, bocejo
  // (mais frequente no fim do dia), espirro raro, espreguiçada de manhã.
  useEffect(() => {
    if (humorEfetivo !== 'idle' || movendo || aberto || emEvento || minimizado) return;
    let dentro: ReturnType<typeof setTimeout> | null = null;
    const timer = setInterval(() => {
      const m = sortearMicro();
      setMicro(m.tipo);
      dentro = setTimeout(() => setMicro('none'), m.duracaoMs);
    }, 9000 + Math.random() * 7000);
    return () => { clearInterval(timer); if (dentro) clearTimeout(dentro); };
  }, [humorEfetivo, movendo, aberto, emEvento, minimizado]);

  // Passeio aleatório: anda até um ponto, para um tempinho, repete.
  useEffect(() => {
    if (aberto || humorEfetivo !== 'idle' || emEvento || minimizado) { setMovendo(false); return; }
    let vivo = true;
    const ids: number[] = [];
    const agendar = (fn: () => void, ms: number) => {
      ids.push(window.setTimeout(() => { if (vivo) fn(); }, ms));
    };

    const passeio = () => {
      const alvo = -Math.round(Math.random() * ALCANCE);
      const dist = Math.abs(alvo - xRef.current);
      if (dist < 24) { agendar(passeio, 1200 + Math.random() * 3000); return; }
      const dur = dist / VELOCIDADE;
      setDir(alvo < xRef.current ? -1 : 1);
      setDurMove(dur);
      setMovendo(true);
      setX(alvo);
      xRef.current = alvo;
      // chegou → pausa aleatória (às vezes curta, "parou no meio do caminho")
      agendar(() => {
        setMovendo(false);
        agendar(passeio, 1500 + Math.random() * 6500);
      }, dur * 1000 + 80);
    };

    agendar(passeio, 2000 + Math.random() * 3000);
    return () => { vivo = false; ids.forEach(clearTimeout); };
  }, [aberto, humorEfetivo, emEvento, minimizado]);

  // Eventos aleatórios: sorteia videogame / borboleta / pescaria / dancinha…
  useEffect(() => {
    if (aberto || humorBase !== 'idle' || comemorando || minimizado || cochilando) { setEvento('nenhum'); return; }
    let vivo = true;
    const ids: number[] = [];
    const agendar = (fn: () => void, ms: number) => {
      ids.push(window.setTimeout(() => { if (vivo) fn(); }, ms));
    };

    const sortearSessao = () => {
      agendar(() => {
        // espera terminar o passinho/reação atual para o evento começar parada
        if (movendoRef.current || reacaoRef.current !== 'nenhuma') { agendar(sortearSessao, 0); return; }
        const e = sortearEvento();
        setEvento(e.tipo);
        agendar(() => { setEvento('nenhum'); sortearSessao(); }, e.duracaoMs);
      }, 40_000 + Math.random() * 140_000);
    };

    sortearSessao();
    return () => { vivo = false; ids.forEach(clearTimeout); };
  }, [aberto, humorBase, comemorando, minimizado, cochilando]);

  // Coreografia da pescaria: espera → fisgada! → peixe (70%) / escapou / bota
  useEffect(() => {
    if (evento !== 'pesca') { setPescaFase('espera'); return; }
    let vivo = true;
    const ids: number[] = [];
    const agendar = (fn: () => void, ms: number) => {
      ids.push(window.setTimeout(() => { if (vivo) fn(); }, ms));
    };
    setPescaFase('espera');
    const tFisgada = 9_000 + Math.random() * 8_000;
    agendar(() => setPescaFase('fisgada'), tFisgada);
    agendar(() => {
      const r = Math.random();
      setPescaFase(r < 0.05 ? 'bota' : r < 0.30 ? 'escapou' : 'peixe');
    }, tFisgada + 1_100);
    return () => { vivo = false; ids.forEach(clearTimeout); };
  }, [evento]);

  // Reação ao mouse por cima: 1 passada (ou parar em cima) → surpresa e feliz;
  // passar várias vezes seguidas → fica tontinha. Sem clique — clique abre o menu.
  function limparReacaoTimeouts() {
    reacaoTimeoutsRef.current.forEach(clearTimeout);
    reacaoTimeoutsRef.current = [];
  }

  function aoPassarMousePorCima() {
    if (minimizado || aberto || cochilando) return;
    if (humorBase !== 'idle' || comemorando || evento !== 'nenhum') return;
    const agora = Date.now();
    hoverTsRef.current = [...hoverTsRef.current.filter(t => agora - t < 6_000), agora];
    limparReacaoTimeouts();
    if (hoverTsRef.current.length >= 4) {
      setReacao('tonta');
      reacaoTimeoutsRef.current.push(window.setTimeout(() => setReacao('nenhuma'), 2_600));
    } else {
      setReacao('surpresa');
      reacaoTimeoutsRef.current.push(window.setTimeout(() => setReacao('feliz'), 750));
      reacaoTimeoutsRef.current.push(window.setTimeout(() => setReacao('nenhuma'), 2_250));
    }
  }

  useEffect(() => () => limparReacaoTimeouts(), []);

  // Cochilo por inatividade: 5 min sem mouse/teclado → dorme em pé;
  // qualquer atividade → acorda assustadinha.
  useEffect(() => {
    if (minimizado) return;
    const ultimaAtividade = { ts: Date.now() };
    const marcar = () => {
      ultimaAtividade.ts = Date.now();
      if (cochilandoRef.current) {
        setCochilando(false);
        limparReacaoTimeouts();
        setReacao('surpresa');
        reacaoTimeoutsRef.current.push(window.setTimeout(() => setReacao('nenhuma'), 900));
      }
    };
    window.addEventListener('mousemove', marcar, { passive: true });
    window.addEventListener('keydown', marcar);
    window.addEventListener('click', marcar);
    const t = setInterval(() => {
      if (Date.now() - ultimaAtividade.ts > COCHILO_MS) setCochilando(true);
    }, 30_000);
    return () => {
      window.removeEventListener('mousemove', marcar);
      window.removeEventListener('keydown', marcar);
      window.removeEventListener('click', marcar);
      clearInterval(t);
    };
  }, [minimizado]);

  // Olhos seguindo o mouse: direção do cursor em relação ao pet, com alcance
  // curto (±3px no viewBox), atualizado no ritmo de 1 frame (rAF).
  useEffect(() => {
    if (minimizado) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const aoMover = (e: MouseEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = petBtnRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = px - (r.left + r.width / 2);
        const dy = py - (r.top + r.height * 0.45);
        const dist = Math.hypot(dx, dy) || 1;
        const alcance = Math.min(1, dist / 120);
        // quantiza em passos de 0.5px para não re-renderizar a cada pixel
        const nx = Math.round((dx / dist) * 3 * alcance * 2) / 2;
        const ny = Math.round((dy / dist) * 2 * alcance * 2) / 2;
        setOlhar(prev => (prev.x === nx && prev.y === ny ? prev : { x: nx, y: ny }));
      });
    };
    window.addEventListener('mousemove', aoMover, { passive: true });
    return () => {
      window.removeEventListener('mousemove', aoMover);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [minimizado]);

  // Balõezinhos contextuais raros enquanto está de boa (bom dia, sextou…)
  useEffect(() => {
    if (aberto || humorBase !== 'idle' || emEvento || minimizado || cochilando) { setFrase(null); return; }
    let vivo = true;
    const ids: number[] = [];
    const agendar = (fn: () => void, ms: number) => {
      ids.push(window.setTimeout(() => { if (vivo) fn(); }, ms));
    };
    const ciclo = () => {
      agendar(() => {
        if (Math.random() < 0.6 && reacaoRef.current === 'nenhuma') {
          setFrase(sortearFrase(interativo, climaAtual.clima));
          agendar(() => setFrase(null), FRASE_MS);
          agendar(ciclo, FRASE_MS + 100);
        } else {
          ciclo();
        }
      }, 90_000 + Math.random() * 240_000);
    };
    ciclo();
    return () => { vivo = false; ids.forEach(clearTimeout); setFrase(null); };
  }, [aberto, humorBase, emEvento, minimizado, cochilando, interativo, climaAtual.clima]);

  // Coreografia da escada: vai pro canto → sobe devagarinho → oizinho → desce
  useEffect(() => {
    if (evento !== 'escada') {
      // evento acabou/cancelado: desce rapidinho se estiver lá em cima
      setEscadaFase('nenhuma');
      setDurY(0.4);
      setY(0);
      return;
    }
    let vivo = true;
    const ids: number[] = [];
    const agendar = (fn: () => void, ms: number) => {
      ids.push(window.setTimeout(() => { if (vivo) fn(); }, ms));
    };

    // primeiro volta pro cantinho onde a escada encosta
    setDurMove(0.4);
    setMovendo(false);
    setX(0);
    xRef.current = 0;
    setDir(1);

    agendar(() => {                       // começa a subir
      setEscadaFase('subindo');
      setDurY(ESCADA_SUBIDA_S);
      setY(-ESCADA_ALTURA);
    }, 700);
    agendar(() => setEscadaFase('topo'),  // chegou: oizinho 👋
      700 + ESCADA_SUBIDA_S * 1000 + 100);
    agendar(() => {                       // desce devagarinho
      setEscadaFase('descendo');
      setDurY(ESCADA_SUBIDA_S);
      setY(0);
    }, 700 + ESCADA_SUBIDA_S * 1000 + 2_800);
    agendar(() => setEscadaFase('nenhuma'),
      700 + ESCADA_SUBIDA_S * 2000 + 3_000);

    return () => { vivo = false; ids.forEach(clearTimeout); };
  }, [evento]);

  function alimentar(nomeComida?: string) {
    if (nomeComida) salvarUltimaComida(nomeComida);  // memória p/ balõezinhos
    setHumor('feliz');
    setTimeout(() => setHumor('idle'), 1900);
  }

  function alternarSono() {
    usuarioMexeuRef.current = true;
    setHumor(h => {
      const novo: PetHumor = h === 'dormindo' ? 'idle' : 'dormindo';
      estado.salvarVisual(roupa, novo === 'dormindo');
      return novo;
    });
  }

  function trocarRoupa(r: PetRoupa) {
    usuarioMexeuRef.current = true;
    setRoupa(r);
    estado.salvarVisual(r, humor === 'dormindo');
  }

  // Pega a recompensa do recebimento diário: converte em moedas e comemora.
  async function pegarRecompensa() {
    const r = await estado.resgatar();
    if (r && r.moedasCreditadas > 0) {
      setMoedaGanha(r.moedasCreditadas);
      celebrarPetAcordoPago();  // reaproveita a animação de comemoração
      setTimeout(() => setMoedaGanha(null), COMEMORACAO_MS);
    }
  }

  // Desativa o pet (vira iconezinho fixo) ou reativa. Ao desativar, volta
  // pro canto e fecha o quartinho para o efeito ficar visível na hora.
  function alternarMinimizado() {
    const novo = !minimizado;
    setMinimizado(novo);
    if (novo) {
      setDurMove(0);
      setMovendo(false);
      setX(0);
      xRef.current = 0;
      setAberto(false);
    }
  }

  function alternarPainel() {
    setAberto(v => {
      if (!v) {
        // Volta pro canto ao abrir o quartinho
        setDurMove(0.35);
        setMovendo(false);
        setX(0);
        xRef.current = 0;
        estado.refetchDisponivel();
      }
      return !v;
    });
  }

  if (!habilitado) return null;

  const PetSvg = pet.tipo === 'aura' ? PetAura : PetRolo;

  return (
    <div className="fixed bottom-2 right-3 z-40 flex flex-col items-end">
      <AnimatePresence>
        {aberto && (
          <PetQuartinho
            petNome={pet.nome}
            PetSvg={PetSvg}
            humor={humorEfetivo}
            roupa={roupa}
            modoTeaser={!interativo}
            moedas={estado.moedas}
            itens={estado.itens}
            catalogo={estado.catalogo}
            lojaAtiva={estado.dbAtiva}
            recompensaMoedas={estado.disponivel.moedas}
            recompensaValor={estado.disponivel.valor}
            onResgatar={pegarRecompensa}
            onComprar={estado.comprar}
            onAlimentar={alimentar}
            onAlternarSono={alternarSono}
            onSetRoupa={trocarRoupa}
            minimizado={minimizado}
            onAlternarMinimizado={alternarMinimizado}
            clima={climaAtual}
            cidadeClimaId={cidadeClima.id}
            onSetCidadeClima={setCidadeClima}
            onClose={() => setAberto(false)}
          />
        )}
      </AnimatePresence>

      {/* notificaçãozinha de recompensa: recebimento do dia p/ pegar */}
      {interativo && !aberto && moedaGanha == null && !comemorando && estado.disponivel.moedas > 0 && (
        <button
          type="button"
          onClick={pegarRecompensa}
          className="pet-anim-recompensa mb-1 mr-1 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-500 text-amber-950 text-[11px] font-bold pl-2 pr-2.5 py-1 shadow-lg border border-amber-300/70 cursor-pointer hover:brightness-105"
          title="Recompensa do recebimento do dia — clique para pegar"
        >
          🪙 Pegar +{estado.disponivel.moedas}
        </button>
      )}

      {/* pet desativado: iconezinho fixo e parado — clique reabre o quartinho */}
      {minimizado && (
        <button
          type="button"
          onClick={alternarPainel}
          title={`Seu ${pet.nome} está quietinho — clique para abrir`}
          aria-label={`Abrir o quartinho do seu ${pet.nome}`}
          className="relative w-9 h-9 text-black/70 dark:text-white/60 opacity-70 hover:opacity-100 hover:scale-110 transition-all cursor-pointer bg-transparent border-0 p-0"
        >
          <PetSvg humor="idle" roupa={roupa} className="pet-estatico w-full h-full drop-shadow-sm" />
        </button>
      )}

      {!minimizado && (<>
      {/* escadinha de madeira encostada no cantinho */}
      {evento === 'escada' && (
        <svg
          className="pet-anim-escada-in absolute bottom-1 pointer-events-none"
          style={{ right: 18, transform: 'rotate(-3.5deg)', transformOrigin: 'bottom right' }}
          width="46"
          height={ESCADA_ALTURA + 86}
          viewBox={`0 0 46 ${ESCADA_ALTURA + 86}`}
          aria-hidden="true"
        >
          <line x1="9"  y1="6" x2="9"  y2={ESCADA_ALTURA + 82} stroke="#a8815c" strokeWidth="6" strokeLinecap="round" />
          <line x1="37" y1="6" x2="37" y2={ESCADA_ALTURA + 82} stroke="#a8815c" strokeWidth="6" strokeLinecap="round" />
          {Array.from({ length: Math.floor((ESCADA_ALTURA + 60) / 26) }, (_, i) => (
            <line key={i} x1="9" x2="37" y1={20 + i * 26} y2={20 + i * 26} stroke="#c9a97b" strokeWidth="5" strokeLinecap="round" />
          ))}
        </svg>
      )}

      <div style={{ transform: `translateX(${x}px)`, transition: `transform ${durMove}s linear` }}>
        {/* camada vertical: usada só pela escada (sobe/desce com deriva) */}
        <div
          className="relative"
          style={{
            transform: `translate(${y !== 0 ? ESCADA_DERIVA_X : 0}px, ${y}px)`,
            transition: `transform ${durY}s linear`,
          }}
        >
          {/* balãozinho: +moedas ao pegar recompensa, senão comemoração de pago */}
          {moedaGanha != null && !aberto ? (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-amber-400 border border-amber-300 text-amber-950 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-md">
              +{moedaGanha} 🪙
            </div>
          ) : comemorando && !aberto && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card border border-border text-foreground text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-md">
              Acordo pago! 🎉
            </div>
          )}
          {/* oizinho lá do alto da escada */}
          {escadaFase === 'topo' && !aberto && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card border border-border text-foreground text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-md">
              oiii! 👋
            </div>
          )}
          {/* resultado da pescaria */}
          {evento === 'pesca' && (pescaFase === 'peixe' || pescaFase === 'escapou' || pescaFase === 'bota') && !aberto && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card border border-border text-foreground text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-md">
              {pescaFase === 'peixe' ? 'pesquei! 🐟' : pescaFase === 'escapou' ? 'escapou… 😿' : 'uma bota?! 🥾'}
            </div>
          )}
          {/* frase contextual rara (bom dia, sextou, fominha…) */}
          {frase && !aberto && !comemorando && moedaGanha == null && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card border border-border text-foreground text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-md">
              {frase}
            </div>
          )}
          <button
            ref={petBtnRef}
            type="button"
            onClick={alternarPainel}
            onMouseEnter={aoPassarMousePorCima}
            title={`Seu ${pet.nome} — clique para abrir`}
            aria-label={`Abrir o quartinho do seu ${pet.nome}`}
            className="relative w-24 h-24 text-black/70 dark:text-white/60 hover:scale-105 transition-transform cursor-pointer bg-transparent border-0 p-0"
          >
            {/* flip na direção da caminhada; passinhos no corpo (sombra fica no chão) */}
            <div className="w-full h-full" style={{ transform: `scaleX(${dir})`, transition: 'transform .2s' }}>
              <PetSvg
                humor={humorEfetivo}
                roupa={roupa}
                micro={microEfetivo}
                cena={cena}
                andando={movendo || escadaFase === 'subindo' || escadaFase === 'descendo'}
                olhar={{ x: olhar.x * dir, y: olhar.y }}  /* compensa o flip */
                pescaFase={pescaFase}
                clima={climaAtual.clima}
                className="w-full h-full drop-shadow-sm"
              />
            </div>
          </button>
        </div>
      </div>
      </>)}
    </div>
  );
}
