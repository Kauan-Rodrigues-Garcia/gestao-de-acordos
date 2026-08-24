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
  // O perfil completo de uma pessoa — migration 20260824160000. Junta navegação
  // (`uso_telas`) com ação e login (`logs_sistema`), que é o que a gerência
  // pede: tudo o que a pessoa fez, e não só quais telas ela abriu.
  'fn_uso_perfil_pessoa',
  // «Abriu o sistema hoje» — migration 20260824180000. Existe porque
  // `logs_sistema.acao = 'login'` só é gravado quando alguém DIGITA a senha, e
  // a sessão do Supabase sobrevive dias: quem usava todo dia aparecia com um
  // login só.
  'fn_uso_registrar_sessao',
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
    // TODAS as definições, e não só a primeira: a policy foi reescrita uma vez
    // (20260824170000, para a RLS deixar de rodar por linha) e vai ser de novo.
    // Conferir só a mais antiga deixaria uma reescrita afrouxar a trava sem que
    // esta guarda percebesse — que é exatamente o que ela existe para pegar.
    const defs = [...SQL.matchAll(/create policy uso_telas_select[\s\S]*?;/gi)].map(m => m[0]);
    expect(defs.length).toBeGreaterThan(0);

    for (const sel of defs) {
      expect(sel).toMatch(/fn_user_is_super_admin/);
      expect(sel).toMatch(/administrador/);
      // Diretoria e líder ficaram fora dos logs por decisão explícita; uso é
      // dado da mesma natureza e segue a mesma trava.
      expect(sel).not.toMatch(/'diretoria'/);
      expect(sel).not.toMatch(/'lider'/);
    }
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

/**
 * ## «Tem gente usando todo dia mas consta 1 login»
 *
 * O relato estava certo e o número é que estava errado. `logs_sistema` só ganha
 * `acao = 'login'` dentro de `signIn()` — quando alguém DIGITA a senha. A sessão
 * do Supabase se renova por refresh token e sobrevive a fechar o navegador, então
 * quem trabalha todo dia na mesma máquina digita a senha uma vez por mês.
 *
 * `uso_sessoes` (migration 20260824180000) registra ABERTURA do sistema, que não
 * depende disso. Estas guardas existem porque a regressão aqui é silenciosa: o
 * painel continuaria carregando, mostrando um número menor do que a verdade — que
 * é o pior formato possível para um dado que vira cobrança de pessoas.
 */
describe('entrada no sistema não depende da sessão ter expirado', () => {
  /** A última definição vale: estas funções já foram reescritas mais de uma vez. */
  function ultimaDefinicao(fn: string): string {
    const defs = [...SQL.matchAll(
      new RegExp(`create or replace function public\\.${fn}[\\s\\S]*?\\$function\\$;`, 'gi'),
    )].map(m => m[0]);
    expect(defs.length, `${fn} não encontrada`).toBeGreaterThan(0);
    return defs[defs.length - 1];
  }

  it('a tabela existe e é deduplicada por (empresa, pessoa, dia)', () => {
    expect(SQL).toMatch(/create table if not exists public\.uso_sessoes/i);
    // A chave primária É a deduplicação: sem ela seria preciso uma consulta de
    // «já registrei hoje?» antes de cada inserção, e uma corrida entre duas abas
    // criaria a linha duas vezes assim mesmo.
    expect(SQL).toMatch(/primary key \(empresa_id, usuario_id, dia\)/i);
  });

  it('a leitura tem a mesma trava de uso_telas', () => {
    const defs = [...SQL.matchAll(/create policy uso_sessoes_select[\s\S]*?;/gi)].map(m => m[0]);
    expect(defs.length).toBeGreaterThan(0);
    for (const sel of defs) {
      expect(sel).toMatch(/fn_user_is_super_admin/);
      expect(sel).toMatch(/administrador/);
      expect(sel).not.toMatch(/'diretoria'/);
      expect(sel).not.toMatch(/'lider'/);
      // Embrulhadas em `(select ...)`: sem isso o Postgres avalia cada função
      // STABLE uma vez POR LINHA, que foi a causa do `statement timeout`
      // corrigido em 20260824170000.
      expect(sel).toMatch(/\(\s*select\s+public\.fn_user_is_super_admin/i);
      expect(sel).toMatch(/\(\s*select\s+public\.fn_user_empresa_id/i);
      expect(sel).toMatch(/\(\s*select\s+public\.fn_user_has_any_role/i);
    }
  });

  it('não há policy de escrita em uso_sessoes', () => {
    const policies = [...SQL.matchAll(/create policy (\S+) on public\.uso_sessoes\s+for (\w+)/gi)];
    expect(policies.length).toBeGreaterThan(0);
    for (const [, nome, cmd] of policies) {
      expect(cmd.toLowerCase(), `policy ${nome} permite escrita`).toBe('select');
    }
  });

  it('a RPC de sessão resolve a identidade por auth.uid(), não por parâmetro', () => {
    const corpo = ultimaDefinicao('fn_uso_registrar_sessao');
    expect(corpo).toMatch(/auth\.uid\(\)/);
    expect(corpo).not.toMatch(/p_usuario/);
    // O dia é o de São Paulo: 22h de terça em Brasília é 01h de quarta em UTC.
    expect(corpo).toMatch(/at time zone 'America\/Sao_Paulo'/i);
  });

  it('o expurgo leva as sessões junto, na mesma janela', () => {
    // Retenções diferentes para o mesmo dado fariam o painel mostrar dia com
    // sessão e sem tela (ou o contrário) nas bordas da janela.
    expect(ultimaDefinicao('fn_uso_expurgar'))
      .toMatch(/delete from public\.uso_sessoes where dia < v_corte/i);
  });

  it('quem só abriu o sistema não aparece como «nunca acessou»', () => {
    // O falso positivo mais caro desta tela: ela existe para virar cobrança.
    expect(ultimaDefinicao('fn_uso_sem_acesso')).toMatch(/public\.uso_sessoes/i);
  });

  it('o perfil separa abrir o sistema de digitar a senha', () => {
    const corpo = ultimaDefinicao('fn_uso_perfil_pessoa');
    expect(corpo).toMatch(/'entradas_total'/);
    // `logins_total` continua existindo — é sinal de troca de máquina e de
    // sessão caída. O defeito era usá-lo como presença, não tê-lo.
    expect(corpo).toMatch(/'logins_total'/);
  });

  it('o dia conta uma vez, mesmo com tela e sessão', () => {
    const corpo = ultimaDefinicao('fn_uso_perfil_pessoa');
    // `UNION ALL` faria o dia de quem navegou E abriu o sistema contar em
    // dobro, e o percentual de uso passaria de 100%.
    const dias = /dias as \(([\s\S]*?)\)\s*select jsonb_build_object/i.exec(corpo);
    expect(dias, 'CTE `dias` não encontrada').not.toBeNull();
    expect(dias![1]).toMatch(/\bunion\b/i);
    expect(dias![1]).not.toMatch(/\bunion\s+all\b/i);
  });

  it('o painel mostra aberturas, e não logins, como «entradas no sistema»', () => {
    // A guarda do front: o SQL certo com o card lendo o campo antigo devolveria
    // exatamente o número que o gerente não reconheceu.
    const perfil = fs.readFileSync(
      path.join(RAIZ, 'src/pages/AdminLogs/PerfilPessoa.tsx'), 'utf8');
    expect(perfil).toMatch(/perfil\?\.entradas_total/);
    expect(SERVICO).toMatch(/entradas_total:\s*number/);
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
