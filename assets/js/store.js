/* store.js — "banco de dados" client-side (localStorage).
   Em produção, isso vira Supabase/Firebase. Aqui a API é a mesma. */

const KEYS = {
  menu:      'bf_menu',
  orders:    'bf_orders',
  customers: 'bf_customers',
  inventory: 'bf_inventory',
  settings:  'bf_settings'
};

const Store = {
  // ----- helpers -----
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  write(key, value) { localStorage.setItem(key, JSON.stringify(value)); },

  // ----- menu -----
  getMenu() { return this.read(KEYS.menu, null); },
  setMenu(arr) { this.write(KEYS.menu, arr); },
  seedMenuIfEmpty() {
    if (this.getMenu()) return;
    const seed = [
      { id: 'm1', name: 'Pizza Margherita',     category: 'Pizzas',    price: 49.90, cost: 14, stock: 999, available: true, description: 'Molho de tomate artesanal, mussarela de búfala e manjericão.' },
      { id: 'm2', name: 'Pizza Calabresa',      category: 'Pizzas',    price: 45.90, cost: 12, stock: 999, available: true, description: 'Calabresa fatiada, cebola roxa e azeitonas pretas.' },
      { id: 'm3', name: 'Combo Sushi 20 peças', category: 'Japonês',   price: 89.90, cost: 32, stock: 25,  available: true, description: '20 peças variadas com salmão, atum e camarão.' },
      { id: 'm4', name: 'Hambúrguer Artesanal', category: 'Lanches',   price: 42.50, cost: 11, stock: 60,  available: true, description: 'Pão brioche, blend 180g, cheddar e bacon.' },
      { id: 'm5', name: 'Bowl Vegetariano',     category: 'Saudável',  price: 47.00, cost: 13, stock: 40,  available: true, description: 'Quinoa, grão-de-bico, abóbora, folhas e molho de tahine.' },
      { id: 'm6', name: 'Coca-Cola 350ml',      category: 'Bebidas',   price:  8.00, cost:  3, stock: 200, available: true, description: 'Lata 350ml gelada.' }
    ];
    this.setMenu(seed);
  },

  addMenuItem(item) {
    const m = this.getMenu() || [];
    item.id = 'm' + Date.now().toString(36);
    m.push(item);
    this.setMenu(m);
    return item;
  },
  updateMenuItem(id, patch) {
    const m = this.getMenu() || [];
    const idx = m.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    m[idx] = { ...m[idx], ...patch };
    this.setMenu(m);
    return m[idx];
  },
  deleteMenuItem(id) {
    const m = (this.getMenu() || []).filter((x) => x.id !== id);
    this.setMenu(m);
  },

  // ----- orders -----
  getOrders() { return this.read(KEYS.orders, null); },
  setOrders(arr) { this.write(KEYS.orders, arr); },
  seedOrdersIfEmpty() {
    if (this.getOrders()) return;
    const now = Date.now();
    const seed = [
      { id: 'o1', customer: 'Marina T.',  phone: '11999990001', items: '2x Pizza Margherita + Coca', total: 107.80, status: 'preparando', channel: 'whatsapp', createdAt: new Date(now - 1*60000).toISOString() },
      { id: 'o2', customer: 'Lucas M.',   phone: '11999990002', items: '1x Combo Sushi 20 peças',    total:  89.90, status: 'confirmado', channel: 'ifood',     createdAt: new Date(now - 3*60000).toISOString() },
      { id: 'o3', customer: 'Camila R.',  phone: '11999990003', items: '3x Hambúrguer Artesanal',    total: 127.50, status: 'pronto',     channel: 'balcao',    createdAt: new Date(now - 8*60000).toISOString() },
      { id: 'o4', customer: 'Pedro H.',   phone: '11999990004', items: '1x Bowl Vegetariano',        total:  47.00, status: 'entregue',   channel: 'whatsapp', createdAt: new Date(now - 30*60000).toISOString() },
      { id: 'o5', customer: 'Joana S.',   phone: '11999990005', items: '2x Pizza Calabresa',         total:  91.80, status: 'novo',       channel: 'whatsapp', createdAt: new Date(now - 30*1000).toISOString() }
    ];
    this.setOrders(seed);
  },
  addOrder(o) {
    const arr = this.getOrders() || [];
    o.id = 'o' + Date.now().toString(36);
    o.createdAt = o.createdAt || new Date().toISOString();
    o.status = o.status || 'novo';
    arr.unshift(o);
    this.setOrders(arr);
    return o;
  },
  updateOrderStatus(id, status) {
    const arr = this.getOrders() || [];
    const idx = arr.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    arr[idx].status = status;
    this.setOrders(arr);
    return arr[idx];
  },
  deleteOrder(id) {
    const arr = (this.getOrders() || []).filter((x) => x.id !== id);
    this.setOrders(arr);
  },

  // ----- customers -----
  getCustomers() { return this.read(KEYS.customers, null); },
  setCustomers(arr) { this.write(KEYS.customers, arr); },
  seedCustomersIfEmpty() {
    if (this.getCustomers()) return;
    const seed = [
      { id: 'c1', name: 'Marina Tavares',  phone: '11999990001', email: 'marina@email.com',  orders: 12, total: 1280.40, lastOrder: '2026-08-05' },
      { id: 'c2', name: 'Lucas Martins',   phone: '11999990002', email: 'lucas@email.com',   orders:  8, total:  720.00, lastOrder: '2026-08-04' },
      { id: 'c3', name: 'Camila Rodrigues',phone: '11999990003', email: 'camila@email.com',  orders: 22, total: 2140.50, lastOrder: '2026-08-06' },
      { id: 'c4', name: 'Pedro Henrique',  phone: '11999990004', email: 'pedro@email.com',   orders:  3, total:  140.00, lastOrder: '2026-08-01' },
      { id: 'c5', name: 'Joana Silva',     phone: '11999990005', email: 'joana@email.com',   orders: 15, total: 1670.20, lastOrder: '2026-08-06' }
    ];
    this.setCustomers(seed);
  },

  // ----- inventory -----
  getInventory() { return this.read(KEYS.inventory, null); },
  setInventory(arr) { this.write(KEYS.inventory, arr); },
  seedInventoryIfEmpty() {
    if (this.getInventory()) return;
    const seed = [
      { id: 'i1', name: 'Farinha de trigo',  unit: 'kg',  qty: 25,  min: 10,  cost:  5.20 },
      { id: 'i2', name: 'Queijo mussarela',  unit: 'kg',  qty:  8,  min:  5,  cost: 32.00 },
      { id: 'i3', name: 'Tomate',            unit: 'kg',  qty: 12,  min:  8,  cost:  7.50 },
      { id: 'i4', name: 'Salmão',            unit: 'kg',  qty:  3,  min:  4,  cost: 78.00 },
      { id: 'i5', name: 'Carne moída',       unit: 'kg',  qty: 15,  min:  6,  cost: 38.00 },
      { id: 'i6', name: 'Refrigerante lata', unit: 'un',  qty: 96,  min: 50,  cost:  3.20 }
    ];
    this.setInventory(seed);
  },
  updateInventory(id, patch) {
    const arr = this.getInventory() || [];
    const idx = arr.findIndex((x) => x.id === id);
    if (idx === -1) return null;
    arr[idx] = { ...arr[idx], ...patch };
    this.setInventory(arr);
    return arr[idx];
  },

  // ----- settings -----
  getSettings() {
    return this.read(KEYS.settings, {
      restaurantName: 'Meu Restaurante',
      whatsapp: '',
      notifications: true,
      autoConfirm: true
    });
  },
  setSettings(s) { this.write(KEYS.settings, s); }
};

window.Store = Store;
