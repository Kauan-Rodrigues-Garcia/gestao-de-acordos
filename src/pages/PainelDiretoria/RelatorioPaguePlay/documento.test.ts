import { describe, expect, it } from 'vitest';
import original from './original.html?raw';
import { documentoRelatorio } from './documento';

describe('fidelidade do HTML da diretoria',()=>{
  const documento=documentoRelatorio();
  it('preserva os estilos e as imagens originais',()=>{
    expect(documento.match(/<style>([\s\S]*?)<\/style>/)?.[1]).toBe(original.match(/<style>([\s\S]*?)<\/style>/)?.[1]);
    expect(documento.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/g)).toEqual(original.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/g));
  });
  it('mantém intacta a função de captura das três imagens',()=>{
    const extrair=(s:string)=>s.slice(s.indexOf('async function copyImg('),s.indexOf('function buildTextoAtualizado('));
    expect(extrair(documento)).toBe(extrair(original));
  });
  it('mantém os três textos copiados, com os valores de cada modalidade',()=>{
    const extrair=(s:string)=>s.slice(s.indexOf('function buildTexts('),s.indexOf('function copyTxt('));
    expect(extrair(documento)).toBe(extrair(original));
  });
  it('não executa a inicialização do arquivo avulso nem seu importador externo',()=>{
    expect(documento).not.toContain("document.addEventListener('DOMContentLoaded'");
    expect(documento).not.toContain('<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx');
    expect(documento).toContain('const origemIntegracao=window.origin');
  });
  it('o dia e o mês seguem a coluna Data, como o filtro do ERP, e não Dt.Pagamento',()=>{
    // Conciliação de 29/09/2026: R$ 249.779,33 com Data = hoje, só R$ 211.935,06
    // com Dt.Pagamento = hoje. O "recebido no dia" tem de mostrar o arquivo inteiro.
    expect(documento).toContain('d:t.data,dAcumuladoMes:t.data');
    expect(documento).not.toContain('d:t.data_pagamento');
  });
});
