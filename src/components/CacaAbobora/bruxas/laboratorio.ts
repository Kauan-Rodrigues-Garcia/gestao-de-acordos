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
import { PalcoBruxas, type EventoPalco } from './palco';
import { montarFaixa } from './faixa';
import { quadrosDa } from './pixels';
import { VELOCIDADES, type Dificuldade } from './voo';
import type { Morte } from './queda';

const FONTES = `
@font-face { font-family: 'Press Start 2P'; src: url('/fonts/press-start-2p.woff2') format('woff2'); font-display: swap; }
@font-face { font-family: 'Pixelify Sans'; src: url('/fonts/pixelify-sans.woff2') format('woff2'); font-weight: 400 700; font-display: swap; }`;

const estilo = document.createElement('style');
estilo.textContent = FONTES;
document.head.appendChild(estilo);

// ── O fundo de mentira ─────────────────────────────────────────────────────

const SISTEMA = `
<div class="lb-app">
  <header class="lb-topo"><b>Gestão de Acordos</b><span>Painel do Líder</span><i></i></header>
  <aside class="lb-menu">${['Início', 'Acordos', 'Analítico', 'Metas', 'Desafios', 'Usuários', 'Configurações'].map((m, i) => `<a class="${i === 1 ? 'ativo' : ''}">${m}</a>`).join('')}</aside>
  <main class="lb-conteudo">
    <h1>Acordos do mês</h1>
    <div class="lb-cartoes">
      ${[['Recebido hoje', 'R$ 48.312,90'], ['Meta do mês', '72%'], ['Acordos fechados', '1.284'], ['Em atraso', '96']].map(([t, v]) => `<div class="lb-cartao"><span>${t}</span><b>${v}</b></div>`).join('')}
    </div>
    <table class="lb-tabela">
      <thead><tr><th>Operador</th><th>Equipe</th><th>Acordos</th><th>Recebido</th></tr></thead>
      <tbody>${['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Alves', 'Elisa Rocha', 'Fábio Nunes', 'Gabi Torres'].map((n, i) => `<tr><td>${n}</td><td>Equipe ${1 + (i % 3)}</td><td>${40 + i * 7}</td><td>R$ ${(12000 + i * 1830).toLocaleString('pt-BR')},00</td></tr>`).join('')}</tbody>
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
    <p class="lb-nota">Fofos: bruxinha, gatinha, gato e fantasminha não morrem. Caem desacordados, sem sangue, e contam igual.</p>
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

const placar = { mortas: 0, headshots: 0, vassouradas: 0, chapeus: 0, raspoes: 0, erros: 0, fugiram: 0, tempos: [] as number[] };
let sempre = false;
let escolhida = 0;

function aoEvento(e: EventoPalco): void {
  if (e.tipo === 'matou') {
    const recorde = !placar.tempos.length || e.ms < Math.min(...placar.tempos);
    const nome = painel.querySelector<HTMLInputElement>('#lb-nome-faixa')!.value.trim() || 'Alguém';
    const f = montarFaixa({ nome, bruxa: e.bruxa, morte: e.morte, ms: e.ms, rapida: recorde, hsRapido: recorde && e.morte === 'cabeca' });
    lugarDaFaixa.replaceChildren(f.el);
    f.ajustar();
    ajustarFaixa = f.ajustar;
    placar.mortas++;
    placar.tempos.push(e.ms);
    if (e.morte === 'cabeca') placar.headshots++;
    if (e.morte === 'vassoura') placar.vassouradas++;
  } else if (e.tipo === 'chapeu') placar.chapeus++;
  else if (e.tipo === 'raspao') placar.raspoes++;
  else if (e.tipo === 'errou') placar.erros++;
  else if (e.tipo === 'fugiu') placar.fugiram++;
  if (sempre && (e.tipo === 'matou' || e.tipo === 'fugiu')) setTimeout(() => palco.soltar(), 1500);
  mostrarPlacar();
}

const palco = new PalcoBruxas(raiz.querySelector<HTMLDivElement>('.lb-palco')!, { escala: 2, aoEvento });

function mostrarPlacar(): void {
  const t = placar.tempos;
  const media = t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0;
  const melhor = t.length ? Math.min(...t) : 0;
  const s = (ms: number) => (ms ? `${(ms / 1000).toFixed(2).replace('.', ',')} s` : '—');
  painel.querySelector('.lb-placar')!.innerHTML = `
    <div><b>${placar.mortas}</b>abatidas</div>
    <div><b>${placar.headshots}</b>headshots</div>
    <div><b>${placar.vassouradas}</b>vassouradas</div>
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
  if (acao === 'limpar') palco.limpar();
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

// Para o ensaio automático (Playwright): o palco fica à mão no console.
(window as unknown as { palco: PalcoBruxas }).palco = palco;
