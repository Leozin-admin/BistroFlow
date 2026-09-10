/* supabaseClient.js — inicializa o cliente Supabase e expõe em window */
(function () {
  if (!window.supabase) {
    console.error('[Na Brasa] SDK do Supabase não foi carregado.');
    return;
  }

  const SUPABASE_URL = 'https://ritkjcnhvtdpbofiudex.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Je0yhqpbA7Ebpdaj6igKQQ_ic27dTRa';

  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  });
})();
