# Módulo de Ponto · o que está pronto e o que falta

Acompanha o plano em [PLANO.md](./PLANO.md). Atualizado em 28/09/2026.

Escopo em execução: **Bloco A**, o produto de verdade, que não depende de INPI, certificado digital nem papelada. O Bloco B (REP-P) é decisão futura e não está neste mapa.

Legenda: **[x]** pronto e testado · **[~]** em andamento · **[ ]** não começou

---

## Fase 0 · Trilhos

| | Item | Situação |
|---|---|---|
| [x] | Conferir no código os furos que o módulo herdaria | 8 confirmados, listados no PLANO.md seção 4 |
| [x] | Gate do módulo no banco (`ponto_tem_modulo`) | lê `tenant_modules`; sem tenant responde não |
| [x] | Ligar `ponto` no trilho do frontend | tipo, rotas, menu e super admin · legado NÃO recebe ponto de graça |
| [ ] | Preço na Stripe (`STRIPE_PRICE_PONTO`) | **R$ 97/mês por restaurante, decidido em 28/09** |
| [x] | Consertar o manifest do PWA | criado, com os ícones que já existiam; título do app deixou de ser 'Velara Delivery' |
| [x] | Confirmar se bucket privado é mesmo privado neste stack | testado: sem chave e com a chave anônima, ambos recusam |
| [ ] | Documento de retenção de selfie e GPS, e quem é controlador | precisa existir antes da primeira foto |
| [ ] | Pedir ao contador do Kōten a relação de códigos de evento | não trava mais a fase 5: saímos com planilha, Alterdata e Sage/IOB |
| [ ] | Conseguir a convenção coletiva de Garibaldi e Bento | trava a fase 3b |

## Fase 1a · Bater e não perder

| | Item | Situação |
|---|---|---|
| [x] | Modelo de dados (8 tabelas) | aplicado no self-hosted |
| [x] | Marcação append-only, por REVOKE e por trigger | update e delete recusados no teste |
| [x] | Número de registro sequencial por restaurante | com trava contra batida simultânea |
| [x] | Hora do servidor como fonte única | app recebe, nunca envia |
| [x] | Cerca virtual com distância e dentro/fora | 2 km deu fora, 0 m deu dentro |
| [x] | Fora do raio registra e sinaliza | nunca bloqueia |
| [x] | Abrir sessão por link com senha (bcrypt, 5 erros trava 5 min) | senha errada não revela se o link existe |
| [x] | Bater ponto, com recusa de toque duplo em menos de 1 minuto | |
| [x] | Últimas 48 horas para o colaborador | exigência do art. 80 |
| [x] | Definir a senha de acesso pelo painel | RPC pronta |
| [x] | Tela do gestor: cadastro de colaborador | com CPF, cargo, admissão e tipo de contrato |
| [x] | Tela do gestor: gerar o link e a senha, com QR | senha de 4 dígitos, QR e copiar |
| [x] | Tela do colaborador: `/ponto/:token`, relógio do servidor e botão de bater | testado em navegador real |
| [x] | Comprovante na tela, com número e hash | mais as últimas 48 horas |
| [x] | Fila offline no aparelho, com pendentes visíveis | com modo avião: guardou 1 e subiu sozinha ao voltar a rede |
| [x] | Modo quiosque no tablet do salão, com PIN ou QR | tela /ponto-tablet/:token com teclado de PIN e selfie |
| [~] | Desligamento por data | feito na tela; falta bloquear a exclusão do usuário em `delete-establishment-user` |

## Fase 1b · Provar quem bateu

| | Item | Situação |
|---|---|---|
| [x] | Selfie por câmera ao vivo (nunca galeria) | getUserMedia em canvas; se a câmera falhar, bate sem foto |
| [x] | Bucket privado novo e upload por edge function | bucket ponto-selfies + função ponto-selfie publicada |
| [x] | Painel do dia: batidas com foto e marcador de fora do raio | foto abre por URL assinada de 5 minutos |
| [x] | "Quem ainda não bateu hoje" | no painel do dia |
| [x] | Aparelho novo registrado como sinal, sem bloquear | gravado em ponto_dispositivos na abertura |

## Fase 2 · Confiabilidade

| | Item | Situação |
|---|---|---|
| [x] | Monitor do relógio do servidor | compara o relógio do servidor com o do navegador, alarme acima de 30 s |
| [x] | Alerta de jornada aberta | no painel do dia, com o nome de quem entrou e não saiu |
| [ ] | Painel interno de batida perdida | fica para quando houver cliente em produção para medir |

## Fase 3 · Escala, regras e espelho

| | Item | Situação |
|---|---|---|
| [x] | 3a · Escala por dia e feriados | escala por dia da semana com folga, intervalo e virada de meia-noite; feriados nacionais carregados |
| [x] | 3b · Perfil de regras e motor de cálculo | nasce no piso da CLT, com vigência; motor puro com 22 testes de mesa (`npm run ponto:mesa`) |
| [x] | 3c · Espelho de ponto | tela dia a dia, PDF e planilha pelo exportador de marca |
| [ ] | Espelho no celular do colaborador | falta a tela do lado dele |

## Fase 4 · Ajuste e fechamento

| | Item | Situação |
|---|---|---|
| [x] | Ajuste como registro novo, com motivo e autor | tela de Ajustes, com aprovação e recusa |
| [x] | Inconsistências do mês | marcação ímpar e dia sem batida, antes de deixar fechar |
| [x] | Fechamento mensal com trava e reabertura registrada | reabrir exige motivo, que fica gravado |
| [ ] | Validador de escala | domingo de folga e 11 horas entre jornadas |
| [ ] | Troca de folga entre colegas | |
| [ ] | Pedido de ajuste pelo próprio colaborador | hoje quem registra é o gestor |

## Fase 5 · O contador

| | Item | Situação |
|---|---|---|
| [x] | Resumo de fechamento em PDF e XLSX | pelo exportador de marca, igual aos outros relatórios |
| [x] | Exportador com preset Alterdata, Sage/IOB e planilha | posição fixa de 128, pipe de 55 e CSV |
| [x] | De/para de código de evento, com trava | sem o código preenchido, o botão não gera arquivo |
| [x] | Prévia nos quatro formatos de hora | o mesmo valor escrito de quatro jeitos, para conferir com o contador |
| [ ] | Envio automático do pacote mensal | |

## Fase 6 · Banco de horas

| | Item | Situação |
|---|---|---|
| [x] | Livro-caixa com validade por lançamento | prazo vem do perfil (mês, quadrimestre, semestre ou ano) |
| [x] | Saldo por pessoa, com o que vence em 30 dias | na tela de Banco de horas |
| [ ] | Aviso mensal de saldo no app do colaborador | |

## Fase 8 · O que só o PDV faz

| | Item | Situação |
|---|---|---|
| [x] | Horas trabalhadas contra faturamento do mês | tela Ponto e operação |
| [x] | As horas do dia que mais vendem | base para montar escala pela curva real |
| [ ] | Gorjeta rateada por hora trabalhada | depende de amarrar o colaborador do ponto a quem atendeu a comanda |
| [ ] | Custo de mão de obra em reais | exigiria cadastro de salário, que está fora de escopo por decisão |

---

## Onde estamos

Bloco A praticamente inteiro no ar (local), da batida ao arquivo do contador. O módulo está ligado no Kōten Garibaldi e no tenant de demonstração, e nada foi publicado em produção ainda. O módulo está desligado nos 18 tenants, então nada disso aparece para cliente nenhum.

**Próxima entrega:** modo quiosque no tablet do salão e a selfie da fase 1b.

**Teste feito em 28/09**, no tenant de demonstração, em navegador real com GPS simulado: bateu dentro da área (0 m), bateu a 3 km e registrou com aviso de fora da área, e em modo avião guardou a batida e subiu sozinha quando a rede voltou. As três marcações estão no banco com número sequencial 1, 2 e 3.

**Decisões tomadas:** preço de R$ 97/mês por restaurante, e a exportação para folha sai com planilha, PDF e dois presets de layout público (Alterdata e Sage/IOB), sem depender do contador para começar.
