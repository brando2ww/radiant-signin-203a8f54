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
| [ ] | Consertar o manifest do PWA | hoje aponta para arquivo que não existe |
| [ ] | Confirmar se bucket privado é mesmo privado neste stack | teste de 28/09 deixou dúvida |
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
| [ ] | Modo quiosque no tablet do salão, com PIN ou QR | resolve cozinha sem sinal e quem não tem celular |
| [~] | Desligamento por data | feito na tela; falta bloquear a exclusão do usuário em `delete-establishment-user` |

## Fase 1b · Provar quem bateu

| | Item | Situação |
|---|---|---|
| [ ] | Selfie por câmera ao vivo (nunca galeria) | campo já existe na tabela |
| [ ] | Bucket privado novo e upload por edge function | |
| [ ] | Painel do dia: batidas com foto e marcador de fora do raio | |
| [ ] | "Quem ainda não bateu hoje" | |
| [ ] | Aparelho novo registrado como sinal, sem bloquear | tabela pronta |

## Fase 2 · Confiabilidade

| | Item |
|---|---|
| [ ] | Monitor do relógio do servidor contra o ntp.br, alarme acima de 30 s |
| [ ] | Alerta de jornada aberta no fechamento do caixa |
| [ ] | Painel interno: tempo até a confirmação e taxa de batida perdida |

## Fase 3 · Escala, regras e espelho

| | Item |
|---|---|
| [ ] | 3a · Escala por dia (6x1, 12x36, escala quebrada) e feriados por município |
| [ ] | 3b · Perfil da convenção coletiva com vigência e motor de cálculo puro |
| [ ] | 3c · Espelho de ponto em PDF e no celular do colaborador |

## Fase 4 · Ajuste e fechamento

| | Item |
|---|---|
| [ ] | Pedido de ajuste pelo colaborador e aprovação pelo gestor, sempre como registro novo |
| [ ] | Relatório de inconsistências do mês |
| [ ] | Validador de escala (domingo de folga, 11 horas entre jornadas, menor à noite) |
| [ ] | Troca de folga entre colegas com aprovação |
| [ ] | Fechamento mensal com trava e reabertura registrada |

## Fase 5 · O contador

| | Item |
|---|---|
| [ ] | Resumo de fechamento em PDF e XLSX |
| [ ] | Exportador configurável, com preset Alterdata e Sage/IOB |
| [ ] | De/para de código de evento, com trava sem preenchimento |
| [ ] | Prévia mostrando o mesmo valor nos quatro formatos de hora |
| [ ] | Envio automático do pacote mensal ao contador |

## Fase 6 · Banco de horas

| | Item |
|---|---|
| [ ] | Livro-caixa com validade por lançamento e consumo mais antigo primeiro |
| [ ] | Aviso mensal de saldo no app do colaborador |

## Fase 8 · O que só o PDV faz

| | Item |
|---|---|
| [ ] | Gorjeta rateada por horas efetivamente trabalhadas |
| [ ] | Custo de mão de obra por hora contra o faturamento da hora |
| [ ] | Escala sugerida pela curva de vendas |

---

## Onde estamos

Fase 1a quase fechada: banco, telas do gestor, tela do colaborador e fila offline prontos e testados em navegador real. Falta o modo quiosque no tablet e a trava de exclusão de usuário. O módulo está desligado nos 18 tenants, então nada disso aparece para cliente nenhum.

**Próxima entrega:** modo quiosque no tablet do salão e a selfie da fase 1b.

**Teste feito em 28/09**, no tenant de demonstração, em navegador real com GPS simulado: bateu dentro da área (0 m), bateu a 3 km e registrou com aviso de fora da área, e em modo avião guardou a batida e subiu sozinha quando a rede voltou. As três marcações estão no banco com número sequencial 1, 2 e 3.

**Decisões tomadas:** preço de R$ 97/mês por restaurante, e a exportação para folha sai com planilha, PDF e dois presets de layout público (Alterdata e Sage/IOB), sem depender do contador para começar.
