/**
 * mensagemOperador.test.ts
 *
 * O texto vai para o WhatsApp de uma pessoa que não tem o painel aberto. O que
 * estes casos protegem é o que ela precisa entender sem perguntar nada:
 *
 *   • o número de HOJE e o de AMANHÃ, separados e nomeados;
 *   • nada de "—", "null" ou "R$ NaN" — sem meta, a seção some;
 *   • negrito de WhatsApp (`*x*`), não de Markdown (`**x**`), que apareceria
 *     literal na conversa.
 */
import { describe, it, expect } from 'vitest';
import { montarMensagemOperador } from './mensagemOperador';
import { detalharOperador } from './detalheOperador';
import type { QuartilConfig } from '@/lib/supabase';

const QUARTIS: QuartilConfig[] = [
  { quartil: 1, min_pct: 100 },
  { quartil: 2, min_pct: 80 },
  { quartil: 3, min_pct: 60 },
  { quartil: 4, min_pct: 0 },
] as QuartilConfig[];

/** Operador no 3º quartil: meta 20.000, 20 dias úteis, 10 decorridos. */
function detalhePadrao(recebido = 7_000) {
  return detalharOperador({
    recebido, meta: 20_000, totalUteis: 20, decorridos: 10,
    quartis: QUARTIS, pagamentos: 14,
  });
}

function montar(recebido = 7_000, meta: number | null = 20_000) {
  return montarMensagemOperador({
    nome: 'Ana Paula',
    mes: '2026-08',
    recebido,
    meta,
    rotuloUnidade: 'H.O.',
    detalhe: detalhePadrao(recebido),
  });
}

describe('montarMensagemOperador', () => {
  it('abre com o nome e o mês por extenso', () => {
    expect(montar()).toContain('*Ana Paula* — agosto/2026');
  });

  it('usa negrito de WhatsApp, nunca de Markdown', () => {
    const texto = montar();
    expect(texto).toContain('*Ritmo*');
    expect(texto).not.toContain('**');
  });

  it('diz o recebido nomeando a unidade em exibição', () => {
    expect(montar()).toMatch(/\*Recebido \(H\.O\.\):\* R\$\s?7\.000,00/);
  });

  it('traz a meta com a porcentagem já calculada', () => {
    expect(montar()).toMatch(/\*Meta:\* R\$\s?20\.000,00 \(35% da meta\)/);
  });

  it('nomeia a faixa atual', () => {
    // 7.000 sobre 10.000 esperados = 70% → 3º quartil (min 60).
    expect(montar()).toContain('*Faixa atual:* 3º quartil');
  });

  it('separa hoje de amanhã, e explica a diferença', () => {
    const texto = montar();
    expect(texto).toContain('*Para subir de faixa*');
    expect(texto).toContain('a régua sobe todo dia útil');
    expect(texto).toMatch(/2º quartil: hoje R\$.*· para seguir amanhã R\$/);
  });

  it('o número de amanhã é MAIOR que o de hoje — a régua subiu', () => {
    const d = detalhePadrao();
    const segundo = d.degraus.find(g => g.quartil === 2)!;
    expect(segundo.faltaAmanha).not.toBeNull();
    expect(segundo.faltaAmanha!).toBeGreaterThan(segundo.falta);
    // Meta 20.000 / 20 dias = 1.000/dia; a régua do 2º quartil (80%) sobe 800.
    expect(segundo.faltaAmanha! - segundo.falta).toBeCloseTo(800, 5);
  });

  it('não repete faixa já alcançada na lista de degraus', () => {
    // 7.000 já passa do 4º (0%) e do 3º (60% de 10.000 = 6.000).
    const texto = montar();
    expect(texto).not.toContain('4º quartil: hoje');
    expect(texto).not.toContain('3º quartil: hoje');
    expect(texto).toContain('2º quartil: hoje');
    expect(texto).toContain('1º quartil: hoje');
  });

  it('sem meta, a seção de faixa e a de meta somem em vez de mostrar traço', () => {
    const semMeta = montarMensagemOperador({
      nome: 'Bruno', mes: '2026-08', recebido: 5_000, meta: null,
      rotuloUnidade: 'Bruto',
      detalhe: detalharOperador({
        recebido: 5_000, meta: null, totalUteis: 20, decorridos: 10, quartis: QUARTIS,
      }),
    });
    expect(semMeta).not.toContain('*Meta:*');
    expect(semMeta).not.toContain('*Faixa atual:*');
    expect(semMeta).not.toContain('*Para subir de faixa*');
    expect(semMeta).not.toContain('NaN');
    expect(semMeta).not.toContain('null');
    // O travessão do cabeçalho ("Bruno — agosto/2026") é legítimo. O que não
    // pode existir é travessão como VALOR — o "—" que a tela usa para "não sei"
    // e que numa conversa de WhatsApp não significa nada.
    expect(semMeta).not.toMatch(/:\*?\s*—\s*$/m);
    expect(semMeta.split('\n').some(l => l.trim() === '—')).toBe(false);
    // O ritmo, esse, existe sem meta nenhuma.
    expect(semMeta).toContain('*Ritmo*');
  });

  it('quem já está na melhor faixa recebe elogio, não uma lista vazia', () => {
    const texto = montar(12_000);
    expect(texto).toContain('Você já está na melhor faixa.');
    expect(texto).not.toContain('*Para subir de faixa*');
  });

  it('meta batida vira comemoração em vez de ritmo necessário', () => {
    const texto = montar(25_000);
    expect(texto).toContain('Meta do mês já batida');
    expect(texto).not.toContain('Para bater a meta:');
  });

  it('no último dia útil não promete um amanhã que não existe', () => {
    const detalhe = detalharOperador({
      recebido: 7_000, meta: 20_000, totalUteis: 20, decorridos: 20, quartis: QUARTIS,
    });
    expect(detalhe.degraus.every(g => g.faltaAmanha === null)).toBe(true);

    const texto = montarMensagemOperador({
      nome: 'Ana', mes: '2026-08', recebido: 7_000, meta: 20_000,
      rotuloUnidade: 'H.O.', detalhe,
    });
    expect(texto).not.toContain('para seguir amanhã');
    expect(texto).toContain('hoje R$');
  });

  it('não deixa vazar objeto nem undefined no texto final', () => {
    const texto = montar();
    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('[object');
  });
});
