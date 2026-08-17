/**
 * As duas regras que NÃO podem morar no front.
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. quem entra no painel de descobridores;
 *   2. quantas vezes cada pessoa joga o fliperama (resposta: uma).
 *
 * Se qualquer das duas ficasse no cliente, bastaria abrir o console para virar
 * o primeiro descobridor da empresa ou repetir a partida até o placar ficar
 * bom. Nenhuma vale dinheiro; as duas valem a graça.
 *
 * A migration é aplicada à mão no SQL Editor, então nada aqui roda contra o
 * banco. O que este arquivo faz é ler o SQL e checar que as garantias estão
 * escritas nele — e, do outro lado, que o TypeScript não tenta tomar essas
 * decisões sozinho. É uma guarda de intenção, e ela pega exatamente o tipo de
 * regressão que aconteceria: alguém "simplificar" movendo a regra para o
 * componente porque é mais rápido de testar na tela.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '../../../../..');
const MIGRATIONS = path.join(RAIZ, 'supabase/migrations');

function migrationDoPainel(): string {
  const arquivo = fs.readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find(f => /creators_lab_fliperama/i.test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')));

  if (!arquivo) throw new Error('Nenhuma migration cria creators_lab_fliperama.');
  return fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8');
}

const SQL = migrationDoPainel();

/** O SQL sem comentários — o texto que o Postgres realmente executa. */
const CODIGO = SQL
  .replace(/--[^\n]*/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('elegibilidade do painel é decidida pelo servidor', () => {
  it('existe um gatilho que sela a descoberta', () => {
    expect(CODIGO).toMatch(/create\s+trigger\s+trg_creators_lab_selar_descoberta/i);
    expect(CODIGO).toMatch(/before\s+insert\s+or\s+update\s+on\s+public\.creators_lab_progresso/i);
  });

  it('quem decide o cargo é uma consulta a perfis, não o cliente', () => {
    expect(CODIGO).toMatch(/select\s+perfil\s+into\s+v_perfil\s+from\s+public\.perfis/i);
    expect(CODIGO).toMatch(/not\s+in\s*\(\s*'super_admin'\s*,\s*'administrador'\s*\)/i);
  });

  /** Sem isto, cada gravação de progresso reescreveria a posição na fila. */
  it('elegibilidade e data de descoberta são imutáveis no UPDATE', () => {
    expect(CODIGO).toMatch(/new\.elegivel_painel\s*:=\s*old\.elegivel_painel/i);
    expect(CODIGO).toMatch(/new\.descoberto_em\s*:=\s*old\.descoberto_em/i);
  });

  /** Os testes do próprio desenvolvimento não podem ocupar o primeiro lugar. */
  it('quem já havia acessado antes fica de fora', () => {
    expect(CODIGO).toMatch(
      /update\s+public\.creators_lab_progresso\s+set\s+elegivel_painel\s*=\s*false/i,
    );
  });

  it('o TypeScript não decide elegibilidade em lugar nenhum', () => {
    const fonte = path.join(RAIZ, 'src');
    const suspeitos: string[] = [];

    const varrer = (dir: string) => {
      for (const nome of fs.readdirSync(dir)) {
        const caminho = path.join(dir, nome);
        if (fs.statSync(caminho).isDirectory()) { varrer(caminho); continue; }
        if (!/\.(ts|tsx)$/.test(nome) || /__tests__|\.test\./.test(caminho)) continue;
        // `database.types.ts` é espelho do esquema, gerado: ele DECLARA a
        // coluna, o que é outra coisa de decidir o valor dela.
        if (caminho.endsWith(path.join('lib', 'database.types.ts'))) continue;

        const texto = fs.readFileSync(caminho, 'utf8');
        // Escrever a coluna, ou repetir a lista de cargos excluídos, seria
        // mover a decisão para cá.
        if (/elegivel_painel\s*[:=]/.test(texto)) suspeitos.push(caminho);
      }
    };
    varrer(fonte);

    expect(suspeitos, `elegibilidade sendo decidida no front:\n${suspeitos.join('\n')}`)
      .toEqual([]);
  });
});

describe('a ficha do fliperama é uma só', () => {
  it('a chave primária é o usuário — não existe segunda linha', () => {
    expect(CODIGO).toMatch(/usuario_id\s+uuid\s+primary\s+key/i);
  });

  /** É o que fecha a brecha de recarregar a página antes de morrer. */
  it('a partida nasce no INÍCIO, com tudo zerado pelo gatilho', () => {
    expect(CODIGO).toMatch(/new\.iniciado_em\s*:=\s*now\(\)/i);
    expect(CODIGO).toMatch(/new\.pontos\s*:=\s*0/i);
    expect(CODIGO).toMatch(/new\.venceu\s*:=\s*false/i);
  });

  it('partida encerrada não aceita novo UPDATE', () => {
    expect(CODIGO).toMatch(/if\s+old\.finalizado_em\s+is\s+not\s+null\s+then[\s\S]{0,200}raise\s+exception/i);
  });

  /** Tempo é critério de ranking: vindo do cliente, seria campo de texto. */
  it('o tempo é medido pelo relógio do servidor', () => {
    expect(CODIGO).toMatch(/duracao_ms\s*:=[\s\S]{0,120}extract\s*\(\s*epoch\s+from/i);
  });

  it('não existe política de DELETE — ficha queimada não se apaga', () => {
    expect(CODIGO).not.toMatch(/create\s+policy[^;]*for\s+delete[^;]*creators_lab_fliperama/i);
    expect(CODIGO).toMatch(/polcmd\s*=\s*'d'/i);   // a verificação que confere isso
  });

  it('a tabela nasce com RLS ligada', () => {
    expect(CODIGO).toMatch(
      /alter\s+table\s+public\.creators_lab_fliperama\s+enable\s+row\s+level\s+security/i,
    );
  });
});

describe('as listas públicas não vazam', () => {
  it('painel e ranking saem por função, e só da própria empresa', () => {
    for (const fn of ['fn_creators_lab_descobridores', 'fn_creators_lab_ranking']) {
      const corpo = CODIGO.slice(CODIGO.indexOf(`function public.${fn}`));
      expect(corpo, fn).toMatch(/security\s+definer/i);
      expect(corpo, fn).toMatch(/set\s+search_path\s*=\s*public,\s*pg_temp/i);
      expect(corpo, fn).toMatch(/empresa_id\s*=\s*public\.fn_user_empresa_id\(\)/i);
    }
  });

  /**
   * Uma `security definer` roda com os poderes de quem a criou. Se `anon`
   * pudesse chamá-la, a lista de nomes da empresa sairia sem login.
   */
  it('anônimo não executa nenhuma das duas', () => {
    expect(CODIGO).toMatch(/revoke\s+all\s+on\s+function\s+public\.fn_creators_lab_descobridores\(\)\s+from\s+public,\s*anon/i);
    expect(CODIGO).toMatch(/revoke\s+all\s+on\s+function\s+public\.fn_creators_lab_ranking\(\)\s+from\s+public,\s*anon/i);
  });

  /** Gatilho não é endpoint — é a regra da migration 20260816150000. */
  it('os gatilhos ficam fora do alcance do PostgREST', () => {
    expect(CODIGO).toMatch(/revoke\s+all\s+on\s+function\s+public\.fn_creators_lab_selar_descoberta\(\)\s+from\s+public,\s*anon,\s*authenticated/i);
    expect(CODIGO).toMatch(/revoke\s+all\s+on\s+function\s+public\.fn_creators_lab_partida\(\)\s+from\s+public,\s*anon,\s*authenticated/i);
  });

  /** Nada de cargo, e-mail ou progresso na lista que a página desenha. */
  it('as funções devolvem só nome, foto e placar', () => {
    const proibidos = ['email', 'usuario\\b', 'setor_id', 'perfil\\b', 'progresso'];
    const trecho = CODIGO.slice(CODIGO.indexOf('fn_creators_lab_descobridores'));
    for (const campo of proibidos) {
      expect(new RegExp(`p\\.${campo}`, 'i').test(trecho), `vazando ${campo}`).toBe(false);
    }
  });
});
