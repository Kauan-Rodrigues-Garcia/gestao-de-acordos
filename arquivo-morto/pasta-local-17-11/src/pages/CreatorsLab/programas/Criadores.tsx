/**
 * Programa: Criadores — os perfis, como arquivos numa pasta.
 *
 * A pasta lista os arquivos; abrir um mostra o conteúdo embaixo. Cada arquivo
 * é uma das antigas seções da página, reaproveitada inteira:
 *
 *   <nome>.perfil  → o cartão e o perfil daquela pessoa (`CreatorsHero`)
 *   colecao.db     → filmes, jogos e música (`PersonalDatabase`)
 *   status.sys     → os números do projeto (`DevStatus`)
 *   contatos.txt   → os contatos (`ContatoSecao`)
 *
 * Os arquivos de perfil saem de `CRIADORES`, em `creators.config.ts`: incluir
 * uma pessoa lá cria o arquivo dela aqui.
 */
import { useState } from 'react';
import { CRIADORES } from '../creators.config';
import { Icone } from '../desktop/Icone';
import { ContatoSecao } from '../sections/ContatoSecao';
import { CreatorsHero } from '../sections/CreatorsHero';
import { DevStatus } from '../sections/DevStatus';
import { PersonalDatabase } from '../sections/PersonalDatabase';
import { useCreators } from '../theme/CreatorsProvider';

type IdCriador = typeof CRIADORES[number]['id'];
type Arquivo =
  | { id: string; nome: string; tipo: 'perfil'; criador: IdCriador }
  | { id: string; nome: string; tipo: 'colecao' | 'status' | 'contatos' };

const ARQUIVOS: Arquivo[] = [
  ...CRIADORES.map(c => ({
    id: `perfil:${c.id}`, nome: `${c.id}.perfil`, tipo: 'perfil' as const, criador: c.id,
  })),
  { id: 'colecao',  nome: 'colecao.db',   tipo: 'colecao' },
  { id: 'status',   nome: 'status.sys',   tipo: 'status' },
  { id: 'contatos', nome: 'contatos.txt', tipo: 'contatos' },
];

export default function ProgramaCriadores() {
  const { tokens } = useCreators();
  const [aberto, setAberto] = useState(ARQUIVOS[0].id);
  const arquivo = ARQUIVOS.find(a => a.id === aberto) ?? ARQUIVOS[0];

  return (
    <div>
      <p className="creators-lab__rotulo mb-2" style={{ color: tokens.cores.secundaria }}>
        {tokens.vocab.rotuloSecao(tokens.vocab.perfis)}
      </p>

      <div className="creators-lab__pasta" role="tablist" aria-label="Arquivos da pasta">
        {ARQUIVOS.map(a => (
          <button
            key={a.id}
            type="button"
            role="tab"
            className="creators-lab__arquivo"
            aria-selected={a.id === arquivo.id}
            aria-current={a.id === arquivo.id}
            onClick={() => setAberto(a.id)}
          >
            <Icone id="arquivo" />
            {a.nome}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={arquivo.nome}>
        {/* `key`: trocar de perfil remonta, para o novo já abrir no dono dele. */}
        {arquivo.tipo === 'perfil'   && <CreatorsHero key={arquivo.criador} inicial={arquivo.criador} />}
        {arquivo.tipo === 'colecao'  && <PersonalDatabase />}
        {arquivo.tipo === 'status'   && <DevStatus />}
        {arquivo.tipo === 'contatos' && <ContatoSecao />}
      </div>
    </div>
  );
}
