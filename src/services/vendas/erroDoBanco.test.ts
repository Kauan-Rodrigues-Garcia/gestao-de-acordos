import { describe, it, expect } from 'vitest';
import { classificarErro, pareceNaoInstalado, mensagemDoErro } from './erroDoBanco';

/*
 * A mensagem que custou horas em 15/09/2026.
 *
 * `vendas_lotes.importado_por` nasceu sem FOREIGN KEY; o PostgREST monta os
 * joins da API a partir das FKs, e a tela pedia `perfis:importado_por`. O texto
 * cita «could not find» e «schema cache» — as duas coisas que o regex antigo
 * procurava — então a tela disse «aplique a migration» sobre uma migration que
 * já estava no ar.
 */
const SEM_VINCULO =
  "Could not find a relationship between 'vendas_lotes' and 'perfis' in the schema cache";

const TABELA_AUSENTE_PG = 'relation "public.vendas_lotes" does not exist';
const TABELA_AUSENTE_REST =
  "Could not find the table 'public.vendas_lotes' in the schema cache";
const CACHE = 'Something changed in the schema cache, retry';

describe('vínculo que falta NÃO é tabela que falta', () => {
  it('a mensagem de relacionamento é classificada como falta de FK', () => {
    expect(classificarErro(SEM_VINCULO)).toBe('sem_vinculo');
  });

  it('e por isso NÃO manda aplicar migration', () => {
    expect(pareceNaoInstalado(SEM_VINCULO)).toBe(false);
  });

  it('a mensagem na tela diz o que é, e entrega o detalhe do banco', () => {
    const texto = mensagemDoErro(SEM_VINCULO, 'A importação de vendas', '20260915110000.sql');
    expect(texto).toContain('chave estrangeira');
    expect(texto).not.toContain('precisa ser aplicada');
    // O texto do banco nomeia as duas tabelas do vínculo — é o que resolve.
    expect(texto).toContain('vendas_lotes');
    expect(texto).toContain('perfis');
  });
});

describe('tabela que falta de verdade', () => {
  it('reconhece o texto do Postgres', () => {
    expect(classificarErro(TABELA_AUSENTE_PG)).toBe('ausente');
    expect(pareceNaoInstalado(TABELA_AUSENTE_PG)).toBe(true);
  });

  it('reconhece o texto do PostgREST', () => {
    expect(classificarErro(TABELA_AUSENTE_REST)).toBe('ausente');
    expect(pareceNaoInstalado(TABELA_AUSENTE_REST)).toBe(true);
  });

  it('e só aí manda aplicar a migration, nomeando o arquivo', () => {
    const texto = mensagemDoErro(TABELA_AUSENTE_PG, 'A aba Vendas', '20260915100000.sql');
    expect(texto).toContain('não existe neste banco');
    expect(texto).toContain('20260915100000.sql');
  });

  it('função ausente conta como ausente', () => {
    expect(classificarErro("Could not find the function public.fn_vendas_projetar"))
      .toBe('ausente');
  });
});

describe('cache é coisa de recarregar', () => {
  it('«schema cache» sozinho, sem dizer o que faltou, é cache', () => {
    expect(classificarErro(CACHE)).toBe('cache');
    expect(pareceNaoInstalado(CACHE)).toBe(false);
  });

  it('a mensagem pede para recarregar, e não para mexer em migration', () => {
    const texto = mensagemDoErro(CACHE, 'A importação de vendas', '20260915110000.sql');
    expect(texto).toContain('Recarregue a página');
    expect(texto).not.toContain('20260915110000.sql');
  });
});

describe('o resto passa como veio', () => {
  it('erro de permissão não vira «não instalado»', () => {
    const rls = 'new row violates row-level security policy for table "vendas"';
    expect(classificarErro(rls)).toBe('outro');
    expect(pareceNaoInstalado(rls)).toBe(false);
    expect(mensagemDoErro(rls, 'A aba Vendas')).toBe(rls);
  });

  it('a mensagem do banco chega inteira — ela é o que resolve', () => {
    const erro = 'Seu cargo não pode importar o relatório de vendas.';
    expect(mensagemDoErro(erro, 'A importação de vendas')).toBe(erro);
  });

  it('vazio não é erro classificável', () => {
    expect(classificarErro('')).toBe('outro');
    expect(classificarErro(null)).toBe('outro');
    expect(classificarErro(undefined)).toBe('outro');
    expect(mensagemDoErro('', 'A aba Vendas')).toBe('A aba Vendas não respondeu.');
  });
});

describe('a ordem das perguntas é o que faz funcionar', () => {
  /*
   * «Could not find a relationship ... in the schema cache» contém as duas
   * pistas das outras duas classificações. Se a pergunta do vínculo não vier
   * primeiro, ela cai em `ausente` — que foi exatamente o defeito.
   */
  it('a frase do vínculo contém as pistas das outras duas', () => {
    expect(SEM_VINCULO.toLowerCase()).toContain('could not find');
    expect(SEM_VINCULO.toLowerCase()).toContain('schema cache');
    // E mesmo assim não é nenhuma das duas.
    expect(classificarErro(SEM_VINCULO)).toBe('sem_vinculo');
  });
});
