/**
 * As garantias do RH Gestão que vivem no BANCO, conferidas no SQL.
 *
 * ## Por que um teste que lê migration
 *
 * Os cenários obrigatórios do pedido — «líder tenta acessar equipe que não
 * lidera», «usuário sem permissão tenta pelo banco», «devolução sem motivo» —
 * não são testáveis no navegador: quem os cumpre é a RLS e as RPCs. Um teste
 * de integração com Postgres provaria mais, e não existe neste projeto.
 *
 * O que dá para provar aqui é que as garantias ESTÃO ESCRITAS, e que nenhuma
 * refatoração as removeu em silêncio. É o mesmo recurso que
 * `permissoes-catalogo.sql.test.ts` usa para casar os dois catálogos, e o mesmo
 * que `migrations-armadilhas-plpgsql.test.ts` usa para pegar erro de dollar
 * quoting.
 *
 * Um teste assim falha por texto, não por comportamento — e é por isso que cada
 * asserção abaixo procura a REGRA, e não a formatação.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

function ler(nome: string): string {
  return fs.readFileSync(path.join(MIGRATIONS, nome), 'utf8');
}

const SCHEMA = ler('20260823090000_rh_gestao.sql');
const FLUXO  = ler('20260823091000_rh_gestao_fluxo.sql');
const PERMS  = ler('20260823092000_rh_gestao_permissoes.sql');

/** Corpo de uma função, do CREATE até o `$function$;` que a fecha. */
function corpoDaFuncao(sql: string, nome: string): string {
  const i = sql.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = sql.indexOf('$function$;', i);
  expect(fim, `função ${nome} sem fechamento`).toBeGreaterThan(i);
  return sql.slice(i, fim);
}

describe('escopo: o líder só alcança as equipes que LIDERA', () => {
  const visivel = corpoDaFuncao(SCHEMA, 'fn_rh_lancamento_visivel');

  it('o nível de equipe sai de `equipe_lideres`, e não de `perfis.equipe_id`', () => {
    // Requisito 4: pertencer ao mesmo setor não dá acesso à equipe alheia.
    expect(visivel).toContain('fn_rh_equipes_que_lidero');
    expect(visivel).not.toContain('perfis.equipe_id');
  });

  it('`fn_rh_equipes_que_lidero` lê a tabela oficial de liderança', () => {
    const f = corpoDaFuncao(SCHEMA, 'fn_rh_equipes_que_lidero');
    expect(f).toContain('public.equipe_lideres');
    expect(f).toContain('lider_id = (SELECT auth.uid())');
  });

  it('o nível de equipe NÃO libera por setor', () => {
    // O ramo de escopo 1 compara `p_equipe_id`; se comparasse setor, um líder
    // veria a equipe de outro líder do mesmo setor.
    const ramo = visivel.slice(visivel.indexOf("fn_user_escopo('rh') >= 1"));
    expect(ramo).toContain('p_equipe_id IN (SELECT public.fn_rh_equipes_que_lidero())');
  });

  it('o escopo de setor confere o setor do usuário', () => {
    expect(visivel).toContain('p_setor_id IS NOT DISTINCT FROM public.fn_user_setor_id()');
  });

  it('empresa errada não passa, nem para quem tem alcance total', () => {
    expect(visivel).toContain('fn_can_access_empresa(p_empresa_id)');
  });
});

describe('RLS: escrever não tem policy — só as RPCs escrevem', () => {
  const tabelasDoFluxo = [
    'public.rh_lancamentos',
    'public.rh_fechamentos',
    'public.rh_dados_operadores',
    'public.rh_eventos',
  ];

  it.each(tabelasDoFluxo)('%s tem RLS ligada', (t) => {
    // Espaço flexível: os ALTER estão alinhados em coluna na migration.
    const alter = new RegExp(
      `ALTER TABLE ${t.replace('.', '\\.')}\\s+ENABLE ROW LEVEL SECURITY;`);
    expect(alter.test(FLUXO), `${t} sem RLS`).toBe(true);
  });

  it.each(tabelasDoFluxo)('%s não tem policy de INSERT/UPDATE/DELETE', (t) => {
    // `FOR ALL` também conta: ele inclui escrita.
    const proibido = new RegExp(
      `CREATE POLICY[^;]*ON ${t.replace('.', '\\.')}[\\s\\S]*?FOR (INSERT|UPDATE|DELETE|ALL)`,
      'i',
    );
    expect(proibido.test(FLUXO), `${t} ganhou policy de escrita`).toBe(false);
  });

  it('a leitura do lançamento passa pela função única de escopo', () => {
    expect(FLUXO).toContain(
      'USING (public.fn_rh_lancamento_visivel(empresa_id, setor_id_snapshot, equipe_id_snapshot))');
  });

  it('o crachá é legível pelo dono e por quem o alcança — e por mais ninguém', () => {
    const i = FLUXO.indexOf('CREATE POLICY rh_cracha_select');
    expect(i).toBeGreaterThan(-1);
    const policy = FLUXO.slice(i, FLUXO.indexOf(');', i) + 2);
    expect(policy).toContain('operador_id = (SELECT auth.uid())');
    expect(policy).toContain('fn_rh_cracha_visivel');
  });

  it('a visibilidade do crachá é resolvida por função SECURITY DEFINER', () => {
    // Subconsulta em `perfis` dentro da policy roda com o recorte de quem lê, e
    // o operador só enxerga a própria linha — o líder não veria crachá nenhum.
    const f = corpoDaFuncao(FLUXO, 'fn_rh_cracha_visivel');
    expect(f).toContain('SECURITY DEFINER');
    expect(f).toContain('fn_rh_lancamento_visivel');
  });
});

describe('as RPCs conferem permissão, escopo e estado', () => {
  const comPermissao: [string, string][] = [
    ['fn_rh_abrir_competencia',    'rh_gerenciar_fechamento'],
    ['fn_rh_definir_prazo',        'rh_gerenciar_fechamento'],
    ['fn_rh_salvar_lancamento',    'rh_preencher'],
    ['fn_rh_congelar_percentual',  'rh_preencher'],
    ['fn_rh_concluir_equipe',      'rh_preencher'],
    ['fn_rh_validar_equipe',       'rh_validar'],
    ['fn_rh_enviar_setor',         'rh_enviar'],
    ['fn_rh_aprovar_operador',     'rh_aprovar'],
    ['fn_rh_devolver_operador',    'rh_devolver'],
    ['fn_rh_devolver_equipe',      'rh_devolver'],
    ['fn_rh_finalizar_competencia', 'rh_gerenciar_fechamento'],
    ['fn_rh_reabrir_competencia',  'rh_reabrir_fechamento'],
    ['fn_rh_salvar_cracha',        'rh_editar_cracha'],
  ];

  it.each(comPermissao)('%s exige %s', (fn, chave) => {
    const corpo = corpoDaFuncao(FLUXO, fn);
    expect(corpo).toContain(`public.fn_rh_pode('${chave}')`);
  });

  it('`fn_rh_pode` exige a ABA aberta, e não só a chave', () => {
    // Ligar `rh_aprovar` para quem não enxerga a aba daria um poder sem onde
    // ser exercido — o defeito que o painel 2.0 existe para não repetir.
    const corpo = corpoDaFuncao(FLUXO, 'fn_rh_pode');
    expect(corpo).toContain("fn_user_escopo('rh') >= 1");
    expect(corpo).toContain('fn_user_tem(p_chave)');
  });

  it.each([
    'fn_rh_salvar_lancamento', 'fn_rh_congelar_percentual',
    'fn_rh_concluir_equipe', 'fn_rh_validar_equipe',
  ])('%s confere o escopo antes de escrever', (fn) => {
    // Trocar o id na requisição cai aqui — é o cenário «alteração manual de ID».
    const corpo = corpoDaFuncao(FLUXO, fn);
    expect(corpo).toMatch(/fn_rh_lancamento_visivel|RH_FORA_DO_ESCOPO/);
  });

  it.each([
    'fn_rh_salvar_lancamento', 'fn_rh_concluir_equipe', 'fn_rh_validar_equipe',
    'fn_rh_enviar_setor', 'fn_rh_aprovar_operador', 'fn_rh_devolver_operador',
    'fn_rh_devolver_equipe',
  ])('%s trava a linha antes de decidir (concorrência)', (fn) => {
    const corpo = corpoDaFuncao(FLUXO, fn);
    expect(corpo).toContain('FOR UPDATE');
  });

  it.each([
    'fn_rh_salvar_lancamento', 'fn_rh_congelar_percentual', 'fn_rh_validar_equipe',
    'fn_rh_enviar_setor', 'fn_rh_aprovar_operador', 'fn_rh_devolver_operador',
    'fn_rh_devolver_equipe', 'fn_rh_finalizar_competencia',
  ])('%s recusa quando o estado atual não permite', (fn) => {
    // É o que impede a decisão de quem chegou primeiro de ser sobrescrita por
    // uma tela carregada há cinco minutos.
    const corpo = corpoDaFuncao(FLUXO, fn);
    expect(corpo).toContain('RH_ESTADO_INVALIDO');
  });

  it.each([
    'fn_rh_salvar_lancamento', 'fn_rh_concluir_equipe', 'fn_rh_validar_equipe',
    'fn_rh_enviar_setor', 'fn_rh_aprovar_operador', 'fn_rh_devolver_operador',
    'fn_rh_devolver_equipe',
  ])('%s recusa em competência finalizada', (fn) => {
    const corpo = corpoDaFuncao(FLUXO, fn);
    expect(corpo).toContain('fn_rh_exigir_aberto');
  });
});

describe('motivo obrigatório', () => {
  it.each(['fn_rh_devolver_operador', 'fn_rh_devolver_equipe', 'fn_rh_reabrir_competencia'])(
    '%s recusa sem motivo', (fn) => {
      const corpo = corpoDaFuncao(FLUXO, fn);
      expect(corpo).toContain('RH_MOTIVO_OBRIGATORIO');
      expect(corpo).toContain("COALESCE(TRIM(p_motivo), '') = ''");
    });

  it('prorrogar prazo já publicado exige motivo; defini-lo pela 1ª vez não', () => {
    const corpo = corpoDaFuncao(FLUXO, 'fn_rh_definir_prazo');
    expect(corpo).toContain('v_antes IS NOT NULL');
    expect(corpo).toContain('RH_MOTIVO_OBRIGATORIO');
  });
});

describe('devolver um operador não toca nos outros', () => {
  it('a devolução de operador recorta por id, e nunca por equipe ou setor', () => {
    const corpo = corpoDaFuncao(FLUXO, 'fn_rh_devolver_operador');
    expect(corpo).toContain('WHERE id = p_lancamento_id');
    expect(corpo).not.toContain('equipe_id_snapshot =');
    expect(corpo).not.toContain('setor_id_snapshot =');
  });

  it('a devolução de equipe recorta pela equipe, e nunca pelo setor', () => {
    // Requisito 16: as outras equipes já aprovadas não perdem o estado.
    const corpo = corpoDaFuncao(FLUXO, 'fn_rh_devolver_equipe');
    expect(corpo).toContain('equipe_id_snapshot = p_equipe_id');
    expect(corpo).not.toContain('setor_id_snapshot = ');
  });
});

describe('histórico e snapshots', () => {
  it('os snapshots do lançamento não têm foreign key para equipe ou setor', () => {
    // Apagar uma equipe não pode apagar nem invalidar histórico financeiro.
    const i = SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS public.rh_lancamentos');
    const tabela = SCHEMA.slice(i, SCHEMA.indexOf(');', i));
    expect(tabela).toContain('equipe_id_snapshot   UUID');
    expect(tabela).not.toMatch(/equipe_id_snapshot[^,]*REFERENCES/);
    expect(tabela).not.toMatch(/setor_id_snapshot[^,]*REFERENCES/);
  });

  it('valor monetário é NUMERIC, nunca float', () => {
    const i = SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS public.rh_lancamentos');
    // Sem os comentários: a palavra «float» aparece neles justamente para dizer
    // que ela NÃO é usada, e casaria com a busca.
    const tabela = SCHEMA.slice(i, SCHEMA.indexOf(');', i))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--.*$/gm, '');
    expect(tabela).toMatch(/valor\s+NUMERIC\(12,2\)/);
    expect(tabela).not.toMatch(/\b(FLOAT|REAL|DOUBLE PRECISION)\b/i);
  });

  it('a trilha é append-only: sem policy de UPDATE nem DELETE', () => {
    expect(/CREATE POLICY[^;]*ON public\.rh_eventos[\s\S]*?FOR (UPDATE|DELETE|ALL)/i
      .test(FLUXO)).toBe(false);
  });

  it('existem índices para as consultas por competência, setor, equipe e status', () => {
    for (const alvo of [
      'rh_lancamentos(fechamento_id, equipe_id_snapshot)',
      'rh_lancamentos(fechamento_id, setor_id_snapshot)',
      'rh_lancamentos(fechamento_id, status)',
      'rh_lancamentos(operador_id)',
      'rh_lancamentos(empresa_id)',
      'rh_fechamentos(empresa_id, competencia DESC)',
    ]) {
      expect(SCHEMA, alvo).toContain(alvo);
    }
  });

  it('um crachá não pode pertencer a duas pessoas', () => {
    expect(SCHEMA).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_cracha_unico');
  });

  it('uma pessoa tem uma linha por competência', () => {
    expect(SCHEMA).toContain('UNIQUE (fechamento_id, operador_id)');
  });
});

describe('a aba entra no registro de escopo do banco', () => {
  it('`fn_abas_escopo` conhece `rh`', () => {
    // Sem esta linha, `fn_user_escopo('rh')` devolveria -1 para todo mundo, em
    // silêncio, e o módulo nasceria invisível.
    expect(FLUXO).toContain("('rh',               'ver_rh_gestao')");
  });

  it('as demais abas continuam registradas', () => {
    for (const aba of ['dashboard', 'acordos', 'lixeira', 'pix',
                       'painel_lider', 'painel_diretoria', 'analitico', 'usuarios']) {
      expect(FLUXO, aba).toContain(`('${aba}'`);
    }
  });
});

describe('permissões do módulo', () => {
  it('as chaves de decisão do RH nascem desligadas para todo cargo', () => {
    // Semear qualquer uma em `gerencia` daria a quatro pessoas o poder de
    // aprovar a própria folha, sem ninguém ter decidido isso.
    for (const chave of ['rh_aprovar', 'rh_devolver', 'rh_gerenciar_fechamento',
                         'rh_configurar', 'rh_editar_cracha']) {
      expect(PERMS, chave).toMatch(
        new RegExp(`\\('${chave}',\\s*NULL::TEXT\\[\\],\\s*ninguem`));
    }
  });

  it('reabrir competência exige concessão nominal (explicita = true)', () => {
    expect(PERMS).toMatch(/\('rh_reabrir_fechamento',\s*NULL::TEXT\[\],\s*ninguem,\s*true\)/);
  });

  it('a semeadura respeita `explicita` para quem tem acesso total', () => {
    expect(PERMS).toContain('THEN NOT v_chave.explicita');
  });
});
