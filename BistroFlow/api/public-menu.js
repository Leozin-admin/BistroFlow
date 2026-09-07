import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { slug } = req.query;

        if (!slug) {
            return res.status(400).json({ error: 'O parâmetro slug é obrigatório' });
        }

        // 1. Buscar o profiles.id correspondente ao slug
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('slug', slug)
            .maybeSingle();

        if (profileError) throw profileError;
        if (!profile) {
            return res.status(404).json({ error: 'Restaurante não encontrado' });
        }

        const userId = profile.id;

        // 2. Buscar os menu_items do restaurante onde available = true
        const { data: menu, error: menuError } = await supabase
            .from('menu_items')
            .select('name, description, category, price')
            .eq('user_id', userId)
            .eq('available', true);

        if (menuError) throw menuError;

        // 3. Devolver os itens
        return res.status(200).json(menu);

    } catch (err) {
        console.error('[public-menu]', err);
        return res.status(500).json({ error: err.message });
    }
}
