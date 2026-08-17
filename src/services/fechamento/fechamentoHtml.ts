/**
 * fechamentoHtml.ts — a casca do relatório: navegação, seções e modo apresentação.
 *
 * ## Por que HTML, e não PDF ou planilha
 *
 * O arquivo é apresentado em reunião e circula por e-mail e WhatsApp. Um HTML
 * de arquivo único abre em qualquer navegador, sem instalar nada, projeta bem,
 * navega por abas — e imprime em PDF pelo próprio navegador quando alguém
 * quiser o PDF. Planilha responderia bem a "me manda os números" e mal a "mostra
 * para a diretoria".
 *
 * ## Autocontido, e isso é uma restrição real
 *
 * Nenhuma requisição externa: sem CDN, sem fonte da web, sem imagem remota. O
 * arquivo vai ser aberto de um pen drive, de um anexo, de uma máquina sem
 * internet numa sala de reunião. Os gráficos são SVG escrito à mão em
 * `graficos/`, pelo mesmo motivo — trazer uma biblioteca de gráficos
 * significaria embutir centenas de KB em cada download.
 *
 * ## Este arquivo só monta
 *
 * O conteúdo mora em `secoes/`, os gráficos em `graficos/`, o estilo em
 * `fechamentoCss.ts`. Aqui ficam três decisões e nada mais: quais seções
 * existem, em que ordem, e como o leitor navega entre elas. Foi assim que o
 * arquivo deixou de ser o ponto onde mexer no donut quebrava a tabela.
 *
 * ⚠️ Todo texto vindo do banco passa por `esc()` (ver `formato.ts`). Nome de
 * cliente, de operador e de setor são digitados por gente; um `<script>` num
 * nome de setor viraria execução no navegador de quem abrisse o relatório.
 */

import { esc } from './formato';
import { CSS_FECHAMENTO } from './fechamentoCss';
import { secaoCapa } from './secoes/capa';
import { secaoVisaoDoMes } from './secoes/visaoDoMes';
import { secaoOperadores } from './secoes/operadores';
import { secaoQuartis } from './secoes/quartis';
import { secaoRanking } from './secoes/ranking';
import { secaoPix } from './secoes/pix';
import { secaoDestaques } from './secoes/destaques';
import { secaoIndividual } from './secoes/individual';
import { secaoDiretoria } from './secoes/diretoria';
import type { DadosFechamento } from './tipos';

interface Secao { id: string; rotulo: string; conteudo: string }

/**
 * As seções do relatório, na ordem fixa, já filtradas.
 *
 * Seção sem conteúdo não entra — nem no menu. Uma aba que abre vazia é pior do
 * que uma aba que não existe, e é o tipo de detalhe que aparece justamente na
 * projeção, com a sala olhando.
 */
function montarSecoes(d: DadosFechamento): Secao[] {
  const nivel = d.alvo.nivel;
  const mostrarSetor = nivel === 'diretoria';

  const candidatas: Secao[] = [
    { id: 'visao', rotulo: 'Visão do mês', conteudo: secaoVisaoDoMes(d) },
    {
      id: 'operadores', rotulo: 'Operadores',
      // No nível operador a lista tem uma pessoa só: uma tabela comparativa de
      // uma linha não compara nada, e a página individual dela já diz tudo.
      conteudo: nivel !== 'operador' && d.operadores.length
        ? secaoOperadores(d.operadores, { mostrarSetor })
        : '',
    },
    { id: 'quartis', rotulo: 'Quartis', conteudo: secaoQuartis(d.quartis) },
    {
      id: 'ranking', rotulo: 'Ranking',
      conteudo: secaoRanking(d.ranking, {
        destacarId: nivel === 'operador' ? d.ranking[0]?.id ?? null : null,
      }),
    },
    {
      id: 'pix', rotulo: 'Pix Automático',
      conteudo: d.pix ? secaoPix(d.pix, nivel) : '',
    },
    {
      id: 'destaques', rotulo: 'Destaques',
      conteudo: secaoDestaques(d.destaques, d.curiosidades),
    },
    {
      id: 'individual', rotulo: 'Fechamento individual',
      conteudo: d.operadores.length
        ? secaoIndividual({
          operadores: d.operadores,
          pix: d.pix,
          agruparPorSetor: nivel === 'diretoria',
          semPagina: d.operadoresSemPagina,
        })
        : '',
    },
    {
      id: 'diretoria', rotulo: 'Painel da Diretoria',
      conteudo: d.setores.length ? secaoDiretoria(d.setores) : '',
    },
  ];

  return candidatas.filter(s => s.conteudo.trim().length > 0);
}

export function montarHtmlFechamento(d: DadosFechamento): string {
  const { alvo } = d;
  const secoes = montarSecoes(d);

  const botoes = secoes.map((s, i) => `<button class="aba${i === 0 ? ' ativa' : ''}" `
    + `data-alvo="${esc(s.id)}" type="button">${esc(s.rotulo)}</button>`).join('');

  const paineis = secoes.map((s, i) => `<div class="conteudo${i === 0 ? ' ativa' : ''}" `
    + `id="${esc(s.id)}">${s.conteudo}</div>`).join('');

  const avisos = d.avisos.length ? `
    <section class="avisos">
      <h3>Observações sobre estes números</h3>
      <ul>${d.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    </section>` : '';

  const subtitulo = [
    alvo.setorNome ? `Setor ${alvo.setorNome}` : null,
    alvo.operadorNome,
    alvo.empresaNome,
  ].filter(Boolean).join(' · ');

  const titulo = `Fechamento ${alvo.mesRotulo} — ${subtitulo || alvo.empresaNome}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>${CSS_FECHAMENTO}</style>
</head>
<body>
<div class="folha">
  ${secaoCapa(d)}

  <div class="barra-nav">
    <nav class="abas">${botoes}</nav>
    <button class="botao-apresentar" type="button" id="btn-apresentar">
      ▶ Modo apresentação
    </button>
  </div>

  ${paineis}
  ${avisos}

  <footer>
    Documento gerado pelo sistema de gestão de acordos.<br>
    Os valores vêm do relatório analítico importado do ERP no mês de referência.
  </footer>
</div>

<div class="controle-slides" role="group" aria-label="Navegação da apresentação">
  <button type="button" id="slide-anterior" aria-label="Seção anterior">‹</button>
  <span class="posicao" id="slide-posicao">1 de ${secoes.length}</span>
  <button type="button" id="slide-proximo" aria-label="Próxima seção">›</button>
  <button type="button" class="sair" id="slide-sair">Esc · sair</button>
</div>

<script>
${SCRIPT_NAVEGACAO}
</script>
</body>
</html>`;
}

/**
 * O único JavaScript da página.
 *
 * Aprimoramento progressivo: o documento nasce com uma seção marcada como ativa
 * e o CSS de impressão mostra todas. Se este script não rodar — navegador
 * antigo, JavaScript desligado, arquivo aberto por um leitor de e-mail — o
 * relatório continua legível.
 *
 * Vive como constante, e não inline no template, para não competir por espaço
 * com a estrutura HTML na hora de ler o arquivo.
 */
const SCRIPT_NAVEGACAO = `
(function () {
  var abas = Array.prototype.slice.call(document.querySelectorAll('.aba'));
  var paineis = Array.prototype.slice.call(document.querySelectorAll('.conteudo'));
  if (!abas.length) return;

  var atual = 0;

  function mostrar(indice) {
    if (indice < 0 || indice >= paineis.length) return;
    atual = indice;
    abas.forEach(function (b, i) { b.classList.toggle('ativa', i === indice); });
    paineis.forEach(function (p, i) {
      p.classList.toggle('ativa', i === indice);
      p.classList.toggle('slide-ativo', i === indice);
    });
    var pos = document.getElementById('slide-posicao');
    if (pos) pos.textContent = (indice + 1) + ' de ' + paineis.length;
    if (document.body.classList.contains('apresentando')) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  abas.forEach(function (botao, i) {
    botao.addEventListener('click', function () { mostrar(i); });
  });

  // ── Modo apresentação ────────────────────────────────────────────────────
  // O script só liga a classe; todo o comportamento visual é do CSS. Sair
  // devolve o leitor à seção em que ele estava, e não ao começo.
  function entrar() {
    document.body.classList.add('apresentando');
    mostrar(atual);
  }
  function sair() {
    document.body.classList.remove('apresentando');
    paineis.forEach(function (p) { p.classList.remove('slide-ativo'); });
    mostrar(atual);
  }

  var btn = document.getElementById('btn-apresentar');
  if (btn) btn.addEventListener('click', entrar);

  var anterior = document.getElementById('slide-anterior');
  var proximo = document.getElementById('slide-proximo');
  var botaoSair = document.getElementById('slide-sair');
  if (anterior) anterior.addEventListener('click', function () { mostrar(atual - 1); });
  if (proximo) proximo.addEventListener('click', function () { mostrar(atual + 1); });
  if (botaoSair) botaoSair.addEventListener('click', sair);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('apresentando')) {
      sair();
      return;
    }
    if (!document.body.classList.contains('apresentando')) return;
    // Nas bordas não avança para seção inexistente: 'mostrar' já ignora índice
    // fora da faixa, e o preventDefault evita a rolagem lateral da página.
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); mostrar(atual + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); mostrar(atual - 1); }
  });
})();
`;

/**
 * Nome do arquivo — previsível o bastante para ordenar sozinho numa pasta.
 *
 * `fechamento-2026-08-receptivo.html`, e não "Fechamento Agosto 2026.html":
 * data em formato ordenável na frente, sem acento e sem espaço, porque o
 * arquivo vai circular por WhatsApp e por e-mail.
 */
export function nomeArquivoFechamento(d: DadosFechamento): string {
  const partes = ['fechamento', d.alvo.mes];
  const alvo = d.alvo.operadorNome ?? d.alvo.setorNome ?? d.alvo.empresaNome;
  if (alvo) {
    partes.push(
      // `̀-ͯ` = os acentos que o NFD separou da letra.
      alvo.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    );
  }
  return `${partes.filter(Boolean).join('-')}.html`;
}
