import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/supabaseSemTipo',()=>({rpcSemTipo:rpc}));
import { importarRelatorio } from './service';
import { zerarValores, type RelatorioLido } from './modelo';

const linha={id_baixa:'1',data:'2026-09-11',data_pagamento:'2026-09-11',uf:'PE',acordo:'1',parcela:'1',forma:'Pix',ia:'',total:100,pp:20,coren:60,cofen:20};
const relatorio:RelatorioLido={linhas:[linha],totais:{total:100,pp:20,coren:60,cofen:20},duplicadas:0,rodapeConferido:false,camposConferidos:[],inicio:'2026-09-11',fim:'2026-09-11',modalidade:'pagamento'};
beforeEach(()=>{rpc.mockReset();});
describe('envio atômico do relatório',()=>{
  it('só conclui depois de enviar todos os blocos',async()=>{
    const linhas=Array.from({length:3001},(_,i)=>({...linha,id_baixa:String(i)}));
    rpc.mockImplementation(async(_n,args)=>({data:args.p_acao==='abrir'?'lote':args.p_acao==='concluir'?{inseridos:3001,ignorados:0}:null,error:null}));
    await importarRelatorio('empresa','pagamento','945.xlsx',{...relatorio,linhas,totais:zerarValores()},'2026-09-10','2026-09-11',()=>{});
    expect(rpc.mock.calls.map(c=>c[1].p_acao)).toEqual(['abrir','adicionar','adicionar','adicionar','concluir']);
    expect(rpc.mock.calls[2][1].p_dados.linhas).toHaveLength(1500);
    expect(rpc.mock.calls[3][1].p_dados.linhas).toHaveLength(1);
  });
  it('falha no envio cancela o lote sem confirmar nem apagar histórico',async()=>{
    rpc.mockResolvedValueOnce({data:'lote',error:null}).mockResolvedValueOnce({data:null,error:{message:'rede caiu'}}).mockResolvedValueOnce({data:null,error:null});
    await expect(importarRelatorio('empresa','pagamento','945.xlsx',relatorio,'2026-09-10','2026-09-11',()=>{})).rejects.toThrow('rede caiu');
    expect(rpc.mock.calls.map(c=>c[1].p_acao)).toEqual(['abrir','adicionar','cancelar']);
  });
});
