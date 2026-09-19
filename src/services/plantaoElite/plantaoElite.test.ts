import { describe, it, expect } from 'vitest';
import {
  FAIXAS_ELITE, FAIXA_DEPOIS, ROTULO_DEPOIS,
  faixaDaChegada, faixasApuradas, horaAgoraSaoPaulo, montarQuadroElite,
  outroDiaDePlantao, plantaoDoDia, primeiroNome, ultimoDiaDoPlantao,
  type ChegadaElite, type MembroElite,
} from './plantaoElite';

const TIAGO:  MembroElite = { id: 'tiago',  nome: 'Tiago Almada', usuario: 'tiago_almada' };
const AGATHA: MembroElite = { id: 'agatha', nome: 'Agatha Rocha', usuario: 'agatha_rocha' };

const chegada = (operador_id: string, hora: number, valor: number): ChegadaElite =>
  ({ operador_id, hora, valor, qtd: 1 });

describe('faixaDaChegada — a hora em que a linha chegou vira a faixa que fechou', () => {
  it('o robô das 09:07 fecha a primeira faixa, e o que chegou antes também cai nela', () => {
    expect(faixaDaChegada(9)).toBe(0);
    expect(faixaDaChegada(8)).toBe(0);
    expect(faixaDaChegada(0)).toBe(0);
  });

  it('chegou às 10h é de 09:00 - 10:00; chegou às 20h é de 19:00 - 20:00', () => {
    expect(FAIXAS_ELITE[faixaDaChegada(10)]).toBe('09:00 - 10:00');
    expect(FAIXAS_ELITE[faixaDaChegada(13)]).toBe('12:00 - 13:00');
    expect(FAIXAS_ELITE[faixaDaChegada(20)]).toBe('19:00 - 20:00');
  });

  it('depois das 21h, ou em outro dia (24), vai para «depois das 20:00»', () => {
    expect(faixaDaChegada(21)).toBe(FAIXA_DEPOIS);
    expect(faixaDaChegada(23)).toBe(FAIXA_DEPOIS);
    expect(faixaDaChegada(24)).toBe(FAIXA_DEPOIS);
  });
});

describe('faixasApuradas — o divisor da média', () => {
  it('dia passado tem as 12 faixas; dia futuro, nenhuma', () => {
    expect(faixasApuradas('2026-09-18', '2026-09-19', 3)).toBe(12);
    expect(faixasApuradas('2026-09-20', '2026-09-19', 15)).toBe(0);
  });

  it('hoje conta as faixas cujo robô já rodou', () => {
    expect(faixasApuradas('2026-09-19', '2026-09-19', 8)).toBe(0);
    expect(faixasApuradas('2026-09-19', '2026-09-19', 9)).toBe(1);
    expect(faixasApuradas('2026-09-19', '2026-09-19', 10)).toBe(2);
    expect(faixasApuradas('2026-09-19', '2026-09-19', 20)).toBe(12);
    expect(faixasApuradas('2026-09-19', '2026-09-19', 23)).toBe(12);
  });
});

describe('dia ímpar e dia par', () => {
  it('segue o dia do mês, como a planilha', () => {
    expect(plantaoDoDia('2026-09-11')).toBe('impar');
    expect(plantaoDoDia('2026-09-12')).toBe('par');
    expect(plantaoDoDia('2026-09-19')).toBe('impar');
  });

  it('as setas da dupla pulam os dias da outra', () => {
    expect(outroDiaDePlantao('2026-09-19', -1, 'impar')).toBe('2026-09-17');
    expect(outroDiaDePlantao('2026-09-18', 1, 'par')).toBe('2026-09-20');
    expect(outroDiaDePlantao('2026-09-19', -1, null)).toBe('2026-09-18');
  });

  it('a virada de mês junta dois ímpares (31 → 1) e a seta não pula o 1º', () => {
    expect(outroDiaDePlantao('2026-10-31', 1, 'impar')).toBe('2026-11-01');
    expect(outroDiaDePlantao('2026-11-01', -1, 'impar')).toBe('2026-10-31');
    expect(outroDiaDePlantao('2026-11-01', -1, 'par')).toBe('2026-10-30');
  });

  it('quem abre em dia da outra dupla cai no último dia do próprio plantão', () => {
    expect(ultimoDiaDoPlantao('2026-09-19', 'impar')).toBe('2026-09-19');
    expect(ultimoDiaDoPlantao('2026-09-19', 'par')).toBe('2026-09-18');
    expect(ultimoDiaDoPlantao('2026-03-01', 'par')).toBe('2026-02-28');
  });
});

describe('horaAgoraSaoPaulo', () => {
  it('converte o instante para o fuso de São Paulo, não o da máquina', () => {
    // 13:30 UTC = 10:30 em São Paulo (UTC-3, sem horário de verão).
    expect(horaAgoraSaoPaulo(new Date('2026-09-19T13:30:00Z'))).toBe(10);
    expect(horaAgoraSaoPaulo(new Date('2026-09-20T02:10:00Z'))).toBe(23);
  });
});

describe('montarQuadroElite — o quadro da planilha', () => {
  const membros = [TIAGO, AGATHA];

  it('põe cada chegada na faixa e na coluna da pessoa, com o acumulado da dupla', () => {
    const q = montarQuadroElite({
      membros,
      chegadas: [
        chegada('tiago', 9, 393.72),
        chegada('agatha', 11, 100),
        chegada('tiago', 11, 50.1),
        chegada('tiago', 11, 0.2),
      ],
    }, 3);

    expect(q.linhas).toHaveLength(12);
    expect(q.linhas[0]).toMatchObject({ faixa: '08:30 - 09:00', valores: [393.72, 0], totalHora: 393.72, acumulado: 393.72 });
    expect(q.linhas[1]).toMatchObject({ faixa: '09:00 - 10:00', valores: [0, 0], acumulado: 393.72, aberta: false });
    expect(q.linhas[2]).toMatchObject({ faixa: '10:00 - 11:00', valores: [50.3, 100], totalHora: 150.3, acumulado: 544.02 });
    expect(q.porMembro[0].total).toBe(444.02);
    expect(q.porMembro[1].total).toBe(100);
    expect(q.totalPlantao).toBe(544.02);
  });

  it('faixa que ainda não fechou fica aberta (traço), a menos que já tenha dinheiro', () => {
    const q = montarQuadroElite({ membros, chegadas: [chegada('agatha', 15, 80)] }, 2);
    expect(q.linhas[1].aberta).toBe(false);
    expect(q.linhas[2].aberta).toBe(true);
    // Linha adiantada (corrigida no ERP) numa faixa ainda aberta aparece.
    expect(q.linhas[6]).toMatchObject({ faixa: '14:00 - 15:00', valores: [0, 80], aberta: false });
  });

  it('a média divide pelas faixas apuradas, como o MÉDIA da planilha', () => {
    const q = montarQuadroElite({
      membros,
      chegadas: [chegada('tiago', 9, 300), chegada('tiago', 10, 100)],
    }, 4);
    expect(q.porMembro[0].media).toBe(100);
    expect(q.porMembro[1].media).toBe(0);
  });

  it('o que chegou depois das 20h entra no total e numa linha própria, fora da média', () => {
    const q = montarQuadroElite({
      membros,
      chegadas: [chegada('tiago', 20, 120), chegada('tiago', 21, 30), chegada('agatha', 24, 10)],
    }, 12);
    expect(q.depois).toMatchObject({ faixa: ROTULO_DEPOIS, valores: [30, 10], totalHora: 40, acumulado: 160 });
    expect(q.porMembro[0]).toEqual({ total: 150, media: 10 });
    expect(q.totalPlantao).toBe(160);
  });

  it('sem nada depois das 20h, não há linha extra', () => {
    const q = montarQuadroElite({ membros, chegadas: [chegada('tiago', 12, 5)] }, 12);
    expect(q.depois).toBeNull();
  });

  it('ignora chegada de quem não está na dupla', () => {
    const q = montarQuadroElite({ membros, chegadas: [chegada('outro', 12, 999)] }, 12);
    expect(q.totalPlantao).toBe(0);
  });

  it('nenhuma faixa apurada: média zero, sem dividir por zero', () => {
    const q = montarQuadroElite({ membros, chegadas: [] }, 0);
    expect(q.porMembro).toEqual([{ total: 0, media: 0 }, { total: 0, media: 0 }]);
    expect(q.linhas.every(l => l.aberta)).toBe(true);
  });
});

describe('primeiroNome', () => {
  it('é o cabeçalho da coluna', () => {
    expect(primeiroNome('Matheus Gonçalves de Souza')).toBe('Matheus');
    expect(primeiroNome('  Agatha Rocha ')).toBe('Agatha');
  });
});
