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

        const { data: sub, error } = await supabase
            .from('subscriptions')
            .select('stripe_customer_id')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) throw error;
        if (!sub?.stripe_customer_id) {
            return res.status(404).json({ error: 'Nenhuma assinatura encontrada para este usuário.' });
        }
        if (!await verifyBillingCustomer(stripe, sub.stripe_customer_id, user.id, res)) return;

        const session = await stripe.billingPortal.sessions.create({
            customer: sub.stripe_customer_id,
            return_url: `${billingOrigin()}/dashboard.html`
        });

        return res.status(200).json({ url: session.url });
    } catch (err) {
        console.error('[create-portal-session]', err);
        return res.status(500).json({ error: 'Não foi possível abrir sua assinatura. Tente novamente em instantes.' });
    }
}
