/**
 * terminal.ts — o terminal simulado.
 * ─────────────────────────────────────────────────────────────────────────────
 * ## Segurança
 *
 * Este terminal **não executa nada**. Não há `eval`, não há `Function`, não há
 * chamada de shell, não há rede. O que existe é uma LISTA BRANCA: um mapa de
 * texto para resposta. Qualquer coisa fora do mapa cai numa mensagem de
 * comando desconhecido.
 *
 * A regra é essa e não deve ser afrouxada: é um brinquedo de interface dentro
 * de um sistema que guarda dado de cobrança. Um terminal que executasse algo
 * seria a pior porta possível de se deixar aberta, ainda mais escondida atrás
 * de um Easter Egg onde ninguém vai procurar.
 */
import { CRIADORES, PROJETO_REAL, estaPendente } from '../creators.config';
import type { TemaCreators } from '../theme/themes';

export interface LinhaTerminal {
  tipo: 'entrada' | 'saida' | 'erro' | 'destaque';
  texto: string;
}

/** Efeitos colaterais que o terminal pode PEDIR — quem executa é a tela. */
export type EfeitoTerminal =
  | { tipo: 'limpar' }
  | { tipo: 'tema'; tema: TemaCreators }
  | { tipo: 'matrix' }
  | { tipo: 'sair' }
  | { tipo: 'conquistas' };

export interface ResultadoComando {
  linhas: LinhaTerminal[];
  efeito?: EfeitoTerminal;
}

/** Só o que existe aqui pode ser digitado. */
export const COMANDOS_VALIDOS = [
  'help', 'about', 'kauan', 'cleber', 'projects', 'skills', 'stack',
  'stats', 'theme', 'cyberpunk', 'arcade', 'matrix', 'achievements',
  'whoami', 'phi', 'clear', 'exit',
] as const;

export type ComandoValido = typeof COMANDOS_VALIDOS[number];

function saida(...textos: string[]): LinhaTerminal[] {
  return textos.map(texto => ({ tipo: 'saida' as const, texto }));
}

/** Mostra o valor, ou avisa que falta preencher — nunca inventa. */
function ouPendente(valor: string | undefined, rotulo: string): string {
  if (!valor || estaPendente(valor)) return `${rotulo}: (não informado)`;
  return `${rotulo}: ${valor}`;
}

function fichaDoCriador(id: 'kauan' | 'cleber'): LinhaTerminal[] {
  const c = CRIADORES.find(x => x.id === id);
  if (!c) return [{ tipo: 'erro', texto: 'registro não encontrado' }];

  return [
    { tipo: 'destaque', texto: c.nome.toUpperCase() },
    ...saida(
      ouPendente(c.papel, 'função'),
      ouPendente(c.sobre, 'sobre'),
      `commits neste repositório: ${c.commits}`,
    ),
  ];
}

/**
 * Interpreta uma linha digitada.
 *
 * Pura: recebe texto, devolve linhas e, quando for o caso, um pedido de efeito.
 * Não mexe em estado, não escreve em lugar nenhum.
 */
export function interpretar(entradaCrua: string): ResultadoComando {
  const entrada = entradaCrua.trim().toLowerCase();

  if (!entrada) return { linhas: [] };

  // Respostas para o que a pessoa VAI tentar. Sem isso, o terminal parece
  // quebrado justamente nos comandos que alguém curioso digita primeiro.
  if (entrada === 'sudo' || entrada.startsWith('sudo ')) {
    return { linhas: [{ tipo: 'erro', texto: 'Nice try.' }] };
  }
  if (entrada === 'rm -rf /' || entrada.startsWith('rm ')) {
    return { linhas: [{ tipo: 'erro', texto: 'Não. Já tentaram isso em produção uma vez.' }] };
  }
  if (entrada === 'ls' || entrada === 'dir') {
    return { linhas: saida('kauan  cleber  projects  secrets  .env(não)') };
  }

  const comando = entrada.split(/\s+/)[0] as ComandoValido;

  switch (comando) {
    case 'help':
      return {
        linhas: [
          { tipo: 'destaque', texto: 'Comandos disponíveis:' },
          ...saida(
            'about        o que é este lugar',
            'kauan        ficha do Kauan',
            'cleber       ficha do Cleber',
            'projects     projetos no arquivo',
            'skills       habilidades',
            'stack        tecnologias reais deste sistema',
            'stats        números do projeto',
            'theme        alterna a realidade',
            'cyberpunk    força a realidade Cyberpunk',
            'arcade       força a realidade Arcade',
            'matrix       (tente)',
            'phi          1.618...',
            'achievements suas conquistas',
            'whoami       boa pergunta',
            'clear        limpa a tela',
            'exit         volta ao Gestão',
          ),
        ],
      };

    case 'about':
      return {
        linhas: [
          { tipo: 'destaque', texto: 'CREATORS LAB' },
          ...saida(
            'Uma área escondida dentro do Gestão de Acordos.',
            'Construída por Kauan e Cleber, os mesmos que construíram o resto.',
            '',
            'Não está no menu. Você chegou aqui clicando cinco vezes no logo.',
          ),
        ],
      };

    case 'kauan':  return { linhas: fichaDoCriador('kauan') };
    case 'cleber': return { linhas: fichaDoCriador('cleber') };

    case 'projects':
      return {
        linhas: [
          { tipo: 'destaque', texto: 'PROJECT ARCHIVE' },
          ...saida(
            'gestao-de-acordos     o sistema que você está usando',
            'calculadora-desconto  mini app funcional',
            'dias-uteis            mini app funcional',
          ),
        ],
      };

    case 'skills': {
      const linhas: LinhaTerminal[] = [];
      for (const c of CRIADORES) {
        linhas.push({ tipo: 'destaque', texto: c.nome.toUpperCase() });
        const temNivel = c.habilidades.some(h => h.nivel > 0);
        if (!temNivel) {
          linhas.push({ tipo: 'saida', texto: '  (níveis ainda não informados)' });
          continue;
        }
        for (const h of c.habilidades) {
          const cheias = Math.round(h.nivel / 10);
          linhas.push({
            tipo: 'saida',
            texto: `  ${h.nome.padEnd(8)} ${'█'.repeat(cheias)}${'░'.repeat(10 - cheias)}`,
          });
        }
      }
      return { linhas };
    }

    case 'stack':
      return {
        linhas: [
          { tipo: 'destaque', texto: 'STACK REAL (nada aqui é enfeite)' },
          ...saida(...PROJETO_REAL.stack.map(t => `  ${t}`)),
        ],
      };

    case 'stats':
      return {
        linhas: [
          { tipo: 'destaque', texto: 'GESTÃO DE ACORDOS — MEDIDO EM 16/08/2026' },
          ...saida(
            `commits ............ ${PROJETO_REAL.commitsTotal}`,
            `desde .............. ${PROJETO_REAL.desde}`,
            `linhas em src/ ..... ${PROJETO_REAL.linhasSrc.toLocaleString('pt-BR')}`,
            `linhas de teste .... ${PROJETO_REAL.linhasTeste.toLocaleString('pt-BR')}`,
            `testes ............. ${PROJETO_REAL.testes.toLocaleString('pt-BR')}`,
            `linhas de SQL ...... ${PROJETO_REAL.linhasSql.toLocaleString('pt-BR')}`,
            `usuários ........... ${PROJETO_REAL.usuarios}`,
          ),
        ],
      };

    case 'theme':
      return { linhas: saida('alternando realidade...'), efeito: { tipo: 'tema', tema: 'cyberpunk' } };
    case 'cyberpunk':
      return { linhas: saida('> realidade: CYBERPUNK'), efeito: { tipo: 'tema', tema: 'cyberpunk' } };
    case 'arcade':
      return { linhas: saida('> realidade: ARCADE'), efeito: { tipo: 'tema', tema: 'arcade' } };

    case 'matrix':
      return { linhas: saida('acordando...'), efeito: { tipo: 'matrix' } };

    case 'phi':
      return {
        linhas: [
          { tipo: 'destaque', texto: 'φ = 1.618033988749895' },
          ...saida(
            'A razão áurea. Aparece na sequência de Fibonacci,',
            'nos vértices do icosaedro desenhado nesta página,',
            'e na proporção de alguns blocos daqui.',
          ),
        ],
      };

    case 'achievements':
      return { linhas: saida('abrindo registro...'), efeito: { tipo: 'conquistas' } };

    case 'whoami':
      return {
        linhas: saida(
          'alguém que clicou cinco vezes num logo para ver o que acontecia.',
          'exatamente o tipo de pessoa para quem isto foi feito.',
        ),
      };

    case 'clear':
      return { linhas: [], efeito: { tipo: 'limpar' } };

    case 'exit':
      return { linhas: saida('encerrando sessão...'), efeito: { tipo: 'sair' } };

    default:
      return {
        linhas: [
          { tipo: 'erro', texto: `comando não reconhecido: ${comando}` },
          { tipo: 'saida', texto: 'digite "help" para ver a lista.' },
        ],
      };
  }
}

/** Sugestão de completar com Tab. */
export function completar(parcial: string): string | null {
  const p = parcial.trim().toLowerCase();
  if (!p) return null;
  const achados = COMANDOS_VALIDOS.filter(c => c.startsWith(p));
  return achados.length === 1 ? achados[0] : null;
}
