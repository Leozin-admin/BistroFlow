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
    const row = {
      user_id: uid,
      customer: o.customer || 'Cliente',
      phone:    o.phone || null,
      items:    o.items || '—',
      total:    Number(o.total) || 0,
      status:   o.status || 'novo',
      channel:  o.channel || 'whatsapp'
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

  seedOrdersIfEmpty() {},

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

  seedCustomersIfEmpty() {},

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

  seedInventoryIfEmpty() {},

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
  }
};

window.Store = Store;
