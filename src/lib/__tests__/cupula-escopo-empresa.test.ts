/**
 * cupula-escopo-empresa.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * "Quem pertence à empresa em vez de a um setor?" está respondido em TRÊS
 * lugares que não conversam:
 *
 *   1. `PERFIS_ESCOPO_EMPRESA`, que o formulário de usuários lê para esconder o
 *      campo de setor;
 *   2. o gatilho `fn_perfis_escopo_empresa`, que zera setor/equipe na gravação;
 *   3. a constraint `perfis_cupula_sem_vinculo`, a rede de segurança do gatilho.
 *
 * Divergir aqui não dá erro em lugar nenhum. Dá uma tela que oferece escolher
 * setor e um banco que descarta a escolha — ou o contrário, um cargo que o banco
 * recusa e a tela deixa salvar.
 *
 * Este projeto já pagou por essa classe de defeito quatro vezes com "quem pode
 * autorizar tabulação" e "quem conta no recebimento". Ver `PERFIS_AUTORIZADORES`
 * e `PERFIS_QUE_CONTAM_NO_RECEBIMENTO` em `src/lib/index.ts`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PERFIS_ESCOPO_EMPRESA, ehEscopoEmpresa,
  PERFIS_QUE_CONTAM_NO_RECEBIMENTO, PERFIS_LIDER,
} from '../index';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

const SQL = (() => {
  // `endsWith('.sql')` não é decoração. Sem ele, um `.sql.bk` deixado no
  // diretório casa com o padrão do nome e, sendo mais longo com o mesmo prefixo,
  // ordena À FRENTE do arquivo real num `sort().reverse()`. A guarda passaria a
  // ler o backup e a aprovar qualquer divergência no arquivo verdadeiro — foi
  // exatamente o que aconteceu ao testar esta guarda pela primeira vez.
  const arquivo = fs.readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql') && /cupula_escopo_empresa/.test(f))
    .sort().reverse()[0];
  if (!arquivo) throw new Error('migration cupula_escopo_empresa não encontrada');
  return fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8');
})();

/** Os cargos que aparecem num `perfil in (...)` do SQL, na ordem em que vêm. */
function cargosDoSql(trecho: string): string[] {
  const m = /perfil\s+(?:not\s+)?in\s*\(([^)]*)\)/i.exec(trecho);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
}

describe('a lista é a mesma no TypeScript e no banco', () => {
  it('são exatamente diretoria, administrador e super_admin', () => {
    expect([...PERFIS_ESCOPO_EMPRESA].sort())
      .toEqual(['administrador', 'diretoria', 'super_admin']);
  });

  it('o gatilho zera o vínculo para os mesmos cargos', () => {
    const corpo = /create or replace function public\.fn_perfis_escopo_empresa[\s\S]*?\$function\$;/i
      .exec(SQL);
    expect(corpo, 'a função do gatilho mudou de forma').not.toBeNull();
    expect(cargosDoSql(corpo![0]).sort()).toEqual([...PERFIS_ESCOPO_EMPRESA].sort());
  });

  it('a constraint cobre os mesmos cargos', () => {
    const chk = /add constraint perfis_cupula_sem_vinculo check \(([\s\S]*?)\);/i.exec(SQL);
    expect(chk, 'a constraint mudou de forma').not.toBeNull();
    expect(cargosDoSql(chk![0]).sort()).toEqual([...PERFIS_ESCOPO_EMPRESA].sort());
  });

  it('o gatilho zera setor E equipe, não só o setor', () => {
    const corpo = /create or replace function public\.fn_perfis_escopo_empresa[\s\S]*?\$function\$;/i
      .exec(SQL)![0];
    expect(corpo).toMatch(/new\.setor_id\s*:=\s*null/i);
    expect(corpo).toMatch(/new\.equipe_id\s*:=\s*null/i);
  });

  it('a constraint exige os dois nulos', () => {
    const chk = /add constraint perfis_cupula_sem_vinculo check \(([\s\S]*?)\);/i.exec(SQL)![1];
    expect(chk).toMatch(/setor_id\s+is\s+null/i);
    expect(chk).toMatch(/equipe_id\s+is\s+null/i);
  });
});

describe('o gatilho dispara antes das validações', () => {
  /**
   * `perfis` tem outros gatilhos BEFORE UPDATE (`trg_impedir_escalada_de_cargo`,
   * `trg_perfis_updated`) e o PostgreSQL os dispara em ordem ALFABÉTICA. O
   * prefixo `a_` garante que o vínculo é normalizado antes de qualquer validação
   * julgar um valor que vai ser descartado.
   */
  it('o nome começa com o prefixo que ordena primeiro', () => {
    const m = /create trigger (\S+)\s+before insert or update on public\.perfis/i.exec(SQL);
    expect(m, 'o gatilho mudou de forma').not.toBeNull();
    expect(m![1]).toBe('a_trg_perfis_escopo_empresa');
    expect(m![1] < 'block_empresa_id_update').toBe(true);
    expect(m![1] < 'trg_impedir_escalada_de_cargo').toBe(true);
  });

  it('cobre INSERT e UPDATE — criar e editar têm o mesmo dono da regra', () => {
    expect(SQL).toMatch(/before insert or update on public\.perfis/i);
  });
});

describe('a constraint entra DEPOIS de mover os perfis existentes', () => {
  /**
   * Um CHECK novo valida as linhas que já existem. Com os 7 perfis ainda
   * carimbados, ele recusaria a própria migration — e o erro apareceria como
   * 23514 na tela de quem aplica, sem dizer que a ordem é o problema.
   */
  it('o UPDATE vem antes do ADD CONSTRAINT', () => {
    const posUpdate = SQL.search(/update public\.perfis\s*\n\s*set setor_id\s*=\s*null/i);
    const posCheck  = SQL.search(/add constraint perfis_cupula_sem_vinculo/i);
    expect(posUpdate).toBeGreaterThan(-1);
    expect(posCheck).toBeGreaterThan(-1);
    expect(posUpdate).toBeLessThan(posCheck);
  });
});

describe('quem NÃO é cúpula continua pertencendo a um setor', () => {
  it('gerência tem setor — vê a empresa mas é de um setor', () => {
    // `ver_todos_setores` é false para gerência nas duas empresas; ela não entra
    // na cúpula por ser "quase diretoria".
    expect(ehEscopoEmpresa('gerencia')).toBe(false);
  });

  it('nenhum cargo que conta no recebimento é de escopo de empresa', () => {
    // Se um deles entrasse, perderia setor e sumiria dos quartis e do ranking.
    for (const cargo of PERFIS_QUE_CONTAM_NO_RECEBIMENTO) {
      expect(ehEscopoEmpresa(cargo)).toBe(false);
    }
  });

  it('nenhum cargo de líder é de escopo de empresa', () => {
    // `perfis_lider_update` compara `setor_id = fn_user_setor_id()`: um líder sem
    // setor perderia a permissão de editar o próprio time.
    for (const cargo of PERFIS_LIDER) {
      expect(ehEscopoEmpresa(cargo)).toBe(false);
    }
  });

  it('operador não é', () => {
    expect(ehEscopoEmpresa('operador')).toBe(false);
  });
});

describe('ehEscopoEmpresa aceita entrada suja', () => {
  it('nulo e vazio não são cúpula', () => {
    expect(ehEscopoEmpresa(null)).toBe(false);
    expect(ehEscopoEmpresa(undefined)).toBe(false);
    expect(ehEscopoEmpresa('')).toBe(false);
  });

  it('normaliza caixa e espaços', () => {
    expect(ehEscopoEmpresa('  DIRETORIA ')).toBe(true);
    expect(ehEscopoEmpresa('Super_Admin')).toBe(true);
  });

  it('cargo desconhecido não vira cúpula por acidente', () => {
    expect(ehEscopoEmpresa('diretor')).toBe(false);
    expect(ehEscopoEmpresa('admin')).toBe(false);
  });
});
