# Pesquisa: detectar mentiras e promessas furadas em conversas de grupo (texto)

Contexto para quem for pesquisar: estou montando uma análise estatística, em tom de brincadeira, de um chat de
grupo de amigos (WhatsApp, só texto, português do Brasil). Quero um ranking de "quem mais mente" **sem acusar
ninguém de forma injusta**. A análise roda localmente com um LLM pequeno (~8B parâmetros, via Ollama) e código
Python. Preciso de respostas baseadas em fontes reais (artigos, papers, projetos), com links.

Responda cada pergunta em tópicos curtos, citando fonte. Se a resposta for "não funciona" ou "não há
evidência", diga isso claramente e explique por quê.

## A. Viabilidade científica

1. Existe evidência de que **texto escrito** (mensagens de chat) permite detectar mentira? Qual a acurácia
   real nos melhores estudos, e em que condições (laboratório x conversa espontânea)?
2. Quais **pistas linguísticas** a literatura associa à mentira (ex.: menos pronomes de primeira pessoa, mais
   negações, menos detalhes sensoriais, mais palavras de emoção negativa)? Essas pistas se mantêm em
   português e em chat informal com gírias, áudios e emojis?
3. Ferramentas como LIWC, análise de "reality monitoring", CBCA/SCAN ou "verbal cues to deception" funcionam
   em mensagens curtas? Qual o tamanho mínimo de texto?
4. Qual a taxa de **falsos positivos**? Quanto um detector errado pode acusar alguém inocente?
5. Há consenso de que humor, ironia, exagero e "mentira social" (desculpa para não ir, "já tô chegando") não
   são o mesmo que mentira maliciosa? Como a literatura separa esses casos?

## B. Modelos de linguagem (LLMs)

6. LLMs conseguem detectar mentira em texto? Há benchmarks (ex.: datasets de deception detection, jogos tipo
   Werewolf/Diplomacy, "Liar's Poker" textual)? Qual o desempenho, principalmente de modelos pequenos (7–8B)?
7. LLMs **alucinam acusações** ao serem pedidos para julgar se alguém mentiu? Há estudos sobre viés e
   sicofância nesse tipo de tarefa?
8. Melhor prática para pedir isso a um LLM sem ele inventar: usar só afirmações **verificáveis** contra outro
   dado (ex.: "chego em 5 min" x hora real da chegada)? Há papers sobre "claim extraction + verification"
   (fact-checking) aplicados a conversas?
9. Existem modelos ou datasets abertos em **português** para detecção de mentira, fake news ou contradição
   (ex.: Fake.Br Corpus, ASSIN/ASSIN2 para inferência textual)? Servem para conversa de chat?

## C. Alternativas mensuráveis (em vez de "detectar mentira")

10. Como medir **promessas não cumpridas** (compromisso dito no chat x ação posterior): que abordagens de NLP
    existem (extração de "commissives"/atos de fala de compromisso, detecção de intenção e de follow-through)?
11. Como medir **contradição** entre afirmações da mesma pessoa em momentos diferentes (inferência textual /
    NLI, detecção de inconsistência)? Funciona entre mensagens distantes no tempo?
12. Como medir **exagero** (hipérbole, números inflados) de forma objetiva? Há métricas ou léxicos?
13. Como medir **confiabilidade de comparecimento** (confirmou presença x apareceu) como proxy honesto de "dar
    furo", usando só dados de eventos?
14. Existem exemplos de **retrospectivas/rankings divertidos** de chats de grupo (tipo "Wrapped" de WhatsApp)
    que já tentaram algo parecido? O que fizeram e que problemas apareceram?

## D. Ética, privacidade e enquadramento

15. Quais são os riscos de **rotular pessoas como mentirosas** com base em IA, mesmo em brincadeira? Há
    diretrizes de uso responsável para análise de conversas privadas entre amigos?
16. Como apresentar o resultado para reduzir dano: mostrar a **evidência** (citação literal e data), usar nome
    de categoria bem-humorada, deixar claro que é estimativa? Há pesquisa sobre como as pessoas reagem a
    esse tipo de ranking?
17. Em termos de LGPD/privacidade, analisar o chat localmente e publicar só números agregados muda o risco?
    O que considerar ao mostrar resultados individuais a outras pessoas do grupo?

## E. Implementação prática

18. Quais bibliotecas Python **offline** (sem enviar dados a serviços externos) ajudam nisso: spaCy (modelo
    `pt_core_news`), NLTK, Stanza, transformers com modelos NLI multilíngues (ex.: XLM-R, mDeBERTa NLI)?
    Quais rodam bem em CPU?
19. Qual abordagem híbrida (regras + LLM + verificação em código) tem melhor custo-benefício para um projeto
    pessoal pequeno? Que passos você recomenda, do mais simples ao mais sofisticado?
20. Como **avaliar** se o detector funciona sem rotular dados reais de amigos (ex.: usar datasets públicos,
    conversas sintéticas)? Que métricas usar (precisão, recall, F1) e que precisão mínima justificaria publicar
    um ranking individual?

## Formato da resposta que quero de volta

- Um resumo de 5–8 linhas com a conclusão geral (dá ou não dá para fazer, e o que é honesto medir).
- Respostas numeradas, iguais às perguntas acima, cada uma com links das fontes.
- No final, uma lista "o que eu implementaria" em ordem de prioridade, separando o que é **confiável** do que
  seria **só palpite**.
