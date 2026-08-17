/**
 * fechamentoCss.ts — a folha de estilo do relatório, como string.
 *
 * Mora fora do gerador porque estilo é uma preocupação inteira sozinha: com o
 * CSS embutido no meio das seções, mexer no donut arriscava quebrar a tabela de
 * setores. Aqui ele é lido de cima a baixo como uma folha de estilo comum.
 *
 * ## Três contextos, uma folha
 *
 * O mesmo arquivo é lido em tela clara, em tela escura e no papel. Nenhuma cor
 * é escrita direto no elemento: tudo sai de token em `:root`, redefinido sob
 * `prefers-color-scheme: dark` e sob `@media print`. É o que permite os
 * gráficos usarem `var(--borda)` e continuarem visíveis nos três.
 *
 * ## Modo apresentação
 *
 * `body.apresentando` é a chave: o JavaScript apenas liga essa classe, e o CSS
 * faz o resto. Sem JavaScript, a classe nunca entra e o documento continua
 * sendo um documento rolável.
 */

export const CSS_FECHAMENTO = `
:root{
  --fundo:#f1f5f9; --papel:#ffffff; --papel-2:#f8fafc;
  --texto:#0f172a; --fraco:#64748b; --tenue:#94a3b8;
  --borda:#e2e8f0; --borda-forte:#cbd5e1;
  --acento:#6366f1; --acento-suave:#eef2ff; --acento-forte:#4f46e5;
  --sombra:0 1px 2px rgba(15,23,42,.06), 0 8px 24px -12px rgba(15,23,42,.18);
  --sombra-alta:0 2px 4px rgba(15,23,42,.08), 0 20px 40px -20px rgba(15,23,42,.28);
  --raio:14px;
}
@media (prefers-color-scheme: dark){
  :root{
    --fundo:#0b1120; --papel:#111827; --papel-2:#0f172a;
    --texto:#e5e7eb; --fraco:#94a3b8; --tenue:#64748b;
    --borda:#1f2937; --borda-forte:#334155;
    --acento:#818cf8; --acento-suave:#1e1b4b; --acento-forte:#a5b4fc;
    --sombra:0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6);
    --sombra-alta:0 2px 4px rgba(0,0,0,.5), 0 20px 40px -20px rgba(0,0,0,.8);
  }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--fundo); color:var(--texto);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  font-size:14px; line-height:1.55; -webkit-font-smoothing:antialiased;
}
.folha{max-width:1180px;margin:0 auto;padding:26px 20px 72px}

/* ── Capa ─────────────────────────────────────────────────────────────── */
header.capa{
  position:relative; overflow:hidden;
  background:var(--papel); border:1px solid var(--borda); border-radius:20px;
  padding:28px 30px; margin-bottom:16px; box-shadow:var(--sombra);
}
header.capa::before{
  content:""; position:absolute; inset:0 auto 0 0; width:5px;
  background:linear-gradient(180deg,var(--acento),transparent);
}
.selo{
  display:inline-flex; align-items:center; gap:6px;
  font-size:10.5px; font-weight:800; letter-spacing:.1em; text-transform:uppercase;
  color:var(--acento); background:var(--acento-suave);
  padding:5px 11px; border-radius:999px; margin-bottom:12px;
}
.selo.parcial{color:#b45309;background:#f59e0b1f}
header.capa h1{margin:0;font-size:32px;line-height:1.1;letter-spacing:-.02em}
header.capa .escopo{margin-top:4px;font-size:15px;font-weight:600;color:var(--fraco)}
header.capa .assinatura{margin-top:10px;color:var(--tenue);font-size:12px}
.veredito{
  margin:18px 0 0; padding:16px 18px; border-radius:12px;
  background:var(--papel-2); border:1px solid var(--borda);
  font-size:15px; line-height:1.6;
}
.veredito strong{font-weight:700}
.capa-numeros{display:flex;gap:32px;flex-wrap:wrap;align-items:flex-end;margin-top:18px}
.capa-numero .rotulo-forte{margin-bottom:2px}
.total-grande{font-size:40px;font-weight:800;letter-spacing:-.03em;display:block;line-height:1.05}
.capa-numero .medio{font-size:22px;font-weight:700;display:block}

/* ── Navegação ────────────────────────────────────────────────────────── */
.barra-nav{
  display:flex; gap:8px; align-items:center; justify-content:space-between;
  margin-bottom:16px; flex-wrap:wrap;
}
.abas{display:flex;gap:6px;flex-wrap:wrap}
.aba{
  border:1px solid var(--borda); background:var(--papel); color:var(--fraco);
  padding:8px 14px; border-radius:10px; font-size:13px; font-weight:600;
  cursor:pointer; font-family:inherit; transition:all .15s;
}
.aba:hover{color:var(--texto);border-color:var(--borda-forte)}
.aba.ativa{background:var(--acento);border-color:var(--acento);color:#fff;box-shadow:var(--sombra)}
.botao-apresentar{
  border:1px solid var(--borda); background:var(--papel); color:var(--fraco);
  padding:8px 14px; border-radius:10px; font-size:12.5px; font-weight:600;
  cursor:pointer; font-family:inherit; white-space:nowrap;
}
.botao-apresentar:hover{color:var(--texto);border-color:var(--borda-forte)}
.conteudo{display:none}
.conteudo.ativa{display:block}

/* ── Painel ───────────────────────────────────────────────────────────── */
.painel{
  background:var(--papel); border:1px solid var(--borda); border-radius:var(--raio);
  padding:20px 22px; margin-bottom:14px; box-shadow:var(--sombra);
}
.painel h3{margin:0 0 4px;font-size:16px;letter-spacing:-.01em}
.painel h4{margin:0 0 8px;font-size:13px;display:flex;gap:8px;align-items:baseline}
.painel-titulo{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.ajuda{margin:0 0 16px;color:var(--fraco);font-size:12.5px;max-width:70ch}
.divisor{
  margin:22px 0 12px; padding-bottom:6px; border-bottom:1px solid var(--borda);
  font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.08em;
  color:var(--fraco);
}

/* ── Cartões ──────────────────────────────────────────────────────────── */
.cartoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:12px;margin-bottom:14px}
.cartoes.tres{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-bottom:0}
.cartoes.compacto{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.cartao{
  position:relative; overflow:hidden;
  background:var(--papel); border:1px solid var(--borda); border-radius:12px;
  padding:14px 16px; display:flex; flex-direction:column; gap:3px;
}
.cartao::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--cor-acento,var(--borda))}
.cartao-rotulo{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--fraco)}
.cartao-valor{font-size:21px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.cartao-apoio{font-size:11.5px;color:var(--fraco)}
.rotulo-forte{display:block;font-size:11px;color:var(--fraco);text-transform:uppercase;letter-spacing:.06em;font-weight:800}

/* ── Progresso e marcos ───────────────────────────────────────────────── */
.progresso{margin:6px 0 2px}
.barra{position:relative;height:10px;background:var(--borda);border-radius:999px;overflow:hidden}
.barra.com-marcos{overflow:visible;height:12px;border-radius:999px}
.barra.com-marcos .barra-fill{border-radius:999px}
.barra-fill{height:100%;border-radius:999px;transition:width .3s}
.marco{
  position:absolute; top:-3px; width:2px; height:18px; background:var(--borda-forte);
  transform:translateX(-1px); border-radius:1px;
}
.marco.batido{background:var(--texto);opacity:.55}
.progresso-legenda{
  display:flex;justify-content:space-between;gap:10px;margin-top:6px;
  font-size:12px;color:var(--fraco);font-variant-numeric:tabular-nums;
}
.marcos-legenda{list-style:none;display:flex;gap:14px;flex-wrap:wrap;margin:8px 0 0;padding:0;font-size:11.5px;color:var(--fraco)}
.marcos-legenda li{display:flex;align-items:center;gap:5px}
.marcos-legenda li.batido{color:var(--texto);font-weight:600}
.marco-ponto{width:8px;height:8px;border-radius:999px;display:inline-block}

/* ── Gráficos ─────────────────────────────────────────────────────────── */
.grafico{width:100%;height:auto;display:block}
.donut-bloco{display:flex;gap:26px;align-items:center;flex-wrap:wrap}
.donut{width:184px;height:184px;flex:0 0 auto}
.legenda-formas{list-style:none;margin:0;padding:0;flex:1;min-width:250px}
.legenda-formas li{display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid var(--borda);font-size:13px}
.legenda-formas li:last-child{border-bottom:0}
.legenda-formas li.zerado{opacity:.5}
.ponto{width:10px;height:10px;border-radius:3px;flex:0 0 auto}
.forma-nome{flex:1}
.forma-val{font-variant-numeric:tabular-nums;font-weight:600}
.forma-pct{color:var(--fraco);min-width:56px;text-align:right;font-variant-numeric:tabular-nums}
.sparkline{width:100%;max-width:240px;height:40px;display:block}

/* ── Tabelas ──────────────────────────────────────────────────────────── */
.rolagem{overflow-x:auto;-webkit-overflow-scrolling:touch}
table.grade{width:100%;border-collapse:collapse;font-size:13px;min-width:640px}
table.grade th{
  text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;
  color:var(--fraco);padding:9px 10px;border-bottom:1px solid var(--borda-forte);white-space:nowrap;
  font-weight:800;
}
table.grade td{padding:10px;border-bottom:1px solid var(--borda);vertical-align:middle}
table.grade tbody tr:last-child td{border-bottom:0}
table.grade tbody tr:nth-child(even){background:var(--papel-2)}
table.grade .n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.grade .pos{color:var(--fraco);width:36px;font-variant-numeric:tabular-nums;font-weight:700}
table.grade .sub{display:block;font-size:11px;color:var(--fraco);font-weight:400}
.participacao{width:140px}
.pilula{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:800}
.fraco{color:var(--fraco);font-weight:400}
.vazio{color:var(--fraco);font-size:13px;margin:0;font-style:italic}

/* ── Quartis ──────────────────────────────────────────────────────────── */
.quartis{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:18px}
.quartil-bloco{border:1px solid var(--borda);border-radius:12px;padding:13px 15px;background:var(--papel-2)}
.lista-quartil{list-style:none;margin:0;padding:0}
.lista-quartil li{display:flex;gap:10px;justify-content:space-between;padding:5px 0;font-size:12.5px;border-bottom:1px solid var(--borda)}
.lista-quartil li:last-child{border-bottom:0}
.lista-quartil .n{font-variant-numeric:tabular-nums}

/* ── Pódio e ranking ──────────────────────────────────────────────────── */
.podio{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:18px}
.podio-item{
  border:1px solid var(--cor-podio,var(--borda)); border-radius:12px; padding:15px;
  display:flex; flex-direction:column; gap:2px;
  background:color-mix(in srgb, var(--cor-podio,transparent) 8%, var(--papel));
}
.podio-pos{font-size:11px;font-weight:800;color:var(--cor-podio,var(--fraco));text-transform:uppercase;letter-spacing:.06em}
.podio-valor{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums}
ol.rank{list-style:none;margin:0;padding:0}
ol.rank li{display:flex;align-items:center;gap:11px;padding:7px 0;border-bottom:1px solid var(--borda)}
ol.rank li:last-child{border-bottom:0}
ol.rank li.eu{background:var(--acento-suave);border-radius:8px;padding-left:8px;padding-right:8px}
.rank-pos{width:26px;color:var(--fraco);font-variant-numeric:tabular-nums;font-size:12px;font-weight:700}
.rank-nome{flex:0 0 190px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank-barra{flex:1;height:9px;background:var(--borda);border-radius:999px;overflow:hidden;min-width:60px}
.rank-barra i{display:block;height:100%;border-radius:999px}
.rank-valor{font-variant-numeric:tabular-nums;font-weight:700;font-size:13px;min-width:116px;text-align:right}

/* ── Comparativo com o mês anterior ───────────────────────────────────── */
.comparativo{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.comp-item{border:1px solid var(--borda);border-radius:12px;padding:14px 16px;background:var(--papel-2)}
.comp-variacao{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;display:block}
.comp-detalhe{font-size:11.5px;color:var(--fraco);display:block;margin-top:2px}

/* ── Curiosidades ─────────────────────────────────────────────────────── */
.curiosidades{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}
.curiosidade{
  border:1px solid var(--borda); border-radius:12px; padding:15px 17px;
  background:var(--papel-2); display:flex; flex-direction:column; gap:5px;
}
.curiosidade .titulo{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--acento)}
.curiosidade .destaque{font-size:17px;font-weight:700;line-height:1.25}
.curiosidade .texto{font-size:12.5px;color:var(--fraco);line-height:1.5}

/* ── Fechamento individual ────────────────────────────────────────────── */
.indice-pessoas{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:0 0 18px;padding:0}
.indice-pessoas a{
  display:flex; justify-content:space-between; gap:10px; align-items:baseline;
  border:1px solid var(--borda); border-radius:10px; padding:9px 12px;
  text-decoration:none; color:inherit; font-size:13px; background:var(--papel-2);
}
.indice-pessoas a:hover{border-color:var(--acento)}
.indice-pessoas .v{font-variant-numeric:tabular-nums;font-weight:700;color:var(--fraco)}
.pessoa{
  border:1px solid var(--borda); border-radius:var(--raio); padding:18px 20px;
  margin-bottom:14px; background:var(--papel-2);
}
.pessoa-cabecalho{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-bottom:14px}
.pessoa-nome{margin:0;font-size:18px;letter-spacing:-.01em}
.pessoa-sub{font-size:12px;color:var(--fraco)}
.pessoa-posicao{
  font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;
  color:var(--acento);background:var(--acento-suave);padding:4px 10px;border-radius:999px;white-space:nowrap;
}
.pessoa-corpo{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;align-items:start}

/* ── Observações ──────────────────────────────────────────────────────── */
.avisos{
  border:1px solid var(--borda); border-left:3px solid #f59e0b; border-radius:12px;
  background:var(--papel); padding:15px 19px; margin-top:18px;
}
.avisos h3{margin:0 0 8px;font-size:13px}
.avisos ul{margin:0;padding-left:18px;color:var(--fraco);font-size:12.5px}
.avisos li{margin-bottom:6px}
footer{margin-top:24px;color:var(--tenue);font-size:11.5px;text-align:center;line-height:1.6}

/* ── Modo apresentação ────────────────────────────────────────────────── */
/* O JavaScript só liga a classe. Todo o comportamento é daqui — e por isso o
   documento continua legível quando ele não roda. */
body.apresentando{background:var(--fundo)}
body.apresentando .folha{max-width:1400px;padding:16px 26px 90px}
body.apresentando header.capa{display:none}
body.apresentando .abas{display:none}
body.apresentando .avisos{display:none}
body.apresentando footer{display:none}
body.apresentando .conteudo{display:none}
body.apresentando .conteudo.slide-ativo{display:block;animation:entra .22s ease-out}
@keyframes entra{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
body.apresentando .painel{box-shadow:var(--sombra-alta)}
body.apresentando .cartao-valor{font-size:26px}
body.apresentando .total-grande{font-size:52px}
body.apresentando table.grade{font-size:15px}
body.apresentando .painel h3{font-size:20px}
.controle-slides{display:none}
body.apresentando .controle-slides{
  display:flex; align-items:center; gap:14px; justify-content:center;
  position:fixed; left:50%; bottom:18px; transform:translateX(-50%);
  background:var(--papel); border:1px solid var(--borda); border-radius:999px;
  padding:8px 16px; box-shadow:var(--sombra-alta); z-index:50;
}
.controle-slides button{
  border:0; background:transparent; color:var(--fraco); cursor:pointer;
  font-size:18px; line-height:1; padding:4px 8px; font-family:inherit;
}
.controle-slides button:hover{color:var(--texto)}
.controle-slides .posicao{font-size:12.5px;font-weight:700;color:var(--fraco);min-width:64px;text-align:center;font-variant-numeric:tabular-nums}
.controle-slides .sair{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.slide-titulo{display:none}
body.apresentando .slide-titulo{
  display:block; font-size:11px; font-weight:800; text-transform:uppercase;
  letter-spacing:.1em; color:var(--acento); margin-bottom:10px;
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
  .abas,.botao-apresentar,.controle-slides{display:none!important}
  body.apresentando .conteudo,.conteudo{display:block!important}
  .conteudo{page-break-after:always;break-after:page}
  .conteudo:last-of-type{page-break-after:auto;break-after:auto}
  .painel,.cartao,.pessoa,.quartil-bloco,.podio-item,.curiosidade{
    break-inside:avoid; page-break-inside:avoid;
  }
  table.grade tr{break-inside:avoid;page-break-inside:avoid}
  .painel h3,.divisor{break-after:avoid;page-break-after:avoid}
  .avisos{display:block!important}
}
`;
