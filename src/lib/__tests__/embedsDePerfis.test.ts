/**
 * `perfis` tem mais de um caminho até `setores` e até `equipes`, e o PostgREST
 * recusa a consulta INTEIRA (`PGRST201`) quando o embed não diz qual usar:
 *
 *   setores  perfis_setor_id_fkey  e  perfis_setor_da_empresa_fkey
 *            (FK composta da fase 4, 20261002210000)
 *   equipes  perfis_equipe_id_fkey  e  `equipe_membros` como junção
 *            (fase 5, 20261002220000: o PK tem equipe_id e pessoa_id)
 *
 * Foi o que esvaziou a tela de Usuários da BookPlay depois da fase 4: a
 * consulta e a reserva dela pediam `setores(id,nome)`, as duas falhavam, e a
 * lista caía em «Nenhum usuário encontrado». O mesmo vale para `empresas`, ver
 * `EMBED_EMPRESA` em `services/empresas.service.ts`.
 *
 * Este teste lê o código: todo `.from('perfis')` cujo `select` traz `setores`
 * ou `equipes` tem de nomear a chave.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..', '..');

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : arquivos(caminho);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

/** O argumento do primeiro `.select(` depois de cada `.from('perfis')`. */
function selectsDePerfis(fonte: string): string[] {
  const achados: string[] = [];
  const re = /\.from\(\s*['"]perfis['"]\s*\)/g;
  for (let m = re.exec(fonte); m; m = re.exec(fonte)) {
    const resto = fonte.slice(m.index + m[0].length, m.index + m[0].length + 600);
    const fim = resto.search(/\.from\(/);
    const trecho = fim >= 0 ? resto.slice(0, fim) : resto;
    const sel = /\.select\(\s*(['"`])([\s\S]*?)\1/.exec(trecho);
    if (sel) achados.push(sel[2]);
  }
  return achados;
}

describe('embeds a partir de perfis', () => {
  it('setores e equipes sempre com a chave nomeada', () => {
    const ruins: string[] = [];
    for (const arq of arquivos(RAIZ)) {
      for (const sel of selectsDePerfis(readFileSync(arq, 'utf8'))) {
        if (/(^|[^\w!])(setores|equipes)\s*\(/.test(sel)) {
          ruins.push(`${relative(RAIZ, arq)}: ${sel.replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(ruins).toEqual([]);
  });

  it('o detector pega o formato que quebrou', () => {
    expect(selectsDePerfis(".from('perfis').select('*, setores(id,nome)')")).toEqual(['*, setores(id,nome)']);
  });
});
