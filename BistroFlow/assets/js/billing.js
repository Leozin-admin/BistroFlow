/* Solicita uma sessão de cobrança com o token atual, sem enviar identidade no corpo. */
(function () {
  async function requestSession(endpoint, payload) {
    const session = await Auth.getSession();
    if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('Sua sessão expirou. Entre novamente.');
    if (!response.ok || !data.url) {
      throw new Error(data.error || 'Não foi possível acessar a cobrança. Tente novamente.');
    }
    return data.url;
  }

  window.Billing = {
    createCheckout: (plan) => requestSession('/api/create-checkout-session', { plan }),
    createPortal: () => requestSession('/api/create-portal-session', {})
  };
})();
