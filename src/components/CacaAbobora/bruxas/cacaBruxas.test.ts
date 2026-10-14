/**
 * cacaBruxas.test.ts — a Caça às Bruxas ligada às rodadas do banco.
 *
 * O que amarra o app ao banco e quebraria em silêncio: a rodada que diz o
 * tema, a finalização que chega depois na mesma rodada, a lista dos fofos (o
 * banco só aceita finalizar os mesmos que o desenho deixa desmaiados) e as
 * garantias da migration 20261014200000.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BRUXAS_FOFAS, juntarRodada, normalizarRodada, type RodadaAbobora } from '../caca';
import { BRUXAS } from './arte';
import { dadosDaRodada } from './rodada';

const BRUTA = {
  id: 7, dia: '2026-10-20', solta_em: '2026-10-20T13:00:00Z', expira_em: '2026-10-20T13:15:00Z',
  semente: 123, origem: 'sorteio', situacao: 'achada', achada_em: '2026-10-20T13:00:04Z',
  achada_por: 'u1', achada_por_nome: 'Mariana de Souza Lima', achada_por_foto: 'https://x/f.jpg', ms: 4213,
  mais_rapida_do_dia: true, zumbi: null, headshot: false, headshot_mais_rapido_do_dia: false,
  tema: 'bruxas', bruxa: 2, tiro: 'vassoura',
  finalizada_em: null, finalizada_por: null, finalizada_por_nome: null, dobrado: false,
};

describe('a rodada de bruxa', () => {
  it('lê o tema, a bruxa, o tiro e a finalização', () => {
    const r = normalizarRodada(BRUTA)!;
    expect(r.tema).toBe('bruxas');
    expect(r.bruxa).toBe(2);
    expect(r.tiro).toBe('vassoura');
    expect(r.dobrado).toBe(false);
  });

  it('rodada de antes da migration é de zumbi, sem tiro', () => {
    const { tema: _t, bruxa: _b, tiro: _ti, dobrado: _d, ...antiga } = BRUTA;
    const r = normalizarRodada({ ...antiga, zumbi: 3 })!;
    expect(r.tema).toBe('zumbis');
    expect(r.bruxa).toBeNull();
    expect(r.tiro).toBeNull();
  });

  it('a finalização chega depois, na mesma rodada achada, e muda a faixa', () => {
    const r = normalizarRodada(BRUTA)!;
    const antes = { rodada: r, faixaAte: 1000 };
    const finalizada = normalizarRodada({ ...BRUTA, finalizada_em: '2026-10-20T13:00:07Z', finalizada_por: 'u1', dobrado: true })!;
    const depois = juntarRodada(antes, finalizada, true, 500);
    expect(depois).not.toBe(antes);
    expect(depois.rodada?.dobrado).toBe(true);
    // A faixa continua o tempo que já tinha: não recomeça.
    expect(depois.faixaAte).toBe(1000);
  });

  it('a faixa diz o que a rodada diz', () => {
    const r = normalizarRodada({ ...BRUTA, dobrado: true })! as RodadaAbobora;
    const d = dadosDaRodada(r);
    expect(d.nome).toBe('Mariana Lima');
    expect(d.bruxa).toBe(BRUXAS[2]);
    expect(d.morte).toBe('vassoura');
    expect(d.dobrado).toBe(true);
    expect(d.rapida).toBe(true);
    // Rodada sem `tiro`: cabeça ou corpo, pelo headshot.
    expect(dadosDaRodada({ ...r, tiro: null, headshot: true }).morte).toBe('cabeca');
  });
});

describe('os fofos: o mesmo no desenho, no app e no banco', () => {
  const SQL = fs.readFileSync(
    path.resolve(__dirname, '../../../../supabase/migrations/20261014200000_caca_bruxas.sql'), 'utf8',
  ).toLowerCase().replace(/\s+/g, ' ');

  it('BRUXAS_FOFAS são as bruxas fofas do desenho', () => {
    expect([...BRUXAS_FOFAS]).toEqual(BRUXAS.map((b, i) => (b.fofa ? i : -1)).filter(i => i >= 0));
  });

  it('o banco só deixa finalizar os mesmos fofos', () => {
    expect(SQL).toContain(`coalesce(v_rodada.bruxa, -1) not in (${BRUXAS_FOFAS.join(', ')})`);
  });

  it('são 8 bruxas, como o sorteio do banco (0 a 7)', () => {
    expect(BRUXAS).toHaveLength(8);
    expect(SQL).toContain('check (bruxa is null or bruxa between 0 and 7)');
  });
});

describe('migration da Caça às Bruxas', () => {
  const SQL = fs.readFileSync(
    path.resolve(__dirname, '../../../../supabase/migrations/20261014200000_caca_bruxas.sql'), 'utf8',
  ).toLowerCase().replace(/\s+/g, ' ');
  const corpo = (funcao: string) => {
    const inicio = SQL.indexOf(`create or replace function public.${funcao}(`);
    expect(inicio, funcao).toBeGreaterThan(-1);
    return SQL.slice(inicio, SQL.indexOf('$function$;', inicio));
  };

  it('finalizar trava a linha: o primeiro clique leva, o segundo encontra já finalizada', () => {
    const f = corpo('fn_abobora_finalizar');
    expect(f).toContain('for update');
    expect(f).toContain('finalizada_por is not null');
    expect(f).toContain("situacao <> 'achada'");
    expect(f).toContain('dobrado = (auth.uid() = v_rodada.achada_por)');
  });

  it('o tiro continua travando a linha e grava onde pegou', () => {
    const p = corpo('fn_abobora_pegar');
    expect(p).toContain('for update');
    expect(p).toContain('tiro = v_tiro');
    // A versão anterior sai: duas deixariam o PostgREST sem saber qual chamar.
    expect(SQL).toContain('drop function if exists public.fn_abobora_pegar(bigint, boolean);');
  });

  it('trocar o tema é do super_admin, e soltar segue fechado ao app', () => {
    expect(corpo('fn_abobora_tema')).toContain('fn_user_is_super_admin()');
    expect(SQL).toContain('revoke all on function public.fn_abobora_soltar(text) from public, anon, authenticated;');
  });

  it('o headshot nunca fica nulo, mesmo sem p_tiro', () => {
    expect(corpo('fn_abobora_pegar')).toContain("coalesce(p_headshot, false) or coalesce(p_tiro = 'cabeca', false)");
  });
});
