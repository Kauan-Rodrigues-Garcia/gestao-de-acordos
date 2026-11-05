/**
 * Laboratório do trenzinho — `npm run dev` e abrir /lab-trem.html.
 *
 * Um «sistema» de mentira, sem login e sem banco: a área que rola do `Layout`,
 * uma página falsa de cada aba, as faixas e a camada do trem de verdade. Dá
 * para escolher a aba, a regra do setor e o momento da volta (o relógio do
 * laboratório é adiantado/atrasado à vontade). `?tema=dark`.
 */
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { Toaster } from 'sonner';
import { TemaNatalContext } from '../tema';
import { CamadaDoTrem } from './CamadaDoTrem';
import { FaixaDoTremFim, FaixaDoTremTopo } from './Faixas';
import { MapaDaLinha } from './MapaDaLinha';
import { chamarUrsoParaTeste } from '../iglu/urso';
import { duracaoDaVolta, ondeEsta, PARADA_ESTACAO_S, PARADA_FIM_S, tempoNaAba } from './horario';
import { AGENDA_LIVRE, definirAgendaParaLaboratorio, type AgendaDoTrem } from './agenda';
import { ROTULO_ABA, ROTA_DO_TREM, abasDaRegra, type AbaDoTrem } from './rota';
import { definirRegraDaSessao } from '@/lib/regraDoSetor';
import { semearParaLaboratorio, type Sorteado } from './passageiros';

const busca = new URLSearchParams(location.search);

// O relógio do laboratório: `Date.now` com um deslocamento que os controles mudam.
const relogioReal = Date.now.bind(Date);
let deslocamento = 0;
Date.now = () => relogioReal() + deslocamento;
// A conferência de relógio da música lê o `Date` do servidor e desfaria o deslocamento: aqui o «servidor» concorda com o laboratório.
const fetchReal = window.fetch.bind(window);
window.fetch = (entrada, init) => (String(entrada).startsWith('/?relogio=')
  ? Promise.resolve(new Response(null, { headers: { date: new Date(Date.now()).toUTCString() } }))
  : fetchReal(entrada, init));

/** A meia-noite de Brasília de hoje: com a agenda livre, as voltas do dia contam dali. */
const meiaNoite = (ms: number) => Math.floor((ms - 3 * 3_600_000) / 86_400_000) * 86_400_000 + 3 * 3_600_000;

/** Leva o relógio do laboratório a `segundos` do começo da volta atual. */
function deslocarPara(segundos: number, rota: readonly AbaDoTrem[]) {
  const volta = duracaoDaVolta(rota) * 1000;
  const dia = meiaNoite(relogioReal());
  const inicio = dia + Math.floor((relogioReal() - dia) / volta) * volta;
  deslocamento = inicio + segundos * 1000 - relogioReal();
}

/*
 * `?agenda=`: o trem parado na estação, sem banco — `fechado` (abre às
 * 23:58), `esperando` (3 dos 5 primeiros na fila) ou `desligado`. Sem nada,
 * rodando o dia inteiro.
 */
const AGENDAS_DO_LAB: Record<string, AgendaDoTrem> = {
  fechado: { ...AGENDA_LIVRE, abreMin: 23 * 60 + 58, fechaMin: 23 * 60 + 59 },
  esperando: { ...AGENDA_LIVRE, inicioMs: null, inscritos: 3 },
  desligado: { ...AGENDA_LIVRE, ativo: false },
};
definirAgendaParaLaboratorio(AGENDAS_DO_LAB[busca.get('agenda') ?? ''] ?? AGENDA_LIVRE);
// `?t=` vale antes do primeiro render (a conferência de relógio começa nele).
// Um trem só para todo mundo: o relógio é sempre o do percurso inteiro.
if (busca.get('t')) deslocarPara(Number(busca.get('t')), ROTA_DO_TREM);

/** O menu de mentira: rótulo, caminho e a aba do trem (quando é uma). */
const MENU: readonly [string, string, AbaDoTrem | null][] = [
  ['Dashboard', '/', 'dashboard'], ['Acordos', '/acordos', 'acordos'], ['Lixeira', '/lixeira', null],
  ['Pix Automático', '/pix-automatico', 'pix'], ['Equipes', '/equipes', null], ['Analítico', '/analitico', 'analitico'],
  ['Configurações', '/configuracoes', null],
];

// `?urso=12`: o urso do iglu já está 12 s dentro da visita dele (para ver cada fase sem esperar).
if (busca.get('urso')) chamarUrsoParaTeste(Date.now() - Number(busca.get('urso')) * 1000);

const NOMES = [
  ['Ana Paula Souza', 'Conecta Play'], ['Bruno Lima', 'Recuperação'], ['Carla Mendes', 'Cobrança 2'],
  ['Diego Alves', 'Recuperação'], ['Elaine Rocha', 'Cobrança 1'], ['Fábio Nunes', 'Cobrança 2'],
  ['Gabriela Torres', 'Conecta Play'], ['Henrique Prado', 'Cobrança 1'], ['Isabela Faria', 'Recuperação'],
  ['João Victor', 'Cobrança 1'], ['Karina Dias', 'Cobrança 2'], ['Lucas Moreira', 'Conecta Play'],
];
const pessoa = (i: number): Sorteado => ({ id: `p${i}`, nome: NOMES[i % NOMES.length][0], setor: NOMES[i % NOMES.length][1], foto: null });

/** Os passageiros das voltas de perto de agora (a chave é o minuto da partida, `chaveDoSorteio`). */
function semear(rota: readonly AbaDoTrem[]) {
  const volta = duracaoDaVolta(rota);
  const dia = meiaNoite(Date.now());
  const agora = Math.floor((Date.now() - dia) / 1000 / volta);
  for (let v = Math.max(0, agora - 3); v < agora + 40; v++) {
    const chave = Math.floor((dia + (v * volta + PARADA_ESTACAO_S) * 1000) / 60_000);
    semearParaLaboratorio(chave, Array.from({ length: 5 }, (_, i) => pessoa(v * 5 + i)));
  }
}

function Cartao({ altura = 120, titulo }: { altura?: number; titulo: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm" style={{ height: altura }}>
      <p className="text-sm font-semibold">{titulo}</p>
      <div className="mt-3 h-2 w-2/3 rounded bg-muted" />
      <div className="mt-2 h-2 w-1/2 rounded bg-muted" />
    </div>
  );
}

function PaginaFalsa({ aba }: { aba: AbaDoTrem }) {
  const linhas = aba === 'acordos' ? 1 : aba === 'analitico' ? 4 : 2;
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{ROTULO_ABA[aba]}</h1>
        <p className="text-sm text-muted-foreground">Página de mentira, para ver o trilho passar por trás dos cards.</p>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {['Recebido', 'Meta', 'Acordos', 'Ticket'].map(t => <Cartao key={t} titulo={t} />)}
      </div>
      {aba === 'acordos'
        ? <Cartao altura={1300} titulo="Tabela de acordos" />
        : Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="grid grid-cols-3 gap-6">
            <div className="col-span-2"><Cartao altura={280} titulo={`Gráfico ${i + 1}`} /></div>
            <Cartao altura={280} titulo={`Ranking ${i + 1}`} />
          </div>
        ))}
    </div>
  );
}

function Lab() {
  const [escuro, setEscuro] = useState(busca.get('tema') === 'dark');
  const [aba, setAba] = useState<AbaDoTrem>((busca.get('aba') as AbaDoTrem) || 'dashboard');
  const [cofen, setCofen] = useState(busca.get('regra') === 'cofen');
  // Semeia já no render: a estação pede o sorteio no efeito dela, antes dos efeitos daqui.
  // O percurso (o relógio) é um só; a regra muda só as abas em que se vê o trem — e o aviso, pela regra da sessão.
  const rota = useMemo(() => { semear(ROTA_DO_TREM); return ROTA_DO_TREM; }, []);
  const visiveis = abasDaRegra(cofen ? 'cofen' : 'nosso_produto');
  useEffect(() => { definirRegraDaSessao({ slug: 'laboratorio', regra: cofen ? 'cofen' : 'nosso_produto' }); }, [cofen]);
  const area = useRef<HTMLElement>(null);
  const menu = useRef<HTMLElement>(null);
  // `?eu=1`: o laboratório «é» o 3º sorteado da viagem de agora, para ver o aviso de quem embarca.
  const meuId = busca.get('eu') ? `p${ondeEsta(Date.now(), rota).viagem * 5 + 2}` : null;
  const [, refazer] = useState(0);
  document.documentElement.classList.toggle('dark', escuro);

  const irPara = (segundos: number) => { deslocarPara(segundos, rota); refazer(v => v + 1); };

  const naRota = visiveis.includes(aba);
  const ida = (ate: AbaDoTrem) => PARADA_ESTACAO_S + rota.slice(0, rota.indexOf(ate)).reduce((s, a) => s + tempoNaAba(a), 0);
  const fimDaIda = PARADA_ESTACAO_S + rota.reduce((s, a) => s + tempoNaAba(a), 0);

  return (
    <TemaNatalContext.Provider value="detalhado">
      <Toaster position="top-right" />
      <div className="flex h-screen flex-col bg-background text-foreground">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs">
          <select className="rounded border bg-background px-2 py-1" value={aba} onChange={e => setAba(e.target.value as AbaDoTrem)}>
            {(['dashboard', 'acordos', 'pix', 'analitico'] as const).map(a => <option key={a} value={a}>{ROTULO_ABA[a]}</option>)}
          </select>
          <button className="rounded border px-2 py-1" onClick={() => setCofen(c => !c)}>Regra: {cofen ? 'Cofen' : 'Nosso produto'}</button>
          <button className="rounded border px-2 py-1" onClick={() => setEscuro(e => !e)}>{escuro ? 'Claro' : 'Escuro'}</button>
          <span className="mx-2 text-muted-foreground">Ir para:</span>
          <button className="rounded border px-2 py-1" onClick={() => irPara(2)}>estação</button>
          <button className="rounded border px-2 py-1" onClick={() => irPara(PARADA_ESTACAO_S - 3)}>partida</button>
          {naRota && <button className="rounded border px-2 py-1" onClick={() => irPara(ida(aba) + 2)}>entrando aqui (ida)</button>}
          {naRota && <button className="rounded border px-2 py-1" onClick={() => irPara(ida(aba) + tempoNaAba(aba) * 0.45)}>meio da aba</button>}
          <button className="rounded border px-2 py-1" onClick={() => irPara(fimDaIda + 1)}>fim da linha</button>
          <button className="rounded border px-2 py-1" onClick={() => irPara(fimDaIda + PARADA_FIM_S + 5)}>voltando</button>
          <button className="rounded border px-2 py-1" onClick={() => irPara(duracaoDaVolta(rota) - 4)}>chegando na estação</button>
        </div>
        <div className="flex min-h-0 flex-1">
          {/* Um menu lateral de mentira, com o mapa da linha (clicar troca de aba). */}
          <aside className="flex w-60 flex-shrink-0 flex-col border-r bg-sidebar">
            <nav ref={menu} className="relative flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
              <MapaDaLinha rota={rota} visiveis={visiveis} nav={menu} />
              {MENU.map(([rotulo, caminho, a]) => (
                <a
                  key={rotulo}
                  href={caminho}
                  onClick={e => { e.preventDefault(); if (a) setAba(a); }}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${a === aba ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/70'}`}
                >
                  <span className="h-4 w-4 rounded bg-current opacity-40" />
                  {rotulo}
                </a>
              ))}
            </nav>
          </aside>
          <main ref={area} className="relative isolate flex-1 overflow-y-auto bg-background">
            {naRota && (
              <>
                <CamadaDoTrem aba={aba} rota={rota} raiz={area} leve={false} />
                <FaixaDoTremTopo aba={aba} rota={rota} />
              </>
            )}
            <PaginaFalsa aba={aba} />
            {naRota && <FaixaDoTremFim aba={aba} rota={rota} meuId={meuId} />}
            {!naRota && <p className="p-6 text-sm text-muted-foreground">Quem é da regra Cofen não vê o trem nesta aba: aqui ele está «no túnel», no mesmo relógio de todo mundo.</p>}
          </main>
        </div>
      </div>
    </TemaNatalContext.Provider>
  );
}

createRoot(document.getElementById('lab')!).render(<StrictMode><Lab /></StrictMode>);
