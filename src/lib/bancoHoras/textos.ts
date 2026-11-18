/**
 * Os textos de «Copiar», no formato do WhatsApp (*negrito*). Sem + e −:
 * negativo leva «devendo» escrito.
 */
import {
  type FiltroSituacao, type Grupo, type Janela, type Pessoa, type ResumoSetor, type Visao,
  fimDaJanela, ordemNatural, valorNoGrupo, vencendoNa, vencendoNoMes, verNegativas, verPositivas,
} from './calculos';
import { data as fmtData, horas, mesCurto, plural } from './formato';

const cabecalho = (titulo: string, filtro: string, v: Visao) =>
  [`*${titulo}*${filtro ? ` · ${filtro}` : ''}`, `Banco de horas, saldo em ${fmtData(v.data)}`];

export function textoPessoas(L: Pessoa[], titulo: string, filtro: string, v: Visao, sit: FiltroSituacao): string {
  const out = cabecalho(titulo, filtro, v);
  const pz = L.filter(p => p.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  const ng = L.filter(p => p.saldo < 0).sort((a, b) => a.saldo - b.saldo);
  if (pz.length && verPositivas(sit)) {
    out.push('', `🔵 *Horas positivas* · ${plural(pz.length, 'pessoa', 'pessoas')} · ${horas(pz.reduce((s, p) => s + p.saldo, 0))}`);
    pz.forEach(p => out.push(`• ${p.nome} (${p.setor}) — ${horas(p.saldo)}`));
  }
  if (ng.length && verNegativas(sit)) {
    out.push('', `🔴 *Horas negativas (devendo)* · ${plural(ng.length, 'pessoa', 'pessoas')} · ${horas(ng.reduce((s, p) => s + p.saldo, 0))}`);
    ng.forEach(p => out.push(`• ${p.nome} (${p.setor}) — ${horas(p.saldo)}`));
  }
  return out.join('\n');
}

export function textoPessoa(p: Pessoa, v: Visao): string {
  const out = [`*${p.nome}* (${p.setor})`, `Banco de horas, saldo em ${fmtData(v.data)}`, '',
    `${p.saldo < 0 ? 'Devendo' : 'Guardadas'} no banco: *${horas(p.saldo)}*`];
  if (p.vprox > 0) out.push(`⚠ Vence em ${fmtData(v.prox)}: ${horas(p.vprox)}`);
  out.push('', 'Horas por mês:');
  for (const m of Object.keys(p.mes).filter(k => p.mes[k]).sort().reverse()) {
    out.push(`• ${mesCurto(m)}: ${horas(p.mes[m])}${p.mes[m] < 0 ? ' devendo' : ''}`);
  }
  return out.join('\n');
}

export function textoGrupo(g: Grupo, L: Pessoa[], filtro: string, v: Visao): string {
  const lista = [...L].sort((a, b) => Math.abs(valorNoGrupo(g.id, b)) - Math.abs(valorNoGrupo(g.id, a)));
  return [`*${g.titulo}*${filtro ? ` · ${filtro}` : ''}`, `Banco de horas, saldo em ${fmtData(v.data)} · ${plural(lista.length, 'pessoa', 'pessoas')}`, '',
    ...lista.map(p => `• ${p.nome} (${p.setor}) — ${horas(valorNoGrupo(g.id, p))}${g.id === 'vence' ? ' vencendo' : p.saldo < 0 ? ' devendo' : ''}`),
  ].join('\n');
}

export function textoSetores(S: ResumoSetor[], filtro: string, v: Visao, sit: FiltroSituacao): string {
  const pos = verPositivas(sit);
  const neg = verNegativas(sit);
  return [`*Banco de horas por setor*${filtro ? ` · ${filtro}` : ''}`, `Saldo em ${fmtData(v.data)}`, '',
    ...[...S].sort((a, b) => b.saldo - a.saldo).map(s => `• *${s.setor}* — ${[
      pos && `positivas ${horas(s.bPos)} (${s.nPos})`,
      neg && `negativas ${horas(s.bNeg)} (${s.nNeg})`,
    ].filter(Boolean).join(', ')}`),
  ].join('\n');
}

export function textoVencimentos(L: Pessoa[], v: Visao, j: Janela): string {
  const lista = L.filter(p => vencendoNa(p, j) > 0)
    .sort((a, b) => ordemNatural(a.setor, b.setor) || vencendoNa(b, j) - vencendoNa(a, j));
  const out = [`*Banco de horas · vence até ${fmtData(fimDaJanela(v, j))}*`, 'Horas positivas que precisam ser compensadas:'];
  let atual: string | null = null;
  for (const p of lista) {
    if (p.setor !== atual) { atual = p.setor; out.push('', `*${atual}*`); }
    out.push(`• ${p.nome} — ${horas(vencendoNa(p, j))}`);
  }
  return out.join('\n');
}

/** «Só o mês»: quem tem horas vencendo naquele dia de vencimento, sem somar os meses de antes. */
export function textoVencimentosNoMes(L: Pessoa[], v: Visao, mes: string, dia: string): string {
  const val = (p: Pessoa) => vencendoNoMes(p, mes, v.data);
  const lista = L.filter(p => val(p) > 0)
    .sort((a, b) => ordemNatural(a.setor, b.setor) || val(b) - val(a));
  const out = [`*Banco de horas · vence em ${fmtData(dia)}*`, `Só as horas positivas que vencem em ${mesCurto(mes)}:`];
  let atual: string | null = null;
  for (const p of lista) {
    if (p.setor !== atual) { atual = p.setor; out.push('', `*${atual}*`); }
    out.push(`• ${p.nome} — ${horas(val(p))}`);
  }
  return out.join('\n');
}

/** Copia; devolve se deu certo. */
export async function copiarTexto(txt: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(txt); return true; } catch { /* cai no plano B */ }
  const ta = document.createElement('textarea');
  ta.value = txt;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
