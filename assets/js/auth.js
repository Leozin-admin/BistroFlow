/* auth.js — autenticação client-side via localStorage (demo/MVP).
   Em produção, isso vira uma chamada a Supabase/Firebase/Auth0. */

const AUTH_KEY = 'bf_users';
const SESSION_KEY = 'bf_session';

const Auth = {
  getUsers() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || []; }
    catch { return []; }
  },
  saveUsers(users) { localStorage.setItem(AUTH_KEY, JSON.stringify(users)); },

  getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch { return null; }
  },
  setSession(s) {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  },

  hash(pwd) {
    // Hash didático (NUNCA use em produção — use bcrypt server-side)
    let h = 0;
    for (let i = 0; i < pwd.length; i++) {
      h = ((h << 5) - h) + pwd.charCodeAt(i);
      h |= 0;
    }
    return 'h_' + Math.abs(h).toString(36) + '_' + pwd.length;
  },

  signup({ name, email, restaurant, phone, password }) {
    const users = this.getUsers();
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, error: 'Já existe uma conta com esse e-mail.' };
    }
    if (password.length < 6) {
      return { ok: false, error: 'A senha precisa ter pelo menos 6 caracteres.' };
    }
    const user = {
      id: 'u_' + Date.now().toString(36),
      name, email, restaurant, phone,
      password: this.hash(password),
      plan: 'trial',
      createdAt: new Date().toISOString()
    };
    users.push(user);
    this.saveUsers(users);
    this.setSession({ id: user.id, name: user.name, email: user.email, restaurant: user.restaurant });
    return { ok: true, user };
  },

  login({ email, password }) {
    const users = this.getUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return { ok: false, error: 'E-mail ou senha incorretos.' };
    if (user.password !== this.hash(password)) return { ok: false, error: 'E-mail ou senha incorretos.' };
    this.setSession({ id: user.id, name: user.name, email: user.email, restaurant: user.restaurant });
    return { ok: true, user };
  },

  logout() { this.setSession(null); }
};

window.Auth = Auth;
