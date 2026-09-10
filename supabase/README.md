# Na Brasa — Banco de dados

## Estoque vazio no cadastro

A migration `migrations/202609070001_empty_initial_inventory.sql` remove os
insumos de exemplo criados por `handle_new_user`. Novas contas iniciam com estoque
vazio; o login não repõe insumos apagados. Insumos existentes não são removidos.
Perfil, configurações e cardápio inicial continuam sendo criados normalmente.
O `schema.sql` também contém essa regra para instalações novas.

Aplique essa migration depois das migrations abaixo, inclusive antes de executar
`tests/recipes_orders.sql`, que verifica o cadastro com estoque vazio.

## Fluxo de receitas e entregas (setembro de 2026)

Aplicação no projeto Supabase `ritkjcnhvtdpbofiudex` concluída em **07/09/2026**.
As quatro migrations abaixo estão instaladas. A conferência das cinco funções
confirmou que seus corpos correspondem ao código testado localmente, desconsiderando
apenas comentários e espaços. Os quatro pedidos existentes foram preservados;
o pedido já entregue recebeu o marcador, sem criar movimentações de estoque.

Validação funcional realizada em banco local descartável: receitas fracionadas,
isolamento entre usuários, pedidos estruturados, custo de insumos compartilhados,
entrega com estoque negativo, itens sem receita, rollback por falha técnica e
concorrência (oito entregas do mesmo pedido e cinco pedidos distintos simultâneos).
O fluxo completo também foi conferido na interface local. Nenhum pedido de teste
foi criado no banco de produção.

Após o schema base e a migration de janeiro, aplicar nesta ordem:

1. `migrations/202609050001_recipe_precision.sql` — `qty_used`, proprietário da receita e RLS.
2. `migrations/202609050002_save_recipe.sql` — função `set_recipe`, que substitui a receita em uma transação.
3. `migrations/202609050003_structured_orders.sql` — quantidades inteiras, proprietário das linhas e função `create_order`.
4. `migrations/202609050004_delivery_stock.sql` — custo, marcador da baixa, precisão de estoque, entrega e avisos.

Não reaplicar a migration de janeiro depois das novas: ela reinstala a restrição contra estoque negativo e as policies antigas.
O frontend atualizado depende das quatro migrations. Aplique o banco antes de publicar os arquivos do painel.
O schema base é para instalação nova; não o reaplique em produção.

### Antes de migrar

- Se as receitas antigas tiverem `recipe_items.unit` diferente de `inventory.unit`, a primeira migration para sem aplicar mudanças. Converta a quantidade e a unidade da receita antes de tentar novamente; não há conversão automática.
- Pedidos antigos com quantidades fracionadas impedem a terceira migration; os dados devem ser revisados antes de trocar para inteiros.
- As migrations preservam as linhas existentes. `order_items.total` é uma coluna calculada e é recriada ao converter a quantidade.
- A coluna legada `recipe_items.unit` permanece por compatibilidade. As novas receitas usam sempre a unidade do insumo.

### Comportamento da operação

- `create_order` usa os preços atuais do cardápio, exige itens disponíveis do usuário e salva pedido, total, texto e linhas juntos.
- A mudança para `entregue` executa a baixa no banco, mesmo se chamada diretamente pelo cliente. Insumos compartilhados são agrupados; custo é `inventory.cost × consumo`, arredondado somente no total final.
- Saldo insuficiente **não bloqueia a entrega**: a quantidade é descontada integralmente, podendo ficar negativa. `set_order_status` retorna `negative_inventory` para o aviso do painel.
- `stock_deducted_at` evita baixa duplicada, inclusive entre chamadas simultâneas e ao retornar de outro status para entregue. O custo já calculado permanece histórico.
- Mudar um pedido entregue para outro status não estorna estoque nem recalcula custo. Os itens estruturados ficam protegidos após a baixa.
- Itens sem receita não movimentam estoque. Se nenhum item tiver receita, `cost_total` fica `NULL`; em pedidos mistos, soma-se o custo dos itens com receita.
- Pedidos já entregues na data da migração recebem apenas o marcador: não há baixa retroativa nem reconstrução de custos. Pedidos legados em texto podem ser entregues, sem baixa porque não têm linhas estruturadas.
- Faturamento e gráfico usam apenas entregues, agrupados pela **data de criação do pedido**, no dia local do navegador. “Lucro hoje” soma `total - (cost_total ?? 0)`; receitas ausentes resultam em custo não contabilizado, conforme a regra solicitada.

### Validação local

Há testes em `tests/` para PostgreSQL 18. Use **somente um banco descartável**:

1. Execute `tests/bootstrap.sql` para simular o mínimo de `auth` e o papel `authenticated`.
2. Aplique `schema.sql`, a migration de janeiro e as quatro migrations de setembro.
3. Execute `tests/recipes_orders.sql` com `psql -v ON_ERROR_STOP=1`. As fixtures são revertidas ao final.
4. Execute `node supabase/tests/concurrency.cjs` na raiz do repositório. Este teste cria fixtures no banco local e requer uma instância nova por execução.
5. Opcional: `node supabase/tests/ui-server.cjs` abre uma integração local em `http://127.0.0.1:4173/dashboard.html`. Usa os arquivos reais do frontend com um adaptador de teste; não se conecta ao Supabase remoto.

Os scripts Node acessam somente `127.0.0.1`, porta `55439`, banco `postgres`. `BF_TEST_PORT` e `BF_TEST_PSQL` permitem ajustar porta e executável. Não rode `bootstrap.sql` no Supabase real.

O material abaixo descreve a estrutura **anterior** às migrations de setembro e permanece como histórico.

Este diretório contém o schema base e as migrations do Supabase.

## Estrutura geral

A modelagem segue o fluxo natural do restaurante: um pedido contém
itens do cardápio, cada item do cardápio é produzido a partir de
ingredientes do estoque, e toda movimentação de estoque fica registrada.

```
orders
  └── order_items          (linhas reais do pedido)
        └── menu_items     (qual prato foi pedido)
              └── recipe_items   (composição do prato)
                    └── inventory  (ingredientes / insumos)

orders    ───► customers  (cliente que fez o pedido)
inventory ───► stock_movements  (histórico de movimentações)
```

## Arquivos

- `schema.sql` — schema inicial. Cria `profiles`, `menu_items`,
  `orders`, `customers`, `inventory`, `settings`, habilita RLS e
  instala o trigger de seed em novos usuários.
- `migrations/20260101000000_orders_items_recipes_stock.sql` —
  adiciona `orders.customer_id` e cria `order_items`,
  `recipe_items`, `stock_movements`, com FKs, CHECKs e RLS.
- `migrations/tests.sql` — queries de validação (somente leitura
  + inserts de teste que DEVEM falhar).

## Ordem de aplicação

1. Rodar `schema.sql` (bootstrap completo).
2. Rodar `migrations/20260101000000_orders_items_recipes_stock.sql`.
3. Rodar `migrations/tests.sql` para validar.

A migration é não-destrutiva: não remove dados, não altera colunas
existentes além de adicionar `orders.customer_id`, e mantém todos os
campos legados (`orders.items`, `orders.customer`, `orders.phone`,
`orders.total`, `menu_items.stock`) intactos para a fase de migração
do frontend.

## Compatibilidade

O frontend atual (`Store.addOrder`, `dashboard.js`) continua
funcionando sem alterações:

- `orders.items` continua sendo texto livre.
- `orders.customer` continua sendo texto livre.
- `orders.customer_id` é `NULL` até a próxima fase.
- `orders.total` continua sendo o total manual.

Quando o modal de pedidos for refatorado, aí passaremos a gravar
`order_items` reais e preencher `customer_id`.

## RLS — resumo do modelo

- Tabelas "donas" (`menu_items`, `orders`, `customers`, `inventory`,
  `settings`): policy `for all using (auth.uid() = user_id)`.
- Tabelas derivadas:
  - `order_items` — autorização via `exists (...)` no `orders`.
  - `recipe_items` — autorização via `exists (...)` no `menu_items`.
  - `stock_movements` — autorização direta via `user_id`.

Cada usuário só vê dados do próprio restaurante. Sem exceções.

## Não implementado nesta fase

Estes pontos serão atacados em migrations / código futuros:

- Baixa automática de estoque a partir de `order_items` (via
  `stock_movements`).
- Cálculo automático de `orders.total` a partir de `order_items.total`.
- Migração do modal de pedidos para gravar `order_items`.
- Edição de receitas pelo dashboard (`recipe_items` CRUD UI).
- Integração WhatsApp / iFood / KDS / IA.
- Mudanças no Stripe (planos, billing).
