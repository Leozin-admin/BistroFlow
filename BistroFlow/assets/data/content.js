/* content.js — todo o conteúdo dinâmico em um só lugar.
   Para corrigir qualquer texto, é aqui que se mexe. */

window.SITE_DATA = {

  logos: [
    { name: 'Forno a Lenha' },
    { name: 'Sushi Hara' },
    { name: 'Burger 73' },
    { name: 'Verde Folha' },
    { name: 'Cantina do Porto' },
    { name: 'Tasca do Zé' },
    { name: 'Café Aurora' },
    { name: 'Bem Querer' }
  ],

  demoList: [
    { title: 'Atendimento omnichannel', text: 'WhatsApp, Instagram, telefone e totem — uma única conversa contínua.' },
    { title: 'Cardápio inteligente', text: 'Atualiza preço, foto e disponibilidade em tempo real em todos os canais.' },
    { title: 'KDS integrado', text: 'A cozinha recebe o pedido em 1 segundo, com cronômetro e prioridade.' },
    { title: 'Financeiro automático', text: 'Concilia bandeiras, taxas de entrega e gorjetas sem planilha.' }
  ],

  panelOrders: [
    { name: 'Marina T.', item: '2x Pizza Margherita + Refri', time: 'agora', status: 'preparando', value: 119.80 },
    { name: 'Lucas M.', item: '1x Combo Sushi 20 peças', time: '2 min', status: 'confirmado', value: 89.90 },
    { name: 'Camila R.', item: '3x Hambúrguer Artesanal', time: '5 min', status: 'a caminho', value: 142.50 },
    { name: 'Pedro H.', item: '1x Bowl Vegetariano', time: '7 min', status: 'entregue', value: 47.00 },
    { name: 'Joana S.', item: '2x Sashimi Salmão 15pç', time: '12 min', status: 'preparando', value: 156.00 }
  ],

  cases: [
    {
      tag: 'Pizzaria',
      title: 'Forno a Lenha',
      quote: '“A pizzaria virou 24h sem eu virar noites. O Bistro fecha 60% dos pedidos sozinho.”',
      metric: '+184%',
      metricLabel: 'pedidos/mês',
      tone: 'orange'
    },
    {
      tag: 'Japonês',
      title: 'Sushi Hara',
      quote: '“Reduzi o no-show em 73% e meu ticket médio subiu 28% com as sugestões do Bistro.”',
      metric: '+28%',
      metricLabel: 'ticket médio',
      tone: 'ink'
    },
    {
      tag: 'Hambúrgueria',
      title: 'Burger 73',
      quote: '“Ele entende até o pedido mais enrolado do WhatsApp. Ninguém mais pede pra repetir.”',
      metric: '−42%',
      metricLabel: 'erros de pedido',
      tone: 'orange'
    }
  ],

  pricing: [
    {
      id: 'balcao',
      name: 'Balcão',
      tagline: 'Pra quem está começando',
      price: 0,
      period: '/mês',
      cta: 'Começar grátis',
      featured: false,
      features: [
        '1 canal de atendimento',
        'Até 300 pedidos/mês',
        'Cardápio digital',
        'Relatórios básicos',
        'Suporte por e-mail'
      ]
    },
    {
      id: 'salao',
      name: 'Salão',
      tagline: 'O queridinho dos donos',
      price: 97.90,
      period: '/mês',
      cta: 'Contratar Salão',
      featured: true,
      features: [
        'Tudo do Balcão',
        'Atendimento ilimitado',
        'WhatsApp + Instagram + voz',
        'KDS e cozinha integrada',
        'Estoque e lista de compras',
        'Marketing automático',
        'Suporte prioritário 12/5'
      ]
    },
    {
      id: 'rede',
      name: 'Rede',
      tagline: 'Pra quem tem várias casas',
      price: 159.90,
      period: '/mês',
      cta: 'Falar com vendas',
      featured: false,
      features: [
        'Tudo do Salão',
        'Lojas ilimitadas',
        'Painel multi-unidade',
        'API e webhooks',
        'Gerente de sucesso dedicado',
        'Suporte 24/7'
      ]
    }
  ],

  faq: [
    {
      q: 'Preciso saber programar?',
      a: 'Não. A configuração é 100% visual, leva em média 15 minutos e tem wizard guiado.'
    },
    {
      q: 'Funciona com qualquer WhatsApp?',
      a: 'Sim. Usamos a API oficial do WhatsApp Business. Você mantém o mesmo número.'
    },
    {
      q: 'E se o cliente fizer uma pergunta que o Bistro não sabe?',
      a: 'Ele transborda pra um humano com todo o contexto da conversa. Você decide quem recebe.'
    },
    {
      q: 'Posso cancelar quando quiser?',
      a: 'Sim. Sem multa, sem fidelidade, sem letra miúda.'
    },
    {
      q: 'Meus dados ficam seguros?',
      a: 'Hospedagem AWS, criptografia em repouso e em trânsito, conformidade com a LGPD.'
    },
    {
      q: 'Vocês treinam com o tom da minha casa?',
      a: 'Sim. Enviamos o cardápio, avaliações antigas e exemplos de atendimento — ele aprende o sotaque.'
    }
  ]
};
