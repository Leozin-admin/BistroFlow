# BistroFlow — Banco de dados

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
