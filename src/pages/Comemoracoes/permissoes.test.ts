/**
 * permissoes.test.ts — o front e a RLS falam a mesma coisa?
 *
 * Este teste LÊ a migration e compara com a constante do front. Sem ele, mudar
 * a lista de um lado só produz botão que aparece e banco que recusa — foi
 * exatamente o que aconteceu com as 12 permissões mortas do Admin → Cargos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERFIS_CRIA_COMEMORACAO, podeCriarComemoracao } from './permissoes';
import { EFEITOS, SONS, efeitoValido, somValido } from './catalogo';

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20260731e_comemoracoes.sql',
);

const sql = readFileSync(MIGRATION, 'utf-8');

/** Alvo por equipe e a pergunta do clone. */
const SQL_20260810A = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260810a_comemoracao_equipe_e_clones.sql'),
  'utf-8',
);

describe('cargos que criam comemoração', () => {
  it('a lista do front bate com fn_comemoracao_pode_criar', () => {
    const bloco = sql.match(/fn_comemoracao_pode_criar[\s\S]*?ARRAY\[([^\]]+)\]/);
    expect(bloco, 'função fn_comemoracao_pode_criar não encontrada na migration').toBeTruthy();

    const naMigration = bloco![1]
      .split(',')
      .map((c) => c.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort();

    expect(naMigration).toEqual([...PERFIS_CRIA_COMEMORACAO].sort());
  });

  it('operador não cria', () => {
    expect(podeCriarComemoracao('operador')).toBe(false);
  });

  it('líder cria', () => {
    expect(podeCriarComemoracao('lider')).toBe(true);
  });

  it('sem perfil não cria', () => {
    expect(podeCriarComemoracao(null)).toBe(false);
    expect(podeCriarComemoracao(undefined)).toBe(false);
  });
});

describe('garantias que estão no banco', () => {
  it('um parabéns por pessoa é PK, não regra de tela', () => {
    expect(sql).toMatch(/PRIMARY KEY \(comemoracao_id, usuario_id\)/);
  });

  it('a duração é limitada por CHECK', () => {
    expect(sql).toMatch(/duracao_s[\s\S]*?CHECK \(duracao_s BETWEEN 5 AND 60\)/);
  });

  it('setores_alvo vem de trigger, não do cliente', () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_comemoracao_setores_alvo/);
  });

  it('os clones são achados pela equipe', () => {
    // Clone é por equipe; é o join com `equipes` que traz o setor. Desde a
    // 20260810a esta função só OFERECE as opções da pergunta — quem decide o
    // setor é quem monta a comemoração.
    expect(sql).toMatch(/equipe_operadores_clones[\s\S]*?JOIN public\.equipes/);
  });

  it('as três tabelas têm RLS ligada', () => {
    for (const t of ['comemoracoes', 'comemoracao_homenageados', 'comemoracao_parabens']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });
});

describe('alvo por equipe e clone escolhido (20260810a)', () => {
  it('as colunas novas nascem com o comportamento antigo', () => {
    // Vazio/false = "não estreita" e "sem escolha": toda comemoração já
    // existente continua se comportando como antes da migration.
    expect(SQL_20260810A).toMatch(/somente_equipe BOOLEAN NOT NULL DEFAULT false/);
    expect(SQL_20260810A).toMatch(/equipes_alvo\s+UUID\[\]\s+NOT NULL DEFAULT '\{\}'/);
    expect(SQL_20260810A).toMatch(/setores_escolhidos UUID\[\] NOT NULL DEFAULT '\{\}'/);
  });

  it('a união automática dos clones saiu do cálculo do alvo', () => {
    // O que decide `setores_alvo` agora é `setores_escolhidos`. Se alguém
    // reintroduzir `fn_setores_do_operador` aqui, a pergunta vira decoração.
    const trigger = SQL_20260810A.match(
      /FUNCTION public\.fn_comemoracao_setores_alvo[\s\S]*?\$\$;/,
    );
    expect(trigger, 'fn_comemoracao_setores_alvo não encontrada').toBeTruthy();
    expect(trigger![0]).toMatch(/setores_escolhidos/);
    expect(trigger![0]).not.toMatch(/fn_setores_do_operador/);
  });

  it('meta de setor não pode ser estreitada para uma equipe', () => {
    // É a comemoração da empresa inteira; recortar por equipe se contradiz.
    expect(SQL_20260810A).toMatch(/alvo_tipo = 'setor'[\s\S]*?somente_equipe\s*:=\s*false/);
  });

  it('equipes_alvo do alvo por operadores é recortado pelos setores alvo', () => {
    // Clone cujo setor NÃO foi escolhido não pode arrastar a equipe dele.
    expect(SQL_20260810A).toMatch(/eq\.setor_id = ANY \(c\.setores_alvo\)/);
  });

  it('ligar a opção num UPDATE recalcula a plateia', () => {
    expect(SQL_20260810A).toMatch(
      /BEFORE INSERT OR UPDATE OF alvo_tipo, equipe_id, setor_id, somente_equipe/,
    );
  });
});

describe('catálogo', () => {
  it('o padrão do banco existe no catálogo do front', () => {
    // A migration nasce com efeito 'confete' e som 'fanfarra'; se alguém
    // renomear no front, a comemoração criada pelo default some da tela.
    expect(sql).toMatch(/efeito\s+TEXT NOT NULL DEFAULT 'confete'/);
    expect(sql).toMatch(/som\s+TEXT NOT NULL DEFAULT 'fanfarra'/);
    expect(EFEITOS.some((e) => e.id === 'confete')).toBe(true);
    expect(SONS.some((s) => s.id === 'fanfarra')).toBe(true);
  });

  it('o fundo tem as duas chuvas e a opção de não ter nenhuma', () => {
    expect(EFEITOS.map((e) => e.id).sort()).toEqual(['chuva-moedas', 'confete', 'nenhum']);
  });

  it('fundo removido numa versão nova vira confete, não tela quebrada', () => {
    // 'fogos' e 'estrelas' existiram e saíram do catálogo; comemoração antiga
    // gravada com eles ainda precisa aparecer.
    expect(efeitoValido('fogos')).toBe('confete');
    expect(efeitoValido('estrelas')).toBe('confete');
    expect(efeitoValido('efeito-de-versao-futura')).toBe('confete');
    expect(somValido(null)).toBe('fanfarra');
  });

  it('valor conhecido é preservado', () => {
    expect(efeitoValido('chuva-moedas')).toBe('chuva-moedas');
    expect(somValido('sino')).toBe('sino');
  });
});
