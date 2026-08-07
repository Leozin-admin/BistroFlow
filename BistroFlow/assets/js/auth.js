/* auth.js — autenticação real via Supabase Auth
   Substitui o mock de localStorage. Mantém API compatível
   com a versão anterior (Auth.signup/login/logout/getSession)
   pra não precisar mexer nas páginas HTML. */

const Auth = {
  /* ---------- sessão ---------- */

  /** Retorna a sessão atual ou null. Tenta memória + storage. */
  async getSession() {
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (error) { console.warn('[Auth]', error.message); return null; }
    return data?.session || null;
  },

  /** Retorna o usuário autenticado (com metadados) ou null. */
  async getUser() {
    const { data, error } = await window.supabaseClient.auth.getUser();
    if (error) { console.warn('[Auth]', error.message); return null; }
    return data?.user || null;
  },

  /** Versão síncrona — usa o cache local do Supabase. Bom pra UI. */
  getSessionSync() {
    try {
      const raw = localStorage.getItem('sb-' + window.location.hostname + '-auth-token');
      // fallback: o supabase-js usa uma chave dinâmica, então usamos o método oficial
      return null; // mantemos API assíncrona via getSession()
    } catch { return null; }
  },

  /* ---------- signup / login / logout ---------- */

  /** { name, restaurant, email, phone, password } */
  async signup({ name, restaurant, email, phone, password }) {
    if (!name || !email || !password || !restaurant) {
      return { ok: false, error: 'Preencha todos os campos obrigatórios.' };
    }
    if (password.length < 6) {
      return { ok: false, error: 'A senha precisa ter pelo menos 6 caracteres.' };
    }

    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { name, restaurant, phone: phone || '' }
      }
    });

    if (error) return { ok: false, error: this.translateError(error) };
    if (!data.user) return { ok: false, error: 'Falha ao criar usuário.' };

    // Se o Supabase exigir confirmação de email, não há sessão ainda
    if (!data.session) {
      return {
        ok: false,
        error: 'Conta criada! Verifique seu email para confirmar o cadastro.',
        needsEmailConfirm: true
      };
    }

    return { ok: true, user: data.user, session: data.session };
  },

  async login({ email, password }) {
    if (!email || !password) {
      return { ok: false, error: 'Preencha e-mail e senha.' };
    }

    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
      email, password
    });

    if (error) return { ok: false, error: this.translateError(error) };
    return { ok: true, user: data.user, session: data.session };
  },

  async logout() {
    await window.supabaseClient.auth.signOut();
  },

  /* ---------- listener de mudança de auth ---------- */

  /** onChange(callback) — callback(event, session).
      Use pra reagir a login/logout em qualquer página. */
  onChange(callback) {
    return window.supabaseClient.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  },

  /* ---------- helpers ---------- */

  translateError(err) {
    const m = (err.message || '').toLowerCase();
    if (m.includes('invalid login') || m.includes('invalid credentials')) return 'E-mail ou senha incorretos.';
    if (m.includes('user already registered') || m.includes('already been registered')) return 'Já existe uma conta com esse e-mail.';
    if (m.includes('email not confirmed')) return 'Confirme seu email antes de entrar (verifique a caixa de entrada).';
    if (m.includes('password should be')) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (m.includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos.';
    if (m.includes('network')) return 'Erro de conexão. Verifique sua internet.';
    return err.message || 'Erro desconhecido. Tente novamente.';
  }
};

window.Auth = Auth;
