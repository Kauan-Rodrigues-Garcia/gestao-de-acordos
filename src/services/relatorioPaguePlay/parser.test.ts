import { describe, expect, it } from 'vitest';
import { utils, write } from '@e965/xlsx';
import { centavos, validarPeriodo } from './modelo';
import { dataISO, lerArquivo, lerLinhas } from './parser';

const cabecalho = ['Período','Data','Id.Baixa','UF Coren','Cód.Acordo','Parcela','Forma Pgto','Valor Recebido','Pague Play','Coren','Cofen','Dt.Pagamento','IA'];
const linha = ['Pagamento - 2026/09', '11/09/2026', '6934206', 'PE', '5800255', 1, 'Pix', 290.44, 65.64, 170.31, 54.49, '11/09/2026', ''];
const rodape = [null,null,null,null,null,null,null,290.44,65.64,170.31,54.49];

describe('945 da diretoria', () => {
  it('lê as divisões do ERP, não as percentagens antigas do HTML', () => {
    const r = lerLinhas([cabecalho, linha, rodape]);
    expect(r.totais).toEqual({ total:29044, pp:6564, coren:17031, cofen:5449 });
    expect(r.linhas).toHaveLength(1);
    expect(r.rodapeConferido).toBe(true);
  });
  it('aceita divisões diferentes dentro do mesmo arquivo', () => {
    const outra = [...linha]; outra[2]='2'; outra[8]=72.50; outra[9]=163.45;
    const r = lerLinhas([cabecalho,linha,outra]);
    expect(r.totais).toEqual({ total:58088, pp:13814, coren:33376, cofen:10898 });
  });
  it('não deduz percentuais quando falta coluna financeira', () => {
    expect(() => lerLinhas([cabecalho.filter(c=>c!=='Coren'),linha])).toThrow('Coluna obrigatória');
  });
  it('não transforma célula monetária vazia em zero', () => {
    const l=[...linha];l[9]='';
    expect(()=>lerLinhas([cabecalho,l])).toThrow('Linha 2');
  });
  it('não soma o rodapé como um pagamento', () => {
    expect(lerLinhas([cabecalho,linha,rodape]).linhas).toHaveLength(1);
  });
  it('rejeita diferença de um centavo no rodapé', () => {
    const f=[...rodape];f[7]=290.45;
    expect(()=>lerLinhas([cabecalho,linha,f])).toThrow('não confere');
  });
  it('confere rodapé parcial sem inventar zero para coluna ausente', () => {
    const f=[...rodape];f[9]=null;
    const r=lerLinhas([cabecalho,linha,f]);
    expect(r.totais.coren).toBe(17031);expect(r.rodapeConferido).toBe(false);
    expect(r.camposConferidos).toEqual(['total','cofen','pp']);
    f[8]=65.65;expect(()=>lerLinhas([cabecalho,linha,f])).toThrow('não confere');
  });
  it('ignora repetição idêntica por Id.Baixa', () => {
    const r=lerLinhas([cabecalho,linha,linha]);
    expect(r.duplicadas).toBe(1);expect(r.totais.total).toBe(29044);
  });
  it('rejeita duplicação com valor divergente', () => {
    const l=[...linha];l[7]=290.45;
    expect(()=>lerLinhas([cabecalho,linha,l])).toThrow('divergentes');
  });
  describe('cartão estornado (formato de 30/09/2026)', () => {
    // Recorte real do hj conci: o mesmo Id.Baixa vem pago («Estornado») e estornado («Estorno»).
    const pago = ['Conciliação - 2026/09', 46294, '6637759', 'CE', '5590866', 5, 'Cartão Padrão - Estornado', 120.91, 60.38, 136.08, 45.36, 46141, ''];
    const estorno = ['Conciliação - 2026/09', 46294, '6637759', 'CE', '5590866', 5, 'Cartão Padrão - Estorno', -120.91, -60.38, -136.08, -45.36, 46141, ''];
    it('junta o par numa linha só, com valor líquido zero e forma Estornado', () => {
      const r = lerLinhas([cabecalho, pago, estorno, [null,null,null,null,null,null,null,0,0,0,0]]);
      expect(r.linhas).toHaveLength(1);
      expect(r.estornos).toBe(1);
      expect(r.linhas[0]).toMatchObject({ id_baixa: '6637759', forma: 'Cartão Padrão - Estornado', total: 0, pp: 0, coren: 0, cofen: 0 });
      expect(r.totais).toEqual({ total: 0, pp: 0, coren: 0, cofen: 0 });
      expect(r.rodapeConferido).toBe(true);
    });
    it('aceita o estorno antes da linha estornada', () => {
      const r = lerLinhas([cabecalho, estorno, pago]);
      expect(r.linhas[0].forma).toBe('Cartão Padrão - Estornado');
      expect(r.totais.total).toBe(0);
    });
    it('não mistura o estorno com os outros pagamentos do arquivo', () => {
      const outra = [...linha]; outra[0] = 'Conciliação - 2026/09';
      const r = lerLinhas([cabecalho, outra, pago, estorno]);
      expect(r.linhas).toHaveLength(2);
      expect(r.totais.total).toBe(29044);
    });
    it('recusa estorno cujo valor não é o inverso do pagamento', () => {
      const e = [...estorno]; e[7] = -120.90;
      expect(() => lerLinhas([cabecalho, pago, e])).toThrow('divergentes');
    });
    it('recusa estorno sozinho, sem a linha estornada', () => {
      expect(() => lerLinhas([cabecalho, estorno])).toThrow('sem a linha «Estornado»');
    });
    it('continua recusando repetição divergente que não é estorno', () => {
      const e = [...estorno]; e[6] = 'Pix';
      expect(() => lerLinhas([cabecalho, pago, e])).toThrow('divergentes');
    });
  });
  it('pagamentos diferentes do mesmo acordo não são descartados', () => {
    const l=[...linha];l[2]='2';l[5]=2;
    expect(lerLinhas([cabecalho,linha,l]).linhas).toHaveLength(2);
  });
  it('não importa sem identificador único', () => {
    const l=[...linha];l[2]='';
    expect(()=>lerLinhas([cabecalho,l])).toThrow('Id.Baixa');
  });
  it('preserva as datas distintas de competência e pagamento', () => {
    const l=[...linha];l[1]='01/09/2026';l[11]='31/08/2026';
    const r=lerLinhas([cabecalho,l]);expect(r.linhas[0].data).toBe('2026-09-01');expect(r.linhas[0].data_pagamento).toBe('2026-08-31');
  });
  it('rejeita UF inválida em vez de descartar dinheiro', () => {
    const l=[...linha];l[3]='XX';expect(()=>lerLinhas([cabecalho,l])).toThrow('UF');
  });
  it('preserva valores negativos e zero do ERP', () => {
    const l=[...linha];l[7]=-100;l[8]=0;l[9]=-80;l[10]=-20;
    expect(lerLinhas([cabecalho,l]).totais).toEqual({ total:-10000,pp:0,coren:-8000,cofen:-2000 });
  });
  it('lê um XLSX real com datas seriais', () => {
    const wb=utils.book_new();const l=[...linha];l[1]=46276;l[11]=46276;
    utils.book_append_sheet(wb,utils.aoa_to_sheet([cabecalho,l,rodape]),'945');
    const r=lerArquivo(write(wb,{type:'array',bookType:'xlsx'}));
    expect(r.totais.total).toBe(29044);expect(r.linhas[0].data).toBe(dataISO(46276));
  });
});

describe('precisão e período', () => {
  it.each([[290.44,29044],['R$ 1.234,56',123456],['0,01',1],[-0.01,-1],['-10.05',-1005],[0.29,29]])('converte %s em centavos exatos', (v,n)=>expect(centavos(v)).toBe(n));
  it.each(['',null,'abc','1.234',1.005,Infinity,NaN])('rejeita valor inválido %s',v=>expect(()=>centavos(v)).toThrow());
  it('rejeita datas inexistentes',()=>expect(()=>dataISO('31/02/2026')).toThrow());
  it('primeira atualização exige ontem e hoje, inclusive virada de mês',()=>{
    expect(()=>validarPeriodo('2026-10-01','2026-10-01','2026-10-01',true)).toThrow('ontem e hoje');
    expect(()=>validarPeriodo('2026-09-30','2026-10-01','2026-10-01',true)).not.toThrow();
  });
  it('atualizações seguintes permitem só hoje',()=>expect(()=>validarPeriodo('2026-09-11','2026-09-11','2026-09-11',false)).not.toThrow());
  it('permite recuperar histórico sem bloquear meses',()=>expect(()=>validarPeriodo('2026-01-01','2026-01-31','2026-09-11',true)).not.toThrow());
  it('rejeita período futuro ou invertido',()=>{
    expect(()=>validarPeriodo('2026-09-12','2026-09-12','2026-09-11',false)).toThrow();
    expect(()=>validarPeriodo('2026-09-11','2026-09-10','2026-09-11',false)).toThrow();
  });
});
