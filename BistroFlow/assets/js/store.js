/* store.js — camada de dados sobre Supabase (Postgres).
   Mantém a mesma API do mock antigo (Store.getMenu, etc.)
   pra que dashboard.js não precise mudar nada. */

const Store = {
  /* ---------- helpers internos ---------- */

  _client() { return window.supabaseClient; },
  _uid() { return window.supabaseClient.auth.getUser().then(r => r.data?.user?.id); },

  async _requireUid() {
    const { data } = await this._client().auth.getUser();
    const uid = data?.user?.id;
    if (!uid) throw new Error('Não autenticado.');
    return uid;
  },

  /* ---------- menu ---------- */

  async getMenu() {
    const uid = await this._requireUid();
    const { data, error } = await this._client()
      .from('menu_items')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true });
    if (error) { console.error('[Store.getMenu]', error); return []; }
    return data || [];
  },

  async addMenuItem(item) {
    const uid = await this._requireUid();

    // Plano Gratuito: limite de 12 itens
    const sub = await this.getSubscription();
    if (sub.plan === 'balcao') {
      const { count } = await this._client()
        .from('menu_items')
        .select('*', { count: 'exact', head: false })
        .eq('user_id', uid);
      if (count >= 12) throw new Error('Limite de 12 itens no plano gratuito atingido. Faça upgrade pra adicionar mais.');
    }

    const { data, error } = await this._client()
      .from('menu_items')
      .insert({ ...item, user_id: uid })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateMenuItem(id, patch) {
    const { data, error } = await this._client()
      .from('menu_items')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteMenuItem(id) {
    const { error } = await this._client()
      .from('menu_items')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  /** Compat com versão antiga (chamada no boot do dashboard). */
  seedMenuIfEmpty() { /* noop — seed é feito via trigger no signup */ },

  /* ---------- orders ---------- */

  async getOrders() {
    const uid = await this._requireUid();
    const { data, error } = await this._client()
      .from('orders')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (error) { console.error('[Store.getOrders]', error); return []; }
    return data || [];
  },

  async addOrder(o) {
    const uid = await this._requireUid();

    // Plano Gratuito: limite de 300 pedidos nos últimos 30 dias
    const sub = await this.getSubscription();
    if (sub.plan === 'balcao') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count } = await this._client()
        .from('orders')
        .select('*', { count: 'exact', head: false })
        .eq('user_id', uid)
        .gte('created_at', thirtyDaysAgo.toISOString());
      if (count >= 300) throw new Error('Limite de 300 pedidos mensais no plano gratuito atingido. Faça upgrade pra adicionar mais.');
    }

    const row = {
      user_id: uid,
      customer: o.customer || 'Cliente',
      phone: o.phone || null,
      items: o.items || '—',
      total: Number(o.total) || 0,
      status: o.status || 'novo',
      channel: o.channel || 'whatsapp'
    };
    const { data, error } = await this._client()
      .from('orders').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async updateOrderStatus(id, status) {
    const { data, error } = await this._client()
      .from('orders').update({ status }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteOrder(id) {
    const { error } = await this._client()
      .from('orders').delete().eq('id', id);
    if (error) throw error;
  },

  async recordCustomerOrder(order) {
    const uid = await this._requireUid();
    const customers = await this.getCustomers();
    const normalizedName = (order.customer || '').trim().toLowerCase();
    const normalizedPhone = (order.phone || '').replace(/\D/g, '');
    const customer = customers.find((item) =>
      (normalizedPhone && (item.phone || '').replace(/\D/g, '') === normalizedPhone) ||
      (!normalizedPhone && item.name.trim().toLowerCase() === normalizedName)
    );
    const lastOrder = new Date().toISOString().slice(0, 10);
    if (customer) {
      const { error } = await this._client().from('customers').update({
        name: order.customer || customer.name,
        phone: order.phone || customer.phone,
        orders: Number(customer.orders || 0) + 1,
        total: Number(customer.total || 0) + Number(order.total || 0),
        last_order: lastOrder
      }).eq('id', customer.id);
      if (error) throw error;
      return;
    }
    const { error } = await this._client().from('customers').insert({
      user_id: uid,
      name: order.customer || 'Cliente',
      phone: order.phone || null,
      orders: 1,
      total: Number(order.total || 0),
      last_order: lastOrder
    });
    if (error) throw error;
  },

  seedOrdersIfEmpty() { },

  /* ---------- customers ---------- */

  async getCustomers() {
    const uid = await this._requireUid();
    const { data, error } = await this._client()
      .from('customers')
      .select('*')
      .eq('user_id', uid)
      .order('name', { ascending: true });
    if (error) { console.error('[Store.getCustomers]', error); return []; }
    return data || [];
  },

  async addCustomer(c) {
    const uid = await this._requireUid();
    const row = {
      user_id: uid,
      name: c.name || 'Cliente',
      phone: c.phone || null,
      email: c.email || null,
      orders: 0,
      total: 0,
      last_order: null
    };
    const { data, error } = await this._client()
      .from('customers').insert(row).select().single();
    if (error) throw error;
    return data;
  },

  async updateCustomer(id, patch) {
    const { data, error } = await this._client().from('customers').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteCustomer(id) {
    const { error } = await this._client().from('customers').delete().eq('id', id);
    if (error) throw error;
  },

  seedCustomersIfEmpty() { },

  /* ---------- inventory ---------- */

  async getInventory() {
    const uid = await this._requireUid();
    const { data, error } = await this._client()
      .from('inventory')
      .select('*')
      .eq('user_id', uid)
      .order('name', { ascending: true });
    if (error) { console.error('[Store.getInventory]', error); return []; }
    return data || [];
  },

  async updateInventory(id, patch) {
    const { data, error } = await this._client()
      .from('inventory').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async addInventory(item) {
    const uid = await this._requireUid();
    const { data, error } = await this._client().from('inventory').insert({ ...item, user_id: uid }).select().single();
    if (error) throw error;
    return data;
  },

  async deleteInventory(id) {
    const { error } = await this._client().from('inventory').delete().eq('id', id);
    if (error) throw error;
  },

  seedInventoryIfEmpty() { },

  /* ---------- settings ---------- */

  async getSettings() {
    const uid = await this._requireUid();
    const { data, error } = await this._client()
      .from('settings')
      .select('*')
      .eq('user_id', uid)
      .single();
    if (error || !data) {
      return {
        restaurantName: '',
        whatsapp: '',
        notifications: true,
        autoConfirm: true
      };
    }
    return {
      restaurantName: data.restaurant_name || '',
      whatsapp: data.whatsapp || '',
      notifications: data.notifications !== false,
      autoConfirm: data.auto_confirm !== false
    };
  },

  async setSettings(s) {
    const uid = await this._requireUid();
    const row = {
      user_id: uid,
      restaurant_name: s.restaurantName || '',
      whatsapp: s.whatsapp || '',
      notifications: s.notifications !== false,
      auto_confirm: s.autoConfirm !== false
    };
    const { error } = await this._client()
      .from('settings')
      .upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
  },

  /* ---------- plan / billing ---------- */

  /** Returns the current plan from Supabase or a default free plan */
  async getSubscription() {
    const uid = await this._requireUid();
    const { data, error } = await this._client()
      .from('subscriptions')
      .select('*')
      .eq('user_id', uid)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[Store.getSubscription]', error);
    }

    if (!data) {
      return { plan: 'balcao', status: 'active', current_period_end: null };
    }

    return data;
  },

};

window.Store = Store;
