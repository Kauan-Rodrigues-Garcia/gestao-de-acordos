import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODELOS, TEMAS, camposFaltando, conteudoDoBanco, fimDeHojeLocal, imagemSegura, limparConteudo, modeloPorId, situacaoDaArte } from './modelos';

describe('modelos de arte', () => {
  it('todo modelo e todo tema do app existem no CHECK da migration', () => {
    const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261117180000_artes_para_todos.sql'), 'utf8');
    for (const m of MODELOS) expect(sql).toContain(`'${m.id}'`);
    for (const t of Object.keys(TEMAS)) expect(sql).toContain(`'${t}'`);
  });

  it('o padrão de cada modelo já vem completo e dentro do tamanho', () => {
    for (const m of MODELOS) {
      if (m.id === 'imagem') continue; // a imagem precisa ser enviada
      expect(camposFaltando(m, m.padrao)).toEqual([]);
      for (const f of m.campos) expect((m.padrao[f.id] ?? '').length).toBeLessThanOrEqual(f.max);
    }
  });

  it('«Deu a louca na gerente» vem com o valor de ontem e o desafio de R$ 1,5 milhão', () => {
    const m = modeloPorId('deu-a-louca')!;
    expect(m.padrao.valor).toBe('R$ 503.997,49');
    expect(m.padrao.meta).toBe('R$ 1.500.000,00');
    expect(m.padrao.premio).toMatch(/1 hora mais cedo/i);
    // 17/11: não chegamos ao resultado, mas agradece a cada um; o fim parabeniza o time.
    expect(m.padrao.agradecimento).toMatch(/não chegamos ao resultado/i);
    expect(m.padrao.agradecimento).toMatch(/agradeço a cada um/i);
    expect(m.padrao.rodape).toMatch(/parabéns/i);
  });

  it('falta preencher, limpar e ler do banco', () => {
    const m = modeloPorId('recado')!;
    expect(camposFaltando(m, { emoji: '📣', titulo: ' ', texto: 'x' })).toEqual(['Título']);
    const limpo = limparConteudo(m, { emoji: '📣', titulo: `  ${'a'.repeat(80)}  `, texto: 'oi', extra: 'some' });
    expect(limpo.titulo).toHaveLength(60);
    expect(limpo).not.toHaveProperty('extra');
    expect(conteudoDoBanco(m, { titulo: 'Oi', texto: 3 })).toEqual({ emoji: '', titulo: 'Oi', texto: '', rodape: '' });
    expect(conteudoDoBanco(m, null).titulo).toBe('');
  });

  it('imagem só de https (blob só na prévia)', () => {
    expect(imagemSegura('https://x.supabase.co/storage/v1/object/public/artes/a.png')).toBe(true);
    expect(imagemSegura('javascript:alert(1)')).toBe(false);
    expect(imagemSegura('http://x/a.png')).toBe(false);
  });

  it('situação da arte pela hora', () => {
    const agora = new Date('2026-11-17T12:00:00Z');
    const a = { inicio: '2026-11-17T10:00:00Z', fim: '2026-11-17T23:00:00Z', encerrada_em: null };
    expect(situacaoDaArte(a, agora)).toBe('no_ar');
    expect(situacaoDaArte({ ...a, inicio: '2026-11-17T13:00:00Z' }, agora)).toBe('agendada');
    expect(situacaoDaArte({ ...a, fim: '2026-11-17T11:00:00Z' }, agora)).toBe('terminou');
    expect(situacaoDaArte({ ...a, encerrada_em: '2026-11-17T11:00:00Z' }, agora)).toBe('encerrada');
    expect(situacaoDaArte({ ...a, fim: null }, agora)).toBe('no_ar');
  });

  it('fim de hoje às 23:59', () => {
    expect(fimDeHojeLocal(new Date(2026, 10, 17, 9, 30))).toBe('2026-11-17T23:59');
  });
});
