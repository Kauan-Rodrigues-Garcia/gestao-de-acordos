/**
 * «Já recebeu mensagem hoje» (26/10/2026): a parte pura e o que o banco promete
 * (20261026190000). O teste do SQL lê a definição MAIS RECENTE de cada função:
 * uma migration nova que devolva setor/operador, troque a chave ou esqueça a
 * trava do dono quebra aqui.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { comNoFim, fraseRecebidos, numerosDoCliente, origemDoNumero } from './jaRecebeu';

describe('origem do número', () => {
  const f1 = '5514998124410';
  const f2 = '551434221180';
  it('reconhece o WhatsApp e o Fone 2 da mensagem', () => {
    expect(origemDoNumero(f1, f1, f2)).toBe('fone1');
    expect(origemDoNumero(f2, f1, f2)).toBe('fone2');
  });
  it('número que não é nenhum dos dois é «outro»', () => {
    expect(origemDoNumero('5514999998842', f1, f2)).toBe('outro');
    expect(origemDoNumero('5514999998842', f1, null)).toBe('outro');
  });
  it('sem número é mensagem copiada', () => {
    expect(origemDoNumero(null, f1, f2)).toBe('copiada');
  });
});

describe('números do cliente', () => {
  it('tira vazios e repetidos', () => {
    expect(numerosDoCliente('551499', null, '', '551499', undefined, '551488')).toEqual(['551499', '551488']);
  });
});

describe('frase do aviso', () => {
  it('conta e dá a hora da última (a lista vem em ordem)', () => {
    const lista = [
      { numero: '1', enviado_em: new Date(2026, 9, 26, 8, 12).toISOString(), mesmo_contrato: true },
      { numero: '2', enviado_em: new Date(2026, 9, 26, 9, 5).toISOString(), mesmo_contrato: false },
    ];
    expect(fraseRecebidos(lista)).toBe('Já recebeu 2 mensagens hoje · a última às 09:05');
    expect(fraseRecebidos(lista.slice(0, 1))).toBe('Já recebeu 1 mensagem hoje · a última às 08:12');
  });
});

describe('fim da fila', () => {
  it('leva os escolhidos para o fim sem mudar a ordem de ninguém', () => {
    expect(comNoFim([1, 2, 3, 4, 5], (n) => n === 2 || n === 4)).toEqual([1, 3, 5, 2, 4]);
  });
  it('sem escolhidos, a ordem fica', () => {
    expect(comNoFim([3, 1, 2], () => false)).toEqual([3, 1, 2]);
  });
});

// ── O banco ──────────────────────────────────────────────────────────────────

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

function ultimaDefinicao(nome: string): string {
  let corpo = '';
  for (const f of ARQUIVOS) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8').replace(/--[^\n]*/g, ' ');
    const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nome}\\b[\\s\\S]*?\\$function\\$;`, 'gi');
    for (const m of sql.matchAll(re)) corpo = m[0];
  }
  return corpo;
}

describe('o banco do «já recebeu hoje»', () => {
  it('a consulta devolve só chave, número, horário e se foi pelo contrato', () => {
    const f = ultimaDefinicao('fn_campanha_facil_ja_recebeu');
    expect(f).toMatch(/RETURNS TABLE \(chave TEXT, numero TEXT, enviado_em TIMESTAMPTZ, mesmo_contrato BOOLEAN\)/i);
    expect(f).not.toMatch(/setor|operador_id|criado_por/i);
  });

  it('acha pelo Nr.Documento na mesma empresa e pelo número em qualquer uma', () => {
    const f = ultimaDefinicao('fn_campanha_facil_ja_recebeu');
    expect(f).toMatch(/d\.empresa_id = i\.e AND d\.contrato = i\.c/i);
    expect(f).toMatch(/d\.numero = u\.num/i);
  });

  it('«hoje» é desde 00:00 de Brasília, e o próprio contato fica de fora', () => {
    const f = ultimaDefinicao('fn_campanha_facil_ja_recebeu');
    expect(f).toMatch(/date_trunc\('day', now\(\) AT TIME ZONE 'America\/Sao_Paulo'\) AT TIME ZONE 'America\/Sao_Paulo'/i);
    expect(f).toMatch(/d\.contato_id::TEXT IS DISTINCT FROM i\.k/i);
  });

  it('registrar é só do dono da mensagem, e só com um dos números dela', () => {
    const f = ultimaDefinicao('fn_campanha_facil_registrar_disparo');
    expect(f).toMatch(/x\.operador_id = \(SELECT auth\.uid\(\)\)/i);
    expect(f).toMatch(/v_num IS DISTINCT FROM c\.whatsapp AND v_num IS DISTINCT FROM c\.whatsapp2/i);
  });

  it('o envio não morre com o contato (o «Finalizar» apaga os contatos)', () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, '20261026190000_campanha_ja_recebeu_hoje.sql'), 'utf8');
    expect(sql).toMatch(/contato_id\s+UUID,/);
    expect(sql).not.toMatch(/contato_id\s+UUID[^,\n]*REFERENCES/i);
  });
});
