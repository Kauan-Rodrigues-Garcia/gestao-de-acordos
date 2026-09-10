/**
 * As garantias do Controle de Números que vivem no BANCO, conferidas no SQL.
 *
 * ## Por que um teste que lê migration
 *
 * As regras centrais deste módulo não são testáveis no navegador: quem cumpre
 * «o mesmo número não se cadastra duas vezes», «o celular do Play 3 nunca
 * hospeda número do Play 1» e «no máximo 6 por aparelho» é o Postgres, não a
 * tela. Um teste de integração com Postgres provaria mais, e não existe neste
 * projeto.
 *
 * O que dá para provar aqui é que as garantias ESTÃO ESCRITAS, e que nenhuma
 * refatoração as removeu em silêncio. Mesmo recurso de
 * `rhSeguranca.sql.test.ts` e `permissoes-catalogo.sql.test.ts`.
 *
 * Cada asserção procura a REGRA, não a formatação.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

/**
 * Acha a migration pelo NOME, ignorando o carimbo de versão.
 *
 * O prefixo muda: o arquivo nasce com um carimbo escolhido à mão e depois é
 * renomeado para o que o banco registrou em
 * `supabase_migrations.schema_migrations` — sem isso, `supabase db push`
 * reaplicaria migration que já rodou. Aconteceu com estas três em 10/09/2026,
 * e o caminho fixo aqui derrubou o arquivo de teste inteiro.
 *
 * Casar pelo sufixo deixa a reconciliação ser o que ela é — renomear arquivo —
 * sem levar o teste junto.
 */
function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

const SCHEMA = migration('_numeros_whatsapp.sql');

/** Corpo de uma função, do CREATE até o `$function$;` que a fecha. */
function corpoDaFuncao(sql: string, nome: string): string {
  const i = sql.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = sql.indexOf('$function$;', i);
  expect(fim, `função ${nome} sem fechamento`).toBeGreaterThan(i);
  return sql.slice(i, fim);
}

/** O SQL sem os comentários — para não confundir explicação com regra. */
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

const CODIGO = semComentarios(SCHEMA);

describe('o mesmo número não se cadastra duas vezes', () => {
  it('a unicidade é do BANCO, por empresa', () => {
    expect(CODIGO).toMatch(/UNIQUE\s*\(\s*empresa_id\s*,\s*numero\s*\)/);
  });

  it('o formato normalizado é exigido, senão a máscara burlaria o UNIQUE', () => {
    // Sem isto, `(18) 99999-9999` e `18999999999` são duas strings diferentes
    // e o mesmo número entra duas vezes sem o índice reclamar.
    expect(CODIGO).toContain("numero ~ '^(1[1-9]|[2-9][0-9])[0-9]{8,9}$'");
  });
});

describe('o vínculo celular → setor nunca se mistura', () => {
  const valida = corpoDaFuncao(SCHEMA, 'fn_numeros_whatsapp_valida');

  it('o número HERDA o setor do celular — o cliente não escolhe', () => {
    expect(valida).toMatch(/NEW\.setor_id\s*:=\s*v_cel_setor/);
  });

  it('o celular tem que ser da mesma empresa do número', () => {
    expect(valida).toMatch(/v_cel_empresa\s+IS\s+DISTINCT\s+FROM\s+NEW\.empresa_id/i);
  });

  it('trocar o setor de um celular COM número é recusado', () => {
    // Sem esta trava, herdar o setor não bastaria: bastaria cadastrar seis
    // números e mexer no aparelho para mover seis números sem movimentação.
    const celular = corpoDaFuncao(SCHEMA, 'fn_numeros_celular_valida');
    expect(celular).toMatch(/NEW\.setor_id\s+IS\s+DISTINCT\s+FROM\s+OLD\.setor_id/i);
    expect(celular).toContain('FROM public.numeros_whatsapp n');
    expect(celular).toMatch(/RAISE EXCEPTION/);
  });
});

describe('o limite de 6 números por celular', () => {
  const valida = corpoDaFuncao(SCHEMA, 'fn_numeros_whatsapp_valida');

  it('trava a linha do celular antes de contar', () => {
    // É o que faz o limite resistir a dois cadastros simultâneos. Sem o lock,
    // as duas sessões leem 5 e as duas passam.
    expect(valida).toMatch(/FROM public\.numeros_celulares c[\s\S]*FOR UPDATE/);
  });

  it('recusa a partir do sexto já existente', () => {
    expect(valida).toMatch(/v_quantos\s*>=\s*6/);
  });

  it('não conta num UPDATE que mantém o mesmo celular', () => {
    // A contagem incluiria a própria linha e recusaria o sexto número.
    expect(valida).toMatch(
      /TG_OP\s*=\s*'INSERT'\s+OR\s+NEW\.celular_id\s+IS\s+DISTINCT\s+FROM\s+OLD\.celular_id/i);
  });
});

describe('situação e posse não se contradizem', () => {
  it('número no Núcleo não pode estar na mão de um operador', () => {
    expect(CODIGO).toMatch(
      /CHECK\s*\(\s*posse\s*<>\s*'nucleo'\s+OR\s+operador_id\s+IS\s+NULL\s*\)/i);
  });

  it('as três situações e as duas posses, e nada além', () => {
    expect(CODIGO).toMatch(
      /situacao\s+IN\s*\(\s*'em_aquecimento'\s*,\s*'ativo'\s*,\s*'banido'\s*\)/i);
    expect(CODIGO).toMatch(/posse\s+IN\s*\(\s*'nucleo'\s*,\s*'setor'\s*\)/i);
  });
});

describe('o Núcleo é reconhecido por configuração, não por nome de setor', () => {
  const souDoNucleo = corpoDaFuncao(SCHEMA, 'fn_numeros_sou_do_nucleo');

  it('lê `numeros_config` e o setor da pessoa', () => {
    expect(souDoNucleo).toContain('public.numeros_config');
    expect(souDoNucleo).toContain('p.setor_id = c.setor_nucleo_id');
  });

  it('não compara o NOME do setor em lugar nenhum', () => {
    // O antipadrão que 20260823092000 documenta ter removido. Renomear o setor
    // pela tela de Admin não pode derrubar o módulo.
    expect(souDoNucleo).not.toMatch(/setores/);
    expect(souDoNucleo).not.toMatch(/\bnome\b/);
  });

  it('sem linha em numeros_config, ninguém é do Núcleo', () => {
    // `EXISTS` sobre a config: ausência devolve FALSE. Falha fechada.
    expect(souDoNucleo).toMatch(/SELECT\s+EXISTS/i);
  });
});

describe('quem enxerga o quê', () => {
  const visivel = corpoDaFuncao(SCHEMA, 'fn_numeros_visivel');

  it('a empresa é a primeira porta', () => {
    expect(visivel).toContain('fn_can_access_empresa(p_empresa_id)');
  });

  it('o Núcleo precisa das DUAS fechaduras: o setor e a chave da aba', () => {
    // Só a chave liberaria todo cargo igual em qualquer setor; só o setor
    // ignoraria o painel de permissões, que é a autoridade do projeto.
    expect(visivel).toContain('fn_numeros_sou_do_nucleo(p_empresa_id)');
    expect(visivel).toContain("fn_user_tem('ver_controle_numeros')");
  });

  it('a liderança vê o próprio setor', () => {
    expect(visivel).toMatch(
      /WHEN 2 THEN p_setor_id IS NOT DISTINCT FROM public\.fn_user_setor_id\(\)/);
  });

  it('o operador vê só o que foi lançado para ele, e no próprio setor', () => {
    expect(visivel).toMatch(/WHEN 0 THEN[\s\S]*p_operador_id = \(SELECT auth\.uid\(\)\)/);
    expect(visivel).toMatch(
      /WHEN 0 THEN[\s\S]*p_setor_id IS NOT DISTINCT FROM public\.fn_user_setor_id\(\)/);
  });

  it('o escopo da aba é avaliado UMA vez, num CASE', () => {
    // A lição medida em 20260910180000: o Postgres não deduplica InitPlans
    // idênticos, e cada avaliação percorre o catálogo de permissões inteiro.
    //
    // A contagem é sobre o CÓDIGO: o comentário que explica esta regra cita a
    // chamada, e citar não é avaliar.
    expect(visivel).toContain("CASE public.fn_user_escopo('chips')");
    const avaliacoes = semComentarios(visivel).match(/fn_user_escopo\('chips'\)/g) ?? [];
    expect(avaliacoes).toHaveLength(1);
  });

  it('nível desconhecido nega, em vez de passar por comparação frouxa', () => {
    expect(visivel).toMatch(/ELSE FALSE/);
  });
});

describe('o histórico é da trilha, não do cliente', () => {
  it('os snapshots de setor e operador ficam SEM foreign key', () => {
    // Apagar um setor ou desligar uma pessoa não pode apagar histórico.
    const tabela = CODIGO.slice(
      CODIGO.indexOf('CREATE TABLE IF NOT EXISTS public.numeros_movimentacoes'),
      CODIGO.indexOf('CREATE INDEX IF NOT EXISTS idx_numeros_mov_numero'));

    for (const coluna of ['setor_origem_id', 'setor_destino_id',
                          'operador_origem_id', 'operador_destino_id']) {
      const linha = tabela.split('\n').find(l => l.includes(coluna)) ?? '';
      expect(linha, `${coluna} não pode ter REFERENCES`).not.toMatch(/REFERENCES/i);
    }
  });

  it('a frase é montada no banco — a tela não interpreta código', () => {
    expect(CODIGO).toMatch(/descricao\s+TEXT NOT NULL/);
    const mov = corpoDaFuncao(SCHEMA, 'fn_numeros_movimentacao');
    expect(mov).toMatch(/v_descricao\s*:=\s*CASE p_tipo/);
  });

  it('só as RPCs escrevem: sem GRANT para authenticated', () => {
    const grants = CODIGO.match(/GRANT EXECUTE ON FUNCTION public\.fn_numeros_movimentacao/g);
    expect(grants).toBeNull();
    expect(CODIGO).toMatch(/REVOKE ALL ON FUNCTION public\.fn_numeros_movimentacao/);
  });
});

describe('a janela entre as migrations falha fechada', () => {
  it('a RLS entra ligada já nesta migration, antes de existir policy', () => {
    for (const t of ['numeros_config', 'numeros_celulares',
                     'numeros_whatsapp', 'numeros_movimentacoes']) {
      expect(CODIGO).toMatch(
        new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });

  it('nenhuma policy é criada aqui — elas são da migration do fluxo', () => {
    expect(CODIGO).not.toMatch(/CREATE POLICY/i);
  });
});

describe('as funções não vazam privilégio', () => {
  it.each([
    'fn_numeros_sou_do_nucleo',
    'fn_numeros_visivel',
    'fn_numeros_setor_e_da_empresa',
    'fn_numeros_movimentacao',
  ])('%s é revogada de PUBLIC', (nome) => {
    expect(CODIGO).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${nome}`));
  });

  it.each([
    'fn_numeros_sou_do_nucleo',
    'fn_numeros_visivel',
    'fn_numeros_whatsapp_valida',
    'fn_numeros_celular_valida',
    'fn_numeros_config_valida',
    'fn_numeros_movimentacao',
  ])('%s fixa o search_path', (nome) => {
    const corpo = corpoDaFuncao(SCHEMA, nome);
    expect(corpo).toMatch(/SET search_path TO 'public'/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A migration do fluxo: as cinco transições e as policies.
// ═══════════════════════════════════════════════════════════════════════════

const FLUXO = migration('_numeros_whatsapp_fluxo.sql');
const FLUXO_CODIGO = semComentarios(FLUXO);

const RPCS = [
  'fn_numeros_liberar_ao_setor',
  'fn_numeros_lancar_ao_operador',
  'fn_numeros_devolver_a_lideranca',
  'fn_numeros_relancar_ao_nucleo',
  'fn_numeros_alterar_situacao',
] as const;

describe('as cinco transições são RPC, e não confiança no cliente', () => {
  it.each(RPCS)('%s existe e roda como dona', (nome) => {
    const corpo = corpoDaFuncao(FLUXO, nome);
    expect(corpo).toContain('SECURITY DEFINER');
    expect(corpo).toMatch(/SET search_path TO 'public'/);
  });

  it.each(RPCS)('%s trava a linha antes de decidir', (nome) => {
    // Sem `FOR UPDATE`, duas chamadas simultâneas leem o mesmo estado de
    // origem e as duas passam pela validação.
    expect(corpoDaFuncao(FLUXO, nome)).toMatch(/FROM public\.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE/);
  });

  it.each(RPCS)('%s grava movimentação', (nome) => {
    expect(corpoDaFuncao(FLUXO, nome)).toContain('fn_numeros_movimentacao');
  });

  it.each(RPCS)('%s é revogada de PUBLIC e concedida a authenticated', (nome) => {
    // Texto literal, não padrão — `toContain` evita escapar o ponto.
    expect(FLUXO_CODIGO).toContain(`REVOKE ALL ON FUNCTION public.${nome}`);
    expect(FLUXO_CODIGO).toContain(`GRANT EXECUTE ON FUNCTION public.${nome}`);
  });
});

describe('liberar ao setor', () => {
  const f = corpoDaFuncao(FLUXO, 'fn_numeros_liberar_ao_setor');

  it('é do Núcleo, e exige a chave própria', () => {
    expect(f).toContain('fn_numeros_sou_do_nucleo(n.empresa_id)');
    expect(f).toContain("fn_user_tem('numeros_liberar_ao_setor')");
  });

  it('só libera número ativo', () => {
    expect(f).toMatch(/n\.situacao <> 'ativo'/);
  });

  it('não libera o que já está no setor', () => {
    expect(f).toMatch(/n\.posse <> 'nucleo'/);
  });

  it('limpa o motivo do retorno anterior', () => {
    // Senão a tela do setor mostraria "banido" num número recém-liberado.
    expect(f).toMatch(/motivo_retorno = NULL/);
  });
});

describe('lançar ao operador', () => {
  const f = corpoDaFuncao(FLUXO, 'fn_numeros_lancar_ao_operador');

  it('exige a chave e o alcance do setor', () => {
    expect(f).toContain("fn_user_tem('chips_lancar_ao_operador')");
    expect(f).toContain('fn_numeros_manda_no_setor(n.setor_id)');
  });

  it('o operador de destino tem que ser do mesmo setor e da mesma empresa', () => {
    // Lançar para fora do setor daria à pessoa um número que ela nem enxerga.
    expect(f).toMatch(/v_op_setor IS DISTINCT FROM n\.setor_id/);
    expect(f).toMatch(/v_op_empresa IS DISTINCT FROM n\.empresa_id/);
  });

  it('recusa número ainda no Núcleo e número banido', () => {
    expect(f).toMatch(/n\.posse <> 'setor'/);
    expect(f).toMatch(/n\.situacao = 'banido'/);
  });

  it('registra de quem para quem', () => {
    expect(f).toMatch(/p_operador_origem_id\s*=>\s*n\.operador_id/);
    expect(f).toMatch(/p_operador_destino_id\s*=>\s*p_operador_id/);
  });
});

describe('devolver à liderança', () => {
  const f = corpoDaFuncao(FLUXO, 'fn_numeros_devolver_a_lideranca');

  it('só o dono devolve', () => {
    expect(f).toMatch(/n\.operador_id IS DISTINCT FROM v_eu/);
  });

  it('o número NÃO sai do setor', () => {
    expect(f).toMatch(/operador_id = NULL/);
    expect(f).not.toMatch(/posse = 'nucleo'/);
  });

  it('exige motivo da lista', () => {
    expect(f).toMatch(/p_motivo NOT IN \('banido', 'sem_uso', 'problema_tecnico', 'outro'\)/);
  });
});

describe('relançar ao Núcleo', () => {
  const f = corpoDaFuncao(FLUXO, 'fn_numeros_relancar_ao_nucleo');

  it('exige a chave, o alcance do setor e o motivo', () => {
    expect(f).toContain("fn_user_tem('chips_relancar_ao_nucleo')");
    expect(f).toContain('fn_numeros_manda_no_setor(n.setor_id)');
    expect(f).toMatch(/p_motivo NOT IN \('banido', 'sem_uso', 'problema_tecnico', 'outro'\)/);
  });

  it('devolve a posse ao Núcleo e solta o operador', () => {
    expect(f).toMatch(/posse = 'nucleo'/);
    expect(f).toMatch(/operador_id = NULL/);
  });

  it('não apaga nem recadastra — é UPDATE, nunca DELETE', () => {
    expect(f).toMatch(/UPDATE public\.numeros_whatsapp/);
    expect(f).not.toMatch(/DELETE FROM/i);
  });
});

describe('alterar situação', () => {
  const f = corpoDaFuncao(FLUXO, 'fn_numeros_alterar_situacao');

  it('é do Núcleo e de mais ninguém', () => {
    // Uma dona só para a coluna. A liderança marca banimento relançando.
    expect(f).toContain('fn_numeros_nucleo_administra(n.empresa_id)');
  });

  it('trocar por igual não vira linha de histórico', () => {
    expect(f).toMatch(/n\.situacao = p_situacao[\s\S]*RETURN;/);
  });
});

describe('o cadastro entra na trilha por gatilho', () => {
  it('existe um AFTER INSERT que grava a primeira movimentação', () => {
    expect(FLUXO_CODIGO).toMatch(/AFTER INSERT ON public\.numeros_whatsapp/);
    expect(corpoDaFuncao(FLUXO, 'fn_numeros_registra_cadastro'))
      .toMatch(/p_tipo\s*=>\s*'cadastro'/);
  });
});

describe('as policies', () => {
  it('a leitura do número passa por fn_numeros_visivel', () => {
    expect(FLUXO_CODIGO).toMatch(
      /CREATE POLICY numeros_whatsapp_select[\s\S]*?USING \(\(SELECT public\.fn_numeros_visivel\(empresa_id, setor_id, operador_id\)\)\)/);
  });

  it('a escrita direta do número é só do Núcleo', () => {
    expect(FLUXO_CODIGO).toMatch(
      /CREATE POLICY numeros_whatsapp_write[\s\S]*?fn_numeros_nucleo_administra\(empresa_id\)/);
  });

  it('a config só é escrita com a chave explícita', () => {
    expect(FLUXO_CODIGO).toMatch(
      /CREATE POLICY numeros_config_write[\s\S]*?fn_user_tem\('numeros_configurar'\)/);
  });

  it('toda chamada em policy vem envolta em (SELECT ...)', () => {
    // Sem isso o Postgres avalia por linha — a lição de 20260910180000.
    const policies = FLUXO_CODIGO.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) {
      const nuas = p.match(/(?<!\(SELECT )public\.fn_[a-z_]+\(/g) ?? [];
      expect(nuas, `policy com chamada nua: ${p.slice(0, 60)}`).toHaveLength(0);
    }
  });

  it('o histórico é append-only: só policy de SELECT', () => {
    const doHistorico = FLUXO_CODIGO.match(
      /CREATE POLICY \w+ ON public\.numeros_movimentacoes\s+FOR (\w+)/g) ?? [];
    expect(doHistorico).toHaveLength(1);
    expect(doHistorico[0]).toMatch(/FOR SELECT/);
  });

  it('a visibilidade do histórico segue a do número', () => {
    expect(FLUXO_CODIGO).toMatch(
      /CREATE POLICY numeros_movimentacoes_select[\s\S]*?FROM public\.numeros_whatsapp n[\s\S]*?fn_numeros_visivel\(n\.empresa_id, n\.setor_id, n\.operador_id\)/);
  });
});
