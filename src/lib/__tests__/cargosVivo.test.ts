/**
 * O cadastro vivo: o que vem do banco (tela de Cargos) é aplicado dentro das
 * mesmas listas que `lib/index.ts` exporta.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CARGOS, aplicarCadastro, cargosAtuais, slugDoNome, type Cargo } from '@/lib/cargos';
import { PERFIL_LABELS, PERFIS_QUE_CONTAM_NO_RECEBIMENTO, PERFIS_ADMIN } from '@/lib/index';

afterEach(() => aplicarCadastro(CARGOS));

describe('aplicarCadastro', () => {
  it('cargo novo e regra trocada aparecem nas listas já exportadas', () => {
    const novo = {
      ...CARGOS[0], slug: 'supervisor', nome: 'Supervisor', ordem: 11,
      conta_no_recebimento: true,
    } as unknown as Cargo;
    aplicarCadastro([...CARGOS, novo]);
    expect(PERFIL_LABELS.supervisor).toBe('Supervisor');
    expect(PERFIS_QUE_CONTAM_NO_RECEBIMENTO).toContain('supervisor');
    expect(PERFIS_ADMIN).toEqual(['administrador', 'super_admin']);
    expect(cargosAtuais().map(c => c.slug)).toContain('supervisor');
  });

  it('volta ao espelho estático', () => {
    aplicarCadastro(CARGOS);
    expect(PERFIL_LABELS.supervisor).toBeUndefined();
    expect(PERFIS_QUE_CONTAM_NO_RECEBIMENTO).toEqual(['operador', 'elite']);
  });

  it('cadastro vazio não apaga as listas', () => {
    aplicarCadastro([]);
    expect(PERFIL_LABELS.operador).toBe('Operador');
  });
});

describe('slugDoNome', () => {
  it('tira acento, espaço e número', () => {
    expect(slugDoNome('Supervisor de Qualidade')).toBe('supervisor_de_qualidade');
    expect(slugDoNome('  Gestão 2 ')).toBe('gestao');
  });
});
