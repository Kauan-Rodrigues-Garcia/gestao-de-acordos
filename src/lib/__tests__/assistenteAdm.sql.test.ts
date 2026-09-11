/**
 * O cargo Assistente ADM — as garantias escritas nas duas migrations.
 *
 * O Núcleo de Inteligência e Gestão passou a ter cargo próprio em 11/09/2026:
 * `assistente_adm`, exclusivo do setor nos dois sentidos. Quem cumpre a regra é
 * o Postgres — a tela só oferece a combinação certa —, e não há Postgres nos
 * testes deste projeto.
 *
 * O que dá para provar aqui é que as garantias ESTÃO ESCRITAS e que nenhuma
 * refatoração as removeu em silêncio. Mesmo recurso de
 * `numerosTratamento.sql.test.ts`. Cada asserção procura a REGRA, não a
 * formatação.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

/** Acha a migration pelo NOME, ignorando o carimbo — ele muda na reconciliação. */
function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

/** O SQL sem os comentários — para não confundir explicação com regra. */
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Corpo de uma função, do CREATE até o `$function$;` que a fecha. */
function corpoDaFuncao(sql: string, nome: string): string {
  const i = sql.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const fim = sql.indexOf('$function$;', i);
  expect(fim, `função ${nome} sem fechamento`).toBeGreaterThan(i);
  return sql.slice(i, fim);
}

const CARGO = semComentarios(migration('_assistente_adm_cargo.sql'));
const TRAVA = semComentarios(migration('_assistente_adm_trava.sql'));

const CHAVES_DO_NUCLEO = ['ver_controle_numeros', 'numeros_administrar', 'numeros_liberar_ao_setor'];
const COBRANCA = ['operador', 'ouvidoria', 'lider', 'elite', 'gerencia', 'diretoria'];
const REDEFINIDAS = [
  'ver_dashboard',
  ...CHAVES_DO_NUCLEO, 'ver_meus_chips', 'chips_escopo_setor',
  'chat_cargo_operador', 'chat_cargo_lider', 'chat_cargo_elite', 'chat_cargo_gerencia',
  'chat_cargo_diretoria', 'chat_cargo_ouvidoria', 'chat_cargo_rh',
  'chat_cargo_administrador', 'chat_cargo_super_admin',
];

/** A linha `('chave', tenants, padrao, explicita)` do catálogo novo. */
function linhaDoCatalogo(chave: string): string {
  const m = new RegExp(`\\('${chave}',[^)]*\\)`).exec(CARGO);
  expect(m, `${chave} não está no VALUES do catálogo`).not.toBeNull();
  return m![0];
}

describe('o cargo e o catálogo', () => {
  it('o cargo entra no CHECK sem tirar nenhum dos que existiam', () => {
    const check = /ADD CONSTRAINT perfis_perfil_check[\s\S]*?\]\)\)/.exec(CARGO)?.[0] ?? '';
    for (const c of [
      'operador', 'lider', 'administrador', 'super_admin', 'elite',
      'gerencia', 'diretoria', 'ouvidoria', 'rh', 'assistente_adm',
    ]) {
      expect(check, `${c} fora do CHECK`).toContain(`'${c}'`);
    }
  });

  it('as chaves do Núcleo nascem SÓ no Assistente ADM', () => {
    for (const chave of CHAVES_DO_NUCLEO) {
      expect(linhaDoCatalogo(chave)).toMatch(/,\s*ARRAY\['assistente_adm'\]::TEXT\[\],\s*false\)$/);
    }
  });

  it('a porta de entrada abre para o Assistente ADM — `/` exige `ver_dashboard`', () => {
    const linha = linhaDoCatalogo('ver_dashboard');
    for (const c of [...COBRANCA, 'rh', 'assistente_adm']) expect(linha).toContain(`'${c}'`);
  });

  it('Meus Chips mantém os setores e acrescenta o Assistente ADM', () => {
    const ver = linhaDoCatalogo('ver_meus_chips');
    for (const c of [...COBRANCA, 'assistente_adm']) expect(ver).toContain(`'${c}'`);
    expect(linhaDoCatalogo('chips_escopo_setor')).toContain("'assistente_adm'");
  });

  it('a versão anterior de cada chave redefinida sai antes de a nova entrar', () => {
    const notIn = /WHERE c\.chave NOT IN \(([\s\S]*?)\)\s*UNION ALL/.exec(CARGO)?.[1] ?? '';
    for (const chave of REDEFINIDAS) {
      expect(notIn, `${chave} fora do NOT IN`).toContain(`'${chave}'`);
      linhaDoCatalogo(chave);
    }
  });

  it('nasce a chave de chat do cargo novo', () => {
    expect(linhaDoCatalogo('chat_cargo_assistente_adm')).toContain("'assistente_adm'");
    expect(CARGO).toMatch(/NOT \(cp\.permissoes \? 'chat_cargo_assistente_adm'\)/);
  });

  it('os seis cargos da cobrança devolvem as três chaves do Núcleo', () => {
    const upd = /UPDATE public\.cargos_permissoes cp\s+SET permissoes = cp\.permissoes \|\| jsonb_build_object\(\s*'ver_controle_numeros',\s*false[\s\S]*?;/
      .exec(CARGO)?.[0] ?? '';
    expect(upd, 'UPDATE da cobrança não encontrado').not.toBe('');
    for (const c of COBRANCA) expect(upd).toContain(`'${c}'`);
    for (const k of CHAVES_DO_NUCLEO) expect(upd).toMatch(new RegExp(`'${k}',\\s*false`));
    expect(upd).not.toContain("'assistente_adm'");
  });

  it('as empresas que já existem ganham a linha do cargo', () => {
    expect(CARGO).toMatch(
      /INSERT INTO public\.cargos_permissoes \(empresa_id, cargo, permissoes\)\s+SELECT\s+e\.id,\s+'assistente_adm'/);
  });

  it('a semeadura de empresa nova cria a linha do cargo', () => {
    const semear = corpoDaFuncao(CARGO, 'fn_permissoes_semear_empresa');
    expect(semear).toMatch(/FOREACH v_cargo IN ARRAY ARRAY\[[^\]]*'assistente_adm'[^\]]*\]/);
  });

  it('a tela descobre o setor do Núcleo sem ler `numeros_config` inteira', () => {
    const f = corpoDaFuncao(CARGO, 'fn_numeros_setor_nucleo');
    expect(f).toMatch(/RETURNS UUID/);
    expect(f).toMatch(/SECURITY DEFINER/);
    expect(f).toContain('fn_can_access_empresa');
    expect(CARGO).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.fn_numeros_setor_nucleo\(UUID\) TO authenticated/);
  });
});

describe('a trava', () => {
  const trava = corpoDaFuncao(TRAVA, 'fn_perfis_cargo_do_nucleo');

  it('recusa aplicar enquanto houver alguém em violação — antes de criar a trigger', () => {
    const verificacao = TRAVA.indexOf('Converta primeiro');
    const gatilho = TRAVA.indexOf('CREATE TRIGGER b_trg_perfis_cargo_do_nucleo');
    expect(verificacao).toBeGreaterThan(-1);
    expect(verificacao).toBeLessThan(gatilho);
  });

  it('dispara na criação e em toda troca de cargo, setor ou empresa', () => {
    expect(TRAVA).toMatch(
      /CREATE TRIGGER b_trg_perfis_cargo_do_nucleo\s+BEFORE INSERT OR UPDATE OF perfil, setor_id, empresa_id ON public\.perfis/);
  });

  it('acesso total atravessa, antes de qualquer outra pergunta', () => {
    const atravessa = trava.search(/NEW\.perfil IN \('administrador', 'super_admin'\)/);
    expect(atravessa).toBeGreaterThan(-1);
    expect(atravessa).toBeLessThan(trava.indexOf("NEW.perfil = 'assistente_adm'"));
  });

  it('Assistente ADM fora do Núcleo é recusado — inclusive sem Núcleo configurado', () => {
    expect(trava).toMatch(/IF v_nucleo IS NULL THEN\s+RAISE EXCEPTION/);
    expect(trava).toMatch(/IF NEW\.setor_id IS DISTINCT FROM v_nucleo THEN\s+RAISE EXCEPTION/);
  });

  it('o setor do Núcleo recusa cargo comum', () => {
    expect(trava).toMatch(/IF v_nucleo IS NOT NULL AND NEW\.setor_id = v_nucleo THEN\s+RAISE EXCEPTION/);
  });

  it('a função da trigger não é chamável pela API', () => {
    expect(TRAVA).toMatch(
      /REVOKE ALL ON FUNCTION public\.fn_perfis_cargo_do_nucleo\(\) FROM PUBLIC, anon, authenticated/);
  });

  it('trocar o setor do Núcleo não deixa ninguém em violação', () => {
    const cfg = corpoDaFuncao(TRAVA, 'fn_numeros_config_valida');
    expect(cfg).toMatch(/p\.perfil = 'assistente_adm'\s+AND p\.setor_id = OLD\.setor_nucleo_id/);
    expect(cfg).toMatch(/p\.setor_id = NEW\.setor_nucleo_id\s+AND p\.perfil NOT IN \('assistente_adm', 'administrador', 'super_admin'\)/);
    // A validação original continua lá.
    expect(cfg).toContain('fn_numeros_setor_e_da_empresa');
  });
});
