/**
 * laboratorio.ts — o ensaio das bruxas, SÓ no localhost.
 *
 * Abre em http://localhost:8080/lab-bruxas.html (com o `npm run dev`). Não
 * passa por login nem toca o banco: é uma página solta que monta o palco
 * (`palco.ts`) em cima de um fundo de mentira — a noite de Halloween ou uma
 * tela do sistema, clara ou escura, para ver o contraste — e um painel para
 * soltar cada bruxa, mudar a velocidade e conferir as mortes.
 *
 * O build de produção não leva esta página: o Vite só empacota o `index.html`.
 */
import '../caca.css';
import './bruxas.css';
import './laboratorio.css';
import { BRUXAS, VOO, MS_POR_QUADRO } from './arte';
import { ESCALA_BRUXAS, EU, PalcoBruxas, type EventoPalco } from './palco';
import { montarFaixa, type DadosFaixa } from './faixa';
import { canvasDaImagem, quadrosDa } from './pixels';
import { VELOCIDADES, type Dificuldade } from './voo';
import type { Morte } from './queda';
import { ALTURA_MC, LARGURA_MC, NOME_CHEFONA, QUADROS_FLUTUANDO, montarBruxaMC } from './chefona/arte';
import { FEITICOS, LISTA_FEITICOS, alvosPorAtributo, type NomeFeitico } from './chefona/feiticos';
import { MANOBRAS, NOME_MANOBRA, type Manobra } from './chefona/movimento';
import { ESPERA_PADRAO_S, PalcoChefona, PRAZO_PADRAO_S, VIDA_PADRAO, type EventoChefona } from './chefona/palcoChefona';
import { MOTIVOS_FORTES, criarDetector, nomesDosMotivos } from '../autoclick';

const FONTES = `
@font-face { font-family: 'Press Start 2P'; src: url('/fonts/press-start-2p.woff2') format('woff2'); font-display: swap; }
@font-face { font-family: 'Pixelify Sans'; src: url('/fonts/pixelify-sans.woff2') format('woff2'); font-weight: 400 700; font-display: swap; }`;

const estilo = document.createElement('style');
estilo.textContent = FONTES;
document.head.appendChild(estilo);

// ── O fundo de mentira ─────────────────────────────────────────────────────

/*
 * As peças com `data-alvo-feitico` são onde a Bruxa do Pântano joga poção (ver
 * `chefona/feiticos.ts`): os valores de recebido e de projeção ficam
 * negativos, o menu e as abas de Acordos ganham nome do Minecraft, e as linhas da
 * tabela somem. Na caça de verdade as telas do Gestão levam a mesma marca.
 */
const SISTEMA = `
<div class="lb-app">
  <header class="lb-topo"><b>Gestão de Acordos</b><span>Painel do Líder</span><i></i></header>
  <aside class="lb-menu">${['Início', 'Acordos', 'Analítico', 'Metas', 'Desafios', 'Usuários', 'Configurações'].map((m, i) => `<a class="${i === 1 ? 'ativo' : ''}"><span data-alvo-feitico="aba">${m}</span></a>`).join('')}</aside>
  <main class="lb-conteudo">
    <h1>Acordos do mês</h1>
    <nav class="lb-abas">${['Todos', 'Pix Automático', 'Campanha Fácil', 'Mensagens'].map((a, i) => `<a class="${i === 0 ? 'ativo' : ''}"><span data-alvo-feitico="aba">${a}</span></a>`).join('')}</nav>
    <div class="lb-cartoes">
      ${[['Recebido hoje', 'R$ 48.312,90', true], ['Projeção do mês', 'R$ 1.284.770,00', true], ['Meta do mês', '72%', false], ['Em atraso', '96', false]].map(([t, v, alvo]) => `<div class="lb-cartao"><span>${t}</span><b><span${alvo ? ' data-alvo-feitico="valor"' : ''}>${v}</span></b></div>`).join('')}
    </div>
    <table class="lb-tabela">
      <thead><tr><th>Operador</th><th>Equipe</th><th>Acordos</th><th>Recebido</th></tr></thead>
      <tbody>${['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Alves', 'Elisa Rocha', 'Fábio Nunes', 'Gabi Torres'].map((n, i) => `<tr data-alvo-feitico="linha"><td>${n}</td><td>Equipe ${1 + (i % 3)}</td><td>${40 + i * 7}</td><td><span data-alvo-feitico="valor">R$ ${(12000 + i * 1830).toLocaleString('pt-BR')},00</span></td></tr>`).join('')}</tbody>
    </table>
  </main>
</div>`;

const NOITE = `
<div class="lb-noite">
  <div class="lb-lua"></div>
  <div class="lb-estrelas"></div>
  <div class="lb-morros"></div>
  <div class="lb-chao"></div>
</div>`;

// ── O painel ───────────────────────────────────────────────────────────────

const NOMES_DIF: Record<Dificuldade, string> = { calma: 'Calma', normal: 'Normal', rapida: 'Rápida', insana: 'Insana' };

const PAINEL = `
<div class="lb-painel">
  <button type="button" class="lb-titulo" data-acao="recolher">Laboratório das Bruxas <span>−</span></button>
  <div class="lb-corpo">
    <p class="lb-nota">Só no localhost · nada vai para o banco · clique na bruxa para atirar</p>
    <p class="lb-rotulo">Chefona: a ${NOME_CHEFONA}</p>
    <div class="lb-chefona-retrato"><canvas width="${LARGURA_MC}" height="${ALTURA_MC}"></canvas><span>A bruxa do Minecraft. Vida de time, joga poção na tela, bebe poção para desviar. A cura e o totem são no botão.</span></div>
    <div class="lb-linha">
      <button type="button" class="lb-btn principal" data-chefona="soltar">Soltar (contagem de 1 min)</button>
      <button type="button" class="lb-btn" data-chefona="pular">Pular contagem</button>
      <button type="button" class="lb-btn" data-chefona="ja">Soltar sem contagem</button>
    </div>
    <div class="lb-linha">
      <button type="button" class="lb-btn" data-chefona="robos" aria-pressed="false">Robôs atirando</button>
      <button type="button" class="lb-btn" data-chefona="arrancar">Arrancar 30%</button>
      <button type="button" class="lb-btn" data-chefona="furia">Fúria</button>
      <button type="button" class="lb-btn" data-chefona="curar">Tomar Poção de Cura</button>
      <button type="button" class="lb-btn" data-chefona="proteger">Feitiço de proteção (totem)</button>
    </div>
    <div class="lb-linha">
      <select class="lb-btn" data-escolha="feitico" aria-label="Qual poção">${LISTA_FEITICOS.map(f => `<option value="${f}">${FEITICOS[f].titulo}</option>`).join('')}</select>
      <button type="button" class="lb-btn" data-chefona="conjurar">Jogar poção</button>
    </div>
    <div class="lb-linha">
      <select class="lb-btn" data-escolha="manobra" aria-label="Qual manobra">${MANOBRAS.map(m => `<option value="${m}">${NOME_MANOBRA[m].replace('!', '').toLowerCase()}</option>`).join('')}</select>
      <button type="button" class="lb-btn" data-chefona="manobrar">Manobrar</button>
    </div>
    <div class="lb-linha">
      <button type="button" class="lb-btn" data-chefona="fugir">Tempo acabou</button>
      <button type="button" class="lb-btn" data-chefona="limpar">Limpar a chefona</button>
    </div>
    <p class="lb-fps lb-chefona-estado">—</p>
    <p class="lb-rotulo">Seus cliques (detector de autoclick)</p>
    <p class="lb-fps lb-autoclick">—</p>
    <p class="lb-rotulo">Bruxas comuns</p>
    <div class="lb-skins"></div>
    <p class="lb-nome"></p>
    <div class="lb-linha">
      <button type="button" class="lb-btn principal" data-acao="soltar">Soltar esta</button>
      <button type="button" class="lb-btn" data-acao="sorteada">Sorteada</button>
      <button type="button" class="lb-btn" data-acao="tres">3 de uma vez</button>
    </div>
    <label class="lb-check"><input type="checkbox" data-opcao="sempre"> Sem parar (outra nasce quando uma morre)</label>
    <p class="lb-rotulo">Velocidade</p>
    <div class="lb-linha lb-seg" data-grupo="dif">
      ${(Object.keys(VELOCIDADES) as Dificuldade[]).map(d => `<button type="button" class="lb-btn" data-dif="${d}">${NOMES_DIF[d]}</button>`).join('')}
    </div>
    <p class="lb-rotulo">Outra pessoa matou</p>
    <div class="lb-linha">
      <button type="button" class="lb-btn" data-morte="cabeca">Headshot</button>
      <button type="button" class="lb-btn" data-morte="corpo">Corpo</button>
      <button type="button" class="lb-btn" data-morte="vassoura">Vassoura</button>
    </div>
    <div class="lb-linha">
      <button type="button" class="lb-btn" data-acao="finalizar">Outra pessoa finalizou (o desmaiado)</button>
    </div>
    <div class="lb-linha">
      <button type="button" class="lb-btn" data-acao="fugir">Tempo acabou (fugir)</button>
      <button type="button" class="lb-btn" data-acao="limpar">Limpar tudo</button>
    </div>
    <p class="lb-rotulo">Fundo</p>
    <div class="lb-linha lb-seg" data-grupo="fundo">
      <button type="button" class="lb-btn" data-fundo="noite">Noite</button>
      <button type="button" class="lb-btn" data-fundo="claro">Sistema claro</button>
      <button type="button" class="lb-btn" data-fundo="escuro">Sistema escuro</button>
    </div>
    <label class="lb-check"><input type="checkbox" data-opcao="lenta"> Câmera lenta (¼)</label>
    <label class="lb-check"><input type="checkbox" data-opcao="areas"> Mostrar as áreas de tiro</label>
    <ul class="lb-legenda">
      <li><i style="background:#ff2840"></i>Cabeça: HEADSHOT</li>
      <li><i style="background:#ffd228"></i>Corpo: cai sangrando (os fofos caem desacordados)</li>
      <li><i style="background:#3ca0ff"></i>Vassoura: parte no ar, ela cai se debatendo</li>
      <li><i style="background:#c850ff"></i>Chapéu: não mata, ela fica brava</li>
      <li><i style="background:#c8c8c8"></i>Capa e cabelo (ou rabo): raspão</li>
    </ul>
    <p class="lb-nota">Fofos: bruxinha, gatinha, gato e fantasminha não morrem: caem desacordados, sem sangue, e contam igual. Clique no fofo desmaiado para finalizar; se foi você quem derrubou, a faixa ganha o «2x».</p>
    <label class="lb-rotulo" for="lb-nome-faixa">Nome na faixa</label>
    <input id="lb-nome-faixa" class="lb-campo" value="Mariana Souza" autocomplete="off">
    <div class="lb-placar"></div>
    <p class="lb-fps"></p>
  </div>
</div>`;

// ── Montagem ───────────────────────────────────────────────────────────────

const raiz = document.getElementById('lab')!;
raiz.innerHTML = `<div class="lb-fundo"></div><div class="lb-palco"></div><div class="lb-faixa"></div>${PAINEL}`;
const lugarDaFaixa = raiz.querySelector<HTMLDivElement>('.lb-faixa')!;
let ajustarFaixa: (() => void) | null = null;
window.addEventListener('resize', () => ajustarFaixa?.());
const fundo = raiz.querySelector<HTMLDivElement>('.lb-fundo')!;
const painel = raiz.querySelector<HTMLDivElement>('.lb-painel')!;

const placar = {
  mortas: 0, headshots: 0, vassouradas: 0, finalizadas: 0, dobradas: 0,
  chapeus: 0, raspoes: 0, erros: 0, fugiram: 0, tempos: [] as number[],
};
let sempre = false;
let escolhida = 0;

/** Uma foto de mentira (rosto em pixel com a inicial), para ver o tamanho dela na faixa. */
function fotoDeMentira(letra: string, cor: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' shape-rendering='crispEdges'>`
    + `<rect width='36' height='36' fill='${cor}'/><rect x='12' y='7' width='12' height='12' fill='#f2d3b3'/>`
    + `<rect x='6' y='22' width='24' height='14' fill='#f2d3b3' opacity='.85'/>`
    + `<text x='18' y='34' font-family='monospace' font-size='12' font-weight='700' fill='${cor}' text-anchor='middle'>${letra}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Quem atirou: você (o nome do campo, com foto) ou a «outra pessoa» dos botões (sem foto: as iniciais). */
function pessoa(quem: string): { nome: string; foto: string | null } {
  if (quem !== EU) return { nome: 'Outra Pessoa', foto: null };
  const nome = painel.querySelector<HTMLInputElement>('#lb-nome-faixa')!.value.trim() || 'Alguém';
  return { nome, foto: fotoDeMentira(nome[0]?.toUpperCase() ?? '?', '#7c3aed') };
}

/** O que está na faixa: o «2x» só vale para a mesma bruxa e a mesma pessoa. */
let naFaixa: { dados: DadosFaixa; id: number; quem: string } | null = null;

/**
 * A faixa entra no quadro seguinte ao tiro, não no mesmo (PC fraco): o quadro
 * do tiro já monta a queda, e somar a faixa a ele é o que dava o tranco.
 */
let faixaPedida = 0;
function mostrarFaixa(): void {
  cancelAnimationFrame(faixaPedida);
  faixaPedida = requestAnimationFrame(() => {
    if (!naFaixa) { lugarDaFaixa.replaceChildren(); ajustarFaixa = null; return; }
    const f = montarFaixa(naFaixa.dados);
    lugarDaFaixa.replaceChildren(f.el);
    f.ajustar();
    ajustarFaixa = f.ajustar;
  });
}

function aoEvento(e: EventoPalco): void {
  if (e.tipo === 'matou') {
    const recorde = !placar.tempos.length || e.ms < Math.min(...placar.tempos);
    naFaixa = {
      dados: { ...pessoa(e.quem), bruxa: e.bruxa, morte: e.morte, ms: e.ms, rapida: recorde, hsRapido: recorde && e.morte === 'cabeca' },
      id: e.id, quem: e.quem,
    };
    mostrarFaixa();
    placar.mortas++;
    placar.tempos.push(e.ms);
    if (e.morte === 'cabeca') placar.headshots++;
    if (e.morte === 'vassoura') placar.vassouradas++;
  } else if (e.tipo === 'finalizou') {
    placar.finalizadas++;
    if (e.dobrado) placar.dobradas++;
    if (e.dobrado && naFaixa && naFaixa.id === e.id && naFaixa.quem === e.quem) {
      naFaixa = { ...naFaixa, dados: { ...naFaixa.dados, dobrado: true } };
      mostrarFaixa();
    }
  } else if (e.tipo === 'chapeu') placar.chapeus++;
  else if (e.tipo === 'raspao') placar.raspoes++;
  else if (e.tipo === 'errou') placar.erros++;
  else if (e.tipo === 'fugiu') placar.fugiram++;
  if (sempre && (e.tipo === 'matou' || e.tipo === 'fugiu')) setTimeout(() => palco.soltar(), 1500);
  mostrarPlacar();
}

const palco = new PalcoBruxas(raiz.querySelector<HTMLDivElement>('.lb-palco')!, { escala: ESCALA_BRUXAS, aoEvento });

function mostrarPlacar(): void {
  const t = placar.tempos;
  const media = t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0;
  const melhor = t.length ? Math.min(...t) : 0;
  const s = (ms: number) => (ms ? `${(ms / 1000).toFixed(2).replace('.', ',')} s` : '—');
  painel.querySelector('.lb-placar')!.innerHTML = `
    <div><b>${placar.mortas}</b>abatidas</div>
    <div><b>${placar.headshots}</b>headshots</div>
    <div><b>${placar.vassouradas}</b>vassouradas</div>
    <div><b>${placar.finalizadas}</b>finalizadas</div>
    <div><b>${placar.dobradas}</b>2x</div>
    <div><b>${placar.chapeus}</b>chapéus</div>
    <div><b>${placar.erros + placar.raspoes}</b>erros</div>
    <div><b>${placar.fugiram}</b>fugiram</div>
    <div class="largo"><b>${s(melhor)}</b>mais rápida · média ${s(media)}</div>`;
}

// As bruxas no painel, voando paradas.
const skins = painel.querySelector<HTMLDivElement>('.lb-skins')!;
const previas: HTMLCanvasElement[] = BRUXAS.map((b, i) => {
  const bt = document.createElement('button');
  bt.type = 'button';
  bt.className = 'lb-skin';
  bt.title = b.nome;
  const c = document.createElement('canvas');
  c.width = 48; c.height = 38;
  bt.appendChild(c);
  bt.addEventListener('click', () => escolher(i));
  skins.appendChild(bt);
  return c;
});
let quadroPrevia = 0;
function pintarPrevias(): void {
  quadroPrevia = (quadroPrevia + 1) % VOO.length;
  previas.forEach((c, i) => {
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 48, 38);
    ctx.drawImage(quadrosDa(BRUXAS[i], false).direita[quadroPrevia], 0, 0);
  });
}
pintarPrevias();
setInterval(pintarPrevias, MS_POR_QUADRO);

function escolher(i: number): void {
  escolhida = i;
  skins.querySelectorAll('.lb-skin').forEach((el, j) => el.classList.toggle('ativo', j === i));
  painel.querySelector('.lb-nome')!.textContent = BRUXAS[i].nome.replace(/^a /, '');
}

function marcar(grupo: string, attr: string, valor: string): void {
  painel.querySelectorAll(`[data-grupo="${grupo}"] [data-${attr}]`).forEach(el => el.classList.toggle('ativo', (el as HTMLElement).dataset[attr] === valor));
}

function trocarFundo(f: string): void {
  fundo.className = `lb-fundo lb-fundo-${f}`;
  fundo.innerHTML = f === 'noite' ? NOITE : SISTEMA;
  marcar('fundo', 'fundo', f);
}

painel.addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!el) return;
  const { acao, dif, morte, fundo: f } = el.dataset;
  if (acao === 'recolher') painel.classList.toggle('recolhido');
  if (acao === 'soltar') palco.soltar(escolhida);
  if (acao === 'sorteada') palco.soltar();
  if (acao === 'tres') for (let i = 0; i < 3; i++) setTimeout(() => palco.soltar(), i * 250);
  if (acao === 'fugir') palco.fugirTodas();
  if (acao === 'finalizar') palco.finalizarPorOutro();
  if (acao === 'limpar') { palco.limpar(); naFaixa = null; mostrarFaixa(); }
  if (dif) { palco.dificuldade = dif as Dificuldade; marcar('dif', 'dif', dif); }
  if (morte) palco.matarPorOutro(morte as Morte);
  if (f) trocarFundo(f);
});

painel.addEventListener('change', e => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.opcao === 'lenta') palco.lenta = el.checked ? 0.25 : 1;
  if (el.dataset.opcao === 'areas') palco.mostrarAreas = el.checked;
  if (el.dataset.opcao === 'sempre') {
    sempre = el.checked;
    if (sempre && palco.estatisticas.vivas === 0) palco.soltar();
  }
});

setInterval(() => {
  const s = palco.estatisticas;
  painel.querySelector('.lb-fps')!.textContent = `${s.vivas ? Math.round(s.fps) : '—'} fps · ${s.vivas} no ar · ${s.quedas} no chão · ${s.particulas} partículas`;
}, 500);

escolher(0);
marcar('dif', 'dif', palco.dificuldade);
trocarFundo('noite');
mostrarPlacar();

// ── A chefona ──────────────────────────────────────────────────────────────

/** O último acontecimento da luta, para a linha de estado do painel. */
let ultimoDaChefona = '';
function aoEventoChefona(e: EventoChefona): void {
  if (e.tipo === 'feitico') ultimoDaChefona = `poção: ${FEITICOS[e.feitico].titulo} · ${e.variante} (${Math.round(e.forca * 100)}%, ${Math.round(e.duracaoMs / 1000)} s)`;
  else if (e.tipo === 'curou') ultimoDaChefona = `bebeu a Poção de Cura: vida ${e.vida}`;
  else if (e.tipo === 'bebendo') ultimoDaChefona = 'bebendo a Poção de Cura';
  else if (e.tipo === 'protegida') ultimoDaChefona = 'protegida pelo Totem da Imortalidade';
  else if (e.tipo === 'totem') ultimoDaChefona = 'o totem a salvou: 1 de vida, Absorção e Regeneração';
  else if (e.tipo === 'quebrou') ultimoDaChefona = `quebraram: ${FEITICOS[e.feitico].titulo}`;
  else if (e.tipo === 'manobra') ultimoDaChefona = `manobra: ${NOME_MANOBRA[e.manobra]}`;
  else if (e.tipo === 'furia') ultimoDaChefona = 'FÚRIA';
  else if (e.tipo === 'derrotada') ultimoDaChefona = `derrotada em ${Math.round(e.segundos)} s`;
  else if (e.tipo === 'fugiu') ultimoDaChefona = 'fugiu';
  else if (e.tipo === 'conquista') ultimoDaChefona = `conquista: ${e.nome}`;
  if (e.tipo === 'derrotada' || e.tipo === 'fugiu') pararRobos();
}

// As poções caem no fundo de mentira (a tela do «sistema»), e a Visão
// Noturna pinta só ele: o painel do laboratório não muda de cor.
const chefona = new PalcoChefona(raiz, {
  alvos: alvosPorAtributo(() => fundo, () => fundo),
  aoEvento: aoEventoChefona,
});

// O retrato dela no painel, com o nariz mexendo.
const retratoChefona = painel.querySelector<HTMLCanvasElement>('.lb-chefona-retrato canvas')!;
const quadrosChefona = Array.from({ length: QUADROS_FLUTUANDO }, (_, i) => canvasDaImagem(montarBruxaMC(i), false));
let quadroChefona = 0;
setInterval(() => {
  quadroChefona = (quadroChefona + 1) % quadrosChefona.length;
  const ctx = retratoChefona.getContext('2d')!;
  ctx.clearRect(0, 0, retratoChefona.width, retratoChefona.height);
  ctx.drawImage(quadrosChefona[quadroChefona], 0, 0);
}, 160);

let robos: ReturnType<typeof setInterval> | undefined;
const botaoRobos = painel.querySelector<HTMLButtonElement>('[data-chefona="robos"]')!;
function pararRobos(): void {
  clearInterval(robos);
  robos = undefined;
  botaoRobos.setAttribute('aria-pressed', 'false');
  botaoRobos.classList.remove('ativo');
  botaoRobos.textContent = 'Robôs atirando';
}

painel.addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-chefona]');
  if (!el) return;
  const escolha = (q: string) => painel.querySelector<HTMLSelectElement>(`[data-escolha="${q}"]`)!.value;
  switch (el.dataset.chefona) {
    case 'soltar':
    case 'ja':
      // O feitiço precisa de tela para cair: da noite, vai para o sistema claro.
      if (fundo.classList.contains('lb-fundo-noite')) trocarFundo('claro');
      pararRobos();
      chefona.soltar({ vida: VIDA_PADRAO, prazoS: PRAZO_PADRAO_S, esperaS: el.dataset.chefona === 'ja' ? 0 : ESPERA_PADRAO_S });
      break;
    case 'pular': chefona.pularContagem(); break;
    case 'curar': chefona.curar(); break;
    case 'proteger': chefona.proteger(); break;
    case 'robos':
      if (robos) pararRobos();
      else {
        robos = setInterval(() => chefona.tiroDeOutro(), 160);
        el.setAttribute('aria-pressed', 'true');
        el.classList.add('ativo');
        el.textContent = 'Parar os robôs';
      }
      break;
    case 'arrancar': chefona.arrancar(0.3); break;
    case 'furia': chefona.enfurecer(); break;
    case 'conjurar': chefona.conjurar(escolha('feitico') as NomeFeitico); break;
    case 'manobrar': chefona.manobrar(escolha('manobra') as Manobra); break;
    case 'fugir': pararRobos(); chefona.fugir(); break;
    case 'limpar': pararRobos(); chefona.limpar(); break;
  }
});

setInterval(() => {
  const s = chefona.estado;
  const linha = s.fase === 'fora'
    ? `fora${ultimoDaChefona ? ` · ${ultimoDaChefona}` : ''}`
    : s.fase === 'chegando'
      ? `contagem: ${s.contagem} s`
      : `${s.fase}${s.furia ? ' (fúria)' : ''} · vida ${s.vida}/${s.vidaMax} · rachaduras ${s.estagio}/3`
        + ` · força das poções ${Math.round(s.forca * 100)}% · ${Math.ceil(s.restante)} s`
        + `${s.protegida ? ' · com totem' : ''}${s.absorcao ? ` · absorção ${s.absorcao}` : ''}`
        + `${s.feiticos.length ? ` · ativos: ${s.feiticos.map(f => FEITICOS[f].titulo).join(', ')}` : ''}`
        + `${ultimoDaChefona ? ` · ${ultimoDaChefona}` : ''}`;
  painel.querySelector('.lb-chefona-estado')!.textContent = linha;
  const a = detector.espiar();
  const pistas = nomesDosMotivos(a.motivos);
  const forte = (a.motivos & MOTIVOS_FORTES) !== 0 || pistas.length >= 2;
  painel.querySelector('.lb-autoclick')!.textContent = `${a.cps}/s agora · pico ${a.pico}/s`
    + (pistas.length ? ` · ${forte ? 'SUSPEITO' : 'pista'}: ${pistas.join(', ')}` : ' · limpo');
}, 250);

// O mesmo detector da luta do Rei do Pop, ouvindo esta página: dá para ver
// as pistas acendendo clicando na bruxa com e sem autoclick.
const detector = criarDetector();

// Para o ensaio automático (Playwright): os palcos ficam à mão no console.
(window as unknown as { palco: PalcoBruxas; chefona: PalcoChefona }).palco = palco;
(window as unknown as { chefona: PalcoChefona }).chefona = chefona;
