/**
 * O que os quebra-nozes falam.
 *
 * Pedido do Cleber (12/11/2026): «eles falando coisas aleatórias para todo
 * mundo ao mesmo tempo, envolvendo o sistema e o tema de Natal — tipo falando
 * que sabem que ficam brincando com a bolinha». Então as conversas puxam o que
 * existe de verdade no Natal do Gestão: a bolinha e a cesta do Dashboard, o
 * urso que pesca no Analítico, o Grinch e os duendes do chalé de Acordos, a TV
 * do chalé, o trem (que só leva quem tem foto), o cubo de gelo escondido, a
 * rádio, o globo de neve do chat, os gorros nas fotos.
 *
 * O tom: dois soldados de brinquedo que se levam a sério demais. A graça é
 * entre eles (a corda que acaba, o chapéu torto, quem quebrou mais nozes) e
 * nunca em cima de quem está trabalhando.
 *
 * Segundo pedido (12/11/2026): «mais interações focadas em falar para o
 * pessoal receber, fechar acordo, focar nas metas». Elas animam o time
 * inteiro — o acordo como presente, a meta como noz, a árvore da meta — e
 * nunca cobram uma pessoa nem dizem o número de ninguém. São palavras na boca
 * de pessoas de verdade: o diretor e os heads podem ler este arquivo e cortar
 * o que não disserem.
 *
 * Terceiro pedido (12/11/2026): eles falam com a «Cobrança», não com Birigui
 * ou Marília («não fala tchau Birigui, fala tchau cobrança»); a saudação segue
 * a hora em que sobem («bom dia, boa tarde ou boa noite»); a chamada dos
 * destaques tem várias formas e não repete a de ontem; e existe o boletim, que
 * diz quem mais recebeu até aquela hora.
 *
 * Nas falas:
 *   {a}       o diretor            {b}   o head da cidade
 *   {ob} {Ob} «o Robson» / «a Jessica» (minúscula e maiúscula)
 *   {par} {opar} {Opar}  no monólogo, quem ficou de fora
 *   {Saudacao}           «Bom dia», «Boa tarde» ou «Boa noite», pela hora
 *   {umasaudacao}        «um bom dia», «uma boa tarde», «uma boa noite»
 *   {periodo}            «da manhã», «da tarde», «da noite»
 *   {Mes}                o mês de hoje («Novembro»)
 *   {setor} {nome}       na chamada dos destaques
 *   {ontem} {Ontem}      o dia dos destaques: «ontem», ou «sexta» na segunda-feira
 *   {lider} {setorlider} no boletim: quem mais recebeu até agora, e o setor
 */
import type { ItemDeMao, Mexe, Pose, Surpresa } from './deixas';

/** Como o outro reage quando a fala termina. */
export type Resposta =
  | 'riso' | 'susto' | 'sim' | 'nao' | 'estufa' | 'pulinho' | 'vergonha' | 'duvida'
  | 'aplauso' | 'continencia' | 'ombros' | 'giro' | 'olha-cima' | 'tremor';

/** Um efeito especial da fala, que o diretor sabe encenar. */
export type Efeito = 'murcha' | 'da-corda' | 'espirro' | 'ajeita' | 'acenam';

export interface Opcoes {
  pose?: Pose;
  mexe?: Mexe;
  /** O que quem fala tem na mão direita durante a fala. */
  item?: ItemDeMao;
  /** A reação do OUTRO, quando a fala termina. */
  r?: Resposta;
  /** A reação de QUEM FALOU, quando a fala termina. */
  eu?: Resposta;
  fx?: Efeito;
}

/** Quem fala (`s` = quem está sozinho no palco), o texto e o resto. */
export type Linha = readonly [quem: 'a' | 'b' | 's', texto: string, opcoes?: Opcoes];
export type Conversa = readonly Linha[];

// ── As conversas dos dois ───────────────────────────────────────────────────

export const CONVERSAS: readonly Conversa[] = [
  [
    ['a', 'Eu sei que vocês ficam jogando a bolinha na cesta.', { pose: 'dedo', mexe: 'dedo' }],
    ['b', 'Todo mundo joga, {a}. Até você.', { r: 'susto' }],
    ['a', '…foram só três arremessos.', { pose: 'ombros', r: 'riso' }],
  ],
  [
    ['b', '{a}, você já parou pra ver o urso pescar?'],
    ['a', 'Parei. Fiquei quatro minutos esperando o peixe.', { r: 'riso' }],
    ['b', 'E o peixe?'],
    ['a', 'Fugiu. Mas o urso é persistente. Gostei dele.', { pose: 'cintura', r: 'sim' }],
  ],
  [
    ['a', 'Alguém viu o Grinch hoje?', { pose: 'pensa' }],
    ['b', 'Passou no chalé de Acordos. Derrubou a árvore de novo.', { r: 'nao' }],
    ['a', 'E os duendes?'],
    ['b', 'Arrumaram tudo. Nunca reclamam.', { r: 'estufa' }],
    ['a', 'Time bom é assim.', { pose: 'cintura' }],
  ],
  [
    ['b', 'Tem gente que ainda não andou de trem.'],
    ['a', 'Por quê?', { eu: 'duvida' }],
    ['b', 'Sem foto no perfil, o trem não leva.'],
    ['a', 'Então fica a dica: foto no perfil, pessoal.', { pose: 'dedo', r: 'sim' }],
  ],
  [
    ['a', '{b}, eu tô com uma dor nas costas…', { pose: 'cintura' }],
    ['b', 'É a chave de corda, {a}. Tá no lugar.', { r: 'susto' }],
    ['a', 'Ah. Achei que era da idade.', { r: 'riso' }],
  ],
  [
    ['b', 'Quantas nozes você já quebrou hoje?'],
    ['a', 'Quarenta e duas.', { pose: 'cintura', eu: 'estufa' }],
    ['b', 'Eu, quarenta e três.', { r: 'susto' }],
    ['a', '…a gente tá competindo?'],
    ['b', 'Sempre.', { pose: 'vitoria', r: 'riso' }],
  ],
  [
    ['a', 'Essa música de Natal não sai da minha cabeça.'],
    ['b', 'Ela toca igual pra todo mundo, na mesma hora.'],
    ['a', 'Então o prédio inteiro tá cantarolando junto.', { r: 'sim' }],
  ],
  [
    ['b', 'Você achou o cubo de gelo escondido?'],
    ['a', 'No pé do Analítico. Tem alguém lá dentro.', { pose: 'pensa' }],
    ['b', 'Vai derretendo um pouco por dia.'],
    ['a', 'Paciência. Coisa boa demora.', { r: 'sim' }],
  ],
  [
    ['a', '{b}, meu chapéu tá torto?', { pose: 'chapeu' }],
    ['b', 'Tá.'],
    ['a', 'E agora?', { fx: 'ajeita' }],
    ['b', 'Agora tá torto pro outro lado.', { r: 'ombros', eu: 'riso' }],
  ],
  [
    ['b', 'Tem uma TV ligada no chalé de Acordos.'],
    ['a', 'Eu vi. Passa o mesmo filme pra todo mundo.'],
    ['b', 'Você ficou assistindo?', { pose: 'dedo', mexe: 'dedo' }],
    ['a', 'Só conferindo se tava funcionando.', { pose: 'ombros', r: 'riso' }],
  ],
  [
    ['a', 'Reparou que todo mundo ganhou gorro na foto?'],
    ['b', 'Menos a gente. A gente ganhou chapéu de meio metro.', { r: 'riso' }],
    ['a', 'É patente, {b}. Patente.', { pose: 'cintura', eu: 'estufa' }],
  ],
  [
    ['a', 'Sabe o que eu mais gosto da Cobrança?'],
    ['b', 'O quê?', { eu: 'duvida' }],
    ['a', 'O pessoal. Olha quanta gente boa do outro lado da tela.', { pose: 'bracos-cima' }],
    ['b', 'Concordo. Um aceno pra eles!', { fx: 'acenam' }],
  ],
  [
    ['b', '{a}, você tomou café hoje?'],
    ['a', 'Boneco de madeira não toma café.', { item: 'xicara', pose: 'cintura' }],
    ['b', 'Então por que tá com uma xícara na mão?', { pose: 'dedo', r: 'susto' }],
    ['a', '…é chocolate quente. Não conta.', { item: 'xicara', pose: 'ombros', r: 'riso' }],
  ],
  [
    ['a', 'O boneco de neve do Dashboard joga basquete.'],
    ['b', 'E o urso do Analítico não acredita.'],
    ['a', 'Alguém precisa apresentar os dois.', { pose: 'pensa', r: 'sim' }],
  ],
  [
    ['b', 'O trenó do Papai Noel passou agora há pouco.'],
    ['a', 'Passou e nem deu carona.', { eu: 'nao' }],
    ['b', 'A gente pesa muito. É madeira maciça.', { r: 'riso' }],
  ],
  [
    ['a', '{b}, qual é o segredo de um bom dia de trabalho?'],
    ['b', 'Abrir os lembretes do dia logo cedo.', { pose: 'dedo' }],
    ['a', 'E o segundo segredo?'],
    ['b', 'Não deixar o Grinch chegar perto da sua mesa.', { r: 'riso' }],
  ],
  [
    ['b', 'Você viu o que acontece quando alguém salva um acordo?'],
    ['a', 'Cai estrela e presente na tela.', { pose: 'aponta-cima' }],
    ['b', 'Eu fico torcendo pra cair bastante hoje.', { r: 'sim', eu: 'pulinho' }],
  ],
  [
    ['a', 'Se eu parar de falar do nada, é porque a corda acab—', { fx: 'murcha' }],
    ['b', '…toda vez.', { fx: 'da-corda' }],
    ['a', '—ou! Onde eu estava?', { r: 'riso' }],
  ],
  [
    ['b', 'A… a… ATCHIM!', { fx: 'espirro' }],
    ['a', 'Saúde. Seu chapéu quase foi parar no teto.'],
    ['b', 'Ele volta sozinho. É treinado.', { pose: 'cintura', r: 'riso' }],
  ],
  [
    ['a', 'A árvore da meta tá ficando bonita.'],
    ['b', 'Cada dia mais acesa.'],
    ['a', 'Quero ver ela piscando inteira.', { pose: 'vitoria', r: 'pulinho' }],
  ],
  [
    ['b', '{a}, do que você tem medo?'],
    ['a', 'De cupim.', { eu: 'tremor' }],
    ['b', 'Justo.', { eu: 'sim' }],
  ],
  [
    ['a', '{Mes} tá voando.'],
    ['b', 'Depois do Natal a gente descansa.'],
    ['a', 'Boneco de madeira descansa onde?', { eu: 'duvida' }],
    ['b', 'Na prateleira, ué.', { pose: 'ombros', r: 'riso' }],
  ],
  [
    ['b', 'O chat virou um globo de neve.'],
    ['a', 'Dá vontade de chacoalhar.'],
    ['b', 'Chacoalha a neve. O colega, não.', { pose: 'dedo', mexe: 'dedo', r: 'riso' }],
  ],
  [
    ['a', '{b}, ficou boa a minha foto?'],
    ['b', 'Ficou. O queixo de madeira te valorizou.', { r: 'estufa' }],
    ['a', 'Eu sempre soube.', { pose: 'cintura' }],
  ],
  [
    ['a', 'Quem cuida do pisca-pisca do Dashboard?'],
    ['b', 'Ninguém. Ele se vira sozinho.'],
    ['a', 'Igual a gente às segundas-feiras.', { pose: 'ombros', r: 'riso' }],
  ],
  [
    ['a', '…'],
    ['b', '…'],
    ['a', 'Esqueci o que eu vinha falar.', { pose: 'pensa' }],
    ['b', 'Era pra desejar {umasaudacao}.'],
    ['a', 'Isso. {Saudacao}, Cobrança!', { fx: 'acenam' }],
  ],
  [
    ['b', 'Por que o seu chapéu é mais alto que o meu?'],
    ['a', 'É do mesmo tamanho, {b}.'],
    ['b', 'A sua pluma é maior.', { pose: 'aponta-cima' }],
    ['a', 'A pluma é mérito.', { pose: 'cintura', eu: 'estufa', r: 'riso' }],
  ],
  [
    ['a', 'Tem um menino loiro armando armadilha lá no Pix.'],
    ['b', 'É o Kevin. Ele se defende sozinho.'],
    ['a', 'Contrata.', { pose: 'dedo', r: 'riso' }],
  ],
  [
    ['a', 'Atenção, Cobrança! Inspeção surpresa.', { item: 'luneta', pose: 'luneta' }],
    ['b', 'O que você tá vendo?'],
    ['a', 'Muita gente trabalhando. E um urso pescando.', { item: 'luneta', pose: 'luneta' }],
    ['b', 'O urso tá liberado.', { eu: 'sim' }],
  ],
  [
    ['a', '{b}, me ensina a bater continência direito?'],
    ['b', 'Assim, ó.', { pose: 'continencia' }],
    ['a', 'Assim?', { pose: 'continencia' }],
    ['b', 'Perfeito. Só não esquece de baixar o braço depois.', { r: 'riso' }],
  ],
  [
    ['b', 'Lembrete importante, pessoal:', { pose: 'dedo' }],
    ['a', 'Bater a meta?'],
    ['b', 'Beber água. O resto vem junto.', { r: 'sim' }],
  ],
  [
    ['a', 'Tá nevando na tela e eu de casaco de lã.', { eu: 'tremor' }],
    ['b', '{Mes}. Trinta graus lá fora.'],
    ['a', 'A gente sofre pela arte.', { pose: 'ombros', r: 'riso' }],
  ],
  [
    ['b', 'Os duendes pediram aumento.'],
    ['a', 'Eles ganham em biscoito.'],
    ['b', 'Pediram mais biscoito.'],
    ['a', 'Aprovado.', { pose: 'vitoria', r: 'pulinho' }],
  ],
  [
    ['a', 'A gente ensaiou essa entrada quantas vezes?'],
    ['b', 'Nenhuma.'],
    ['a', 'Deu pra notar?'],
    ['b', 'Só um pouquinho.', { r: 'riso' }],
  ],
  [
    ['b', 'Será que hoje a gente aparece no telão também?'],
    ['a', 'Não sei. Mas arrumei o chapéu, por via das dúvidas.', { pose: 'chapeu', r: 'riso' }],
  ],
  [
    ['a', '{b}, o que você pediu pro Papai Noel?'],
    ['b', 'Uma lata de verniz.', { r: 'duvida' }],
    ['a', 'Pra quê?'],
    ['b', 'Pra chegar brilhando em janeiro.', { pose: 'cintura', r: 'riso' }],
  ],
  // ── Receber, fechar acordo, bater a meta (Cleber, 12/11/2026) ──────────────
  [
    ['a', '{b}, qual é o melhor presente de Natal?', { pose: 'pensa' }],
    ['b', 'Meia? Panetone?', { eu: 'duvida' }],
    ['a', 'Acordo fechado.', { pose: 'aponta-cima' }],
    ['b', 'E o segundo melhor?'],
    ['a', 'Acordo pago.', { pose: 'vitoria', r: 'pulinho' }],
  ],
  [
    ['b', 'Sabe o que eu mais gosto no chalé de Acordos?'],
    ['a', 'Os duendes?'],
    ['b', 'A festa quando alguém salva um acordo.', { pose: 'bracos-cima' }],
    ['a', 'Então bora dar trabalho pros duendes hoje.', { pose: 'aponta-cima', r: 'aplauso' }],
  ],
  [
    ['a', 'Meta é igual noz, {b}.', { item: 'noz', pose: 'segura' }],
    ['b', 'Dura?'],
    ['a', 'Parece. Mas com jeito, abre.', { item: 'noz', pose: 'segura', r: 'sim' }],
    ['b', 'E dentro tem coisa boa.', { pose: 'cintura' }],
  ],
  [
    ['b', 'Passei na árvore da meta agora.'],
    ['a', 'E aí? Já tem bola nela?'],
    ['b', 'Tem. Mas cabe muito mais.', { pose: 'aponta-cima' }],
    ['a', 'Ouviram? Cada recebimento é um enfeite.', { pose: 'dedo', mexe: 'dedo', r: 'sim' }],
  ],
  [
    ['a', 'Um acordo de cada vez.'],
    ['b', 'Um passo de cada vez.'],
    ['a', 'É assim que soldado chega longe.', { pose: 'continencia', r: 'continencia' }],
    ['b', 'E é assim que a meta chega também.', { pose: 'cintura' }],
  ],
  [
    ['b', '{a}, o que o cliente mais quer no fim do ano?'],
    ['a', 'Presente?'],
    ['b', 'Começar janeiro sem dívida.', { pose: 'dedo' }],
    ['a', 'Então quem fecha acordo aqui tá entregando presente.', { pose: 'bracos-cima', r: 'aplauso' }],
  ],
  [
    ['a', 'Atenção para o boletim {periodo}.', { item: 'corneta', pose: 'corneta' }],
    ['b', 'Previsão?'],
    ['a', 'Chuva de acordo fechado, com pancadas de recebimento.', { pose: 'aponta-cima', r: 'riso' }],
    ['b', 'Levem o guarda-chuva. Ou melhor: não levem.', { pose: 'ombros' }],
  ],
  [
    ['b', 'Tô vendo uma meta ali na frente.', { item: 'luneta', pose: 'luneta' }],
    ['a', 'Longe?', { eu: 'duvida' }],
    ['b', 'Cada ligação deixa mais perto.', { item: 'luneta', pose: 'luneta' }],
    ['a', 'Então marcha, pessoal. Tá logo ali.', { pose: 'aponta-cima', r: 'sim' }],
  ],
  [
    ['a', 'Eu quebro noz. Vocês quebram o quê?'],
    ['b', 'Objeção de cliente.', { pose: 'cintura', r: 'riso' }],
    ['a', 'Bem mais difícil que noz.', { r: 'sim' }],
    ['b', 'Por isso eles são os melhores.', { pose: 'aplaude', mexe: 'aplauso' }],
  ],
  [
    ['b', 'O trenó passou agora há pouco.'],
    ['a', 'Levando o quê?'],
    ['b', 'Os acordos que vocês fecharam hoje.', { pose: 'aponta-cima' }],
    ['a', 'Então enche esse trenó, Cobrança!', { pose: 'bracos-cima', r: 'pulinho' }],
  ],
  [
    ['a', 'Acordo fechado é bom.'],
    ['b', 'Acordo recebido é melhor ainda.', { pose: 'dedo', mexe: 'dedo' }],
    ['a', 'Então não esquece de lembrar o cliente do vencimento.', { r: 'sim' }],
    ['b', 'Combinado não sai caro.', { pose: 'cintura' }],
  ],
  [
    ['b', '{a}, me dá corda?', { fx: 'murcha' }],
    ['a', 'Pronto. Novinho.', { fx: 'da-corda' }],
    ['b', 'Obrigado. Meta também é assim: no meio da tarde dá uma murchada.'],
    ['a', 'Aí levanta, toma um café e volta com tudo.', { item: 'xicara', pose: 'brinda', r: 'sim' }],
  ],
  [
    ['a', 'Fim de ano é a melhor época pra negociar.', { pose: 'dedo' }],
    ['b', 'Por causa do décimo terceiro?'],
    ['a', 'E porque todo mundo quer virar o ano em paz.', { r: 'sim' }],
    ['b', 'Então hoje o telefone tá do nosso lado.', { pose: 'vitoria', r: 'aplauso' }],
  ],
  [
    ['b', 'Qual foi o primeiro acordo de hoje?'],
    ['a', 'Não sei de quem foi. Mas foi o mais importante.', { pose: 'pensa' }],
    ['b', 'Por quê?'],
    ['a', 'Porque depois do primeiro, o resto vem.', { pose: 'aponta-cima', r: 'sim' }],
  ],
  [
    ['a', 'Tem um segredo pra bater meta, {b}.', { pose: 'dedo' }],
    ['b', 'Qual?', { eu: 'duvida' }],
    ['a', 'Não desistir no terceiro «não».', { r: 'riso' }],
    ['b', 'O «sim» mora no quarto.', { pose: 'cintura', r: 'sim' }],
  ],
  [
    ['b', 'Olha o relógio, {a}.', { pose: 'relogio' }],
    ['a', 'Ainda dá tempo?'],
    ['b', 'Dá tempo de mais um acordo. Sempre dá.', { pose: 'aponta-cima' }],
    ['a', 'Vocês ouviram. Mais um!', { pose: 'bracos-cima', r: 'pulinho' }],
  ],
  [
    ['a', 'Sabe o que o painel mais gosta de mostrar?'],
    ['b', 'Neve?'],
    ['a', 'Número subindo.', { pose: 'aponta-cima' }],
    ['b', 'Então bora dar esse gosto pra ele.', { pose: 'cintura', r: 'estufa' }],
  ],
  [
    ['b', 'Esse time aqui não precisa de corda.'],
    ['a', 'Não?', { eu: 'duvida' }],
    ['b', 'Já vem de fábrica com vontade.', { pose: 'aplaude', mexe: 'aplauso' }],
    ['a', 'Orgulho de vocês, Cobrança.', { pose: 'continencia', r: 'continencia' }],
  ],
  // ── Mais variações (Cleber, 12/11/2026, terceiro pedido) ───────────────────
  [
    ['a', '{Saudacao}, Cobrança!', { pose: 'tchau', mexe: 'aceno' }],
    ['b', 'Você já deu {umasaudacao} hoje.'],
    ['a', 'Educação nunca é demais.', { pose: 'cintura', r: 'riso' }],
  ],
  [
    ['b', '{a}, quanto vale um «vou pagar amanhã»?'],
    ['a', 'Vale um lembrete amanhã cedo.', { pose: 'dedo', r: 'sim' }],
    ['b', 'Anotado na agenda da guarda.'],
  ],
  [
    ['a', 'Eu tenho um superpoder, {b}.'],
    ['b', 'Qual?', { eu: 'duvida' }],
    ['a', 'Escutar o cliente até o fim.', { pose: 'cintura' }],
    ['b', 'Esse fecha mais acordo que qualquer desconto.', { r: 'sim' }],
  ],
  [
    ['b', 'Fiz as contas da meta.'],
    ['a', 'E aí?'],
    ['b', 'Se cada um fechar mais um hoje, ela treme.', { pose: 'aponta-cima' }],
    ['a', 'Então faz ela tremer, Cobrança!', { pose: 'bracos-cima', r: 'pulinho' }],
  ],
  [
    ['a', 'Qual é a diferença entre a noz e a negociação?', { item: 'noz', pose: 'segura' }],
    ['b', 'Qual?'],
    ['a', 'A noz a gente quebra. A negociação a gente constrói.', { pose: 'dedo', r: 'sim' }],
    ['b', 'Bonito. Anotei no chapéu.', { pose: 'chapeu', r: 'riso' }],
  ],
  [
    ['b', 'Recebimento caiu. Sabe o que isso quer dizer?'],
    ['a', 'Que alguém combinou direito lá atrás.', { pose: 'cintura' }],
    ['b', 'E que tem mais um enfeite na árvore.', { pose: 'aponta-cima', r: 'aplauso' }],
  ],
  [
    ['a', 'Proposta boa é aquela que cabe no bolso do cliente.'],
    ['b', 'E na meta da gente.', { pose: 'dedo' }],
    ['a', 'Quando cabe nos dois, é Natal.', { pose: 'bracos-cima', r: 'pulinho' }],
  ],
  [
    ['b', '{a}, o que você diz pra quem tá num dia difícil?'],
    ['a', 'Que o próximo «alô» pode mudar o dia.', { pose: 'pensa' }],
    ['b', 'E se não mudar?'],
    ['a', 'Tem o seguinte. A gente não desiste fácil.', { pose: 'vitoria', r: 'continencia' }],
  ],
  [
    ['a', 'Ouvi dizer que acordo dá em árvore.'],
    ['b', 'Dá. Na árvore da meta.', { r: 'riso' }],
    ['a', 'Então rega, pessoal. Ligação é água.', { pose: 'aponta-cima' }],
  ],
  [
    ['b', 'Tá ouvindo esse barulho?', { eu: 'olha-cima' }],
    ['a', 'Que barulho?', { eu: 'duvida' }],
    ['b', 'Teclado, telefone, acordo saindo. Música.', { pose: 'cintura', r: 'sim' }],
  ],
  [
    ['a', 'Vencimento é igual trem.'],
    ['b', 'Passa na hora?'],
    ['a', 'Passa. Então avisa o cliente antes da estação.', { pose: 'dedo', mexe: 'dedo', r: 'sim' }],
  ],
  [
    ['b', '{a}, posso tocar o sino da vitória?', { item: 'sino', pose: 'segura' }],
    ['a', 'Alguém bateu a meta?'],
    ['b', 'Ainda não. Mas eu gosto de treinar.', { item: 'sino', pose: 'brinda', mexe: 'sino', r: 'riso' }],
  ],
  [
    ['a', 'Sabe quem ganha quando o acordo sai?'],
    ['b', 'A gente?'],
    ['a', 'O cliente, que respira. E a gente junto.', { pose: 'bracos-cima' }],
    ['b', 'Todo mundo ganha. Gostei desse jogo.', { pose: 'vitoria', r: 'aplauso' }],
  ],
  [
    ['b', 'Eu ia contar uma piada de cobrança.'],
    ['a', 'Conta.'],
    ['b', 'Depois eu te pago.', { pose: 'ombros', r: 'riso' }],
    ['a', '…com juros.', { pose: 'dedo', r: 'riso' }],
  ],
  [
    ['a', 'Reparou que quem sorri fecha mais?'],
    ['b', 'Por isso meu queixo já vem aberto.', { r: 'riso' }],
    ['a', 'Profissional.', { pose: 'continencia' }],
  ],
  [
    ['b', 'Tem um presente embaixo da árvore pra cada um aqui.'],
    ['a', 'O que é?', { eu: 'duvida' }],
    ['b', 'A chance de fechar o próximo.', { pose: 'aponta-cima' }],
    ['a', 'Abre logo, pessoal!', { pose: 'bracos-cima', r: 'pulinho' }],
  ],
];

// ── Quando só um aparece ────────────────────────────────────────────────────

export const MONOLOGOS: readonly Conversa[] = [
  [['s', 'Vim sem dupla hoje.'], ['s', '{Opar} ficou lustrando as botas.', { pose: 'ombros' }]],
  [['s', 'Só passando pra ver se tá tudo bem.'], ['s', 'Tá? Ótimo. Continuem assim.', { pose: 'cintura', eu: 'sim' }]],
  [['s', 'Psiu.', { pose: 'dedo' }], ['s', 'Eu vi quem acertou a cesta agora há pouco.'], ['s', 'Bonito arremesso.', { eu: 'aplauso' }]],
  [['s', 'Ronda de rotina.', { item: 'luneta', pose: 'luneta' }], ['s', 'Chalé: em ordem. Urso: pescando. Vocês: mandando bem.', { eu: 'estufa' }]],
  [['s', 'Alguém aí viu a minha noz?', { eu: 'duvida' }], ['s', 'Deixei em cima da mesa e sumiu.'], ['s', 'Suspeito do Grinch.', { pose: 'pensa' }]],
  [['s', 'Atenção, Cobrança!', { pose: 'aponta-cima' }], ['s', '…'], ['s', 'Era só pra dar oi mesmo.', { fx: 'acenam' }]],
  [['s', 'Dizem que quebra-nozes dá sorte.'], ['s', 'Então fiquem com um pouco.', { pose: 'bracos-cima', eu: 'pulinho' }]],
  [['s', 'Um, dois. Um, dois.'], ['s', 'Marchar sem {opar} é meio estranho.', { pose: 'ombros' }]],
  [['s', 'Passei no Analítico agora.'], ['s', 'O urso mandou um abraço.', { fx: 'acenam' }]],
  [['s', 'Minha pluma tá reta?', { pose: 'chapeu' }], ['s', 'Não precisa responder. Eu sei que tá.', { pose: 'cintura', eu: 'estufa' }]],
  [['s', 'Tô de olho no pisca-pisca.', { pose: 'dedo' }], ['s', 'Alguém tem que supervisionar.']],
  [['s', 'Bom trabalho, pessoal.'], ['s', 'É sério. Bom trabalho.', { eu: 'aplauso' }]],
  [['s', 'Vocês ouviram um sino?', { item: 'sino', pose: 'brinda', mexe: 'sino' }], ['s', 'Ah. Era eu.', { item: 'sino', pose: 'ombros' }]],
  [['s', 'Dica do dia:', { pose: 'dedo' }], ['s', 'foto no perfil pra andar de trem.']],
  [['s', 'A… ATCHIM!', { fx: 'espirro' }], ['s', 'É a neve. Sou alérgico a enfeite.', { pose: 'ombros' }]],
  [['s', 'Escutem.'], ['s', '…'], ['s', 'É o som de uma equipe boa trabalhando.', { pose: 'cintura', eu: 'sim' }]],
  [['s', 'Passei só pra lembrar:', { pose: 'dedo' }], ['s', 'cada acordo de hoje é um Natal mais leve pra alguém.'], ['s', 'Bonito isso que vocês fazem.', { eu: 'aplauso' }]],
  [['s', 'A meta tá logo ali.', { item: 'luneta', pose: 'luneta' }], ['s', 'Eu vi daqui. Dá pra chegar.', { pose: 'aponta-cima', eu: 'sim' }]],
  [['s', 'Quem fechou acordo hoje, levanta a mão.'], ['s', '…'], ['s', 'Quem ainda vai fechar, levanta as duas.', { pose: 'bracos-cima', eu: 'pulinho' }]],
  [['s', 'Dica de soldado:', { pose: 'dedo' }], ['s', 'um «não» é só o cliente pedindo outra proposta.', { eu: 'sim' }]],
  [['s', 'Um recebimento aqui, outro ali…'], ['s', 'e quando vê, a árvore da meta tá cheia.', { pose: 'bracos-cima' }]],
  [['s', 'Atenção, Cobrança!', { item: 'corneta', pose: 'corneta' }], ['s', 'Última chamada para o acordo do dia.'], ['s', 'Mentira. Sempre cabe mais um.', { pose: 'ombros', eu: 'riso' }]],
  [['s', 'Sabe o que eu pedi de Natal?'], ['s', 'Ver esse time batendo a meta.', { pose: 'cintura' }], ['s', 'O resto eu resolvo com verniz.', { pose: 'ombros' }]],
  [['s', 'Bora, pessoal.'], ['s', 'Telefone na mão, sorriso na voz.', { pose: 'aponta-cima' }], ['s', 'O cliente escuta o sorriso.', { eu: 'sim' }]],
  [['s', 'Lembrete carinhoso:', { item: 'sino', pose: 'brinda', mexe: 'sino' }], ['s', 'acordo bom é acordo que o cliente consegue pagar.', { item: 'sino', pose: 'dedo' }]],
  [['s', 'Hora boa pra ligar pra quem prometeu pagar hoje.', { pose: 'relogio' }], ['s', 'Só um lembrete. Com educação de soldado.', { pose: 'continencia' }]],
  [['s', '{Saudacao}, Cobrança!', { pose: 'tchau', mexe: 'aceno' }], ['s', 'Só vim dar {umasaudacao} mesmo.'], ['s', 'E lembrar que vocês são bons nisso.', { pose: 'cintura', eu: 'sim' }]],
  [['s', 'Contei quantos «sim» cabem num dia.'], ['s', 'Perdi a conta. Cabem muitos.', { pose: 'ombros', eu: 'riso' }]],
  [['s', 'Soldado de madeira não cansa.'], ['s', 'Mas se cansasse, olhava pra árvore da meta e levantava.', { pose: 'aponta-cima' }]],
  [['s', 'Toque de incentivo!', { item: 'sino', pose: 'brinda', mexe: 'sino' }], ['s', 'Pronto. Agora vai.', { item: 'sino', pose: 'cintura', eu: 'estufa' }]],
  [['s', 'O segredo da guarda:', { pose: 'dedo' }], ['s', 'postura reta, proposta clara.'], ['s', 'Funciona nos dois casos.', { eu: 'sim' }]],
  [['s', 'Tem cliente esperando uma boa notícia.'], ['s', 'A boa notícia é a proposta de vocês.', { pose: 'bracos-cima', eu: 'pulinho' }]],
  [['s', 'Vim ver a árvore da meta de perto.', { item: 'luneta', pose: 'luneta' }], ['s', 'Tá crescendo. Continua regando.', { pose: 'aponta-cima', eu: 'sim' }]],
  [['s', 'Recado da guarda:', { item: 'corneta', pose: 'corneta' }], ['s', 'quem recebe hoje dorme melhor.'], ['s', 'O cliente também.', { pose: 'cintura' }]],
];

// ── A chamada das dez: os destaques de ontem ────────────────────────────────

export const ABERTURAS: readonly Conversa[] = [
  [['a', '{Saudacao}, Cobrança!', { pose: 'bracos-cima' }], ['b', 'Chegou a hora boa do dia.'], ['a', 'Os destaques de {ontem}!', { pose: 'aponta-cima' }]],
  [['b', 'Atenção, Cobrança!', { pose: 'aponta-cima' }], ['a', 'Hora de aplaudir quem brilhou {ontem}.']],
  [['a', 'Formação!'], ['b', 'Temos gente pra parabenizar.'], ['a', 'Então vamos à lista.', { pose: 'dedo' }]],
  [['b', '{a}, trouxe a lista?'], ['a', 'Trouxe. E tá bonita.', { pose: 'cintura', eu: 'estufa' }]],
  [['a', '{Ontem} teve gente voando.'], ['b', 'Vamos aos nomes!', { pose: 'vitoria' }]],
  [['b', '{Saudacao}, pessoal!', { pose: 'tchau', mexe: 'aceno' }], ['a', 'Quem foi destaque {ontem}, levanta a mão.'], ['b', 'A gente levanta por vocês.', { pose: 'bracos-cima' }]],
  [['a', 'Silêncio no quartel…', { pose: 'dedo' }], ['b', '…que vai começar a chamada.']],
  [['a', 'Bola pra frente, Cobrança.'], ['b', 'Mas antes, palmas pra {ontem}.', { pose: 'aplaude', mexe: 'aplauso' }]],
  [['b', '{a}, sabe o que eu mais gosto nesse trabalho?'], ['a', 'A farda?', { eu: 'duvida' }], ['b', 'Anunciar quem mandou bem.', { pose: 'vitoria' }]],
  [['a', 'Rufem os tambores!', { pose: 'aponta-cima' }], ['b', 'A gente só tem um.'], ['a', 'Então rufa esse aí.', { r: 'riso' }]],
  [['b', 'Tem nome novo na lista hoje?'], ['a', 'Tem nome bom. É o que importa.', { pose: 'cintura', r: 'sim' }]],
  [['a', '{Saudacao}! Chegou o correio da guarda.'], ['b', 'Só notícia boa: os destaques de {ontem}.', { pose: 'aponta-cima' }]],
  [['b', 'Pode aplaudir daí mesmo.'], ['a', 'A gente aplaude daqui.', { pose: 'aplaude', mexe: 'aplauso' }], ['b', 'Destaques de {ontem}, um passo à frente!', { pose: 'aponta-cima' }]],
  [['a', 'Eu conferi a lista duas vezes.'], ['b', 'Igual o Papai Noel?'], ['a', 'Igual. E só tem gente boa.', { r: 'sim' }]],
  [['b', 'Cobrança, atenção pro telão!', { pose: 'aponta-cima' }], ['a', 'Não tem telão, {b}.'], ['b', 'Então atenção pra gente mesmo.', { pose: 'ombros', r: 'riso' }]],
  [['a', 'Hoje eu vim de gala.', { pose: 'cintura', eu: 'estufa' }], ['b', 'Você vem de gala todo dia.'], ['a', 'Mas hoje é pelos destaques de {ontem}.', { pose: 'aponta-cima' }]],
  [['b', '{Saudacao}, Cobrança! Quem brilhou {ontem}?'], ['a', 'Eu sei. Tá tudo aqui.', { pose: 'dedo', mexe: 'dedo' }]],
  [['a', '{b}, hoje quem fala é você ou sou eu?'], ['b', 'Hoje quem fala é o resultado.', { pose: 'cintura', r: 'estufa' }]],
];

/** O que quem anuncia diz a cada cartão. */
export const CHAMADAS: readonly string[] = [
  '{setor}: {nome}!',
  'No {setor}, o destaque foi… {nome}!',
  '{nome}, do {setor}. Mandou muito!',
  '{setor}, com vocês: {nome}!',
  'Quem brilhou no {setor}? {nome}!',
  '{nome}! Orgulho do {setor}.',
  'Do {setor} direto pra lista: {nome}!',
  '{setor}… {nome}! Palmas!',
  '{nome}, um passo à frente! É do {setor}.',
  'E no {setor}… {nome}!',
  'O {setor} mandou avisar: {nome}!',
  'Anota aí: {nome}, do {setor}.',
  'Pelo {setor}, {nome}!',
  'Estrela do {setor}: {nome}!',
  '{nome}! O {setor} agradece.',
  'No pódio do {setor}: {nome}!',
];

/** Na chamada com suspense: primeiro o setor… */
export const SUSPENSES: readonly string[] = [
  'No {setor}…', 'Agora o {setor}…', 'Do {setor}, quem foi?', 'E o {setor}?', '{setor}. Rufem!', 'Pelo {setor}…', 'Atenção, {setor}…', 'O {setor} quer saber…',
];
/** …e depois o nome. */
export const REVELACOES: readonly string[] = [
  '{nome}!', 'É {nome}!', '{nome}! Palmas!', 'Deu {nome}!', '{nome}, parabéns!', 'Ninguém menos que {nome}!', '{nome}! Merecido.',
];

/** O que o outro solta, curto, por cima. */
export const VIVAS: readonly string[] = [
  'Boa!', 'Isso aí!', 'Mandou bem!', 'Que orgulho!', 'Aí sim!', 'Bravo!', 'Merecido!', 'Parabéns!', 'Show!', 'Arrasou!', 'Continência!', 'É disso que eu tô falando!',
  'Voou!', 'Que fase!', 'Tá demais!', 'Palmas!', 'Fera!', 'Brilhou!', 'É craque!', 'Respeito!',
];

export const FECHAMENTOS: readonly Conversa[] = [
  [['a', 'Parabéns a todos os destaques!', { pose: 'aplaude', mexe: 'aplauso' }], ['b', 'Hoje tem mais. Quem vai ser o próximo?', { pose: 'aponta-cima' }]],
  [['b', 'Palmas, Cobrança!', { pose: 'aplaude', mexe: 'aplauso' }], ['a', 'Amanhã tem mais.']],
  [['a', 'É isso. Orgulho de vocês.', { pose: 'cintura', eu: 'estufa' }], ['b', 'Bora fazer um dia melhor ainda.', { pose: 'vitoria' }]],
  [['b', 'Guardem esses nomes.'], ['a', 'Amanhã pode ser o seu.', { pose: 'dedo' }]],
  [['a', 'Quartel dispensado!', { pose: 'continencia' }], ['b', 'Com louvor.', { pose: 'continencia' }]],
  [['b', 'Fim da chamada.'], ['a', 'Mas não do aplauso.', { pose: 'aplaude', mexe: 'aplauso' }]],
  [['a', 'Parabéns, Cobrança!', { pose: 'bracos-cima' }], ['b', 'Agora é com vocês de novo.', { pose: 'aponta-cima' }]],
  [['b', 'Lista encerrada.'], ['a', 'A de amanhã começa agora.', { pose: 'dedo', r: 'sim' }]],
  [['a', 'Quem tá na lista, parabéns.'], ['b', 'Quem não tá, a gente guarda lugar.', { pose: 'cintura' }]],
  [['b', 'Dá orgulho, né, {a}?'], ['a', 'Dá. Mas não conta que eu me emocionei.', { pose: 'cobre-rosto', r: 'riso' }]],
  [['a', 'Missão cumprida.', { pose: 'continencia' }], ['b', 'Bora cumprir a de hoje.', { pose: 'vitoria' }]],
  [['b', 'Um viva pros destaques!', { pose: 'bracos-cima' }], ['a', 'E um viva pra quem tá chegando lá.', { pose: 'aplaude', mexe: 'aplauso' }]],
];

// ── O boletim: quem mais recebeu até agora ──────────────────────────────────

/**
 * Antes do cartão, o anúncio (o cartão aparece com ele), e o comentário.
 * Elogia quem está na frente e chama o resto para a disputa; não diz valor.
 */
export interface Boletim { antes: Conversa; anuncio: Linha; depois: Conversa }

export const BOLETINS: readonly Boletim[] = [
  {
    antes: [['a', 'Atenção para o boletim {periodo}.', { item: 'corneta', pose: 'corneta' }], ['b', 'Tem novidade?']],
    anuncio: ['a', 'Quem mais recebeu até agora: {lider}, do {setorlider}!', { pose: 'aponta-cima' }],
    depois: [['b', 'Tá voando! Segue assim.', { pose: 'aplaude', mexe: 'aplauso' }], ['a', 'E ainda tem dia pela frente. Quem alcança?', { pose: 'dedo' }]],
  },
  {
    antes: [['b', '{a}, espiei o painel agora.', { item: 'luneta', pose: 'luneta' }], ['a', 'E quem tá na frente?', { eu: 'duvida' }]],
    anuncio: ['b', '{lider}, do {setorlider}. Na ponta até agora!', { pose: 'aponta-cima' }],
    depois: [['a', 'Boa, {lider}!', { pose: 'vitoria', r: 'aplauso' }], ['b', 'O dia não acabou. Bora, pessoal.', { pose: 'aponta-cima' }]],
  },
  {
    antes: [['a', 'Parcial do dia, {b}.'], ['b', 'Manda.']],
    anuncio: ['a', 'Na ponta até agora: {lider}, do {setorlider}!', { pose: 'aponta-cima' }],
    depois: [['b', 'Merece continência.', { pose: 'continencia', r: 'continencia' }], ['a', 'E o resto do pelotão vem logo atrás.', { pose: 'cintura' }]],
  },
  {
    antes: [['b', 'Sabe quem tá com a mão quente hoje?'], ['a', 'Quem?', { eu: 'duvida' }]],
    anuncio: ['b', '{lider}, do {setorlider}!', { pose: 'aponta-cima' }],
    depois: [['a', 'Tá indo muito bem.', { pose: 'aplaude', mexe: 'aplauso' }], ['b', 'Quem vai buscar? Ainda dá tempo.', { pose: 'relogio' }]],
  },
  {
    antes: [['a', 'Sino da parcial!', { item: 'sino', pose: 'brinda', mexe: 'sino' }], ['b', 'Fala, que eu tô curioso.']],
    anuncio: ['a', 'Até agora, ninguém recebeu mais que {lider}, do {setorlider}.', { pose: 'dedo' }],
    depois: [['b', 'Aí sim! Palmas daqui.', { pose: 'aplaude', mexe: 'aplauso' }], ['a', 'Seguimos. A árvore da meta agradece.']],
  },
  {
    antes: [['b', 'Notícia boa não espera.'], ['a', 'Então fala logo.', { r: 'riso' }]],
    anuncio: ['b', '{lider}, do {setorlider}, é quem mais recebeu hoje até aqui!', { pose: 'bracos-cima' }],
    depois: [['a', 'Orgulho. E o recado pro time: tá aberto.', { pose: 'dedo' }], ['b', 'Um acordo de cada vez.', { pose: 'cintura' }]],
  },
  {
    antes: [['a', '{b}, como tá o dia?'], ['b', 'Tem gente acelerando.', { pose: 'cintura' }]],
    anuncio: ['b', 'Na frente, por enquanto: {lider}, do {setorlider}!', { pose: 'aponta-cima' }],
    depois: [['a', '«Por enquanto» é a parte boa.', { pose: 'dedo', mexe: 'dedo', r: 'riso' }], ['b', 'Tá valendo até o fim do dia.', { pose: 'vitoria' }]],
  },
  {
    antes: [['b', 'Passei na árvore da meta.'], ['a', 'Quem pendurou mais enfeite hoje?']],
    anuncio: ['b', '{lider}, do {setorlider}. Até agora, ninguém pendurou mais.', { pose: 'aponta-cima' }],
    depois: [['a', 'Bonito de ver.', { pose: 'aplaude', mexe: 'aplauso' }], ['b', 'Ainda cabe enfeite. Bora, Cobrança!', { pose: 'bracos-cima', r: 'pulinho' }]],
  },
];

// ── Os números ──────────────────────────────────────────────────────────────

/** Antes de quebrar a noz. */
export const NOZ_ANTES: readonly string[] = ['Hora da noz do dia.', 'Vamos ver o que tem dentro desta.', 'Atenção: demonstração profissional.', 'Essa aqui tá pesada. Promete.', 'Rufem os tambores. É noz.', 'Essa eu guardei pra agora.', 'Ninguém respira.'];

/** O que sai da noz, e o que os dois dizem (o primeiro é quem quebrou). */
export const NOZ_DEPOIS: Record<Surpresa, readonly (readonly [string, string])[]> = {
  estrela: [['Uma estrela!', 'Guarda. A gente pendura na árvore da meta.'], ['Saiu uma estrela.', 'Pede um desejo, rápido!']],
  coracao: [['Um coração.', 'É o que a gente sente por esse time.'], ['Olha só o que tinha dentro.', 'Noz romântica. Raro.']],
  nota: [['Saiu música!', 'Essa noz veio com rádio.'], ['Uma nota musical.', 'Afinada, ainda por cima.']],
  floco: [['Neve. Dentro da noz.', '{Mes} tá estranho.'], ['Um floco de neve.', 'Devolve pro urso, é dele.']],
  presente: [['Um presente!', 'Ainda não é dia de abrir.'], ['Tinha um presente aqui dentro.', 'Embrulho dos duendes. Conheço o laço.']],
  poeira: [['…vazia.', 'Acontece nas melhores famílias.'], ['Só poeira.', 'O Grinch chegou antes.']],
  moeda: [['Uma moeda de ouro!', 'Vai pro cofrinho dos duendes.'], ['Ouro!', 'É de chocolate. Eu conheço.']],
  confete: [['Confete!', 'Alguém escondeu uma festa aqui dentro.'], ['Opa!', 'Essa era a noz de comemoração.']],
};

export const LUNETA: readonly (readonly [string, string])[] = [
  ['Tô vendo você aí.', 'Você mesmo, de fone. Tá indo bem.'],
  ['Deixa eu ver…', 'Tem alguém jogando a bolinha. Boa pontaria.'],
  ['Vejo o chalé de Acordos.', 'O gato tá dormindo na poltrona. Tudo em paz.'],
  ['Vejo o trem chegando.', 'Lotado. Todo mundo de foto no perfil.'],
  ['Hm. Vejo um urso.', 'Ele também tá me vendo. Acenou.'],
  ['Inspeção geral.', 'Aprovado. Podem continuar.'],
  ['Vejo a árvore da meta.', 'Ganhou enfeite novo agora há pouco.'],
  ['Tô vendo um acordo saindo.', 'Não vou dizer de quem. Mas tá bonito.'],
  ['Lá no fundo…', 'É a meta. Tá acenando pra vocês.'],
];

export const AVISOS: readonly (readonly [string, string])[] = [
  ['Aviso importante:', 'o urso pede silêncio no Analítico.'],
  ['Aviso:', 'quem achar um chapéu preto de meio metro, é meu.'],
  ['Atenção:', 'o trem não espera. Mas volta.'],
  ['Comunicado oficial:', 'chocolate quente imaginário pra todo mundo.'],
  ['Aviso aos navegantes:', 'o Grinch foi visto perto de Acordos.'],
  ['Lembrete:', 'sorrir no atendimento. O cliente escuta.'],
  ['Informe da guarda:', 'nenhuma noz ficou inteira hoje.'],
  ['Aviso de utilidade pública:', 'acordo salvo faz os duendes dançarem.'],
  ['Atenção, Cobrança:', 'o próximo «sim» pode ser o seu.'],
  ['Recado rápido:', 'cliente bem atendido volta pra pagar.'],
  ['Comunicado:', 'a árvore da meta aceita enfeite a qualquer hora.'],
];

export const BRINDES: readonly Conversa[] = [
  [['a', 'Um brinde, {b}.'], ['b', 'A quê?'], ['a', 'A essa equipe.']],
  [['b', 'Chocolate quente?'], ['a', 'Sempre. Um brinde à Cobrança.']],
  [['a', 'Saúde!'], ['b', 'E verniz novo pra todo mundo.']],
  [['b', 'Um brinde aos acordos de hoje.'], ['a', 'E aos de amanhã.']],
  [['a', 'Ao próximo recebimento!'], ['b', 'Que venha logo.']],
];

export const FANFARRAS: readonly Conversa[] = [
  [['a', 'A gente ensaiou a semana toda.'], ['b', 'Era pra ser Jingle Bells.', { r: 'riso' }]],
  [['b', 'Ficou bom?'], ['a', 'Ficou alto.', { r: 'riso' }]],
  [['a', 'Fanfarra da guarda, ao seu dispor.', { pose: 'reverencia' }], ['b', 'Não aceitamos pedidos.', { r: 'riso' }]],
  [['b', 'Essa foi pra quem fechou acordo hoje.'], ['a', 'E a próxima é pra quem vai fechar.', { pose: 'aponta-cima', r: 'sim' }]],
  [['a', 'Desafinei?'], ['b', 'Só no começo, no meio e no fim.', { r: 'riso' }]],
];

export const TROCAS: readonly Conversa[] = [
  [['a', 'Troca de guarda concluída.'], ['b', 'Ninguém notou a diferença.', { r: 'riso' }]],
  [['b', 'Desse lado a vista é melhor.'], ['a', 'É a mesma vista, {b}.', { r: 'ombros' }]],
  [['a', 'Agora eu sou você.'], ['b', 'Então endireita esse chapéu.', { r: 'riso' }]],
  [['b', 'Rendição de posto, sem alteração.'], ['a', 'Sem alteração. Só mais acordo.', { pose: 'cintura', r: 'sim' }]],
];

// ── As entradas e as saídas ─────────────────────────────────────────────────

/** Quem chegou atrasado, e o que ouviu de volta. */
export const ATRASOS: readonly (readonly [string, string])[] = [
  ['Desculpa! O trem atrasou.', 'O trem nunca atrasa.'],
  ['Cheguei! Perdi alguma coisa?', 'Só a hora.'],
  ['Tava dando corda no relógio.', 'E esqueceu de dar em você.'],
  ['Fui ver o urso pescar.', '…ele pegou alguma coisa?'],
  ['Tava olhando a árvore da meta.', 'Tá perdoado. Só dessa vez.'],
  ['Me perdi no chalé de Acordos.', 'Lá só tem uma porta.'],
];
/** Quem caiu de paraquedas, e o que ouviu. */
export const PARAQUEDAS: readonly (readonly [string, string])[] = [
  ['Vim pelo atalho.', 'Você não podia vir andando?'],
  ['Peguei carona no trenó.', 'E te largaram no meio do caminho.'],
  ['Trânsito.', 'No céu?'],
  ['A rena me deu carona.', 'E o freio dela?'],
  ['Cheguei por cima. Mais rápido.', 'Mais rápido, só o primeiro acordo do dia.'],
];
export const CAIXAS: readonly (readonly [string, string])[] = [
  ['Surpresa!', 'Todo dia isso.'],
  ['Entrega especial!', 'Não fui eu que pedi.'],
  ['Ta-dá!', 'O laço ficou na sua pluma.'],
  ['Presente pra Cobrança!', 'Somos nós. De novo.'],
  ['Abriu!', 'Era pra esperar o Natal.'],
];
export const ESCORREGOES: readonly (readonly [string, string])[] = [
  ['Gelo no chão!', 'Alguém avisa a manutenção.'],
  ['Opa! Desculpa.', 'É a neve. Acontece.'],
  ['Freio não é meu forte.', 'Deu pra perceber.'],
  ['Cheguei deslizando.', 'Igual meta quando o time embala.'],
  ['Quem encerou esse chão?', 'Os duendes. Capricharam.'],
];
/** Quem ficou sem corda no meio do caminho, quando volta. */
export const CORDAS: readonly (readonly [string, string])[] = [
  ['Parou de novo…', 'Valeu! Onde a gente estava?'],
  ['Toda vez no meio do caminho.', 'Tô novo. Pode seguir.'],
  ['Deixa que eu dou corda.', 'Ufa. Achei que era segunda-feira.'],
  ['Acabou a corda bem agora?', 'Voltei. Com tudo.'],
  ['Calma, eu resolvo.', 'Nada como um empurrão do colega.'],
];

export const DESPEDIDAS: readonly string[] = [
  'Até a próxima ronda!', 'Bom trabalho, Cobrança!', 'A gente volta.', 'Marchando!', 'De volta ao posto.', 'Fui. Quer dizer, fomos.', 'Qualquer coisa, é só chamar.', 'Tchau, Cobrança!',
  'Bons acordos, Cobrança!', 'Bora receber!', 'A gente tá de olho. Com carinho.', 'Até já, Cobrança!', 'Seguimos na torcida.', 'Mais um acordo e a gente volta.',
];
export const DESPEDIDAS_SOLO: readonly string[] = [
  'Até a próxima ronda!', 'Bom trabalho, Cobrança!', 'Eu volto.', 'De volta ao posto.', 'Qualquer coisa, é só chamar.', 'Tchau, Cobrança!',
  'Bons acordos, Cobrança!', 'Bora receber!', 'Até já, Cobrança!', 'Sigo na torcida.',
];
