const {chromium}=require('@playwright/test');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const XLSX=require('@e965/xlsx');
// Execute com `npm run dev` em outra janela. Nenhum dado real é enviado:
// todas as RPCs são interceptadas no contexto do navegador.
fs.mkdirSync('.tmp',{recursive:true});
fs.writeFileSync('.tmp/pp-review.html',`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import PP from '/src/pages/PainelDiretoria/RelatorioPaguePlay/index.tsx';import '/src/index.css';
createRoot(document.getElementById('root')).render(React.createElement(PP,{empresaId:'00000000-0000-4000-8000-000000000001',versao:0}));
</script></body></html>`);
const hoje='2026-09-11';
const groups=[{data:hoje,data_pagamento:hoje,uf:'PE',forma:'Pix',ia:'',total:10000,coren:5628,cofen:1876,pp:2496},{data:hoje,data_pagamento:hoje,uf:'SP',forma:'Boleto',ia:'',total:40000,coren:22512,cofen:7504,pp:9984}];
const resumo={hoje,primeiraImportacaoPendente:true,quantidade:2,grupos:groups,dias:[{data:hoje,completo:false,quantidade:2,importado_em:'2026-09-11T15:00:00Z'}],ultimaImportacao:'2026-09-11T15:00:00Z'};
const h=['Período','Data','Id.Baixa','UF Coren','Cód.Acordo','Parcela','Forma Pgto','Valor Recebido','Pague Play','Coren','Cofen','Dt.Pagamento','IA'];
const rows=[h,['Pagamento - 2026/09','11/09/2026','1','PE','100',1,'Pix',290.44,65.64,170.31,54.49,'11/09/2026',''],[null,null,null,null,null,null,null,290.44,65.64,170.31,54.49]];
const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'945');
fs.writeFileSync('.tmp/pp-fixture.xlsx',XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=[];
 await ctx.route('**/rest/v1/rpc/fn_pp_relatorio',async route=>{
   const p=route.request().postDataJSON();calls.push(p);
   const data=p.p_acao==='resumo'?resumo:p.p_acao==='abrir'?'00000000-0000-4000-8000-000000000009':p.p_acao==='concluir'?{inseridos:1,ignorados:0}:p.p_acao==='excluir'?2:null;
   await route.fulfill({json:data});
 });
 await page.goto('http://localhost:8080/.tmp/pp-review.html');
 await page.getByRole('button',{name:'Importar relatório de pagamento',exact:true}).waitFor();
 const fr=page.frames().find(f=>f.parentFrame());assert(fr,'iframe mounted');
 await fr.waitForFunction(()=>document.getElementById('heroNum').textContent==='R$ 500,00');
 await page.screenshot({path:'.tmp/pp-review.png',fullPage:true});
 assert.equal(await fr.locator('#gPP').textContent(),'R$ 124,80');
 // Dark app CSS does not affect iframe.
 const theme=await fr.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg-solid'));
 await page.evaluate(()=>document.documentElement.classList.add('dark'));
 assert.equal(await fr.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg-solid')),theme);
 // Clipboard payload is captured in the test only, without replacing captureImg.
 const hook=async f=>f.evaluate(()=>{
   window.copied=[];
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{const blob=await items[0].getType('image/png');window.copied.push(await new Promise(r=>{const x=new FileReader();x.onload=()=>r(x.result);x.readAsDataURL(blob);}));},writeText:async text=>{window.textCopied=text;}}});
 });
 await hook(fr);
 const capture=async(f,n)=>{
   await f.evaluate(n=>copyImg(n,document.getElementById('cImg'+n)),n);
   await f.waitForFunction(()=>window.copied.length>0);
   return f.evaluate(()=>window.copied.shift());
 };
 const original=fs.readFileSync('src/pages/PainelDiretoria/RelatorioPaguePlay/original.html','utf8').replace(/<script src="https:\/\/cdnjs[^\"]+xlsx[^\"]+"><\/script>/,'').replace('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js','http://localhost:8080/node_modules/html2canvas/dist/html2canvas.min.js');
 const baseline=await ctx.newPage();baseline.on('pageerror',e=>errors.push('baseline: '+e.message));
 await baseline.goto('http://localhost:8080/.tmp/pp-review.html');
 await baseline.setContent(original);await baseline.waitForFunction(()=>typeof html2canvas==='function');await hook(baseline);
 const seed=groups.map(g=>({...g,total:g.total/100,coren:g.coren/100,cofen:g.cofen/100,pp:g.pp/100,sigla:g.uf,d:g.data_pagamento,dAcumuladoMes:g.data}));
 await baseline.evaluate(seed=>{
   window.__txns=seed;window.__hasDate=true;window.disabledCorens=new Set();COREN_ORDER=['PE','SP'];
   const f={total:500,coren:281.40,cofen:93.80,pp:124.80,corens:Object.fromEntries(seed.map(t=>[t.sigla,{total:t.total,coren:t.coren,cofen:t.cofen,pp:t.pp}]))};
   STATE.final=f;STATE.geral=f;STATE.daily=buildDailyFromTxns('2026-09-11');STATE.dailyLoaded=true;
   document.getElementById('lockOverlay').classList.add('hidden');renderGeral(f);renderDay(STATE.daily);enableCopyButtons(true,true);
 },seed);
 for(const mode of ['pagamento','conciliacao']){
   if(mode==='conciliacao'){await page.getByRole('button',{name:'Conciliação',exact:true}).click();}
   await page.frameLocator('iframe').locator('#heroNum').filter({hasText:'R$ 500,00'}).waitFor(); const f=page.frames().find(f=>f.parentFrame());await f.waitForFunction(m=>typeof currentMode!=='undefined'&&currentMode===m&&STATE.final.total===50000,mode);await hook(f);
   await baseline.evaluate(mode=>setMode(mode),mode);
   await baseline.evaluate(()=>document.fonts.ready);await f.evaluate(()=>document.fonts.ready);
   // Both viewport widths give original .wrap the same 1080px max width.
   for(let n=1;n<=3;n++){
     const a=await capture(baseline,n);const b=await capture(f,n);
     fs.writeFileSync(`.tmp/pp-${mode}-${n}.png`,Buffer.from(b.split(',')[1],'base64'));
     fs.writeFileSync(`.tmp/original-${mode}-${n}.png`,Buffer.from(a.split(',')[1],'base64'));
     console.log(`IMAGE ${mode} ${n} identical=${a===b}`);assert.ok(a===b,`Image ${mode} ${n} differs; compare the PNG files in .tmp.`);
   }
 }
 // Read file/worker, preview actual split, first import gate, retry, deletion cancel.
 await page.getByRole('button',{name:'Pagamento',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles('.tmp/pp-fixture.xlsx');
 await page.getByText('Os quatro totais conferem com o rodapé do arquivo.').waitFor();
 await page.getByRole('button',{name:'Visualizar arquivo sem salvar'}).click();
 const pf=page.frames().find(f=>f.parentFrame());await pf.waitForFunction(()=>document.getElementById('gCoren').textContent==='R$ 170,31');
 await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Validar e salvar no histórico'}).click();
 await page.getByRole('status').filter({hasText:'primeira importação'}).waitFor();
 assert(!calls.some(c=>c.p_acao==='abrir'),'first day rejected before persistence');
 await page.getByLabel('Início do período exportado').fill('2026-09-10');await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Validar e salvar no histórico'}).click();
 await page.getByText('1 pagamentos novos salvos; 0 repetidos ignorados.').waitFor();
 assert(calls.some(c=>c.p_acao==='concluir'));
 await page.locator('summary').click();await page.getByRole('button',{name:'Excluir todo o histórico de pagamento'}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Cancelar',exact:true}).click();
 assert(!calls.some(c=>c.p_acao==='excluir'));
 assert.deepEqual(errors,[]);console.log('BROWSER PASS: six identical exports, themes, worker, preview, first daily guard, import, cancel deletion.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});



