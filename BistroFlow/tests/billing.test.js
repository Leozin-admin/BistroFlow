import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Executa os handlers reais, substituindo somente os serviços externos.
// Não usa credenciais, rede, clientes Stripe ou cobranças reais.
async function setup(route, options = {}) {
    const calls = { auth: [], queries: [], customers: [], checkout: [], portal: [] };
    const env = {
        APP_URL: 'https://bistro.example', NODE_ENV: 'production',
        STRIPE_PRICE_SALAO: 'price_salao', STRIPE_PRICE_REDE: 'price_rede',
        ...options.env
    };
    const supabase = {
        auth: { async getUser(token) {
            calls.auth.push(token);
            const id = { token_a: 'user_a', token_b: 'user_b' }[token];
            return id ? { data: { user: { id, email: `${id}@example.com`, is_anonymous: !!options.anonymous } }, error: null }
                : { data: { user: null }, error: { message: 'Token inválido' } };
        } },
        from(table) {
            assert.equal(table, 'subscriptions');
            let userId;
            return {
                select() { return this; },
                eq(column, value) { assert.equal(column, 'user_id'); userId = value; calls.queries.push(value); return this; },
                async maybeSingle() {
                    return { data: options.noCustomer ? null : { stripe_customer_id: `cus_${userId}` },
                        error: options.dbError ? { message: 'private-database-detail' } : null };
                }
            };
        }
    };
    class Stripe {
        customers = {
            retrieve: async (id) => {
                calls.customers.push({ retrieve: id });
                return { id, deleted: !!options.deleted,
                    metadata: options.noOwner ? {} : { user_id: options.wrongOwner ? 'another_user' : id.slice(4) } };
            },
            create: async (payload) => { calls.customers.push({ create: payload }); return { id: 'cus_new' }; }
        };
        checkout = { sessions: { create: async (payload) => {
            calls.checkout.push(payload);
            if (options.stripeError) throw new Error('private-stripe-detail');
            return { url: 'https://checkout.stripe.com/test' };
        } } };
        billingPortal = { sessions: { create: async (payload) => {
            calls.portal.push(payload);
            if (options.stripeError) throw new Error('private-stripe-detail');
            return { url: 'https://billing.stripe.com/test' };
        } } };
    }
    const context = vm.createContext({ URL, process: { env }, console: { error() {} } });
    const security = new vm.SourceTextModule(await readFile(new URL('../lib/billing-security.js', import.meta.url), 'utf8'), { context });
    const stripeModule = new vm.SyntheticModule(['default'], function () { this.setExport('default', Stripe); }, { context });
    const supabaseModule = new vm.SyntheticModule(['createClient'], function () {
        this.setExport('createClient', () => supabase);
    }, { context });
    const handlerModule = new vm.SourceTextModule(await readFile(new URL(`../api/${route}.js`, import.meta.url), 'utf8'), { context });
    await handlerModule.link((specifier) => {
        if (specifier === 'stripe') return stripeModule;
        if (specifier === '@supabase/supabase-js') return supabaseModule;
        if (specifier === '../lib/billing-security.js') return security;
        throw new Error(`Import inesperado: ${specifier}`);
    });
    await handlerModule.evaluate();
    async function request(overrides = {}) {
        const response = {
            statusCode: 200, headers: {},
            setHeader(key, value) { this.headers[key] = value; },
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; }
        };
        await handlerModule.namespace.default({
            method: 'POST', headers: { authorization: 'Bearer token_a', origin: 'https://attacker.example' },
            body: { plan: 'salao', userId: 'user_b', userEmail: 'forged@example.com' }, ...overrides
        }, response);
        assert.equal(response.headers['Cache-Control'], 'no-store');
        return response;
    }
    return { request, calls };
}

for (const route of ['create-checkout-session', 'create-portal-session']) {
    test(`${route}: rejeita métodos diferentes de POST antes de consultar serviços`, async () => {
        const { request, calls } = await setup(route);
        assert.equal((await request({ method: 'GET' })).statusCode, 405);
        assert.equal(calls.auth.length, 0);
    });

    test(`${route}: rejeita token ausente, malformado e inválido sem consultar assinaturas`, async () => {
        for (const authorization of [undefined, '', 'Basic token_a', 'Bearer token_a extra', ['Bearer token_a'], 'Bearer expired']) {
            const { request, calls } = await setup(route);
            assert.equal((await request({ headers: { authorization } })).statusCode, 401);
            assert.equal(calls.queries.length, 0);
            assert.equal(calls.customers.length + calls.checkout.length + calls.portal.length, 0);
        }
    });

    test(`${route}: sessão anônima não pode acessar cobrança`, async () => {
        const { request, calls } = await setup(route, { anonymous: true });
        assert.equal((await request()).statusCode, 401);
        assert.equal(calls.queries.length, 0);
    });

    test(`${route}: ignora identidade forjada e isola duas contas no mesmo handler`, async () => {
        const { request, calls } = await setup(route);
        assert.equal((await request()).statusCode, 200);
        assert.equal((await request({ headers: { authorization: 'Bearer token_b' }, body: { plan: 'rede', userId: 'user_a' } })).statusCode, 200);
        assert.deepEqual(calls.queries, ['user_a', 'user_b']);
        const sessions = route === 'create-checkout-session' ? calls.checkout : calls.portal;
        assert.deepEqual(sessions.map((s) => s.customer), ['cus_user_a', 'cus_user_b']);
        for (const s of sessions) {
            for (const key of ['success_url', 'cancel_url', 'return_url']) {
                if (s[key]) assert.equal(new URL(s[key]).origin, 'https://bistro.example');
            }
        }
        if (route === 'create-checkout-session') {
            assert.equal(sessions[0].metadata.user_id, 'user_a');
            assert.equal(sessions[1].metadata.user_id, 'user_b');
        }
    });

    test(`${route}: bloqueia vínculo Stripe de outra pessoa, ausente ou excluído`, async () => {
        for (const option of ['wrongOwner', 'noOwner', 'deleted']) {
            const { request, calls } = await setup(route, { [option]: true });
            assert.equal((await request()).statusCode, 403);
            assert.equal(calls.checkout.length + calls.portal.length, 0);
        }
    });

    test(`${route}: falha do banco não é tratada como ausência de assinatura`, async () => {
        const { request, calls } = await setup(route, { dbError: true });
        const response = await request();
        assert.equal(response.statusCode, 500);
        assert.doesNotMatch(response.body.error, /private-database-detail/);
        assert.equal(calls.customers.length + calls.checkout.length + calls.portal.length, 0);
    });

    test(`${route}: não expõe detalhes de erros do Stripe`, async () => {
        const { request } = await setup(route, { stripeError: true });
        const response = await request();
        assert.equal(response.statusCode, 500);
        assert.doesNotMatch(response.body.error, /private-stripe-detail/);
    });
}

test('checkout: cliente novo usa e-mail e ID verificados pelo Supabase', async () => {
    const { request, calls } = await setup('create-checkout-session', { noCustomer: true });
    assert.equal((await request()).statusCode, 200);
    assert.equal(calls.customers[0].create.email, 'user_a@example.com');
    assert.equal(calls.customers[0].create.metadata.user_id, 'user_a');
    assert.equal(calls.checkout[0].customer, 'cus_new');
    assert.equal(calls.checkout[0].line_items[0].price, 'price_salao');
});

test('checkout: rejeita planos inexistentes, herdados e corpo ausente', async () => {
    for (const plan of ['balcao', 'toString', '__proto__', ['salao'], null, undefined]) {
        const { request, calls } = await setup('create-checkout-session');
        assert.equal((await request({ body: plan === undefined ? undefined : { plan } })).statusCode, 400);
        assert.equal(calls.queries.length + calls.customers.length, 0);
    }
});

test('portal: usuário sem assinatura recebe 404, sem abrir sessão Stripe', async () => {
    const { request, calls } = await setup('create-portal-session', { noCustomer: true });
    assert.equal((await request()).statusCode, 404);
    assert.equal(calls.portal.length, 0);
});

test('retorno da cobrança: usa configuração Vercel e rejeita origem insegura ou ausente', async () => {
    const valid = await setup('create-portal-session', { env: { APP_URL: '', VERCEL_PROJECT_PRODUCTION_URL: 'my-app.vercel.app' } });
    assert.equal((await valid.request()).statusCode, 200);
    assert.equal(valid.calls.portal[0].return_url, 'https://my-app.vercel.app/dashboard.html');
    for (const APP_URL of ['', 'http://public.example', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?next=evil']) {
        const { request, calls } = await setup('create-checkout-session', { env: { APP_URL } });
        assert.equal((await request()).statusCode, 500);
        assert.equal(calls.checkout.length + calls.customers.length, 0);
    }
});

async function browser(auth, fetch) {
    const context = vm.createContext({ window: {}, Auth: auth, fetch });
    vm.runInContext(await readFile(new URL('../assets/js/billing.js', import.meta.url), 'utf8'), context);
    return context.window.Billing;
}

test('navegador: busca token atual a cada ação e não envia userId/e-mail', async () => {
    let token = 'token_a';
    const calls = [];
    const billing = await browser({ getSession: async () => ({ access_token: token }) }, async (url, options) => {
        calls.push({ url, ...options });
        return { ok: true, status: 200, json: async () => ({ url: 'https://billing.stripe.com/test' }) };
    });
    await billing.createCheckout('salao');
    token = 'token_b';
    await billing.createPortal();
    assert.equal(calls[0].headers.Authorization, 'Bearer token_a');
    assert.equal(calls[1].headers.Authorization, 'Bearer token_b');
    assert.equal(calls[0].url, '/api/create-checkout-session');
    assert.equal(calls[1].url, '/api/create-portal-session');
    assert.deepEqual(JSON.parse(calls[0].body), { plan: 'salao' });
    assert.deepEqual(JSON.parse(calls[1].body), {});
});

test('navegador: sessão ausente bloqueia requisição; 401 informa novo login', async () => {
    const missing = await browser({ getSession: async () => null }, () => { assert.fail('Não deve enviar requisição'); });
    await assert.rejects(missing.createPortal(), /sessão expirou/);
    const expired = await browser({ getSession: async () => ({ access_token: 'expired' }) }, async () => ({ status: 401, ok: false, json: async () => ({}) }));
    await assert.rejects(expired.createCheckout('salao'), /sessão expirou/);
});

test('navegador: não aceita URL em resposta de erro ou resposta inválida', async () => {
    for (const response of [
        { ok: false, status: 403, json: async () => ({ error: 'Acesso negado', url: 'https://example.com' }) },
        { ok: false, status: 502, json: async () => { throw new Error('HTML'); } },
        { ok: true, status: 200, json: async () => ({}) }
    ]) {
        const billing = await browser({ getSession: async () => ({ access_token: 'token_a' }) }, async () => response);
        await assert.rejects(billing.createPortal());
    }
});
