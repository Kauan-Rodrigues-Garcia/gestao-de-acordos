/** Executa apenas no documento isolado. Nenhuma credencial entra no iframe. */
export const ponte = String.raw`
// about:srcdoc tem location.origin "null", mas herda a origem real do pai.
const origemIntegracao=window.origin;
let relatorioAtual = null;
let todasTransacoes = [];
function percentual(valor,total){
  return total ? (valor/total*100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%' : '—';
}
function atualizarPercentuais(bloco,dados,prefixo){
  const campos=['coren','cofen','pp'], nomes=['Coren','Cofen','Pagueplay'], barras=['Cor','Cof','PP'];
  const root=document.querySelector(bloco);
  campos.forEach((k,i)=>{
    const pct=percentual(dados[k],dados.total);
    root.querySelectorAll('.split-pct')[i].textContent=pct;
    const legenda=root.querySelectorAll('.hl')[i];
    while(legenda.childNodes.length>1)legenda.removeChild(legenda.lastChild);
    legenda.appendChild(document.createTextNode(nomes[i]+' '+pct));
    document.getElementById(prefixo+'Bar'+barras[i]).style.width=(dados.total?Math.max(0,dados[k]/dados.total*100):0)+'%';
  });
}
const renderGeralOriginal=renderGeral, renderDayOriginal=renderDay;
renderGeral=function(d){renderGeralOriginal(d);atualizarPercentuais('.total-hero',d,'g');};
renderDay=function(d){renderDayOriginal(d);atualizarPercentuais('.day-hero',d,'d');};
function somarTransacoes(txns){
  const out={total:0,coren:0,cofen:0,pp:0,corens:{}};
  txns.forEach(t=>{
    if(!out.corens[t.sigla])out.corens[t.sigla]={total:0,coren:0,cofen:0,pp:0};
    ['total','coren','cofen','pp'].forEach(k=>{out[k]+=t[k];out.corens[t.sigla][k]+=t[k];});
  });
  return out;
}
onDailyDateChange=function(val){
  if(!relatorioAtual||!val)return;
  const daily=buildDailyFromTxns(val);
  const cobertura=relatorioAtual.dias.some(d=>d.data===val);
  const temMovimento=todasTransacoes.some(t=>t.d===val);
  STATE.daily=daily;STATE.dailyLoaded=cobertura||temMovimento;
  window.dayData=daily;
  // Zero é um resultado válido, não "aguardando relatório".
  renderDay(daily);
  if(!cobertura&&!temMovimento)document.getElementById('dayDate').textContent=daily.date+' — data ainda não importada';
  enableCopyButtons(relatorioAtual.quantidade>0,STATE.dailyLoaded);
};
resetDailyToday=function(){
  if(!relatorioAtual)return;
  document.getElementById('dailyDatePicker').value=relatorioAtual.hoje;
  onDailyDateChange(relatorioAtual.hoje);
};
applyCorenFilters=function(){
  if(!relatorioAtual)return;
  window.__txns=todasTransacoes.filter(t=>!window.disabledCorens.has(t.sigla));
  const geral=somarTransacoes(window.__txns);
  STATE.geral=geral;STATE.final=geral;STATE.verified=true;window.geralData=geral;
  renderGeral(geral);
  onDailyDateChange(document.getElementById('dailyDatePicker').value||relatorioAtual.hoje);
  renderMonthly();renderCorenMonthly();renderIA();renderFilters();showBtnAtualizado();
};
window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==origemIntegracao||event.data?.type!=='pp-relatorio-dados')return;
  relatorioAtual=event.data.resumo;
  todasTransacoes=relatorioAtual.grupos.map(t=>({sigla:t.uf,total:t.total,coren:t.coren,cofen:t.cofen,pp:t.pp,
    d:t.data_pagamento,dAcumuladoMes:t.data,forma:t.forma,ia:t.ia}));
  COREN_ORDER=[...new Set(todasTransacoes.map(t=>t.sigla))].sort();
  window.__hasDate=true;window.__hasIA=true;
  setMode(event.data.modalidade);
  document.getElementById('hdrPeriod').textContent=event.data.modalidade==='conciliacao'?'Conciliação · histórico salvo':'Pagamento · histórico salvo';
  const dp=document.getElementById('dailyDatePicker');
  dp.max=relatorioAtual.hoje;dp.disabled=false;
  if(!dp.value)dp.value=relatorioAtual.hoje;
  document.getElementById('dailyDateWrap').style.display='flex';
  applyCorenFilters();
});
// Isolamento por abertura/modalidade: filtros e tema não vazam entre empresas.
window.disabledCorens=new Set();
const avisarAltura=()=>parent.postMessage({type:'pp-relatorio-altura',altura:document.body.scrollHeight},origemIntegracao);
new ResizeObserver(avisarAltura).observe(document.body);
parent.postMessage({type:'pp-relatorio-pronto'},origemIntegracao);
`;
