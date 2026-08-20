import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Precisa do corpo "cru" da requisição pra validar a assinatura do Stripe
export const config = {
    api: { bodyParser: false }
};

function buffer(readable) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        readable.on('data', (chunk) => chunks.push(chunk));
        readable.on('end', () => resolve(Buffer.concat(chunks)));
        readable.on('error', reject);
    });
}

const priceToPlan = {
    [process.env.STRIPE_PRICE_SALAO]: 'salao',
    [process.env.STRIPE_PRICE_REDE]: 'rede'
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const sig = req.headers['stripe-signature'];
    const buf = await buffer(req);

    let event;
    try {
        event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('[webhook] assinatura inválida:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = session.metadata?.user_id;
                const plan = session.metadata?.plan;

                if (userId) {
                    await supabase.from('subscriptions').upsert({
                        user_id: userId,
                        stripe_customer_id: session.customer,
                        stripe_subscription_id: session.subscription,
                        plan: plan || 'salao',
                        status: 'active',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' });
                }
                break;
            }

            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const priceId = sub.items.data[0]?.price?.id;
                const plan = priceToPlan[priceId] || 'salao';

                await supabase.from('subscriptions')
                    .update({
                        plan,
                        status: sub.status,
                        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', sub.id);
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                await supabase.from('subscriptions')
                    .update({ plan: 'balcao', status: 'canceled', updated_at: new Date().toISOString() })
                    .eq('stripe_subscription_id', sub.id);
                break;
            }
        }

        return res.status(200).json({ received: true });
    } catch (err) {
        console.error('[webhook] erro ao processar evento:', err);
        return res.status(500).json({ error: err.message });
    }
}