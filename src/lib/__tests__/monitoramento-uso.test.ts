/**
 * monitoramento-uso.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O monitoramento de uso tem cinco funções no banco e um serviço no front que as
 * chama por nome, em string. Renomear uma no SQL e esquecer a outra não dá erro
 * de compilação: dá painel vazio, porque `ler()` transforma erro de RPC em lista
 * vazia de propósito — telemetria não deve derrubar tela.
 *
 * Painel vazio é indistinguível de "ninguém usou". Estes testes existem para que
 * a divergência apareça aqui, e não como uma conclusão errada sobre pessoas.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { telaComAba, TELA_LABEL } from '../telas-catalogo';

const RAIZ = path.resolve(__dirname, '../../..');
const MIGRATIONS = path.join(RAIZ, 'supabase/migrations');

/**
 * As migrations de uso, concatenadas.
 *
 * O filtro é pelo CONTEÚDO, e não pelo nome do arquivo.
 *
 * A lista era `/(monitoramento_uso|uso_detalhe)/`, e envelheceu duas vezes:
 * `uso_empresa_null` refez três funções e `uso_filtros_e_sem_acesso` refez
 * quatro e criou uma quinta — nenhuma das duas casava com o padrão, então a
 * guarda continuava conferindo assinaturas antigas e reprovando função nova.
 * Filtrar pelo que o arquivo FAZ não tem esse problema.
 *
 * `endsWith('.sql')`: um `.sql.bk` no diretório entraria na lista e poderia
 * mascarar o arquivo real. Já aconteceu neste projeto.
 */
const SQL = (() => {
  const arquivos = fs.readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => ({ nome: f, texto: fs.readFileSync(path.join(MIGRATIONS, f), 'utf8') }))
    .filter(a => /function\s+public\.fn_uso_/i.test(a.texto));
  if (arquivos.length === 0) throw new Error('migrations de uso não encontradas');
  return arquivos.map(a => a.texto).join('\n');
})();

const SERVICO = fs.readFileSync(path.join(RAIZ, 'src/services/uso.service.ts'), 'utf8');

const FUNCOES = [
  'fn_uso_registrar',
  'fn_uso_por_pessoa',
  'fn_uso_por_tela',
  'fn_uso_por_dia',
  'fn_uso_adocao_tela',
  'fn_uso_detalhe_pessoa',
  'fn_uso_detalhe_pessoa_dias',
  // A lista de quem NÃO usou o sistema — migration 20260824150000. Responde a
  // pergunta que a adoção de tela não responde: quem nunca entrou não aparece
  // na adoção de tela nenhuma.
  'fn_uso_sem_acesso',
] as const;

/**
 * A migration DEFINE esta função?
 *
 * Exige o `create or replace ... (` completo. Procurar só `function public.<nome>`
 * casaria com as linhas de `revoke` e `grant`, que continuam citando o nome
 * antigo quando alguém renomeia a definição e esquece o resto — foi exatamente
 * assim que esta guarda aprovou uma migration sabotada na primeira tentativa de
 * quebrá-la.
 *
 * O `(` no fim importa: sem ele, `fn_uso_por_tela` casaria com
 * `fn_uso_por_telaX`.
 */
function migrationDefine(fn: string): boolean {
  // Case-insensitive: as migrations antigas escrevem SQL em minúsculas e as
  // novas em maiúsculas. Exigir uma das duas grafias faria a guarda reprovar
  // uma função definida, que é o pior tipo de falso positivo — o que ela mede
  // é se a função existe, não como alguém digitou a palavra-chave.
  return new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'i',
  ).test(SQL);
}

describe('as funções existem nos dois lados', () => {
  it.each(FUNCOES)('%s é DEFINIDA na migration', (fn) => {
    expect(migrationDefine(fn), `create or replace de ${fn} não encontrado`).toBe(true);
  });

  it.each(FUNCOES)('%s é chamada pelo serviço', (fn) => {
    expect(SERVICO).toContain(`'${fn}'`);
  });

  it('a migration não deixa revoke/grant apontando para função que não existe', () => {
    const citadas = new Set(
      [...SQL.matchAll(/on function public\.(fn_uso_[a-z_]+)\(/g)].map(m => m[1]),
    );
    for (const fn of citadas) {
      expect(migrationDefine(fn), `${fn} tem revoke/grant mas não é definida`).toBe(true);
    }
  });

  it('o serviço não chama nenhuma RPC de uso que a migration não crie', () => {
    const chamadas = [...SERVICO.matchAll(/'(fn_uso_[a-z_]+)'/g)].map(m => m[1]);
    for (const c of new Set(chamadas)) {
      expect(FUNCOES as readonly string[], `${c} não está na lista conhecida`).toContain(c);
      expect(migrationDefine(c), `${c} não é definida na migration`).toBe(true);
    }
  });

  it('a tabela e os tipos do front concordam no nome', () => {
    expect(SQL).toMatch(/create table if not exists public\.uso_telas/i);
    const tipos = fs.readFileSync(path.join(RAIZ, 'src/lib/database.types.ts'), 'utf8');
    expect(tipos).toContain('uso_telas: {');
  });
});

describe('escrita só pela RPC', () => {
  /**
   * `uso_telas` não pode ter policy de INSERT/UPDATE. Um painel de uso que aceita
   * números vindos direto do cliente não mede nada — qualquer pessoa com um token
   * infla o próprio uso ou o de outra.
   */
  it('não há policy de escrita na migration', () => {
    const policies = [...SQL.matchAll(/create policy (\S+) on public\.uso_telas\s+for (\w+)/gi)];
    expect(policies.length).toBeGreaterThan(0);
    for (const [, nome, cmd] of policies) {
      expect(cmd.toLowerCase(), `policy ${nome} permite escrita`).toBe('select');
    }
  });

  it('a leitura é travada em super_admin/administrador, igual aos logs', () => {
    const sel = /create policy uso_telas_select[\s\S]*?;/i.exec(SQL);
    expect(sel).not.toBeNull();
    expect(sel![0]).toMatch(/fn_user_is_super_admin/);
    expect(sel![0]).toMatch(/administrador/);
    // Diretoria e líder ficaram fora dos logs por decisão explícita; uso é dado
    // da mesma natureza e segue a mesma trava.
    expect(sel![0]).not.toMatch(/'diretoria'/);
    expect(sel![0]).not.toMatch(/'lider'/);
  });

  it('a RPC de registro resolve a identidade por auth.uid(), não por parâmetro', () => {
    const corpo = /create or replace function public\.fn_uso_registrar[\s\S]*?\$function\$;/i.exec(SQL);
    expect(corpo).not.toBeNull();
    expect(corpo![0]).toMatch(/auth\.uid\(\)/);
    // Nenhum parâmetro de usuário: os únicos são tela, segundos e abertura.
    expect(corpo![0]).not.toMatch(/p_usuario/);
  });

  it('as funções de leitura NÃO são SECURITY DEFINER', () => {
    // DEFINER aqui contornaria a policy para qualquer um com EXECUTE.
    for (const fn of ['fn_uso_por_pessoa', 'fn_uso_por_tela', 'fn_uso_por_dia', 'fn_uso_adocao_tela']) {
      const corpo = new RegExp(`create or replace function public\\.${fn}[\\s\\S]*?\\$function\\$;`, 'i')
        .exec(SQL);
      expect(corpo, `${fn} não encontrada`).not.toBeNull();
      expect(corpo![0], `${fn} está DEFINER`).not.toMatch(/security definer/i);
      expect(corpo![0], `${fn} deveria declarar security invoker`).toMatch(/security invoker/i);
    }
  });
});

describe('limites que protegem a tabela', () => {
  /** O identificador vem do cliente e é chave primária. */
  it('a RPC corta o nome da tela em 120 caracteres', () => {
    expect(SQL).toMatch(/left\(\s*v_tela\s*,\s*120\s*\)/i);
  });

  it('nenhum rótulo do catálogo passa do limite do banco', () => {
    for (const chave of Object.keys(TELA_LABEL)) {
      expect(chave.length, `identificador longo: ${chave}`).toBeLessThanOrEqual(120);
    }
  });

  /**
   * O cliente manda o intervalo desde o último envio. Relógio errado, máquina que
   * hibernou ou payload adulterado mandariam horas numa tacada.
   */
  it('a RPC limita os segundos de um envio', () => {
    expect(SQL).toMatch(/least\(greatest\(coalesce\(p_segundos, 0\), 0\), 3600\)/i);
  });

  it('o dia é o de São Paulo, não UTC', () => {
    // 22h de terça em Brasília é 01h de quarta em UTC: cairia no dia seguinte.
    expect(SQL).toMatch(/at time zone 'America\/Sao_Paulo'/);
  });
});

describe('retenção própria, separada da auditoria', () => {
  it('180 dias, não os 730 da trilha', () => {
    expect(SQL).toMatch(/fn_uso_expurgar\(180\)/);
    expect(SQL).toMatch(/p_dias integer default 180/i);
  });

  it('tem piso — não se apaga tudo por acidente', () => {
    expect(SQL).toMatch(/p_dias\s*<\s*30/);
  });

  it('não é alcançável por quem tem um token', () => {
    expect(SQL).toMatch(
      /revoke all on function public\.fn_uso_expurgar\(integer\) from public, anon, authenticated/i,
    );
  });

  it('registra a execução na trilha, inclusive quando não apaga nada', () => {
    expect(SQL).toMatch(/insert into public\.logs_sistema/i);
    // `origem` só aceita ui/trigger/api/importacao/automatico/anon.
    expect(SQL).toMatch(/'automatico'/);
    expect(SQL).not.toMatch(/'sistema',\s*'uso_telas'/);
  });

  it('reagendar não duplica o trabalho', () => {
    expect(SQL).toMatch(/cron\.unschedule\('uso-telas-expurgo-180d'\)/);
  });

  it('não colide com horário de trabalho já agendado', () => {
    const agenda = /cron\.schedule\('uso-telas-expurgo-180d',\s*'([^']+)'/.exec(SQL);
    expect(agenda).not.toBeNull();
    expect(['17 4 * * *', '50 2 * * *', '*/10 * * * *', '40 3 1 * *'])
      .not.toContain(agenda![1]);
  });
});

describe('as telas que o painel existe para medir', () => {
  /**
   * A pergunta que originou a tela: "quais líderes acessam mais o Painel Líder e
   * o Desempenho Equipes". As abas do Painel Líder precisam ter identificador
   * próprio, senão as quatro aparecem somadas como um único `/lider`.
   */
  it('cada aba do Painel Líder tem identificador próprio', () => {
    const abas = ['time', 'desempenho', 'quartis', 'grafico'];
    const ids = abas.map(a => telaComAba('lider', a));
    expect(new Set(ids).size).toBe(abas.length);
    for (const id of ids) {
      expect(TELA_LABEL[id], `falta rótulo para ${id}`).toBeTruthy();
    }
  });

  it('as duas abas internas de Logs se distinguem', () => {
    expect(telaComAba('admin/configuracoes', 'logs'))
      .not.toBe(telaComAba('admin/configuracoes', 'uso'));
    expect(TELA_LABEL['admin/configuracoes:logs']).toBeTruthy();
    expect(TELA_LABEL['admin/configuracoes:uso']).toBeTruthy();
  });
});
