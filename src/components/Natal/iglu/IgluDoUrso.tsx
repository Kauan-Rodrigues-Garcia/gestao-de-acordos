import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuthOpcional } from '@/hooks/useAuth';
import { useModoLeve } from '@/lib/modoLeve';
import { useRelogioDoTrem } from '../trem/comum';
import { ondeEsta } from '../trem/horario';
import { agendaAgora } from '../trem/agenda';
import { ROTA_DO_TREM } from '../trem/rota';
import { relogioNatal } from '../musica';
import { ENTRANDO_S, SAINDO_S, beliscada, chamarUrsoParaTeste, oUrsoAgora, tremPassaPeloIglu } from './urso';
import { criarRodada, SILENCIO_MS, type MomentoDoUrso } from './falas';
import { DentroDoIglu } from './DentroDoIglu';
import { cortinaFechadaAte, fecharCortina, sortearAtividade, type AtividadeDoUrso } from './espiar';
import { invasaoRecente } from '../noticiaDoGrinch';
import { Urso } from './DesenhoDoUrso';
import { BURACO, CHAO, DESCE, ESTRELINHA, X_PORTA, X_SENTADO, limitar, suave } from './medidas';
import './iglu.css';

/** O balão escreve uma letra a cada tanto (ms), como quem está falando. */
const MS_POR_LETRA = 26;
/** Depois de escrita, a fala fica o tempo de ler: mais longa, mais tempo. */
const tempoDeLer = (letras: number) => Math.min(5500, Math.max(2000, 1400 + 45 * letras));
const primeiroNome = (nome: string | null | undefined) => (nome ?? '').trim().split(/\s+/)[0] || null;

/**
 * O relógio quadro a quadro, só com o urso fora do iglu (Cleber, 05/11/2026:
 * «como se ele tivesse no mesmo frame a cada segundo»). Antes a posição vinha
 * de um relógio de 200 ms alisado por CSS — e com a redução de animações do
 * Windows a transição sumia e ele andava aos pulos. Aqui são ~30 quadros por
 * segundo, e só enquanto ele está fora.
 */
function useRelogioFino(ativo: boolean): number {
  const [agora, setAgora] = useState(relogioNatal);
  useEffect(() => {
    if (!ativo) return;
    let quadro = 0, antes = 0;
    const passo = (t: number) => {
      if (t - antes >= 33) { antes = t; setAgora(relogioNatal()); }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [ativo]);
  return agora;
}

/*
 * O iglu do urso, no alto do Analítico (pedido do Cleber, 04/11/2026).
 *
 * Estilo das referências de ilustração plana (urso polar fofo, pescando no
 * gelo): formas redondas e amigáveis, paleta fria — branco, azul-gelo — com o
 * vermelho e o verde do Natal no cachecol e no gorro; sem contorno, como o
 * trem e o boneco de neve.
 *
 * Quando o urso sai é o relógio que diz (`urso.ts`): duas vezes por hora, para todo
 * mundo ao mesmo tempo. Fora das visitas ele está lá dentro — porta fechada,
 * janelinha acesa. Clicar nele (ou no iglu) puxa conversa: o que ele fala, e
 * em que ordem, é `falas.ts` (sorteado por rodada, sem repetir). O balão
 * escreve letra por letra e, numa conversa de mais de uma fala, ele continua
 * sozinho; um clique adianta.
 *
 * Desde 06/11/2026: depois de 10 conversas ele cansa e fica quieto (`falas.ts`),
 * e com ele em casa dá para ESPIAR pela janelinha — um zoom abre o lado de
 * dentro (`DentroDoIglu.tsx`); quem fica olhando é pego e a cortina fecha
 * (`espiar.ts`).
 *
 * O iglu é bem mais alto que o urso (Cleber, 04/11/2026: «para fazer sentido o
 * tamanho da porta»): a porta tem a altura dele de gorro, e a cúpula passa
 * dele com folga.
 *
 * Desenho em px da tela, `LARGURA` × `ALTURA`, com o chão em y = `CHAO`.
 */

export const LARGURA = 300;
export const ALTURA = 132;

const CenaDoIglu = memo(function CenaDoIglu({ porta, acesa, ondinha }: { porta: boolean; acesa: boolean; ondinha: boolean }) {
  // As fileiras de blocos da cúpula (de baixo para cima) e as do túnel.
  const fileiras = [126, 114, 101, 88, 75, 63, 53, 44];
  const fileirasTunel = [126, 114, 102, 90, 78, 66];
  return (
    <>
      <defs>
        <clipPath id="nt-iglu-cupula"><path d="M150 126 A64 80 0 0 1 278 126 Z" /></clipPath>
        <clipPath id="nt-iglu-tunel"><path d="M136 126 V91 A27 30 0 0 1 190 91 V126 Z" /></clipPath>
        <clipPath id="nt-iglu-porta-forma"><path d="M147 126 V94.5 A16 23 0 0 1 179 94.5 V126 Z" /></clipPath>
        {/* o gelo com volume: luz no alto à esquerda, sombra embaixo à direita */}
        <radialGradient id="nt-iglu-gelo" cx="0.32" cy="0.22" r="0.95">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#EEF4F9" />
          <stop offset="1" stopColor="#CFDDE9" />
        </radialGradient>
        <radialGradient id="nt-iglu-luz" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFD98A" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFD98A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nt-iglu-boca" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1C2532" />
          <stop offset="1" stopColor="#334257" />
        </linearGradient>
      </defs>

      {/* À esquerda: a plaquinha, o laguinho com o buraco e o bloco onde o urso senta */}
      <g transform={`translate(0 ${DESCE})`}>
        <rect x={13.5} y={66} width={3} height={26} rx={1.2} fill="#7A5236" />
        <rect x={2} y={57} width={32} height={12} rx={2.5} fill="#A0724F" />
        <text x={18} y={65.4} textAnchor="middle" fontSize={6.6} fontWeight={800} letterSpacing={0.6} fill="#FFF8EC" fontFamily="system-ui, sans-serif">PESCA</text>
        <path d="M2.5 58.5 Q10 55 18 57.4 Q26 55 33.5 58.5 L33.5 57 L2.5 57 Z" fill="#FFFFFF" />
        <ellipse cx={70} cy={90} rx={48} ry={7.6} fill="#CDEBF7" />
        <ellipse cx={66} cy={89.4} rx={38} ry={5} fill="#E3F4FB" />
        <path d="M38 90 L48 88.6 L54 90.4 M92 88.4 L100 89.6 M58 92.6 L66 91.4" stroke="#B3D8EA" strokeWidth={0.8} fill="none" />
        <ellipse cx={BURACO.x} cy={BURACO.y - DESCE} rx={8.4} ry={3} fill="#FFFFFF" />
        <ellipse cx={BURACO.x} cy={BURACO.y - DESCE + 0.3} rx={7} ry={2.4} fill="#2F6F9F" />
        {ondinha && <ellipse className="nt-urso-ondinha" cx={BURACO.x} cy={BURACO.y - DESCE + 0.3} rx={7} ry={2.4} fill="none" stroke="#FFFFFF" strokeWidth={0.8} />}
        <rect x={X_SENTADO - 9} y={85} width={18} height={7} rx={2} fill="#D3E6F2" />
        <rect x={X_SENTADO - 9} y={85} width={18} height={2} rx={1} fill="#EAF4FA" />
      </g>

      {/* A sombra do iglu na neve */}
      <ellipse cx={212} cy={126} rx={82} ry={5} fill="#B4C7D7" opacity={0.45} />

      {/* A cúpula: gelo com volume, blocos desencontrados com brilho na borda de cima, sombra à direita */}
      <path d="M150 126 A64 80 0 0 1 278 126 Z" fill="url(#nt-iglu-gelo)" />
      <g clipPath="url(#nt-iglu-cupula)">
        {fileiras.slice(1).map(y => (
          <g key={y}>
            <line x1={150} y1={y} x2={278} y2={y} stroke="#BFD0DE" strokeWidth={1.1} />
            <line x1={150} y1={y + 1.3} x2={278} y2={y + 1.3} stroke="#FFFFFF" strokeWidth={0.9} opacity={0.75} />
          </g>
        ))}
        {fileiras.slice(0, -1).map((baixo, i) => {
          const alto = fileiras[i + 1];
          return Array.from({ length: 7 }, (_, k) => 150 + (i % 2 ? 11 : 0) + k * 22).map(x => (
            <line key={`${baixo}-${x}`} x1={x} y1={alto} x2={x} y2={baixo} stroke="#BFD0DE" strokeWidth={1.1} />
          ));
        })}
      </g>
      <path d="M278 126 A64 80 0 0 0 236 50 Q270 80 262 126 Z" fill="#B9CCDC" opacity={0.45} />
      <path d="M180 120 Q176 84 196 60" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.55} />
      <path d="M186 52 Q196 41 210 43.6 Q222 39.6 234 46.6 Q241 50.4 243 55.6 Q233 51.4 224 53.2 Q214 49.2 204 53 Q194 50.6 186 52 Z" fill="#FFFFFF" />

      {/* A janela redonda: acesa com o urso em casa, com o reflexo na neve */}
      <ellipse className={cn('nt-iglu-reflexo', acesa && 'acesa')} cx={240} cy={124.6} rx={24} ry={3.6} fill="#FFD98A" />
      <circle className={cn('nt-iglu-brilho', acesa && 'acesa')} cx={242} cy={86} r={24} fill="url(#nt-iglu-luz)" />
      <circle cx={242} cy={86} r={11} fill="#BFD0DE" />
      <circle className={cn('nt-iglu-vidro', acesa && 'acesa')} cx={242} cy={86} r={8.2} />
      <path d="M242 77.8 V94.2 M233.8 86 H250.2" stroke="#BFD0DE" strokeWidth={1.6} />
      <path d="M236 82.6 A7 7 0 0 1 240 79.4" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.7} />
      <path d="M230 97.6 Q242 94 254 97.6 Q242 100 230 97.6 Z" fill="#FFFFFF" />

      {/* O túnel da entrada, em blocos */}
      <path d="M136 126 V91 A27 30 0 0 1 190 91 V126 Z" fill="url(#nt-iglu-gelo)" />
      <g clipPath="url(#nt-iglu-tunel)">
        {fileirasTunel.slice(1).map(y => (
          <g key={y}>
            <line x1={136} y1={y} x2={190} y2={y} stroke="#BFD0DE" strokeWidth={1.1} />
            <line x1={136} y1={y + 1.3} x2={190} y2={y + 1.3} stroke="#FFFFFF" strokeWidth={0.9} opacity={0.75} />
          </g>
        ))}
        {fileirasTunel.slice(0, -1).map((baixo, i) => {
          const alto = fileirasTunel[i + 1];
          return Array.from({ length: 4 }, (_, k) => 136 + (i % 2 ? 9 : 0) + k * 18).map(x => (
            <line key={`${baixo}-${x}`} x1={x} y1={alto} x2={x} y2={baixo} stroke="#BFD0DE" strokeWidth={1.1} />
          ));
        })}
      </g>

      {/* A boca escura, a luz pelas frestas (com o urso em casa) e a porta de madeira */}
      <path d="M146 126 V94 A17 24 0 0 1 180 94 V126 Z" fill="url(#nt-iglu-boca)" />
      <path className={cn('nt-iglu-fresta', acesa && 'acesa')} d="M146.6 126 V94 A16.4 23.4 0 0 1 179.4 94 V126" stroke="#FFD98A" strokeWidth={2} fill="none" />
      <g className={cn('nt-iglu-porta', porta && 'aberta')}>
        <path d="M147 126 V94.5 A16 23 0 0 1 179 94.5 V126 Z" fill="#8A5E3F" />
        <g clipPath="url(#nt-iglu-porta-forma)">
          <path d="M155 126 V70 M163 126 V70 M171 126 V70" stroke="#6E4A30" strokeWidth={1.1} />
          <rect x={146} y={102} width={34} height={2.4} fill="#4A3F44" opacity={0.75} />
          <rect x={146} y={117} width={34} height={2.4} fill="#4A3F44" opacity={0.75} />
          <path d="M147 94.5 A16 23 0 0 1 179 94.5" stroke="#A97B55" strokeWidth={1.6} fill="none" />
        </g>
        <circle cx={174} cy={111} r={1.7} fill="#F2B544" />
        {/* a guirlandinha da porta */}
        <circle cx={163} cy={86} r={4.6} fill="none" stroke="#3F9A5B" strokeWidth={2.4} />
        <circle cx={160.4} cy={83.6} r={0.9} fill="#D6403A" />
        <circle cx={166} cy={88} r={0.9} fill="#D6403A" />
        <path d="M161.4 91.2 L163 89.6 L164.6 91.2" stroke="#D6403A" strokeWidth={1.4} strokeLinecap="round" fill="none" />
      </g>

      {/* A neve no alto do túnel e os pingentes de gelo */}
      <path d="M133 93 Q138 78 150 68.6 Q163 61.4 176 68.6 Q188 78 193 93 Q186 82 176 74.4 Q163 67.6 150 74.4 Q140 82 133 93 Z" fill="#FFFFFF" />
      <path d="M136.4 90 l1.6 6.6 l1.6 -6.6 Z M140.6 84 l1.3 5.2 l1.3 -5.2 Z M184.6 84 l1.3 5.2 l1.3 -5.2 Z M188.2 90 l1.6 6.6 l1.6 -6.6 Z" fill="#D9ECF7" />

      {/* Os montes de neve na base */}
      <path d="M126 126 Q131 119 138 121 Q143 118 146 126 Z" fill="#FFFFFF" />
      <path d="M192 126 Q200 118.4 212 121.6 Q224 116.6 238 126 Z" fill="#FFFFFF" />
      <path d="M262 126 Q272 116 284 119.4 Q293 121.6 296 126 Z" fill="#FFFFFF" />

      {/* Brilhinhos no gelo */}
      {([[198, 72, 0], [226, 106, 1.1], [262, 94, 2.2], [214, 58, 0.6], [186, 106, 1.7]] as const).map(([x, y, atraso]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
          <path className="nt-iglu-brilhinho" d={ESTRELINHA} fill="#FFFFFF" style={{ animationDelay: `${atraso}s` }} />
        </g>
      ))}
    </>
  );
});

export function IgluDoUrso() {
  // Com o urso lá dentro nada se mexe: o relógio anda de segundo em segundo. Com ele fora, quadro a quadro.
  const leve = useModoLeve();
  const lento = useRelogioDoTrem(1000);
  const fora = oUrsoAgora(lento).fase !== 'dentro';
  const fino = useRelogioFino(fora);
  const agora = fora ? Math.max(fino, lento) : lento;
  const { fase, t } = oUrsoAgora(agora);
  // O trem passando pelo iglu, com ele pescando: tchauzinho (e uma fala, uma vez por passagem).
  const posDoTrem = ondeEsta(lento, ROTA_DO_TREM, agendaAgora());
  const acenando = fase === 'pescando' && tremPassaPeloIglu(posDoTrem);
  const atento = fase === 'pescando' && !acenando ? beliscada(t) : null;
  const nome = primeiroNome(useAuthOpcional()?.perfil?.nome);
  /** A conversa em andamento: as falas dela, qual está no balão, e quem fala. */
  const [fala, setFala] = useState<{ linhas: string[]; i: number; doUrso: boolean; id: number } | null>(null);
  /** Quantas letras da fala de agora já foram escritas. */
  const [letras, setLetras] = useState(0);
  /** A rodada de conversa (baralhos embaralhados); recomeça quando ele aparece ou entra. */
  const rodada = useRef<ReturnType<typeof criarRodada> | null>(null);
  /** Quando ele ficou calado (passou do limite de conversas). */
  const caladoDesde = useRef<number | null>(null);
  /** A espiada pela janela, aberta agora. */
  const [espiada, setEspiada] = useState<{ origem: DOMRect; atividade: AtividadeDoUrso; id: number } | null>(null);
  /** Até quando a cortina da janelinha fica fechada (ele pegou alguém espiando). */
  const [cortinaAte, setCortinaAte] = useState(cortinaFechadaAte);

  // Escreve a fala letra por letra; lida, passa para a próxima da conversa (ou fecha o balão).
  useEffect(() => {
    if (!fala) return;
    const total = Array.from(fala.linhas[fala.i]).length;
    const instantaneo = leve;
    let n = instantaneo ? total : 0;
    setLetras(n);
    const escreve = instantaneo ? 0 : window.setInterval(() => {
      n = Math.min(total, n + 1);
      setLetras(n);
      if (n >= total) window.clearInterval(escreve);
    }, MS_POR_LETRA);
    const fim = window.setTimeout(() => {
      setFala(f => (f && f.id === fala.id && f.i === fala.i ? (f.i + 1 < f.linhas.length ? { ...f, i: f.i + 1 } : null) : f));
    }, (instantaneo ? 0 : total * MS_POR_LETRA) + tempoDeLer(total));
    return () => { window.clearInterval(escreve); window.clearTimeout(fim); };
  }, [fala, leve]);

  // Onde o urso está, se aparece, e a porta.
  let x = X_SENTADO, opacidade = 1, andando = false, porta = false;
  if (fase === 'dentro') opacidade = 0;
  if (fase === 'saindo') {
    porta = t < SAINDO_S - 0.5;
    x = X_PORTA + (X_SENTADO - X_PORTA) * suave(limitar((t - 0.5) / (SAINDO_S - 1.1)));
    opacidade = limitar((t - 0.35) / 0.4);
    andando = t > 0.5 && t < SAINDO_S - 0.6;
  }
  if (fase === 'entrando') {
    porta = t > 0.2 && t < ENTRANDO_S - 0.3;
    x = X_SENTADO + (X_PORTA - X_SENTADO) * suave(limitar((t - 0.3) / (ENTRANDO_S - 1.2)));
    opacidade = 1 - limitar((t - (ENTRANDO_S - 0.95)) / 0.45);
    andando = t > 0.3 && t < ENTRANDO_S - 0.9;
  }
  const acesa = fase === 'dentro' || (fase === 'entrando' && t > ENTRANDO_S - 0.25);
  const visivel = opacidade > 0.05;

  // Uma rodada nova cada vez que ele aparece (e cada vez que ele entra, para o iglu).
  useEffect(() => { rodada.current = null; caladoDesde.current = null; }, [visivel]);
  const cortinaFechada = lento < cortinaAte;

  // O tchauzinho para o trem: uma fala por passagem (a viagem e o sentido dizem qual).
  const passagem = acenando ? `${posDoTrem.partidaMs}-${posDoTrem.fase}` : null;
  const ultimaPassagem = useRef<string | null>(null);
  useEffect(() => {
    if (!passagem || ultimaPassagem.current === passagem) return;
    ultimaPassagem.current = passagem;
    rodada.current ??= criarRodada(nome, new Date().getHours(), Math.random, invasaoRecente());
    setFala({ linhas: rodada.current.proxima('trem'), i: 0, doUrso: true, id: Date.now() });
  }, [passagem, nome]);

  const clicar = () => {
    const doUrso = visivel;
    // No meio de uma conversa: adianta para a próxima fala dela.
    if (fala && fala.doUrso === doUrso && fala.i + 1 < fala.linhas.length) {
      setFala({ ...fala, i: fala.i + 1 });
      return;
    }
    // Calado há tempo bastante, volta a conversar (rodada nova).
    if (caladoDesde.current !== null && Date.now() - caladoDesde.current > SILENCIO_MS) { rodada.current = null; caladoDesde.current = null; }
    rodada.current ??= criarRodada(nome, new Date().getHours(), Math.random, invasaoRecente());
    const momento: Exclude<MomentoDoUrso, 'trem'> = !doUrso ? 'iglu' : fase === 'fisgou' || fase === 'entrando' ? 'fisgou' : 'pescando';
    const linhas = rodada.current.conversar(momento);
    // Passou do limite: ele já se despediu e não responde mais nesta rodada.
    if (!linhas) return;
    if (rodada.current.calado) caladoDesde.current = Date.now();
    setFala({ linhas, i: 0, doUrso, id: Date.now() });
  };

  /** Clique na janelinha (com ele em casa): abre a espiada — ou avisa que a cortina está fechada. */
  const espiar = (e: React.MouseEvent<SVGCircleElement>) => {
    e.stopPropagation();
    if (espiada) return;
    if (cortinaFechada) {
      setFala({ linhas: ['A cortina está fechada.', 'Melhor deixar o urso em paz um pouquinho…'], i: 0, doUrso: false, id: Date.now() });
      return;
    }
    setFala(null);
    setEspiada({ origem: e.currentTarget.getBoundingClientRect(), atividade: sortearAtividade(), id: Date.now() });
  };
  const fimDaEspiada = (pego: boolean) => {
    setEspiada(null);
    if (pego) {
      setCortinaAte(fecharCortina());
      setFala({ linhas: ['Lá de dentro: «E NÃO VOLTA!»', 'A cortina ficou fechada.'], i: 0, doUrso: false, id: Date.now() });
    }
  };
  const texto = fala ? Array.from(fala.linhas[fala.i]) : [];

  return (
    <div className={cn('nt-iglu', leve && 'leve')} onClick={clicar} role="button" tabIndex={0} aria-label="O iglu do urso"
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clicar(); } }}>
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} width={LARGURA} height={ALTURA} overflow="visible">
        <CenaDoIglu porta={porta} acesa={acesa} ondinha={fase === 'pescando' || fase === 'fisgou'} />
        {/* A janelinha: a cortina (quando ele pegou alguém espiando) e, com ele em casa, o clique para espiar. */}
        {cortinaFechada && (
          <g className="nt-iglu-cortina">
            <clipPath id="nt-iglu-vidro"><circle cx={242} cy={86} r={8.2} /></clipPath>
            <g clipPath="url(#nt-iglu-vidro)">
              <path d="M233 77 H242.4 Q240 86 242.4 95 H233 Z" />
              <path d="M251 77 H241.6 Q244 86 241.6 95 H251 Z" />
              <path className="dobra" d="M236.6 77 V95 M247.4 77 V95" />
            </g>
            <path d="M242 77.8 V94.2 M233.8 86 H250.2" stroke="#BFD0DE" strokeWidth={1.6} />
          </g>
        )}
        {fase === 'dentro' && (
          <>
            <circle className="nt-iglu-janela-mira" cx={242} cy={86} r={12.6} />
            <circle className={cn('nt-iglu-janela-clique', cortinaFechada && 'fechada')} cx={242} cy={86} r={13} onClick={espiar}>
              <title>{cortinaFechada ? 'A cortina está fechada' : 'Espiar pela janela'}</title>
            </circle>
          </>
        )}
        {/* Voltando para casa, ele vira para a porta (o desenho olha para a esquerda). */}
        <g className={cn('nt-urso', andando && 'andando')}
          style={{ transform: `translate(${x.toFixed(2)}px, ${CHAO}px)${fase === 'entrando' ? ' scaleX(-1)' : ''}`, opacity: opacidade }}>
          <Urso
            feliz={fase === 'fisgou' || fase === 'entrando'}
            vara={fase === 'pescando' || fase === 'fisgou'}
            fisgando={fase === 'fisgou' && t < 1.6}
            peixe={fase === 'fisgou' ? (t < 1.4 ? 'pulando' : 'na-pata') : fase === 'entrando' ? 'na-pata' : 'nao'}
            atento={atento}
            acenando={acenando}
            pulando={fase === 'fisgou' && t > 1.4 && t < 3.2}
          />
        </g>
      </svg>
      {fala && (
        <div key={`${fala.id}-${fala.i}`} className="nt-iglu-fala" role="status" aria-label={texto.join('')}
          // À esquerda de quem fala, na altura da cabeça: em cima seria cortado pelo alto da página.
          style={{ right: LARGURA - (fala.doUrso ? x - 16 : 140), bottom: fala.doUrso ? 46 : 40 }}>
          {/* O resto da frase já ocupa o lugar (invisível): o balão nasce do tamanho certo e não pula. */}
          <span aria-hidden="true">{texto.slice(0, letras).join('')}</span>
          <span aria-hidden="true" className="nt-iglu-fala-resto">{texto.slice(letras).join('')}</span>
        </div>
      )}
      {espiada && (
        <DentroDoIglu key={espiada.id} origem={espiada.origem} atividade={espiada.atividade} emCasa={fase === 'dentro'} onFechar={fimDaEspiada} />
      )}
      {import.meta.env.DEV && (
        <button type="button" className="nt-trem-botao-teste nt-iglu-teste" title="Só no npm run dev"
          onClick={e => { e.stopPropagation(); chamarUrsoParaTeste(relogioNatal()); }}>
          Chamar o urso
        </button>
      )}
    </div>
  );
}
