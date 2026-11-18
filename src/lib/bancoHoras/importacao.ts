/**
 * Monta o lote de uma importação: o que vai para o banco, e o que avisar.
 *
 * As regras são as do painel antigo:
 *
 *   * Arquivo de data minoritária no lote (≥ 4 arquivos, < 25% deles, data que
 *     ainda não existe) fica de fora — o e-mail de 16/11 trouxe um HOME
 *     RECEPTIVO antigo no meio dos novos.
 *   * O mesmo setor duas vezes no lote (zip + CSV, cópia): conteúdo igual conta
 *     uma vez; conteúdo diferente fica a versão gerada por último.
 *
 * Quem decide se cada setor é novo, igual ou trocado é o banco
 * (`fn_banco_horas_importar`), pela assinatura.
 */
import { data as fmtData } from './formato';
import type { ArquivosLidos } from './leitor';
import type { PessoaDP, SetorParaGravar } from './tipos';

/** Mesmas pessoas, saldos e vencimentos = mesma assinatura. */
export function assinatura(g: { people: PessoaDP[] }): string {
  return g.people
    .map(p => `${p.mat}:${p.saldo}:${p.venc.map(v => v.join('=')).join(',')}`)
    .sort()
    .join(';');
}

export interface Lote {
  gravar: SetorParaGravar[];
  /** As datas tocadas: `novo` = a data ainda não existia; `backup` = veio do backup. */
  datas: Map<string, { novo: boolean; backup: boolean }>;
  repetidos: { arquivo: string; igual: string }[];
  conflitos: { setor: string; ficou: string; saiu: string; gerado: string | null; empate: boolean }[];
  erros: { arquivo: string; motivo: string }[];
}

export function montarLote(lidos: ArquivosLidos, datasExistentes: Set<string>): Lote {
  const lote: Lote = { gravar: [], datas: new Map(), repetidos: [], conflitos: [], erros: [...lidos.erros] };

  if (lidos.backup) {
    for (const p of lidos.backup.posicoes) {
      for (const s of Object.values(p.setores || {})) {
        if (s && Array.isArray(s.people) && s.people.length) {
          lote.gravar.push({ ...s, empresaCode: String(s.empresaCode), date: p.date, assinatura: assinatura(s) });
        }
      }
      lote.datas.set(p.date, { novo: !datasExistentes.has(p.date), backup: true });
    }
  }

  const porData = new Map<string, typeof lidos.lidos>();
  for (const r of lidos.lidos) {
    const l = porData.get(r.data) ?? [];
    l.push(r);
    porData.set(r.data, l);
  }
  const maior = [...porData].sort((a, b) => b[1].length - a[1].length)[0];
  if (maior && maior[1].length >= 4) {
    for (const [dt, rs] of [...porData]) {
      if (dt === maior[0] || datasExistentes.has(dt) || rs.length >= maior[1].length * 0.25) continue;
      for (const r of rs) {
        lote.erros.push({
          arquivo: r.arquivo,
          motivo: `é de outra data: saldo em ${fmtData(dt)}, gerado em ${fmtData(r.gerado)}. Os outros `
            + `${maior[1].length} arquivos são de ${fmtData(maior[0])}. Ficou de fora para não misturar; `
            + 'peça ao DP a versão atual desse setor.',
        });
      }
      porData.delete(dt);
    }
  }

  for (const [dt, rs] of porData) {
    const doLote = new Map<string, { arquivo: string; gerado: string | null; ass: string; setor: SetorParaGravar }>();
    for (const r of rs) {
      for (const g of r.grupos) {
        const k = `${g.empresaCode}|${g.setor}`;
        const ass = assinatura(g);
        const ja = doLote.get(k);
        if (ja) {
          if (ja.ass === ass) { lote.repetidos.push({ arquivo: r.arquivo, igual: ja.arquivo }); continue; }
          const maisNovo = (r.gerado || '') > (ja.gerado || '');
          lote.conflitos.push({
            setor: g.setor,
            ficou: maisNovo ? r.arquivo : ja.arquivo,
            saiu: maisNovo ? ja.arquivo : r.arquivo,
            gerado: maisNovo ? r.gerado : ja.gerado,
            empate: (r.gerado || '') === (ja.gerado || ''),
          });
          if (!maisNovo) continue;
        }
        doLote.set(k, {
          arquivo: r.arquivo, gerado: r.gerado, ass,
          setor: {
            date: dt, assinatura: ass, setor: g.setor, depto: g.depto, hierarquia: g.hierarquia,
            empresa: g.empresa, empresaCode: g.empresaCode, arquivo: r.arquivo, gerado: r.gerado,
            usuario: r.usuario, people: g.people,
          },
        });
      }
    }
    for (const x of doLote.values()) lote.gravar.push(x.setor);
    if (!lote.datas.has(dt)) lote.datas.set(dt, { novo: !datasExistentes.has(dt), backup: false });
  }
  return lote;
}
