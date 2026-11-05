import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AvatarChat } from '@/components/Chat/comum';
import {
  ALTURA_ESTACAO, ALTURA_FAIXA, ALTURA_FAIXA_DO_IGLU, COMPRIMENTO_TREM_PX, RECUO_DA_PARADA, TRILHO_NA_FAIXA, useRelogioDoTrem,
} from './comum';
import {
  PARADA_ESTACAO_S, ROTULO_ABA, chaveDoSorteio, chegaNaAbaEm, etapaDoSorteio, ondeEsta, quantosABordo,
  relogioCurto, segundosAteAEstacao, type AbaDoTrem, type TremFechado,
} from './horario';
import { PRIMEIROS_DA_FILA, agendaAgora, horaDe, useAgendaDoTrem, type AgendaDoTrem } from './agenda';
import { MuralDaEstacao } from './MuralDaEstacao';
import { useInscricao, usePassageiros } from './passageiros';
import { PISTAS_DA_ABA, abasDaRegra } from './rota';
import { ouvirRegraDaSessao, regraDaSessaoAtual } from '@/lib/regraDoSetor';
import { IgluDoUrso } from '../iglu/IgluDoUrso';
import { buzina, ligarSonsDoTrem, useSonsDoTrem } from './sons';
import { adiantarRelogioNatalParaTeste, relogioNatal } from '../musica';

/*
 * As faixas do trem: espaços de verdade que o `Layout` abre nas abas por onde
 * o trem passa, onde correm as pistas (`PISTAS_DA_ABA`, em `rota.ts`):
 *
 *   pé do Dashboard    — a estação: o prédio (clicável: o mural da fila), o
 *                        sorteio de surpresa, um de cada vez, e a parada;
 *   pé de Acordos e Pix — a pista e o aviso de onde o trem está e quando chega;
 *   alto do Analítico  — a pista de ida, o aviso e o iglu do urso;
 *   pé do Analítico    — a pista de volta e o fim da linha, com o para-choque.
 *
 * O trilho e o trem não moram aqui: são da camada (`CamadaDoTrem.tsx`), que
 * acha as faixas por `data-faixa-trem` e a parada por `data-trem-parada` /
 * `data-trem-fim-da-linha`.
 */

function BotaoSons() {
  const ligados = useSonsDoTrem();
  return (
    <button
      type="button"
      onClick={() => ligarSonsDoTrem(!ligados)}
      className="nt-trem-botao-som"
      title={ligados ? 'Desligar os sons do trem' : 'Ligar os sons do trem'}
      aria-label={ligados ? 'Desligar os sons do trem' : 'Ligar os sons do trem'}
    >
      {ligados ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Só no `npm run dev`: toca a buzina na hora, para ajustar o volume sem esperar a viagem dela. */
function BotaoTestarBuzina() {
  if (!import.meta.env.DEV) return null;
  return (
    <button type="button" onClick={() => buzina(true)} className="nt-trem-botao-teste" title="Só no npm run dev">
      Testar buzina
    </button>
  );
}

/**
 * Só no `npm run dev`: adianta o relógio do trem até a próxima chegada à
 * estação, para ver o sorteio sem esperar a volta inteira.
 */
function BotaoVerSorteio({ rota }: { rota: readonly AbaDoTrem[] }) {
  if (!import.meta.env.DEV) return null;
  return (
    <button type="button" className="nt-trem-botao-teste" title="Só no npm run dev"
      onClick={() => {
        const s = segundosAteAEstacao(relogioNatal(), rota, agendaAgora());
        if (s !== null) adiantarRelogioNatalParaTeste(s * 1000 + 300);
      }}>
      Ver o sorteio agora
    </button>
  );
}

/** «às 08:00», «amanhã às 08:00» ou «sex. às 08:00» (horário de Brasília). */
function quandoAbre(abreEmMs: number, agoraMs: number): string {
  const fuso = { timeZone: 'America/Sao_Paulo' } as const;
  const hora = new Date(abreEmMs).toLocaleTimeString('pt-BR', { ...fuso, hour: '2-digit', minute: '2-digit' });
  const dia = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', fuso);
  if (dia(abreEmMs) === dia(agoraMs)) return `às ${hora}`;
  if (dia(abreEmMs) === dia(agoraMs + 86_400_000)) return `amanhã às ${hora}`;
  return `${new Date(abreEmMs).toLocaleDateString('pt-BR', { ...fuso, weekday: 'short' })} às ${hora}`;
}

/** O trem parado na estação, numa frase: por que, e quando volta. */
function textoDoFechado(f: TremFechado, agenda: AgendaDoTrem | null, agoraMs: number) {
  switch (f.motivo) {
    case 'carregando': return <>Conferindo o horário do trem…</>;
    case 'desligado': return <><b>O trenzinho está em manutenção</b> na estação.</>;
    case 'esperando': {
      const faltam = Math.max(1, PRIMEIROS_DA_FILA - (agenda?.inscritos ?? 0));
      return <><b>A primeira viagem sai quando {PRIMEIROS_DA_FILA} pessoas entrarem na fila</b> · {faltam === 1 ? 'falta 1' : `faltam ${faltam}`}</>;
    }
    case 'fechado': return <><b>Estação fechada</b>{f.abreEmMs !== null && <> · abre {quandoAbre(f.abreEmMs, agoraMs)}</>}</>;
  }
}

function Aviso({ aba, rota }: { aba: AbaDoTrem; rota: readonly AbaDoTrem[] }) {
  const agora = useRelogioDoTrem(1000);
  const agenda = useAgendaDoTrem();
  const pos = ondeEsta(agora, rota, agenda);
  const aqui = pos.aba === aba;
  const falta = aqui ? 0 : chegaNaAbaEm(agora, rota, aba, agenda);
  // Quem é da regra Cofen não tem o Pix: ali o trem está «a caminho», sem nome de aba.
  const visiveis = abasDaRegra(useSyncExternalStore(ouvirRegraDaSessao, regraDaSessaoAtual));
  const ondeVe = visiveis.includes(pos.aba);
  return (
    <div className="nt-trem-aviso">
      <span aria-hidden="true">{pos.fechado?.motivo === 'desligado' ? '🔧' : '🚂'}</span>
      {pos.fechado
        ? <span>{aba === rota[0] ? textoDoFechado(pos.fechado, agenda, agora) : <>O trem está na estação, no <b>{ROTULO_ABA[rota[0]]}</b> · {textoDoFechado(pos.fechado, agenda, agora)}</>}</span>
        : aqui
        ? <span>{pos.fase === 'fim' ? 'Fim da linha! O trem já vai voltar.' : 'O trem está passando por aqui!'}</span>
        : <span>{ondeVe ? <>O trem está em <b>{ROTULO_ABA[pos.aba]}</b></> : 'O trem está a caminho'}{falta !== null && <> · chega aqui em <b>{relogioCurto(falta)}</b></>}</span>}
      <BotaoSons />
      <BotaoTestarBuzina />
    </div>
  );
}

/** O prédio da estação, 150 × 118. */
function PredioDaEstacao() {
  return (
    <svg viewBox="0 0 156 120" width={156} height={120} aria-hidden="true" className="nt-trem">
      {/* plataforma */}
      <rect x={0} y={108} width={156} height={12} rx={3} fill="#E6D8C2" />
      <rect x={0} y={108} width={156} height={3} rx={1.5} fill="#F6F0E7" />
      {/* poste com lampião */}
      <rect x={146} y={58} width={3.4} height={50} rx={1.7} fill="#3A2F3B" />
      <circle className="nt-trem-lampiao" cx={147.7} cy={54} r={9} fill="#FFD98A" opacity={0.35} />
      <rect x={142.5} y={48} width={10.4} height={11} rx={2.5} fill="#F2B544" />
      <rect x={141.5} y={46} width={12.4} height={3} rx={1.5} fill="#7A2433" />
      {/* paredes */}
      <rect x={18} y={54} width={116} height={54} fill="#F6F0E7" />
      <rect x={18} y={94} width={116} height={14} fill="#E6D8C2" />
      {/* janelas acesas */}
      {[30, 100].map(x => (
        <g key={x}>
          <rect x={x} y={70} width={22} height={19} rx={3} fill="#A92F35" />
          <rect x={x + 2.5} y={72.5} width={17} height={14} rx={2} fill="#FFD98A" />
          <rect x={x + 10} y={72.5} width={2} height={14} fill="#A92F35" />
          <rect x={x + 2.5} y={78.5} width={17} height={2} fill="#A92F35" />
          <path d={`M${x - 1} ${70} h24 v-3 h-24 z`} fill="#FFFFFF" />
        </g>
      ))}
      {/* porta com guirlanda */}
      <rect x={65} y={74} width={22} height={34} rx={3} fill="#3F9A5B" />
      <rect x={67.5} y={76.5} width={17} height={14} rx={2} fill="#2E7A47" />
      <circle cx={76} cy={84} r={5} fill="none" stroke="#F2B544" strokeWidth={2.2} />
      <circle cx={83} cy={95} r={1.3} fill="#F2B544" />
      {/* placa */}
      <rect x={40} y={57.5} width={72} height={11} rx={2.5} fill="#7A2433" />
      <text x={76} y={65.6} textAnchor="middle" fontSize={7.4} fontWeight={800} letterSpacing={1.2} fill="#F6F0E7" fontFamily="system-ui, sans-serif">ESTAÇÃO</text>
      {/* telhado com neve */}
      <path d="M8 56 L30 26 H122 L144 56 Z" fill="#D6403A" />
      <rect x={5} y={52} width={142} height={7} rx={3.5} fill="#A92F35" />
      <rect x={104} y={12} width={11} height={18} fill="#7A2433" />
      <path d="M102.5 13.5 Q106 8.6 109.5 11.6 Q113 8.4 116.5 13.5 Z" fill="#FFFFFF" />
      <path d="M28 29 Q33 21 41 25 Q47 19 55 24 Q62 18 70 23 Q78 18 86 23 Q93 19 100 24 Q108 20 114 25 Q121 22 124 29 Z" fill="#FFFFFF" />
      {/* relógio */}
      <circle cx={76} cy={41} r={9} fill="#F6F0E7" stroke="#A92F35" strokeWidth={2} />
      <path d="M76 41 V35.6 M76 41 L80 43" stroke="#3A2F3B" strokeWidth={1.5} strokeLinecap="round" />
      {/* pisca-pisca na beira do telhado */}
      {Array.from({ length: 13 }, (_, i) => (
        <circle key={i} className="nt-trem-luz" cx={12 + i * 10.7} cy={61} r={1.9}
          fill={['#D6403A', '#F2B544', '#6BA6E0', '#3F9A5B'][i % 4]} style={{ animationDelay: `${(i % 5) * 0.3}s` }} />
      ))}
    </svg>
  );
}

/** O para-choque do fim da linha, 70 × 74. */
function ParaChoque() {
  return (
    <svg viewBox="0 0 70 74" width={70} height={74} aria-hidden="true" className="nt-trem">
      <rect x={8} y={34} width={6} height={36} rx={2} fill="#3A2F3B" />
      <rect x={40} y={34} width={6} height={36} rx={2} fill="#3A2F3B" />
      <rect x={2} y={30} width={50} height={14} rx={3} fill="#F6F0E7" />
      {[6, 18, 30, 42].map(x => <path key={x} d={`M${x} 30 h7 l-7 14 h-7 z`} fill="#D6403A" />)}
      <rect x={2} y={30} width={50} height={14} rx={3} fill="none" stroke="#A92F35" strokeWidth={1.5} />
      <path d="M1 31 Q8 25 15 29 Q22 24 30 28 Q38 23 45 28 Q51 26 53 31 Z" fill="#FFFFFF" />
      <circle className="nt-trem-farol" cx={27} cy={22} r={4.2} fill="#D6403A" />
      <rect x={25.5} y={24} width={3} height={6} fill="#3A2F3B" />
      {/* plaquinha */}
      <rect x={52} y={6} width={2.6} height={64} rx={1.3} fill="#7A5236" />
      <rect x={44} y={4} width={26} height={16} rx={2.5} fill="#3F9A5B" />
      <text x={57} y={11} textAnchor="middle" fontSize={5.2} fontWeight={800} fill="#FFFFFF" fontFamily="system-ui, sans-serif">FIM DA</text>
      <text x={57} y={17} textAnchor="middle" fontSize={5.2} fontWeight={800} fill="#FFFFFF" fontFamily="system-ui, sans-serif">LINHA</text>
    </svg>
  );
}

/** O presente que treme enquanto o sorteio corre. */
function PresenteSorteando() {
  return (
    <svg viewBox="0 0 40 40" width={40} height={40} className="nt-trem-sorteando" aria-hidden="true">
      <rect x={6} y={15} width={28} height={21} rx={3} fill="#3F9A5B" />
      <rect x={4} y={11} width={32} height={8} rx={2.5} fill="#2E7A47" />
      <rect x={18} y={11} width={4} height={25} fill="#D6403A" />
      <path d="M20 11 C14 2 7 6 12 11 Z M20 11 C26 2 33 6 28 11 Z" fill="#D6403A" />
      <circle cx={20} cy={11} r={2.6} fill="#A92F35" />
    </svg>
  );
}

/**
 * A placa na plataforma com o trem parado: fechado (a hora que abre), em
 * manutenção, ou esperando os primeiros da fila (quantos já entraram).
 */
function PlacaDaEstacao({ fechado, agenda, agora }: { fechado: TremFechado; agenda: AgendaDoTrem | null; agora: number }) {
  if (fechado.motivo === 'carregando') return null;
  const [titulo, linha] = fechado.motivo === 'desligado' ? ['EM MANUTENÇÃO', 'volta logo!']
    : fechado.motivo === 'esperando' ? ['1ª VIAGEM', `${Math.min(PRIMEIROS_DA_FILA, agenda?.inscritos ?? 0)}/${PRIMEIROS_DA_FILA} na fila`]
    : ['FECHADO', fechado.abreEmMs !== null ? `abre ${quandoAbre(fechado.abreEmMs, agora)}` : ''];
  return (
    <div className={cn('nt-trem-placa', `nt-trem-placa-${fechado.motivo}`)} aria-hidden="true">
      <span className="nt-trem-placa-titulo">{titulo}</span>
      {linha && <span className="nt-trem-placa-linha">{linha}</span>}
    </div>
  );
}

function Estacao({ rota, meuId }: { rota: readonly AbaDoTrem[]; meuId: string | null }) {
  const agora = useRelogioDoTrem(500);
  const agenda = useAgendaDoTrem();
  const pos = ondeEsta(agora, rota, agenda);
  const sorteados = usePassageiros(chaveDoSorteio(pos));
  const { inscricao, mudando, mudar, reler } = useInscricao();
  const [muralAberto, setMuralAberto] = useState(false);

  const naEstacao = pos.fase === 'estacao' && !pos.fechado;
  const n = sorteados?.length ?? 0;
  const etapa = naEstacao && sorteados ? etapaDoSorteio(pos.noTrecho, n) : null;
  const aBordo = naEstacao ? quantosABordo(pos.noTrecho, n) : n;
  const revelado = etapa?.etapa === 'revelado' ? sorteados?.[etapa.indice] : undefined;
  const souEu = !!revelado && revelado.id === meuId;

  // O aviso para quem está assistindo e acabou de ser sorteado (uma vez por viagem).
  const avisado = useRef<number | null>(null);
  useEffect(() => {
    if (!souEu || avisado.current === pos.partidaMs) return;
    avisado.current = pos.partidaMs;
    toast.custom(() => (
      <div className="nt-trem-aviso-sorteado">
        <span className="text-2xl" aria-hidden="true">🚂</span>
        <div>
          <p className="font-bold">Você foi sorteado!</p>
          <p className="text-xs opacity-90">Você vai participar desta viagem do trenzinho de Natal. Boa viagem! 🎄</p>
        </div>
      </div>
    ), { duration: 9000 });
  }, [souEu, pos.partidaMs]);

  const proximaVolta = segundosAteAEstacao(agora, rota, agenda);
  const naFila = inscricao && (inscricao.inscrito ? <> · seu ticket está na fila ✓</> : <> · <b>clique na estação</b> e insira seu ticket</>);
  const status = pos.fechado
    ? <>{textoDoFechado(pos.fechado, agenda, agora)}{naFila}</>
    : naEstacao
    ? (sorteados === undefined ? <>Preparando o sorteio…</>
      : n === 0 ? <>Ninguém na fila hoje · <b>clique na estação</b> e insira seu ticket!</>
      : aBordo < n ? <><b>Sorteando os passageiros…</b> {aBordo}/{n} a bordo</>
      : <><b>Todos a bordo!</b> · sai em <b>{relogioCurto(PARADA_ESTACAO_S - pos.noTrecho)}</b></>)
    : proximaVolta !== null && proximaVolta < 3600
    ? <>Próxima saída em <b>{relogioCurto(proximaVolta + PARADA_ESTACAO_S)}</b>{naFila}</>
    : <>Esta é a <b>última viagem de hoje</b>{naFila}</>;
  // A mesma frase no mural da estação.
  const saida = pos.fechado ? textoDoFechado(pos.fechado, agenda, agora)
    : naEstacao ? <>Sai em <b>{relogioCurto(PARADA_ESTACAO_S - pos.noTrecho)}</b></>
    : proximaVolta !== null && proximaVolta < 3600 ? <>Próxima saída em <b>{relogioCurto(proximaVolta + PARADA_ESTACAO_S)}</b></>
    : <>Última viagem de hoje em andamento</>;

  return (
    <div data-faixa-trem="fim" data-trilho={TRILHO_NA_FAIXA} className="nt-faixa-trem" style={{ height: ALTURA_ESTACAO }}>
      <div className="relative mx-auto h-full max-w-[1400px] px-6">
        <button
          type="button"
          className="nt-trem-estacao-botao absolute left-6"
          style={{ bottom: TRILHO_NA_FAIXA - 12 }}
          onClick={() => { reler(); setMuralAberto(true); }}
          aria-label="Estação do trenzinho: inserir o ticket da viagem"
          title="Inserir o ticket"
        >
          {inscricao && !inscricao.inscrito && <span className="nt-trem-estacao-balao">Insira seu ticket!</span>}
          <PredioDaEstacao />
        </button>
        <div data-trem-parada className="absolute" style={{ left: RECUO_DA_PARADA, width: COMPRIMENTO_TREM_PX, bottom: 0, height: 1 }} />
        {/* Fechado: a placa na frente do trem parado, no meio do trilho, como uma cancela. */}
        {pos.fechado && (
          <div className="absolute" style={{ left: RECUO_DA_PARADA + COMPRIMENTO_TREM_PX + 14, bottom: TRILHO_NA_FAIXA + 30 }}>
            <PlacaDaEstacao fechado={pos.fechado} agenda={agenda} agora={agora} />
          </div>
        )}
        <div className="absolute flex flex-col items-start gap-2" style={{ left: RECUO_DA_PARADA + COMPRIMENTO_TREM_PX + 32, top: 14 }}>
          <div className="nt-trem-aviso">
            <span aria-hidden="true">🎁</span>
            <span>{status}</span>
            <BotaoSons />
            <BotaoTestarBuzina />
            <BotaoVerSorteio rota={rota} />
          </div>
          {/* O sorteio: o presente treme, abre, e a pessoa aparece — e embarca. */}
          {etapa && (
            <div key={`${pos.partidaMs}-${etapa.indice}-${etapa.etapa}`} className={cn('nt-trem-bilhete', souEu && 'nt-trem-bilhete-eu')}>
              {etapa.etapa === 'sorteando' || !revelado ? (
                <>
                  <PresenteSorteando />
                  <span className="text-xs font-semibold">Sorteando o {etapa.indice + 1}º passageiro…</span>
                </>
              ) : (
                <>
                  <AvatarChat nome={revelado.nome} foto={revelado.foto} tamanho={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{souEu ? 'É você! 🎉' : revelado.nome}</span>
                    <span className="block truncate text-[11px] opacity-75">{souEu ? revelado.nome : revelado.setor ?? 'Sem setor'} · embarcando!</span>
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <MuralDaEstacao
        aberto={muralAberto}
        aoFechar={() => setMuralAberto(false)}
        inscricao={inscricao}
        mudando={mudando}
        mudar={mudar}
        saida={saida}
        horario={agenda && agenda.fechaMin - agenda.abreMin < 24 * 60 ? `${horaDe(agenda.abreMin)} – ${horaDe(agenda.fechaMin)}` : null}
        primeiraViagem={pos.fechado?.motivo === 'esperando' ? { faltam: Math.max(1, PRIMEIROS_DA_FILA - (agenda?.inscritos ?? 0)) } : null}
      />
    </div>
  );
}

/** A faixa do alto: só nas abas com pista no alto (o Analítico). */
export function FaixaDoTremTopo({ aba, rota }: { aba: AbaDoTrem; rota: readonly AbaDoTrem[] }) {
  if (!PISTAS_DA_ABA[aba].includes('topo')) return null;
  return (
    <div data-faixa-trem="topo" data-trilho={TRILHO_NA_FAIXA} className="nt-faixa-trem" style={{ height: ALTURA_FAIXA_DO_IGLU }}>
      <div className="relative mx-auto h-full max-w-[1400px] px-6 pt-3">
        <Aviso aba={aba} rota={rota} />
        {/* O iglu do urso, à direita: o urso sai para pescar de vez em quando. */}
        <div data-trem-reserva className="absolute right-6" style={{ bottom: TRILHO_NA_FAIXA + 11 }}><IgluDoUrso /></div>
      </div>
    </div>
  );
}

/** A faixa do pé: em toda aba da rota. Na primeira (o Dashboard), é a estação. */
export function FaixaDoTremFim({ aba, rota, meuId }: { aba: AbaDoTrem; rota: readonly AbaDoTrem[]; meuId: string | null }) {
  if (aba === rota[0]) return <Estacao rota={rota} meuId={meuId} />;
  const ultima = aba === rota[rota.length - 1];
  // Sem faixa no alto, o aviso de onde o trem está mora aqui.
  const aviso = !PISTAS_DA_ABA[aba].includes('topo');
  return (
    <div data-faixa-trem="fim" className="nt-faixa-trem" style={{ height: ALTURA_FAIXA }}>
      <div className={cn('relative mx-auto h-full max-w-[1400px] px-6', aviso && 'pt-3')}>
        {aviso && <Aviso aba={aba} rota={rota} />}
        {ultima && (
          <>
            <div className="absolute left-3" style={{ bottom: TRILHO_NA_FAIXA - 8 }}><ParaChoque /></div>
            <div data-trem-fim-da-linha className="absolute" style={{ left: 64, width: COMPRIMENTO_TREM_PX, bottom: 0, height: 1 }} />
          </>
        )}
      </div>
    </div>
  );
}
