import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { plan, userId, userEmail } = req.body;

        const priceMap = {
            salao: process.env.STRIPE_PRICE_SALAO,
            rede: process.env.STRIPE_PRICE_REDE
        };

        const priceId = priceMap[plan];
        if (!priceId) {
            return res.status(400).json({ error: 'Plano inválido' });
        }

        // busca ou cria o customer no Stripe vinculado a esse usuário
        const { data: existing } = await supabase
            .from('subscriptions')
            .select('stripe_customer_id')
            .eq('user_id', userId)
            .maybeSingle();

        let customerId = existing?.stripe_customer_id;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: userEmail,
                metadata: { user_id: userId }
            });
            customerId = customer.id;
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${req.headers.origin}/dashboard.html?checkout=success`,
            cancel_url: `${req.headers.origin}/dashboard.html?checkout=cancel`,
            metadata: { user_id: userId, plan }
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('[create-checkout-session]', err);
        return res.status(500).json({ error: err.message });
    }
}