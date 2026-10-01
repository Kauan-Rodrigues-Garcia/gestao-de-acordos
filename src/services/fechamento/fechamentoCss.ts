/**
 * fechamentoCss.ts — a folha de estilo do relatório, como string.
 *
 * Mora fora do gerador porque estilo é uma preocupação inteira sozinha: com o
 * CSS embutido no meio das seções, mexer no donut arriscava quebrar a tabela de
 * setores. Aqui ele é lido de cima a baixo como uma folha de estilo comum.
 *
 * ## Sempre claro, na tela e no papel
 *
 * Nenhuma cor é escrita direto no elemento: tudo sai de token em `:root`,
 * redefinido sob `@media print`. É o que permite os gráficos usarem
 * `var(--borda)` e continuarem visíveis nos dois.
 *
 * Até 19/09/2026 havia também um tema escuro, sob `prefers-color-scheme: dark`:
 * quem tinha o computador no modo escuro recebia o relatório escuro. Pedido da
 * gerência: o arquivo abre sempre claro, em qualquer máquina. `color-scheme:
 * light` impede o navegador de escurecer os controles por conta própria.
 *
 * ## Sóbrio de propósito (01/10/2026)
 *
 * Pedido da gerência: mais limpo, profissional, minimalista. A regra que saiu
 * disso: **cor só onde há julgamento** — percentual de meta, quartil, variação.
 * Total, cartão, pódio e barra de ranking ficam na tinta do texto ou num azul
 * único. Sem sombra, sem faixa colorida lateral, sem pílula cheia: linhas finas
 * e espaço em branco fazem a separação.
 *
 * ## Modo apresentação
 *
 * `body.apresentando` é a chave: o JavaScript apenas liga essa classe, e o CSS
 * faz o resto. Sem JavaScript, a classe nunca entra e o documento continua
 * sendo um documento rolável.
 */

export const CSS_FECHAMENTO = `
:root{
  --fundo:#f6f6f4; --papel:#ffffff; --papel-2:#fafaf9;
  --texto:#111827; --fraco:#6b7280; --tenue:#9ca3af;
  --borda:#e7e7e4; --borda-forte:#d4d4d0;
  --acento:#1e3a8a; --acento-suave:#eef2fa; --barra:#c7cfdd;
  --ok:#15803d;
  --sombra:none; --sombra-alta:0 12px 32px -18px rgba(17,24,39,.35);
  --raio:10px;
  color-scheme:light;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--fundo); color:var(--texto);
  font-family:"Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",Arial,sans-serif;
  font-size:14px; line-height:1.6; -webkit-font-smoothing:antialiased;
  font-feature-settings:"tnum" 1;
}
.folha{max-width:1120px;margin:0 auto;padding:44px 24px 80px}

/* ── Capa ─────────────────────────────────────────────────────────────── */
header.capa{padding:0 0 28px;margin-bottom:8px}
.selo{
  display:inline-flex; align-items:center; gap:8px;
  font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase;
  color:var(--fraco); margin-bottom:14px;
}
.selo::before{content:"";width:6px;height:6px;border-radius:999px;background:var(--acento)}
.selo.parcial{color:#b45309}
.selo.parcial::before{background:#d97706}
header.capa h1{margin:0;font-size:38px;line-height:1.1;font-weight:600;letter-spacing:-.025em}
header.capa .escopo{margin-top:6px;font-size:16px;font-weight:500;color:var(--texto)}
header.capa .assinatura{margin-top:4px;color:var(--tenue);font-size:12px}
.capa-numeros{
  display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
  margin-top:28px; border-top:1px solid var(--borda); border-bottom:1px solid var(--borda);
}
.capa-numero{padding:18px 20px 18px 0}
.capa-numero + .capa-numero{padding-left:20px;border-left:1px solid var(--borda)}
.capa-numero .rotulo-forte{margin-bottom:6px}
.total-grande{font-size:30px;font-weight:600;letter-spacing:-.02em;display:block;line-height:1.15}
.capa-numero .medio{font-size:22px;font-weight:600;letter-spacing:-.01em;display:block;line-height:1.3}
.veredito{
  margin:22px 0 0; padding:2px 0 2px 16px; border-left:2px solid var(--acento);
  font-size:15px; line-height:1.7; color:var(--fraco); max-width:78ch;
}
.veredito strong{font-weight:600;color:var(--texto)}

/* ── Navegação ────────────────────────────────────────────────────────── */
.barra-nav{
  display:flex; gap:12px; align-items:flex-end; justify-content:space-between;
  margin-bottom:24px; flex-wrap:wrap; border-bottom:1px solid var(--borda);
}
.abas{display:flex;gap:22px;flex-wrap:wrap}
.aba{
  border:0; border-bottom:2px solid transparent; background:transparent; color:var(--fraco);
  padding:12px 0 10px; margin-bottom:-1px; font-size:13px; font-weight:500;
  cursor:pointer; font-family:inherit; transition:color .15s,border-color .15s;
}
.aba:hover{color:var(--texto)}
.aba.ativa{color:var(--texto);border-bottom-color:var(--texto);font-weight:600}
.botao-apresentar{
  border:1px solid var(--borda); background:var(--papel); color:var(--fraco);
  padding:6px 12px; margin-bottom:8px; border-radius:8px; font-size:12px; font-weight:500;
  cursor:pointer; font-family:inherit; white-space:nowrap;
}
.botao-apresentar:hover{color:var(--texto);border-color:var(--borda-forte)}
.conteudo{display:none}
.conteudo.ativa{display:block}

/* ── Painel ───────────────────────────────────────────────────────────── */
.painel{
  background:var(--papel); border:1px solid var(--borda); border-radius:var(--raio);
  padding:24px 26px; margin-bottom:16px;
}
.painel h3{margin:0 0 4px;font-size:15px;font-weight:600;letter-spacing:-.005em}
.painel h4{margin:0 0 10px;font-size:13px;font-weight:600;display:flex;gap:8px;align-items:center}
.painel-titulo{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.painel-titulo .fraco{font-size:12.5px}
.ajuda{margin:0 0 20px;color:var(--fraco);font-size:12.5px;max-width:76ch;line-height:1.6}
.divisor{
  margin:28px 0 12px; padding-bottom:8px; border-bottom:1px solid var(--borda);
  font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.1em;
  color:var(--fraco);
}

/* ── Cartões ──────────────────────────────────────────────────────────── */
.cartoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:16px}
.cartoes.tres{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-bottom:0}
.cartoes.compacto{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.cartao{
  background:var(--papel); border:1px solid var(--borda); border-radius:var(--raio);
  padding:16px 18px; display:flex; flex-direction:column; gap:4px;
}
.cartao-rotulo{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.07em;color:var(--fraco)}
.cartao-valor{font-size:20px;font-weight:600;letter-spacing:-.01em;line-height:1.3}
.cartao-apoio{font-size:12px;color:var(--fraco)}
.rotulo-forte{display:block;font-size:11px;color:var(--fraco);text-transform:uppercase;letter-spacing:.07em;font-weight:500}

/* ── Progresso e marcos ───────────────────────────────────────────────── */
.progresso{margin:10px 0 2px}
.barra{position:relative;height:6px;background:var(--borda);border-radius:999px;overflow:hidden}
.barra.com-marcos{overflow:visible}
.barra-fill{height:100%;border-radius:999px;transition:width .3s}
.marco{
  position:absolute; top:-4px; width:1px; height:14px; background:var(--borda-forte);
}
.marco.batido{background:var(--texto)}
.progresso-legenda{
  display:flex;justify-content:space-between;gap:10px;margin-top:8px;
  font-size:12.5px;color:var(--fraco);
}
.marcos-legenda{list-style:none;display:flex;gap:18px;flex-wrap:wrap;margin:10px 0 0;padding:0;font-size:12px;color:var(--tenue)}
.marcos-legenda li{display:flex;align-items:center;gap:6px}
.marcos-legenda li.batido{color:var(--texto);font-weight:500}
.marco-ponto{width:6px;height:6px;border-radius:999px;display:inline-block}

/* ── Gráficos ─────────────────────────────────────────────────────────── */
.grafico{width:100%;height:auto;display:block}
.donut-bloco{display:flex;gap:32px;align-items:center;flex-wrap:wrap}
.donut{width:176px;height:176px;flex:0 0 auto}
.legenda-formas{list-style:none;margin:0;padding:0;flex:1;min-width:250px}
.legenda-formas li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--borda);font-size:13px}
.legenda-formas li:last-child{border-bottom:0}
.legenda-formas li.zerado{opacity:.45}
.ponto{width:8px;height:8px;border-radius:999px;flex:0 0 auto}
.forma-nome{flex:1}
.forma-val{font-weight:500}
.forma-pct{color:var(--fraco);min-width:56px;text-align:right}
.sparkline{width:100%;max-width:240px;height:40px;display:block}

/* ── Tabelas ──────────────────────────────────────────────────────────── */
.rolagem{overflow-x:auto;-webkit-overflow-scrolling:touch}
table.grade{width:100%;border-collapse:collapse;font-size:13px;min-width:680px}
table.grade th{
  text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;
  color:var(--fraco);padding:0 12px 10px;border-bottom:1px solid var(--borda-forte);white-space:nowrap;
  font-weight:500;
}
table.ordenavel th[data-ordem]{cursor:pointer;user-select:none;transition:color .15s}
table.ordenavel th[data-ordem]:hover,table.ordenavel th[aria-sort]{color:var(--texto)}
table.ordenavel th[data-ordem]::after{content:"↕";margin-left:5px;opacity:0;font-size:10px}
table.ordenavel th[data-ordem]:hover::after{opacity:.4}
table.ordenavel th[aria-sort=ascending]::after{content:"↑";opacity:1}
table.ordenavel th[aria-sort=descending]::after{content:"↓";opacity:1}
table.ordenavel th[data-ordem]:focus-visible{outline:2px solid var(--acento);outline-offset:2px;border-radius:2px}
table.grade th:first-child,table.grade td:first-child{padding-left:0}
table.grade th:last-child,table.grade td:last-child{padding-right:0}
table.grade td{padding:12px;border-bottom:1px solid var(--borda);vertical-align:middle}
table.grade tbody tr:last-child td{border-bottom:0}
table.grade tbody tr:hover td{background:var(--papel-2)}
table.grade .n{text-align:right;white-space:nowrap}
table.grade .pos{color:var(--tenue);width:32px;font-weight:500}
table.grade strong{font-weight:600}
table.grade .sub{display:block;font-size:11.5px;color:var(--fraco);font-weight:400}
.participacao{width:140px}
.pilula{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--texto)}
.pilula i,.ponto-quartil{display:inline-block;width:7px;height:7px;border-radius:999px}
.meta-batida{display:inline-flex;align-items:center;gap:6px;font-weight:600;white-space:nowrap}
.meta-batida::before{content:"";width:7px;height:7px;border-radius:999px;background:var(--ok)}
.meta-batida.nenhuma{font-weight:400;color:var(--tenue)}
.meta-batida.nenhuma::before{background:var(--borda-forte)}
.fraco{color:var(--fraco);font-weight:400}
.vazio{color:var(--fraco);font-size:13px;margin:0}

/* ── Distribuição de metas batidas ────────────────────────────────────── */
.faixa-metas{
  list-style:none; margin:0 0 20px; padding:0;
  display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr));
  border:1px solid var(--borda); border-radius:var(--raio);
}
.faixa-metas li{padding:12px 16px;display:flex;flex-direction:column;gap:2px}
.faixa-metas li + li{border-left:1px solid var(--borda)}
.faixa-metas strong{font-size:20px;font-weight:600;line-height:1.2}
.faixa-metas span{font-size:12px;color:var(--fraco)}
.faixa-metas li.zerado{opacity:.45}

/* ── Quartis ──────────────────────────────────────────────────────────── */
.quartis{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:22px}
.quartil-bloco{border:1px solid var(--borda);border-radius:var(--raio);padding:16px 18px;background:var(--papel)}
.quartil-bloco h4 .fraco{font-size:11.5px;margin-left:auto}
.lista-quartil{list-style:none;margin:0;padding:0}
.lista-quartil li{display:flex;gap:10px;justify-content:space-between;padding:7px 0;font-size:12.5px;border-bottom:1px solid var(--borda)}
.lista-quartil li:last-child{border-bottom:0}

/* ── Pódio e ranking ──────────────────────────────────────────────────── */
.podio{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:24px}
.podio-item{
  border:1px solid var(--borda); border-radius:var(--raio); padding:16px 18px;
  display:flex; flex-direction:column; gap:2px; background:var(--papel);
}
.podio-1{border-color:var(--borda-forte)}
.podio-pos{
  display:flex; align-items:center; gap:6px;
  font-size:11px; font-weight:500; color:var(--fraco); text-transform:uppercase; letter-spacing:.08em;
}
.podio-pos::before{content:"";width:6px;height:6px;border-radius:999px;background:var(--cor-podio,var(--borda-forte))}
.podio-item strong{font-weight:600;margin-top:4px}
.podio-valor{font-size:20px;font-weight:600;letter-spacing:-.01em}
.podio-selo{font-size:11.5px;color:var(--ok);font-weight:600;margin-top:4px}
ol.rank{list-style:none;margin:0;padding:0}
ol.rank li{display:flex;align-items:center;gap:14px;padding:9px 0;border-bottom:1px solid var(--borda)}
ol.rank li:last-child{border-bottom:0}
ol.rank li.eu{background:var(--acento-suave);border-radius:8px;padding-left:10px;padding-right:10px;border-bottom-color:transparent}
.rank-pos{width:24px;color:var(--tenue);font-size:12px;font-weight:500}
.rank-nome{flex:0 0 230px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank-selo{font-style:normal;font-size:11px;color:var(--ok);font-weight:600;margin-left:6px}
.rank-barra{flex:1;height:6px;background:var(--papel-2);border-radius:999px;overflow:hidden;min-width:60px}
.rank-barra i{display:block;height:100%;border-radius:999px}
.rank-valor{font-weight:600;font-size:13px;min-width:116px;text-align:right}

/* ── Comparativo com o mês anterior ───────────────────────────────────── */
.comparativo{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.comp-item{border:1px solid var(--borda);border-radius:var(--raio);padding:16px 18px;background:var(--papel)}
.comp-variacao{font-size:20px;font-weight:600;display:block;margin-top:4px}
.comp-detalhe{font-size:12px;color:var(--fraco);display:block;margin-top:2px}

/* ── Curiosidades ─────────────────────────────────────────────────────── */
.curiosidades{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.curiosidade{
  border:1px solid var(--borda); border-radius:var(--raio); padding:16px 18px;
  background:var(--papel); display:flex; flex-direction:column; gap:6px;
}
.curiosidade .titulo{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.08em;color:var(--fraco)}
.curiosidade .destaque{font-size:17px;font-weight:600;line-height:1.3}
.curiosidade .texto{font-size:12.5px;color:var(--fraco);line-height:1.55}

/* ── Fechamento individual ────────────────────────────────────────────── */
.indice-pessoas{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 24px;margin:0 0 24px;padding:0}
.indice-pessoas a{
  display:flex; justify-content:space-between; gap:10px; align-items:baseline;
  border-bottom:1px solid var(--borda); padding:9px 0;
  text-decoration:none; color:inherit; font-size:13px;
}
.indice-pessoas a:hover{color:var(--acento)}
.indice-pessoas .v{color:var(--fraco)}
.pessoa{
  border:1px solid var(--borda); border-radius:var(--raio); padding:22px 24px;
  margin-bottom:16px; background:var(--papel);
}
.pessoa-cabecalho{
  display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start;
  margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--borda);
}
/* ".pessoa" na frente: sem ele, ".painel h4" (13px, flex) vence e o nome encolhe. */
.pessoa .pessoa-nome{display:block;margin:0 0 2px;font-size:18px;font-weight:600;letter-spacing:-.01em}
.pessoa-sub{font-size:12px;color:var(--fraco)}
.pessoa-posicao{
  font-size:11.5px;font-weight:500;color:var(--fraco);
  border:1px solid var(--borda);padding:3px 10px;border-radius:999px;white-space:nowrap;
}
.pessoa-corpo{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;align-items:start;margin-top:18px}
.pessoa-corpo .rotulo-forte{margin-bottom:8px}

/* ── Observações ──────────────────────────────────────────────────────── */
.avisos{
  border:1px solid var(--borda); border-left:2px solid #d97706; border-radius:var(--raio);
  background:var(--papel); padding:16px 20px; margin-top:24px;
}
.avisos h3{margin:0 0 8px;font-size:13px;font-weight:600}
.avisos ul{margin:0;padding-left:18px;color:var(--fraco);font-size:12.5px}
.avisos li{margin-bottom:6px}
footer{margin-top:40px;padding-top:20px;border-top:1px solid var(--borda);color:var(--tenue);font-size:11.5px;text-align:center;line-height:1.7}

/* ── Modo apresentação ────────────────────────────────────────────────── */
/* O JavaScript só liga a classe. Todo o comportamento é daqui — e por isso o
   documento continua legível quando ele não roda. */
body.apresentando{background:var(--fundo)}
body.apresentando .folha{max-width:1400px;padding:28px 32px 96px}
body.apresentando header.capa{display:none}
body.apresentando .barra-nav{display:none}
body.apresentando .avisos{display:none}
body.apresentando footer{display:none}
body.apresentando .conteudo{display:none}
body.apresentando .conteudo.slide-ativo{display:block;animation:entra .22s ease-out}
@keyframes entra{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
body.apresentando .cartao-valor{font-size:26px}
body.apresentando .total-grande{font-size:44px}
body.apresentando table.grade{font-size:15px}
body.apresentando .painel h3{font-size:20px}
.controle-slides{display:none}
body.apresentando .controle-slides{
  display:flex; align-items:center; gap:14px; justify-content:center;
  position:fixed; left:50%; bottom:20px; transform:translateX(-50%);
  background:var(--papel); border:1px solid var(--borda); border-radius:999px;
  padding:8px 16px; box-shadow:var(--sombra-alta); z-index:50;
}
.controle-slides button{
  border:0; background:transparent; color:var(--fraco); cursor:pointer;
  font-size:18px; line-height:1; padding:4px 8px; font-family:inherit;
}
.controle-slides button:hover{color:var(--texto)}
.controle-slides .posicao{font-size:12.5px;font-weight:500;color:var(--fraco);min-width:64px;text-align:center}
.controle-slides .sair{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.08em}
.slide-titulo{display:none}
body.apresentando .slide-titulo{
  display:block; font-size:11px; font-weight:600; text-transform:uppercase;
  letter-spacing:.12em; color:var(--fraco); margin-bottom:10px;
}

/* ── Celular ──────────────────────────────────────────────────────────── */
@media (max-width:640px){
  .folha{padding:28px 16px 64px}
  header.capa h1{font-size:30px}
  .capa-numero,.capa-numero + .capa-numero{padding:14px 0;border-left:0}
  .capa-numero + .capa-numero{border-top:1px solid var(--borda)}
  .painel{padding:18px 16px}
  .rank-nome{flex-basis:130px}
  .faixa-metas li + li{border-left:0;border-top:1px solid var(--borda)}
}

/* ── Impressão ────────────────────────────────────────────────────────── */
@media print{
  :root{
    --fundo:#fff; --papel:#fff; --papel-2:#fafafa; --texto:#000;
    --fraco:#444; --tenue:#666; --borda:#ccc; --borda-forte:#999;
    --sombra:none; --sombra-alta:none;
  }
  body{background:#fff}
  .folha{max-width:none;padding:0}
  /* Quem imprime quer o DOCUMENTO, não a aba que por acaso estava aberta. */
  .barra-nav,.controle-slides{display:none!important}
  body.apresentando .conteudo,.conteudo{display:block!important}
  .conteudo{page-break-after:always;break-after:page}
  .conteudo:last-of-type{page-break-after:auto;break-after:auto}
  .painel,.cartao,.pessoa,.quartil-bloco,.podio-item,.curiosidade,.faixa-metas{
    break-inside:avoid; page-break-inside:avoid;
  }
  table.grade tr{break-inside:avoid;page-break-inside:avoid}
  .painel h3,.divisor{break-after:avoid;page-break-after:avoid}
  .avisos{display:block!important}
}
`;
