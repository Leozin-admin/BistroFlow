// A identidade vem do Supabase Auth, nunca do corpo enviado pelo navegador.
export async function requireBillingUser(req, res, supabase) {
    const authorization = req.headers?.authorization;
    const token = typeof authorization === 'string'
        ? /^Bearer\s+(\S+)$/i.exec(authorization)?.[1] : null;
    if (!token) {
        res.status(401).json({ error: 'Entre novamente para gerenciar sua assinatura.' });
        return null;
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id || data.user.is_anonymous) {
        res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
        return null;
    }
    return data.user;
}

export async function verifyBillingCustomer(stripe, customerId, userId, res) {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted || customer.metadata?.user_id !== userId) {
        res.status(403).json({ error: 'Não foi possível validar o vínculo desta assinatura. Entre em contato com o suporte.' });
        return false;
    }
    return true;
}

export function billingOrigin() {
    // Origin/Host da requisição são controláveis pelo solicitante.
    const deployment = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    const configured = process.env.APP_URL || (deployment ? `https://${deployment}` : '');
    const url = new URL(configured);
    const local = process.env.NODE_ENV !== 'production' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('Configure APP_URL com a origem pública do aplicativo.');
    }
    return url.origin;
}
