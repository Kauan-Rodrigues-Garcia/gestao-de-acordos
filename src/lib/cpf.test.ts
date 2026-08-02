/**
 * cpf.test.ts — o reconhecedor de CPF que guarda o campo de código.
 *
 * O que se perde se isto quebrar, nos dois sentidos:
 *   • frouxo demais → CPF de cliente entra no banco, contra a política que a
 *     diretoria fixou em 28/07/2026;
 *   • rígido demais → o operador não consegue tabular um código legítimo e não
 *     entende o motivo. O segundo é o pior dos dois.
 */
import { describe, it, expect } from 'vitest';
import {
  ehCpf, apenasDigitos, contemCpf, camposComCpf, acordoTemCpf, avisoCpfDoAcordo,
  PADROES_CPF,
} from './cpf';

// CPFs com dígitos verificadores válidos (gerados para o teste, não reais).
const CPF_VALIDO      = '52998224725';
const CPF_VALIDO_2    = '16899535009';
const CPF_MASCARADO   = '529.982.247-25';

describe('apenasDigitos', () => {
  it('tira máscara, espaço e o que mais vier', () => {
    expect(apenasDigitos('529.982.247-25')).toBe('52998224725');
    expect(apenasDigitos(' 529 982 247 25 ')).toBe('52998224725');
  });

  it('nulo e indefinido viram string vazia', () => {
    expect(apenasDigitos(null)).toBe('');
    expect(apenasDigitos(undefined)).toBe('');
    expect(apenasDigitos('')).toBe('');
  });
});

describe('ehCpf — reconhece', () => {
  it('CPF válido, com e sem máscara', () => {
    expect(ehCpf(CPF_VALIDO)).toBe(true);
    expect(ehCpf(CPF_MASCARADO)).toBe(true);
    expect(ehCpf(CPF_VALIDO_2)).toBe(true);
  });

  it('CPF colado com espaços em volta', () => {
    expect(ehCpf('  529.982.247-25  ')).toBe(true);
  });
});

describe('ehCpf — NÃO bloqueia trabalho legítimo', () => {
  it('códigos reais do ERP passam', () => {
    // Conferidos nos relatórios de julho/2026: os códigos de cliente têm 7
    // dígitos e os NrDocumento 8. Se algum deles fosse recusado, o operador
    // ficaria sem conseguir tabular.
    for (const codigo of ['4141294', '3137004', '6016114', '80332997', '12904826', '80409419']) {
      expect(ehCpf(codigo)).toBe(false);
    }
  });

  it('número de 11 dígitos com verificador errado passa', () => {
    // É o preço consciente da precisão: só recusamos o que É um CPF.
    expect(ehCpf('12345678901')).toBe(false);
  });

  it('sequência de um dígito só é recusada como CPF', () => {
    // Passa na conta dos verificadores — o caso clássico que engana validador
    // ingênuo. Não é CPF, mas também não é código: os dois lados concordam.
    for (const seq of ['00000000000', '11111111111', '99999999999']) {
      expect(ehCpf(seq)).toBe(false);
    }
  });

  it('tamanho errado nunca é CPF', () => {
    expect(ehCpf('5299822472')).toBe(false);    // 10
    expect(ehCpf('529982247250')).toBe(false);  // 12
    expect(ehCpf('')).toBe(false);
  });

  it('texto, nulo e indefinido não quebram', () => {
    expect(ehCpf(null)).toBe(false);
    expect(ehCpf(undefined)).toBe(false);
    expect(ehCpf('INS-100')).toBe(false);
    expect(ehCpf('abc')).toBe(false);
    expect(ehCpf({})).toBe(false);
  });

  it('CNPJ não é confundido com CPF', () => {
    // 14 dígitos — fora do escopo desta trava, mas não pode virar falso
    // positivo. Se um dia CNPJ também for bloqueado, é regra separada.
    expect(ehCpf('11222333000181')).toBe(false);
  });
});

describe('contemCpf — CPF escondido em texto livre', () => {
  it('acha no meio de uma frase', () => {
    expect(contemCpf('cliente Joao, CPF 529.982.247-25, ligar depois')).toBe(true);
    expect(contemCpf('doc 52998224725 conferido')).toBe(true);
  });

  it('acha com separadores variados', () => {
    expect(contemCpf('529 982 247 25')).toBe(true);
    expect(contemCpf('529.982.247 25')).toBe(true);
  });

  it('texto sem CPF passa', () => {
    expect(contemCpf('Maria da Silva')).toBe(false);
    expect(contemCpf('acordo 12904826 parcela 3/12')).toBe(false);
    expect(contemCpf('')).toBe(false);
    expect(contemCpf(null)).toBe(false);
  });

  it('CNPJ de 14 dígitos não vira CPF por recorte', () => {
    // Sem as ancoras de fronteira, um pedaco de 11 digitos de dentro do CNPJ
    // seria testado isoladamente e uma hora passaria nos verificadores.
    expect(contemCpf('CNPJ 11222333000181')).toBe(false);
    expect(contemCpf('protocolo 5299822472599999')).toBe(false);
  });

  it('numero longo que CONTEM um CPF nao dispara por acidente', () => {
    // O CPF valido 52998224725 esta dentro de uma sequencia maior: nao e um
    // CPF, e um numero comprido. A fronteira protege.
    expect(contemCpf('9052998224725')).toBe(false);
  });
});

describe('camposComCpf / acordoTemCpf / avisoCpfDoAcordo', () => {
  it('acordo limpo nao acusa nada', () => {
    const a = { instituicao: '4141294', nr_cliente: '', nome_cliente: 'Ana', observacoes: 'ligar 3a feira' };
    expect(camposComCpf(a)).toEqual([]);
    expect(acordoTemCpf(a)).toBe(false);
    expect(avisoCpfDoAcordo(a)).toBeNull();
  });

  it('nomeia o campo onde o CPF esta', () => {
    expect(camposComCpf({ instituicao: '52998224725' })).toEqual(['Código']);
    expect(camposComCpf({ nr_cliente: '529.982.247-25' })).toEqual(['NR']);
    expect(camposComCpf({ nome_cliente: 'Joao 52998224725' })).toEqual(['Nome do cliente']);
    expect(camposComCpf({ observacoes: 'CPF 529.982.247-25' })).toEqual(['Observações']);
  });

  it('lista todos os campos afetados, na ordem', () => {
    const a = { instituicao: '52998224725', observacoes: 'CPF 16899535009' };
    expect(camposComCpf(a)).toEqual(['Código', 'Observações']);
    expect(avisoCpfDoAcordo(a)).toMatch(/Código e Observações/);
  });

  it('o aviso diz o que fazer e a consequencia', () => {
    const aviso = avisoCpfDoAcordo({ instituicao: '52998224725' });
    expect(aviso).toMatch(/Remova o CPF/);
    expect(aviso).toMatch(/apagado/);
  });

  it('whatsapp NAO entra na checagem', () => {
    // Celular tem 11 digitos como o CPF: ~1% cairia nos verificadores por
    // acaso e o operador nao conseguiria salvar um telefone correto.
    expect(camposComCpf({ whatsapp: '52998224725' } as Record<string, unknown>)).toEqual([]);
  });

  it('nulo e indefinido nao quebram', () => {
    expect(acordoTemCpf(null)).toBe(false);
    expect(acordoTemCpf(undefined)).toBe(false);
    expect(camposComCpf(null)).toEqual([]);
    expect(avisoCpfDoAcordo(undefined)).toBeNull();
  });
});

describe('contemCpf — sem lookbehind (compatibilidade)', () => {
  it('nenhum dos padrões usa lookbehind', () => {
    // Lookbehind quebra no Safari < 16.4 com erro de SINTAXE, avaliado quando
    // o módulo carrega — a tela inteira morre, não só a checagem. Este teste
    // existe para ninguém reintroduzir a construção "porque é mais curta".
    //
    // Olha o `.source` de cada padrão, não o corpo de `contemCpf`: as
    // expressões são constantes de módulo e não apareceriam no toString().
    for (const padrao of PADROES_CPF) {
      expect(padrao.source).not.toMatch(/\(\?<[=!]/);
    }
  });

  it('as duas varreduras cobrem os formatos que importam', () => {
    expect(contemCpf('529.982.247-25')).toBe(true);   // com ponto e traço
    expect(contemCpf('529 982 247 25')).toBe(true);   // com espaço
    expect(contemCpf('52998224725')).toBe(true);      // corrido
    expect(contemCpf('obs: 52998224725 fim')).toBe(true);
  });
});
