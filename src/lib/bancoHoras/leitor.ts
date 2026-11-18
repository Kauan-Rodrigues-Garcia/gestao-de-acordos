/**
 * Leitura do relatório HRBH102 do DP — «Vencimento de Lançamentos não
 * Compensados».
 *
 * O DP manda um CSV por setor (separado por `;`, quase sempre cp1252). O
 * webmail baixa «todos os anexos» como .zip, às vezes com nome `.tmp`. Aqui
 * entra qualquer um dos dois, e também o backup .json do painel antigo.
 *
 * Portado do painel solto (`Documents\banco-de-horas`, 17/11/2026) sem mudar a
 * regra: as linhas que importam são o cabeçalho («Saldo Banco em», «HRBH102 …
 * dd/mm/aaaa - hh:mm … Usuário»), a empresa, o setor, a pessoa («Saldo BH:»),
 * cada vencimento («Vencendo em:») e a hierarquia («1.2.3, …»).
 */
import { unzipSync } from 'fflate';
import type { PessoaDP, PosicaoBH, SetorDP } from './tipos';

export type GrupoLido = Omit<SetorDP, 'arquivo' | 'gerado' | 'usuario'>;

export type Leitura =
  | { ok: true; arquivo: string; data: string; gerado: string | null; usuario: string | null; grupos: GrupoLido[] }
  | { ok: false; arquivo: string; motivo: string };

const isoBR = (s: string | undefined): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((s || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** «12:34» → 754; «12:34-» → −754. */
export const lerHora = (s: string | undefined): number | null => {
  const m = /^\s*(\d+):(\d{2})\s*(-?)\s*$/.exec(s || '');
  if (!m) return null;
  const v = (+m[1]) * 60 + (+m[2]);
  return m[3] ? -v : v;
};

/** UTF-8 (com ou sem BOM) ou, se não for, cp1252 — o que o sistema do DP grava. */
export function decodificar(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return new TextDecoder('utf-8').decode(u8.subarray(3));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); }
  catch { return new TextDecoder('windows-1252').decode(u8); }
}

export function lerRelatorio(texto: string, arquivo: string): Leitura {
  let data: string | null = null;
  let gerado: string | null = null;
  let usuario: string | null = null;
  let empresa: string | null = null;
  let empresaCode: string | null = null;
  let esperaSetor = false;
  let g: GrupoLido | null = null;
  let cur: PessoaDP | null = null;
  const grupos: GrupoLido[] = [];
  const novoGrupo = (setor: string) => {
    g = { setor, depto: null, hierarquia: null, empresa, empresaCode: empresaCode ?? '', people: [] };
    grupos.push(g);
    cur = null;
  };

  for (const raw of texto.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const c = raw.split(';').map(x => x.trim());
    const c0 = c[0] || '';
    if (c0 === 'Vencimentos de:') {
      const i = c.indexOf('Saldo Banco em:');
      if (i >= 0 && !data) for (let j = i + 1; j < c.length; j++) { const d = isoBR(c[j]); if (d) { data = d; break; } }
      continue;
    }
    if (/^HRBH/i.test(c0)) {
      const m = /(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}:\d{2})/.exec(c0);
      if (m) gerado = `${isoBR(m[1])} ${m[2]}`;
      const u = /Usu.rio:\s*(.+)$/i.exec(c0);
      if (u) usuario = u[1].trim();
      continue;
    }
    if (/^\d{1,5}$/.test(c0) && c[1] && c[7] !== 'Saldo BH:' && c[4] !== 'Vencendo em:') {
      empresaCode = String(+c0);
      empresa = c[1];
      esperaSetor = !c.some(x => /^P.g\.:$/.test(x));
      continue;
    }
    if (esperaSetor) {
      esperaSetor = false;
      if (c0 && c.slice(1).every(x => !x) && !/^[\d.]+\s*,/.test(c0) && !['Empresa', 'Local', 'Empregado'].includes(c0)) {
        novoGrupo(c0);
        continue;
      }
    }
    if (c[7] === 'Saldo BH:') {
      if (!g) novoGrupo((arquivo || 'Sem setor').replace(/\.[^.]+$/, '').replace(/\s*-?\s*BH\s*$/i, ''));
      const saldo = lerHora(c[8]);
      if (saldo === null) continue;
      cur = { mat: c[1], nome: c[2], saldo, em: isoBR(c[10]), venc: [] };
      (g as GrupoLido | null)?.people.push(cur);
      continue;
    }
    if (c[4] === 'Vencendo em:') {
      const d = isoBR(c[5]);
      const v = lerHora(c[8]);
      if (cur && d && v !== null) (cur as PessoaDP).venc.push([d, v]);
      continue;
    }
    if (/^[\d.]+\s*,/.test(c0)) {
      const partes = c0.split(',').map(s => s.trim()).filter(Boolean);
      const atual = g as GrupoLido | null;
      if (atual && !atual.depto && partes.length >= 4) {
        atual.depto = partes[partes.length - 2];
        atual.hierarquia = partes.slice(1).join(' › ');
      }
      cur = null;
      continue;
    }
  }
  const pessoas = grupos.reduce((t, x) => t + x.people.length, 0);
  if (!data || !pessoas) {
    return { ok: false, arquivo, motivo: !data ? 'não tem a linha «Saldo Banco em» do relatório de banco de horas' : 'nenhum colaborador encontrado' };
  }
  return { ok: true, arquivo, data, gerado, usuario, grupos: grupos.filter(x => x.people.length) };
}

const ehZip = (u8: Uint8Array) => u8[0] === 0x50 && u8[1] === 0x4B && u8[2] === 3 && u8[3] === 4;

/** O backup do painel antigo (`{ app: 'banco-de-horas', posicoes }`). */
export interface Backup { app: 'banco-de-horas'; posicoes: PosicaoBH[] }

export interface ArquivosLidos {
  lidos: Extract<Leitura, { ok: true }>[];
  erros: { arquivo: string; motivo: string }[];
  backup: Backup | null;
}

/** Lê o que a pessoa escolheu ou arrastou: CSV, .zip/.tmp do e-mail, a pasta, o backup. */
export async function lerArquivos(arquivos: { name: string; arrayBuffer(): Promise<ArrayBuffer> }[]): Promise<ArquivosLidos> {
  const out: ArquivosLidos = { lidos: [], erros: [], backup: null };
  const tratar = (nome: string, u8: Uint8Array) => {
    if (ehZip(u8)) {
      let dentro: Record<string, Uint8Array>;
      try { dentro = unzipSync(u8); }
      catch (e) { out.erros.push({ arquivo: nome, motivo: `não consegui abrir o .zip (${e instanceof Error ? e.message : e})` }); return; }
      for (const [n, conteudo] of Object.entries(dentro)) {
        if (n.endsWith('/')) continue;
        tratar(n.split('/').pop() || n, conteudo);
      }
      return;
    }
    const txt = decodificar(u8);
    if (/\.json$/i.test(nome) || /^\s*\{\s*"app"\s*:\s*"banco-de-horas"/.test(txt)) {
      try {
        const j = JSON.parse(txt) as Partial<Backup>;
        if (j.app === 'banco-de-horas' && Array.isArray(j.posicoes)) { out.backup = j as Backup; return; }
      } catch { /* não era o backup: segue como relatório */ }
    }
    const r = lerRelatorio(txt, nome);
    if ('motivo' in r) out.erros.push({ arquivo: r.arquivo, motivo: r.motivo }); else out.lidos.push(r);
  };
  for (const f of arquivos) {
    try { tratar(f.name, new Uint8Array(await f.arrayBuffer())); }
    catch (e) { out.erros.push({ arquivo: f.name, motivo: e instanceof Error ? e.message : String(e) }); }
  }
  return out;
}
