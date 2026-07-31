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

  it('os clones entram no escopo pela equipe', () => {
    // Clone é por equipe; é o join com `equipes` que traz o setor.
    expect(sql).toMatch(/equipe_operadores_clones[\s\S]*?JOIN public\.equipes/);
  });

  it('as três tabelas têm RLS ligada', () => {
    for (const t of ['comemoracoes', 'comemoracao_homenageados', 'comemoracao_parabens']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    }
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

  it('valor desconhecido cai no padrão em vez de quebrar a tela', () => {
    expect(efeitoValido('efeito-de-versao-futura')).toBe('confete');
    expect(somValido(null)).toBe('fanfarra');
  });

  it('valor conhecido é preservado', () => {
    expect(efeitoValido('fogos')).toBe('fogos');
    expect(somValido('sino')).toBe('sino');
  });
});
