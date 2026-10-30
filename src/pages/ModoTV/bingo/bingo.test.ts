import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ESTRELA, LINHAS, elegiveis, encaixa, faltamParaCheia, gruposDoLider, lerAviso, letraDe, melhorFeito,
  padrao, paraMarcarSozinho, pedrasDaSorteQuina, podeGritar,
} from './regras';
import { CARTELA_DEMO, estadoDemo } from './demo';
import type { CartelaNoControle } from './tipos';

const C = CARTELA_DEMO;
const cartela = (nome: string, numeros = C): CartelaNoControle => ({
  perfil_id: nome, nome, foto: null, equipe_nome: null, numeros, gritou_em: null, gritou_tipo: null,
});

describe('a cartela', () => {
  it('a demo é uma cartela tradicional: faixas por coluna e estrela no meio', () => {
    expect(C[ESTRELA]).toBe(0);
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 5; r++) {
        const n = C[r * 5 + c];
        if (r * 5 + c === ESTRELA) continue;
        expect(n).toBeGreaterThanOrEqual(c * 15 + 1);
        expect(n).toBeLessThanOrEqual(c * 15 + 15);
      }
    }
  });

  it('letra de cada faixa', () => {
    expect([1, 15, 16, 30, 31, 45, 46, 60, 61, 75].map(letraDe).join('')).toBe('BBIINNGGOO');
  });

  it('12 linhas que fazem quina, as diagonais passando pela estrela', () => {
    expect(LINHAS).toHaveLength(12);
    expect(LINHAS.filter(l => l.includes(ESTRELA))).toHaveLength(4);
  });
});

describe('padrão', () => {
  it('quina numa linha', () => {
    expect(padrao(C, new Set([3, 22, 41, 50, 67]), 'quina')).toEqual([0, 1, 2, 3, 4]);
  });

  it('a estrela conta: coluna N fecha com 4 pedras', () => {
    expect(padrao(C, new Set([41, 38, 33, 44]), 'quina')).toEqual([2, 7, 12, 17, 22]);
  });

  it('diagonal pela estrela', () => {
    expect(padrao(C, new Set([3, 17, 55, 75]), 'quina')).toEqual([0, 6, 12, 18, 24]);
  });

  it('quatro de cinco não fecha', () => {
    expect(padrao(C, new Set([3, 22, 41, 50]), 'quina')).toBeNull();
  });

  it('cartela cheia precisa dos 24', () => {
    const todos = new Set(C.filter(n => n));
    expect(padrao(C, todos, 'cheia')).toHaveLength(25);
    todos.delete(75);
    expect(padrao(C, todos, 'cheia')).toBeNull();
    expect(melhorFeito(C, todos)).toBe('quina');
  });
});

describe('pedras da sorte e grupos', () => {
  it('as que faltam nas linhas a uma pedra, sem repetir', () => {
    // Linha 0 sem o 67; coluna B sem o 1.
    const s = new Set([3, 22, 41, 50, 11, 7, 14]);
    expect(pedrasDaSorteQuina(C, s)).toEqual([1, 67]);
  });

  it('cada pessoa num grupo só, o mais adiantado', () => {
    const quase = new Set(C.filter(n => n && n !== 75 && n !== 61));
    const g = gruposDoLider([
      cartela('perto', C),
      // Nenhuma das pedras sorteadas está nesta.
      cartela('nada', [2, 16, 31, 46, 62, 4, 18, 32, 47, 63, 5, 20, 0, 48, 65, 6, 21, 34, 49, 66, 8, 23, 35, 51, 68]),
    ], [3, 22, 41, 50]);
    expect(g.pertoDaQuina.map(p => p.cartela.nome)).toEqual(['perto']);
    expect(g.pertoDaQuina[0].sorte).toEqual([67]);

    const g2 = gruposDoLider([cartela('quase')], [...quase]);
    expect(g2.pertoDaCheia.map(p => p.cartela.nome)).toEqual(['quase']);
    expect(g2.pertoDaCheia[0].sorte).toEqual([61, 75]);
    expect(g2.fezQuina).toEqual([]);

    const g3 = gruposDoLider([cartela('cheia')], C.filter(n => n));
    expect(g3.bingo).toHaveLength(1);
    expect(faltamParaCheia(C, new Set(C))).toEqual([]);
  });

  it('elegíveis pela régua das pedras, não pelo que a pessoa marcou', () => {
    expect(elegiveis([cartela('a')], [3, 22, 41, 50, 67], 'quina')).toHaveLength(1);
    expect(elegiveis([cartela('a')], [3, 22, 41, 50, 67], 'cheia')).toHaveLength(0);
  });
});

describe('tempo real', () => {
  it('a pedra encaixa, repete ou abre buraco', () => {
    const p = [9, 3];
    expect(encaixa(p, { tipo: 'pedra', partida: 'x', ordem: 3, numero: 22 })).toBe('nova');
    expect(encaixa(p, { tipo: 'pedra', partida: 'x', ordem: 2, numero: 3 })).toBe('repetida');
    expect(encaixa(p, { tipo: 'pedra', partida: 'x', ordem: 4, numero: 58 })).toBe('buraco');
    expect(encaixa(p, { tipo: 'pedra', partida: 'x', ordem: 2, numero: 7 })).toBe('buraco');
  });

  it('aviso torto não passa', () => {
    expect(lerAviso({ tipo: 'pedra', partida: 'x', ordem: 1, numero: 99 })).toBeNull();
    expect(lerAviso({ tipo: 'pedra', ordem: 1, numero: 9 })).toBeNull();
    expect(lerAviso({ tipo: 'grito', partida: 'x', quem: 'p', grito: 'bingo' })).toBeNull();
    expect(lerAviso({ tipo: 'qualquer', partida: 'x' })).toBeNull();
    expect(lerAviso({ tipo: 'pedra', partida: 'x', ordem: '2', numero: '9' })).toEqual({ tipo: 'pedra', partida: 'x', ordem: 2, numero: 9 });
    expect(lerAviso({ tipo: 'vitoria', partida: 'x' })).toEqual({ tipo: 'vitoria', partida: 'x' });
  });
});

describe('o jogador', () => {
  it('marca sozinho só o que é da cartela, saiu, não foi marcado e venceu o tempo', () => {
    const vista = new Map([[3, 0], [22, 0], [9, 0], [41, 90_000]]);
    const r = paraMarcarSozinho(C, [3, 22, 9, 41], new Set([22]), new Set(), vista, 120_000, 120_000);
    expect(r).toEqual([3]);
  });

  it('o grito acende só se a cartela fez mais do que já gritou', () => {
    expect(podeGritar(null, null)).toBe(false);
    expect(podeGritar('quina', null)).toBe(true);
    expect(podeGritar('quina', 'quina')).toBe(false);
    expect(podeGritar('cheia', 'quina')).toBe(true);
    expect(podeGritar('cheia', 'cheia')).toBe(false);
  });

  it('a demo comemora uma quina de verdade', () => {
    const e = estadoDemo('chiclete', [9, 3, 22, 58, 41, 50, 31, 67]);
    expect(e.vitoria?.ganhadores[0].padrao).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('os temas', () => {
  it('os oito estão prontos, carregam e cada arquivo é o tema do nome', async () => {
    const { TEMAS_BINGO, carregarTema } = await import('./temas');
    expect(TEMAS_BINGO.map(t => t.id).sort()).toEqual(['aquario', 'bichinho', 'bloco', 'chiclete', 'fliperama', 'gacha', 'galaxia', 'rpg']);
    for (const t of TEMAS_BINGO) {
      expect(t.pronto, t.id).toBe(true);
      const tema = await carregarTema(t.id);
      expect(tema.id).toBe(t.id);
      expect(tema.nome).toBe(t.nome);
      expect(typeof tema.Bola).toBe('function');
      expect(typeof tema.Maquina).toBe('function');
      expect(typeof tema.Festa).toBe('function');
    }
  });

  it('os temas do banco são os mesmos do front', () => {
    const sql = readFileSync(resolve(__dirname, '../../../../supabase/migrations/20261030200000_modo_tv_bingo.sql'), 'utf8');
    const lista = sql.match(/CHECK \(tema IN \(([^)]+)\)\)/)?.[1] ?? '';
    expect(lista.replace(/[' ]/g, '').split(',').sort()).toEqual(['aquario', 'bichinho', 'bloco', 'chiclete', 'fliperama', 'gacha', 'galaxia', 'rpg']);
  });
});

describe('a migration casa com o front', () => {
  const sql = readFileSync(resolve(__dirname, '../../../../supabase/migrations/20261030200000_modo_tv_bingo.sql'), 'utf8');
  const servico = readFileSync(resolve(__dirname, 'servico.ts'), 'utf8');
  const chamadas = [...servico.matchAll(/'(fn_(?:bingo|tv_bingo)_?\w*)'/g)].map(m => m[1]);

  it('toda RPC chamada pelo front existe e tem grant', () => {
    expect(chamadas.length).toBeGreaterThan(8);
    const grants = sql.slice(sql.indexOf('GRANT EXECUTE'));
    for (const f of new Set(chamadas)) {
      expect(sql, f).toContain(`FUNCTION public.${f}(`);
      expect(grants, f).toContain(`public.${f}(`);
    }
  });

  it('só a da TV abre para anon, e as internas não abrem para ninguém', () => {
    const anon = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION ([^;]+) TO ([^;]+);/g)].filter(m => m[2].includes('anon'));
    expect(anon.map(m => m[1].trim())).toEqual(['public.fn_tv_bingo(TEXT, BOOLEAN)']);
    for (const interna of ['fn_bingo_sortear_interno', 'fn_bingo_avisar', 'fn_bingo_dar_cartelas', 'fn_bingo_estado']) {
      expect(sql.slice(sql.indexOf('GRANT EXECUTE'))).not.toContain(`public.${interna}(`);
    }
  });

  it('só quem foi escolhido recebe: férias e afastado fora, convite só para quem ganhou cartela', () => {
    const pessoas = sql.slice(sql.indexOf('FUNCTION public.fn_bingo_pessoas_do_painel'), sql.indexOf('FUNCTION public.fn_bingo_avisar'));
    expect(pessoas).toContain("NOT IN ('ferias', 'afastado')");
    expect(pessoas).toContain('p.ativo');
    // O convite vai para a lista que `fn_bingo_dar_cartelas` devolveu, nunca para o pedido cru.
    expect(sql).toContain('PERFORM public.fn_bingo_convidar(v_id, v_novos);');
    expect(sql).toContain('PERFORM public.fn_bingo_convidar(p_partida, v_novos);');
    // O canal da partida só abre para quem tem cartela nela ou controla o painel.
    expect(sql).toMatch(/bingo_cartelas c WHERE c\.partida_id = v_id AND c\.perfil_id = auth\.uid\(\)\)\s+OR public\.fn_bingo_controla\(v_id\)/);
  });

  it('o resumo da central só traz os painéis do meu alcance', () => {
    const resumo = sql.slice(sql.indexOf('FUNCTION public.fn_bingo_resumo'), sql.indexOf('FUNCTION public.fn_bingo_do_painel'));
    expect(resumo).toContain('public.fn_tv_alvo_no_meu_alcance(tp.setor_id, tp.equipe_id)');
  });

  it('as tabelas não têm acesso direto', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.bingo_partidas, public\.bingo_cartelas, public\.bingo_pedras,\s+public\.bingo_vitorias, public\.bingo_vitoria_ganhadores FROM anon, authenticated;/);
    expect(sql).not.toMatch(/CREATE POLICY \w+ ON public\.bingo_/);
  });
});

describe('o movimento', () => {
  // Máquina corporativa com «Efeitos de animação» desligado responde
  // `reduce`: o Bingo parado não mostra sorteio nenhum (ver `BingoTv.tsx`).
  const arquivos = ['BingoTv.tsx', 'Cartela.tsx', 'jogador/CartelasDoJogador.tsx'];

  it('nenhuma peça do motor obedece a prefers-reduced-motion', () => {
    for (const a of arquivos) {
      const fonte = readFileSync(resolve(__dirname, a), 'utf8');
      expect(fonte, a).not.toMatch(/@media\s*\(prefers-reduced-motion/);
      expect(fonte, a).not.toContain('matchMedia');
    }
  });

  it('o modo leve deixa o Bingo animar', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    expect(css).toContain('[data-bingo-anima], [data-bingo-anima] *');
    expect(readFileSync(resolve(__dirname, 'BingoTv.tsx'), 'utf8')).toContain('data-bingo-anima');
  });
});
