/**
 * O caso que motivou este arquivo: `camila@ribeiro` é nome de usuário, não
 * endereço. A regra antiga ("tem arroba = é e-mail") impedia a pessoa de entrar
 * com o próprio login.
 *
 * Os testes de e-mail existente não são decoração: o valor desta mudança é
 * justamente que ela NÃO mexe em quem já entrava.
 */
import { describe, it, expect } from 'vitest';
import { pareceEmailEntregavel } from '../identificadorLogin';

describe('pareceEmailEntregavel', () => {
  it('reconhece endereço de verdade, que continua indo direto ao GoTrue', () => {
    expect(pareceEmailEntregavel('fulano@gmail.com')).toBe(true);
    expect(pareceEmailEntregavel('fulano.silva@empresa.com.br')).toBe(true);
    expect(pareceEmailEntregavel('CLEBER@Hotmail.COM')).toBe(true);
  });

  it('reconhece o domínio interno do sistema', () => {
    // Os 272 usuários nascem com `login@interno.sistema`. Se este caso virasse
    // busca por nome de usuário, todo login por e-mail ganharia uma consulta a
    // mais — e quem digita o e-mail interno deixaria de entrar direto.
    expect(pareceEmailEntregavel('camilly_pereira@interno.sistema')).toBe(true);
  });

  it('recusa apelido com arroba — é nome de usuário', () => {
    expect(pareceEmailEntregavel('camila@ribeiro')).toBe(false);
    expect(pareceEmailEntregavel('joao@casa')).toBe(false);
  });

  it('recusa nome de usuário comum, como sempre fez', () => {
    expect(pareceEmailEntregavel('camila_ribeiro')).toBe(false);
    expect(pareceEmailEntregavel('mateus_castro')).toBe(false);
  });

  it('recusa o que não é identificador nenhum', () => {
    expect(pareceEmailEntregavel('')).toBe(false);
    expect(pareceEmailEntregavel('   ')).toBe(false);
    expect(pareceEmailEntregavel('@')).toBe(false);
    expect(pareceEmailEntregavel('@dominio.com')).toBe(false);
    expect(pareceEmailEntregavel('fulano@')).toBe(false);
    expect(pareceEmailEntregavel('dois@arrobas@aqui.com')).toBe(false);
    // Espaço no meio nunca é endereço.
    expect(pareceEmailEntregavel('nome sobrenome@empresa.com')).toBe(false);
  });

  it('ignora espaço em volta, que é o que o campo de login entrega', () => {
    expect(pareceEmailEntregavel('  fulano@gmail.com  ')).toBe(true);
    expect(pareceEmailEntregavel('  camila@ribeiro  ')).toBe(false);
  });

  it('recusa domínio terminado em número — TLD é letra', () => {
    expect(pareceEmailEntregavel('fulano@empresa.123')).toBe(false);
  });
});
