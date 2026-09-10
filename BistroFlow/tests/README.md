# Validação da segurança de cobrança

Na pasta `BistroFlow`, execute `npm run test:billing` com Node 20 ou superior.
Os testes executam os handlers e o cliente de cobrança reais, com Supabase e
Stripe simulados. Não acessam a rede nem criam cobranças.

Cobertura: tokens ausentes/inválidos, contas anônimas, identidade forjada no
corpo, isolamento entre duas contas, vínculo do cliente Stripe, erros de
serviços, planos inválidos e URLs de retorno. Também verificam o envio do
token atualizado pelo navegador e o tratamento de sessão expirada.

## Configuração para publicação

- Preservar as variáveis existentes do Supabase e Stripe no servidor.
- `APP_URL` pode definir a origem pública, por exemplo `https://meu-app.vercel.app`
  (sem `/dashboard.html`). Na ausência dela, são utilizadas as variáveis de
  implantação `VERCEL_PROJECT_PRODUCTION_URL` ou `VERCEL_URL`, nessa ordem.
- Fora da Vercel, configurar `APP_URL` explicitamente. Para desenvolvimento,
  aceita-se `http://localhost:3000`; em produção exige-se HTTPS.
- Nunca colocar chaves secretas no código do navegador.
- Clientes Stripe existentes precisam ter `metadata.user_id` correspondente
  ao usuário autenticado. O checkout anterior já criava esse vínculo. Clientes
  criados manualmente ou com vínculo ausente serão bloqueados; investigar a
  titularidade antes de qualquer correção manual. Não há associação por e-mail.
- Nenhuma migração de banco é necessária para esta alteração. As políticas
  atuais da tabela `subscriptions` não são verificadas por estes testes.

## Verificação integrada antes de publicar

Em ambiente com Stripe de teste, conferir os botões Mudar de plano e Gerenciar
assinatura com duas contas distintas. Confirmar que cada portal mostra apenas
o respectivo cliente, que o retorno usa a origem correta e que o webhook mantém
o vínculo da assinatura. Os testes locais não substituem essa verificação de
configuração e serviços reais.

Frontend e endpoints devem ser publicados juntos: o frontend anterior não
envia token e será rejeitado com 401 pelos endpoints corrigidos. O cache da PWA
foi versionado para carregar os arquivos atualizados; abas já abertas podem
precisar ser recarregadas após a atualização.
