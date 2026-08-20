import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { userId } = req.body;

        const { data: sub, error } = await supabase
            .from('subscriptions')
            .select('stripe_customer_id')
            .eq('user_id', userId)
            .maybeSingle();

        if (error || !sub?.stripe_customer_id) {
            return res.status(404).json({ error: 'Nenhuma assinatura encontrada para este usuário.' });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: sub.stripe_customer_id,
            return_url: `${req.headers.origin}/dashboard.html`
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('[create-portal-session]', err);
        return res.status(500).json({ error: err.message });
    }
}