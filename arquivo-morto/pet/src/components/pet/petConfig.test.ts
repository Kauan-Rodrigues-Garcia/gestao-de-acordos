/**
 * Testes de `fasePet` — a regra que decide quem vê o pet, quem vê a despedida
 * e quem nunca soube que ele existiu.
 *
 * O caso que justifica o arquivo é o primeiro: campo AUSENTE (migration não
 * aplicada) tem de significar "pet como sempre foi". Se um dia alguém
 * "simplificar" isso para `?? null`, o pet some para todo mundo antes da hora,
 * sem despedida nenhuma — e o teste é o que segura essa mudança.
 */
import { describe, it, expect } from 'vitest';
import { fasePet } from './petConfig';

describe('fasePet', () => {
  it('campo ausente (migration pendente) mantém o pet como está hoje', () => {
    expect(fasePet({})).toBe('normal');
  });

  it('não confunde ausente com vazio: null é quem nunca acessou', () => {
    expect(fasePet({ pet_despedida: null })).toBe('ausente');
  });

  it("'pendente' é quem já convivia com o pet e deve se despedir", () => {
    expect(fasePet({ pet_despedida: 'pendente' })).toBe('despedindo');
  });

  it("'concluida' já se despediu — o pet não volta a aparecer", () => {
    expect(fasePet({ pet_despedida: 'concluida' })).toBe('ausente');
  });

  it('perfil ainda não carregado conta como campo ausente, não como sem pet', () => {
    // Durante o login o perfil é null por um instante. Tratar isso como
    // 'ausente' faria o pet piscar e sumir na frente de quem ainda vai se
    // despedir.
    expect(fasePet(null)).toBe('normal');
    expect(fasePet(undefined)).toBe('normal');
  });

  it('valor desconhecido não libera o pet (fail-closed)', () => {
    // Se um dia entrar um estado novo no banco, o padrão é NÃO mostrar o pet:
    // errar para menos é reversível, mostrar um pet que já se despediu não.
    expect(fasePet({ pet_despedida: 'qualquer_coisa' })).toBe('ausente');
  });
});
