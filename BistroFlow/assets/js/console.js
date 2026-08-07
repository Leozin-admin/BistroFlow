/* console.js — feed "ao vivo" no console do hero, simulando pedidos chegando */
(function () {
  const body = $('#consoleBody');
  if (!body) return;

  const reduce = utils.prefersReducedMotion();
  const lines = [
    { t: 'sys',   m: 'Bistro v2.4 conectado · cozinha + PDV + WhatsApp' },
    { t: 'in',    m: 'Cliente: "Oi, qual o prato do dia?"' },
    { t: 'bistro',m: 'O prato do dia é Risoto de Cogumelos (R$ 58). Posso anotar?' },
    { t: 'in',    m: 'Cliente: "Sim! E uma coca, por favor"' },
    { t: 'bistro',m: 'Pedido #1842 confirmado · Risoto + Coca · entrega 35min' },
    { t: 'sys',   m: 'Estoque atualizado · cogumelos: 12 → 11 porções' },
    { t: 'in',    m: 'Cliente: "Vocês entregam no Centro?"' },
    { t: 'bistro',m: 'Sim! Para o Centro a entrega sai por R$ 7 e leva ~30min. Posso mandar o cardápio?' },
    { t: 'sys',   m: 'Marketing: cupom "VOLTEI15" disparado para 142 clientes inativos' },
    { t: 'in',    m: 'Cliente: "Aceita pix?"' },
    { t: 'bistro',m: 'Aceitamos pix, cartão e dinheiro na entrega. Qual prefere?' }
  ];

  let i = 0;
  const render = () => {
    if (i >= lines.length) i = 0;
    const line = lines[i++];
    const el = document.createElement('div');
    el.className = `cline cline--${line.t}`;
    el.innerHTML = `<span class="cline__tag">${line.t === 'in' ? 'cliente' : line.t}</span><span class="cline__msg"></span>`;
    el.querySelector('.cline__msg').textContent = line.m;
    body.appendChild(el);
    // mantém só as últimas 7 linhas
    while (body.children.length > 7) body.removeChild(body.firstChild);
    body.scrollTop = body.scrollHeight;
    // animar entrada
    el.style.animation = 'ticker 380ms cubic-bezier(0.16,1,0.3,1) both';
  };

  // abre com 3 linhas
  for (let k = 0; k < 3; k++) render();
  if (!reduce) {
    setInterval(render, 2200);
  }
})();
