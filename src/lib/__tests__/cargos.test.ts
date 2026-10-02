/**
 * O cadastro de cargos e as listas que ele vai substituir.
 *
 * Fase 2 da reorganização empresa > setor > cargo: `public.cargos` existe, mas
 * o app ainda lê as listas antigas. Este teste é o que deixa a fase 3 trocar
 * uma pela outra sem ninguém ganhar nem perder nada:
 *
 *   1. as linhas de `lib/cargos.ts` são as mesmas da migration;
 *   2. cada lista antiga é reproduzida pelos atributos.
 *
 * Se um destes quebrar, o cadastro e a lista discordam — e a fase 3 mudaria
 * comportamento. Corrija o lado errado, nunca o teste.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CARGOS, derivar } from '../cargos';
import {
  PERFIL_LABELS, PERFIL_NIVEL, PERFIS_ADMIN, PERFIS_ESCOPO_EMPRESA,
  PERFIS_QUE_CONTAM_NO_RECEBIMENTO, PERFIS_QUE_SO_LIDERAM,
} from '../index';
import { CARGOS_ACESSO_TOTAL, CARGOS_CONFIGURAVEIS } from '../permissoes-catalogo';
import { CARGOS_ALVO_CHAT } from '../permissoes-chat';
import { CARGO_DO_NUCLEO, CARGOS_FORA_DO_NUCLEO } from '../cargoDoNucleo';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

const ordenado = (xs: readonly string[]) => [...xs].sort();
const d = derivar();

describe('cadastro de cargos — a migration e o espelho', () => {
  const sql = migration('_cargos_cadastro.sql');

  // As tuplas do INSERT: ('slug', 'Nome', nivel, ordem, bool, tipo, bool, bool, bool)
  const linhas = [...sql.matchAll(
    /\(\s*'([a-z_]+)',\s*'([^']+)',\s*(NULL|\d+),\s*(\d+),\s*(TRUE|FALSE),\s*(NULL|'[a-z_]+'),\s*(TRUE|FALSE),\s*(TRUE|FALSE),\s*(TRUE|FALSE)\s*\)/g,
  )].map(m => ({
    slug: m[1], nome: m[2],
    nivel: m[3] === 'NULL' ? null : Number(m[3]),
    ordem: Number(m[4]),
    pertence_a_setor: m[5] === 'TRUE',
    exige_tipo_setor: m[6] === 'NULL' ? null : m[6].slice(1, -1),
    acesso_total: m[7] === 'TRUE',
    conta_no_recebimento: m[8] === 'TRUE',
    lidera_equipe: m[9] === 'TRUE',
    ativo: true,
  }));

  it('tem as mesmas dez linhas, com os mesmos atributos', () => {
    expect(linhas).toHaveLength(10);
    expect(linhas).toEqual(CARGOS);
  });

  it('são exatamente os cargos que o CHECK de perfis aceita', () => {
    const check = migration('_assistente_adm_cargo.sql');
    const trecho = check.slice(check.indexOf('ADD CONSTRAINT perfis_perfil_check'));
    const aceitos = [...trecho.slice(0, trecho.indexOf(']')).matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    expect(ordenado(CARGOS.map(c => c.slug))).toEqual(ordenado(aceitos));
  });

  it('o gatilho da cúpula zera o setor dos mesmos cargos que não pertencem a setor', () => {
    const cupula = migration('_cupula_escopo_empresa.sql');
    const m = cupula.match(/if new\.perfil in \(([^)]*)\)/);
    const lista = [...(m?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
    expect(ordenado(lista)).toEqual(ordenado(d.escopoEmpresa));
  });
});

describe('cada lista antiga sai dos atributos', () => {
  it('PERFIS_ESCOPO_EMPRESA = não pertence a setor', () => {
    expect(ordenado(d.escopoEmpresa)).toEqual(ordenado(PERFIS_ESCOPO_EMPRESA));
  });

  it('CARGOS_ACESSO_TOTAL e PERFIS_ADMIN = acesso_total', () => {
    expect(d.acessoTotal).toEqual([...CARGOS_ACESSO_TOTAL]);
    expect(ordenado(d.acessoTotal)).toEqual(ordenado(PERFIS_ADMIN));
  });

  it('CARGOS_CONFIGURAVEIS = ativos sem acesso total, na ordem do painel', () => {
    expect(d.configuraveis).toEqual([...CARGOS_CONFIGURAVEIS]);
  });

  it('PERFIS_QUE_CONTAM_NO_RECEBIMENTO = conta_no_recebimento', () => {
    expect(ordenado(d.contamNoRecebimento)).toEqual(ordenado(PERFIS_QUE_CONTAM_NO_RECEBIMENTO));
  });

  it('PERFIS_QUE_SO_LIDERAM = lidera e não recebe', () => {
    expect(ordenado(d.soLideram)).toEqual(ordenado(PERFIS_QUE_SO_LIDERAM));
  });

  it('CARGO_DO_NUCLEO e CARGOS_FORA_DO_NUCLEO = exige_tipo_setor', () => {
    expect(d.doNucleo).toEqual([CARGO_DO_NUCLEO]);
    expect(ordenado(d.foraDoNucleo)).toEqual(ordenado(CARGOS_FORA_DO_NUCLEO));
  });

  it('PERFIL_LABELS = nome', () => {
    expect(d.rotulos).toEqual(PERFIL_LABELS);
  });

  it('PERFIL_NIVEL = nivel, onde há nível', () => {
    expect(d.niveis).toEqual(PERFIL_NIVEL);
  });

  it('CARGOS_ALVO_CHAT = todos os cargos', () => {
    expect(ordenado(CARGOS.map(c => c.slug))).toEqual(ordenado(CARGOS_ALVO_CHAT));
  });
});
