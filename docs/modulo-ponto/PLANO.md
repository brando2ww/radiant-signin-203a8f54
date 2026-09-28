# Módulo de Ponto do Velara · plano

Pesquisa e plano feitos em 28/09/2026 por nove agentes em paralelo: concorrentes, legislação, contabilidade, antifraude, regras de jornada, código atual do Velara, arquitetura, comercial e uma crítica adversarial do próprio plano. Tudo que é preço, exigência legal ou detalhe do código foi conferido na fonte; o que não deu para conferir está marcado como não verificado.

Nada foi implementado. Este documento existe para você decidir antes de qualquer linha de código.

---

## 1. A descoberta que muda o projeto

**A Portaria MTP 671/2021, art. 78, define REP-P como software "utilizado exclusivamente para o registro de jornada".**

Um módulo dentro do PDV dificilmente se enquadra nisso. A própria portaria abre o caminho alternativo no art. 75, parágrafo único: coletores de marcações são programas capazes de receber e transmitir marcações para o REP-P. Ou seja, o desenho defensável é **um serviço REP-P separado, com registro próprio no INPI, tendo o Velara como coletor** · não uma tela nova dentro do app multi-tenant que já existe.

Duas consequências imediatas:

**Foto e raio de GPS não são exigência legal.** A portaria não pede nenhum dos dois em artigo nenhum. São padrão de mercado e antifraude comercial. O que a lei pede é outra coisa: hora sincronizada, imutabilidade, comprovante por batida, AFD.

**A maioria dos seus clientes não é obrigada a registrar ponto.** O art. 74, §2º da CLT, com a redação da Lei 13.874/2019, obriga apenas estabelecimentos **com mais de 20 trabalhadores**. O Kōten e a maior parte da base estão abaixo disso. Vender o módulo como obrigação legal para um restaurante de 9 pessoas é mentira verificável, e vira reclamação. O que vende para eles é hora extra controlada, gorjeta justa e prova em reclamatória.

Por isso o plano tem **dois produtos com nomes diferentes desde o primeiro dia**:

| | Ponto Velara Gestão | Ponto Velara REP-P |
|---|---|---|
| O que é | controle de jornada, escala, presença, fechamento e exportação | conformidade com a Portaria 671/2021 |
| Depende de | nada externo | registro no INPI, e-CNPJ ICP-Brasil, atestado assinado por pessoa física |
| Texto obrigatório na oferta | "não substitui o registro eletrônico oficial de ponto" | · |
| Quando | fases 1 a 6 | fase 7, com go/no-go próprio |

---

## 2. O que os concorrentes fazem e cobram

Preços conferidos na página oficial em 28/09/2026, com a fonte ao lado.

| Sistema | Preço | Observação | Fonte |
|---|---|---|---|
| **Convenia** | R$ 4 por colaborador/mês | ponto como módulo extra · é o desenho idêntico ao nosso | site oficial |
| **Genyo** | R$ 69 (1-10) a R$ 469 (51-100) · R$ 4,69 a R$ 6,90 por cabeça | **foto, QR, cerca virtual e dispositivos autorizados ficam FORA do plano base** | genyo.com.br/planos-e-precos |
| **Oitchau** | R$ 68 (11-15) a R$ 500 (91-100) · R$ 4,40 a R$ 6,20 | tabela só começa em 11 colaboradores | oitchau.com.br/pricing |
| **Sesame HR** | a partir de R$ 13/usuário, mínimo 15 pessoas | plataforma de RH, categoria acima | sesamehr.com.br/precos |
| **mywork** | sem preço público | tem página para restaurantes · **cerca virtual limitada a 3 no plano inicial** | mywork.com.br/restaurantes |
| **Pontomais, Sólides/Tangerino, Ahgora** | sem preço público | valores que circulam em blog não foram confirmados | páginas devolvem 403, 404 ou redirecionam |

**O flanco aberto dos grandes é a confiabilidade do app, não a funcionalidade.** Pontomais tem 3,0 no Google Play e 2,1 na App Store. Sólides/Tangerino acumula reclamação de "app de ponto que não bate o ponto". Todas as reclamações relevantes que a pesquisa encontrou são de batida perdida, app travado sem internet e confirmação que some · não de recurso faltando.

**Foto e cerca virtual não são diferencial.** Todo mundo tem. Dois dos concorrentes cobram como upsell, então entregá-las no pacote base já é posicionamento.

**O diferencial real é o que só o dono do caixa consegue fazer:** gorjeta rateada por hora efetivamente trabalhada, custo de mão de obra contra o faturamento daquela hora, escala sugerida pela curva de vendas real e um pacote mensal único para o contador com ponto, faturamento e notas juntos.

---

## 3. O que a lei exige de verdade

Da Portaria MTP 671/2021, com o artigo ao lado:

- **Hora sincronizada** com a Hora Legal Brasileira do Observatório Nacional, variação máxima de 30 segundos, e relógio com hora, minuto e segundo visível na tela no momento da marcação (Anexo IX, itens 2 e 3).
- **Imutabilidade.** "Os dados armazenados não devem ser apagados ou alterados, direta ou indiretamente" (Anexo IX, item 7). O art. 74, IV veda "qualquer dispositivo que permita a alteração dos dados registrados pelo empregado".
- **Correção é registro paralelo**, nunca edição. O art. 82 só permite acrescentar informação para complementar omissões ou indicar marcação indevida.
- **Comprovante por batida** com NSR, dados do empregador, nome e CPF do trabalhador, data e hora, e acesso às últimas 48 horas (arts. 79 e 80).
- **Atestado Técnico e Termo de Responsabilidade** assinado com certificado de **pessoa física** do responsável técnico e do legal. O art. 89, §4º é taxativo: sem esse documento o empregador não pode usar o sistema.
- **Três coisas proibidas que o seu gerente vai pedir** (art. 74): bloquear marcação fora do horário, bater ponto automaticamente pela escala e exigir aprovação prévia para hora extra. A resposta ao cliente é que o sistema **alerta**, não impede.

E uma exigência que não é da portaria e sim da física: a mediana de erro do GPS dentro de prédio passa de 16 metros, com máximo medido de 99,7 m em ambiente urbano. Cozinha atrás de câmara fria, sob coifa de inox, é o pior cenário. **Fora do raio registra e sinaliza; nunca bloqueia.**

---

## 4. O que já existe no Velara, e os furos que apareceram

**Pronto para reaproveitar:**

- `tenant_modules` e `user_roles` · o trilho de liberação por plano e por papel já existe.
- `pdv_stock_count_links` · molde testado em produção de acesso por link com senha, com bcrypt no banco e bloqueio por tentativa. É o caminho do colaborador.
- `src/lib/stock-count-offline.ts` · fila offline já funcionando.
- `src/lib/reports/branded-export.ts` · exportador de marca em PDF e XLSX.
- `src/lib/reports/fetch-all.ts` · a paginação que acabamos de criar. **Obrigatória em todo relatório do módulo**: um mês de 30 pessoas passa do teto de 1000 linhas do PostgREST.
- `pdv_action_audit_log` e `log_pdv_action` · trilha de auditoria.
- `send-checklist-report` · molde de envio mensal por e-mail com cron.

**Furos que o módulo herdaria se ninguém consertar:**

1. **Funcionário no Velara são três cadastros e nenhum é RH.** `establishment_users` (login real), `checklist_operators` (PIN em texto puro) e `pdv_authorized_employees` (consumo interno). Sem uma identidade única, a gorjeta rateada por hora não sai.
2. **O gate de módulo é só frontend.** `use-user-modules.ts` tem `if (!tenantId) return true`, que libera tudo para tenant legado, e `has_module_access` no banco lê a tabela antiga `user_modules` e não aparece em policy nenhuma. Para dado de jornada isso significa ler ponto sem ter comprado o módulo.
3. **A RLS separa estabelecimento, não pessoa.** "Cada um vê só o próprio ponto" é trabalho novo em todas as tabelas.
4. **Os buckets de imagem são públicos.** `checklist-evidence` tem SELECT sem condição e INSERT liberado para anon. Selfie ali seria rosto de funcionário com hora e lugar acessível por URL. Pior: num teste de 28/09/2026 o bucket `certificates`, criado privado, respondeu pelo endpoint público igual aos demais · **isso precisa ser confirmado antes da primeira selfie**.
5. **O padrão de foto usado hoje aceita foto da galeria.** `ExecutionItemRenderer.tsx` usa `input type=file` com `capture`. A selfie do ponto tem que ser frame de `getUserMedia` desenhado em canvas.
6. **Demitir funcionário apaga a prova.** `delete-establishment-user` chama `auth.admin.deleteUser`, que cascateia. Desligamento tem que ser por data, nunca delete.
7. **O PWA está quebrado.** O `index.html` referencia `/manifest.webmanifest` e o arquivo não existe, não há service worker e o título do app é "Velara Delivery".
8. **Garçom em dois restaurantes já quebra o app hoje.** `use-establishment-id.ts` usa `.maybeSingle()`; duas lojas ativas para a mesma pessoa dão erro.

---

## 5. Fases

Revisadas depois da crítica adversarial: a fase 1 original virou duas, a 3 virou três, e a fila offline subiu para a primeira entrega, porque a cozinha do piloto fica no subsolo.

### Fase 0 · Decisão, trilhos legais e módulo ligado
Pequena em código, média em papelada · roda em paralelo com a 1a.

- Página de decisão assinada por você respondendo as perguntas da seção 7, datada, valendo como escopo.
- Se a resposta for REP-P: abrir o registro no INPI (código 730, R$ 185,00 na tabela oficial, 50% de desconto para ME/EPP) e comprar o e-CNPJ A1 ICP-Brasil.
- Ligar `ponto` no trilho que já existe: `use-user-modules.ts`, `module-routes.ts`, `PDVHeaderNav.tsx`, `ModuleSelector.tsx`, `stripe-create-checkout` e `stripe-webhook`.
- Fechar os dois furos do gate, com um helper `ponto_tem_modulo(owner)` exigido em toda policy do módulo.
- Consertar o manifest do PWA.
- Pedir por escrito ao contador do Kōten: nome do sistema de folha, layout de importação e relação de eventos. Conseguir a convenção coletiva vigente de Garibaldi e Bento Gonçalves.
- Escrever a política de retenção de selfie e de GPS, e definir no contrato que o restaurante é controlador e a Velara operadora.
- Confirmar se `public=false` é respeitado nos buckets deste stack.
- Cotar o segundo nó de infraestrutura **antes** de precificar o adicional REP-P.

**Pronto quando:** o super admin ativa o módulo num tenant piloto, a rota aparece no menu, e existe no repositório o documento de retenção assinado.

### Fase 1a · Bater e não perder
O coração. Metade é montagem de código que já roda.

- Identidade única de colaborador em `ponto_colaboradores`, amarrando os três cadastros que existem hoje, com CPF, admissão e cargo.
- Acesso por link com senha no molde de `pdv_stock_count_links`, e quem já tem login entra pelo login.
- Batida com **relógio do servidor** com hora, minuto e segundo, mais o delta local medido, para funcionar se o servidor cair.
- Gravação append-only em `ponto_marcacoes`, com `REVOKE UPDATE, DELETE` no role do PostgREST **e** trigger de bloqueio.
- Fila offline persistente com estado visível: registrada contra aguardando envio, com contador de pendentes.
- Modo quiosque no tablet do salão, com PIN ou QR. É o que resolve cozinha sem sinal, funcionário sem celular e iPhone pedindo permissão de câmera toda vez.
- Desligamento por data, com bloqueio de exclusão de usuário que tenha marcação.

**Pronto quando:** garçom, cozinheiro e gerente batem quatro vezes por dia, três dias seguidos, sem uma batida perdida; com modo avião a batida entra na fila e sobe em menos de 30 segundos depois da rede voltar; um UPDATE em `ponto_marcacoes` pelo PostgREST é recusado.

### Fase 1b · Provar quem bateu
- Selfie por `getUserMedia` desenhada em canvas, nunca `input file`.
- Bucket `ponto-selfies` novo e privado, criado na própria migration, com URL assinada de validade curta.
- Coordenada com `accuracy`, raio padrão de 150 m, regra de aceitação somando o erro que o aparelho declara. Fora do raio **registra e sinaliza**.
- Comprovante na tela na hora, com número do registro, e histórico de 48 horas para o próprio colaborador.
- Painel do gestor: batidas do dia com selfie e marcador dentro ou fora do raio, "quem ainda não bateu hoje", vínculo de aparelho gravado como sinal (não como trava).

**Pronto quando:** a selfie aparece no painel e não abre por URL pública.

### Fase 2 · Confiabilidade como produto
- Monitor de desvio do relógio do servidor contra o ntp.br, com alarme acima de 30 segundos.
- Alerta de jornada aberta no fechamento do caixa, rotina que já existe.
- Instrumentação: tempo até a confirmação e taxa de batida perdida por tenant, num painel interno.

**Pronto quando:** taxa de batida perdida abaixo de 0,5% no piloto.

### Fase 3a · Escala e feriados
Escala por **dia**, não carga semanal, com 6x1, 12x36 e escala quebrada de almoço e jantar. Calendário de feriados por município, cadastrado centralmente pelo super admin · Carnaval e Corpus Christi não são feriados nacionais, são municipais.

### Fase 3b · Motor de cálculo
Perfil de convenção coletiva por tenant, com vigência e PDF anexado. **Nenhum percentual fixo no código**: a convenção do SINDHA paga 50% nas duas primeiras horas e 75% acima, não 50/100. Motor puro recebendo marcações, escala, contrato e o perfil vigente na data: tolerância tudo-ou-nada da Súmula 366 (travada no código para nunca passar de 5 minutos por extremo e 10 no dia), hora noturna de 52min30s com horário misto e prorrogação, intrajornada suprimido. Suíte de teste de mesa antes de ver cliente.

**Pronto quando:** o contador do piloto confere um mês real contra o que ele apuraria à mão e concorda; uma jornada de 18h às 02h e outra de 22h às 06h passam no teste.

### Fase 3c · Espelho de ponto
Os seis blocos do art. 84, com marcação original e tratamento lado a lado, em PDF pelo exportador que já existe, e acessível pelo próprio colaborador no celular.

### Fase 4 · Ajuste, inconsistências e fechamento
Solicitação de ajuste pelo colaborador com justificativa e aprovação do gestor, sempre como registro paralelo. Relatório de inconsistências para fechar o mês (dia com número ímpar de marcações, dia sem marcação, batida fora da cerca, batida offline, ajuste sem ciência). Validador de escala que bloqueia a **publicação** (nunca a marcação): domingo de folga a cada três semanas, interjornada de 11 horas, menor de 18 entre 22h e 5h. Troca de folga entre colegas com aprovação. Fechamento mensal com trava e reabertura registrada.

### Fase 5 · O contador
Resumo de fechamento em PDF e XLSX. Motor de layout configurável por tenant.

**Como os concorrentes resolvem isso, levantado em 28/09/2026:** nenhum entrega layout pronto para todo mundo. O Pontomais exporta só TXT e, para um sistema fora da lista dele, o cliente manda o layout pelo chat e a integração sai em **até 60 dias úteis**. A Ahgora diz ter mais de 50 formatos e também deixa o cliente montar o próprio. A Secullum cria layout novo sem custo e distribui cada layout como um arquivo importável. Ou seja, o que o mercado vende não é a lista de sistemas suportados, é a **velocidade de atender o contador que apareceu**.

Por isso o primeiro release sai com três saídas, sem depender de nenhum contador:

1. **Planilha e PDF de fechamento**, que qualquer escritório lê e digita. É o piso, e sozinho já atende.
2. **Preset Alterdata DP**, posição fixa de 128 posições, com faltas em minutos. Leiaute público, conferido campo a campo.
3. **Preset Sage Gestão Contábil / IOB**, 55 posições com pipe e hora sexagesimal (2h30 vira 00230). Leiaute público, conferido campo a campo.

O que só o contador do cliente tem é a **relação de códigos de evento** dele, e isso não é código: é uma tela de de/para preenchida no onboarding, em minutos. Enquanto ela estiver vazia, a exportação não gera arquivo, de propósito. Tabela de/para de código de evento, com trava: sem de/para preenchido não gera arquivo. Prévia mostrando o mesmo valor nos quatro formatos de hora, porque formato trocado paga salário errado sem gerar erro nenhum. Envio automático do pacote do mês por e-mail.

**Pronto quando:** o contador importa o arquivo no sistema dele sem ajuste manual e o valor bate com o espelho. Se o sistema dele não for Alterdata nem Sage, o de/para mais o motor de layout resolvem sem release novo.

### Fase 6 · Banco de horas
Livro-caixa com validade por lançamento e consumo FIFO, com os três regimes (mês, 6 meses por acordo escrito, 12 meses por norma coletiva). Aviso mensal de saldo no app, que a convenção exige. Entra depois do primeiro fechamento validado por contador.

### Fase 7 · REP-P · projeto próprio, com go/no-go
Não é continuação do módulo: é outro produto. NSR sequencial por estabelecimento com serialização, cadeia de hash SHA-256, AFD posicional e AEJ gerados **a partir dos leiautes republicados em 31/07/2026** (nunca dos anexos de 2021), assinatura CAdES e PAdES com o e-CNPJ da Velara, Atestado Técnico por tenant e por versão, redundância, retenção de 5 anos e alarme de vencimento do certificado.

### Fase 8 · O que só o PDV consegue fazer
Gorjeta e taxa de serviço rateadas por horas efetivamente trabalhadas (atenção: pela Súmula 354 a gorjeta não compõe base de hora extra, noturno nem DSR, então é rubrica separada). Custo de mão de obra por hora contra o faturamento da hora. Escala sugerida pela curva de vendas. Pacote único para o contador.

---

## 6. O que fica fora, e por quê

- **Reconhecimento facial e prova de vida.** O AWS Face Liveness custa US$ 0,015 por verificação: num restaurante de 12 pessoas dá R$ 82 por mês só de liveness, mais que o módulo inteiro deveria custar. E transforma o dado em sensível pelo art. 11 da LGPD, com regulamentação da ANPD prevista para 2026. Foto simples resolve na prática: o gerente vê a cara.
- **App nativo nas lojas** e tudo que só existe em código nativo (Play Integrity, detecção de localização falsa). Entra quando a fraude virar reclamação real.
- **Cálculo em reais e folha.** O módulo entrega horas e rubricas; quem transforma em dinheiro é o contador. Trazer isso para dentro transfere risco trabalhista para a Velara por um módulo de R$ 169.
- **eSocial e integração por API com a folha.** Primeiro release exporta arquivo.
- **Presets de exportação além do primeiro.** Nenhum sistema de folha publica o layout. Planejar sem o documento em mão é planejar no escuro.
- **Rastreamento contínuo durante o turno.** Não existe em PWA e não deveria existir: a coordenada é capturada só no instante da marcação.
- **Botão de editar horário de uma marcação.** Não existe em nenhuma versão. Correção é sempre registro paralelo.
- **Bloquear batida fora da escala, bater automático pela escala e exigir aprovação para hora extra.** O art. 74 da portaria proíbe os três, e os três vão ser pedidos.

---

## 7. As decisões que dependem de você

**1. REP-P ou gerencial?**
Recomendação: começar gerencial, com o nome "Ponto Velara Gestão" e o texto "não substitui o registro eletrônico oficial" em toda oferta, e tratar o REP-P como projeto próprio depois da fase 5. Motivo: a maior parte da base está abaixo de 20 trabalhadores e não é obrigada por lei, então o que vende é controle, não obrigação. Nunca chamar de ponto eletrônico legal antes de o INPI e o certificado existirem.

**2. Preço · DECIDIDO EM 28/09/2026.**
**R$ 97 por mês, valor único por restaurante**, sem faixa por número de colaboradores e sem mínimo. Foto e cerca virtual incluídas.

Onde isso cai no mercado: um restaurante de 12 pessoas paga hoje R$ 68 no Oitchau ou R$ 169 no Genyo só de ponto, em outra assinatura e com outro suporte. R$ 97 fica no meio dessa faixa, e abaixo do que o cliente paga hoje na maioria dos casos. Preço único também evita o atrito mensal da rotatividade do setor, que é alta.

O que isso exige do produto: como não há faixa, o custo por colaborador cai conforme o restaurante cresce, então o teto prático é o suporte. A conta fecha porque o custo de infraestrutura por colaborador é de centavos (selfie comprimida, sem reconhecimento facial) e porque o módulo entra na fatura que o cliente já paga.

**3. Retenção da selfie e da coordenada.**
Recomendação: 90 dias para a selfie, guardando depois só o hash, e prazo curto para a coordenada crua, guardando para sempre apenas o resultado (dentro ou fora do raio e a distância). A marcação precisa de 5 anos pela prescrição do art. 11 da CLT; o rosto não. Doze funcionários dão cerca de 1.400 imagens por mês por restaurante.

**4. Entregador entra?**
Recomendação: entra, com aviso escrito no contrato. No momento em que o entregador bate ponto por app com geolocalização, o empregador demonstra que a fixação de horário é possível, o que derruba o enquadramento de atividade externa do art. 62, I da CLT. O TST já usou rastreamento por satélite para afastar essa exceção e condenar em horas extras (RR-24327-87.2015.5.24.0002). É a única parte do módulo que pode custar ao cliente mais do que a mensalidade.

**5. Quem preenche a convenção coletiva de cada cliente?**
Recomendação: o suporte da Velara, com o PDF anexado e a vigência registrada, e os feriados municipais numa tela central de super admin. O dono do restaurante não sabe se a convenção dele paga 75% acima da segunda hora.

**6. Multi-loja.**
Recomendação para o primeiro release: fixar "1 tenant = 1 estabelecimento" e deixar multi-loja como refatoração própria. Hoje loja é o `user_id` do dono e nenhum outro módulo conhece um segundo conceito de loja.

---

## 8. Riscos que merecem atenção desde já

- **Imutabilidade contra a cultura do projeto.** O hábito aqui é corrigir dado em produção por SQL direto · aconteceu nesta mesma semana. Isso não pode encostar em `ponto_marcacoes`, e a proteção tem que ser `REVOKE` mais trigger, não combinado de equipe.
- **Formato de hora trocado na exportação paga salário errado sem gerar erro nenhum.** Duas horas e meia pode ser 00230, 2.50 ou 150 conforme o destino. É o defeito mais provável e o mais caro.
- **Sem escala em dia, o sistema gera hora extra fantasma**, porque a tolerância compara com o horário previsto. O onboarding tem que exigir escala antes de liberar o fechamento.
- **Antifraude de GPS é promessa que PWA não sustenta.** A própria especificação do W3C diz que a API não garante que a posição é real. O GPS é registro auditável, não prova.
- **Fontes a reconferir antes de escrever código de arquivo fiscal:** o texto da portaria usado aqui vem de reprodução secundária, existem quatro portarias alteradoras de 2022, e o número da portaria de 2026 que mexeu no Anexo IV aparece divergente entre fontes (1.316 contra 1.361).

---

## 9. Por onde começar

A fase 0 não depende de decisão nenhuma na parte técnica: consertar o gate de módulo, o manifest do PWA e confirmar o bucket privado são coisas que precisam acontecer de qualquer jeito. A fase 1a só começa depois que você responder a pergunta 1, porque ela define se a tabela de marcações nasce com cadeia de hash ou não.
