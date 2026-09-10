import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { requireBillingUser, verifyBillingCustomer, billingOrigin } from '../lib/billing-security.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const user = await requireBillingUser(req, res, supabase);
        if (!user) return;
        const { plan } = req.body || {};
        const userId = user.id;

        const priceMap = {
            salao: process.env.STRIPE_PRICE_SALAO,
            rede: process.env.STRIPE_PRICE_REDE
        };

        const priceId = typeof plan === 'string' && Object.hasOwn(priceMap, plan) ? priceMap[plan] : null;
        if (!priceId) {
            return res.status(400).json({ error: 'Plano inválido' });
        }

        // busca ou cria o customer no Stripe vinculado a esse usuário
        const origin = billingOrigin();
        const { data: existing, error } = await supabase
            .from('subscriptions')
            .select('stripe_customer_id')
            .eq('user_id', userId)
            .maybeSingle();
        if (error) throw error;

        let customerId = existing?.stripe_customer_id;
        if (customerId && !await verifyBillingCustomer(stripe, customerId, userId, res)) return;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { user_id: userId }
            });
            customerId = customer.id;
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/dashboard.html?checkout=success`,
            cancel_url: `${origin}/dashboard.html?checkout=cancel`,
            metadata: { user_id: userId, plan }
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('[create-checkout-session]', err);
        return res.status(500).json({ error: 'Não foi possível iniciar a assinatura. Tente novamente em instantes.' });
    }
}
