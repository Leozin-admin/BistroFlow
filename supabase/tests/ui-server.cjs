// Preview de integração LOCAL. Usa o Store e dashboard reais com um adaptador
// mínimo de Supabase conectado exclusivamente ao PostgreSQL descartável.
// Iniciar depois das migrations: node supabase/tests/ui-server.cjs
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../../BistroFlow');
const uid = '10000000-0000-0000-0000-000000000012';
const quote = v => "'" + String(v).replaceAll("'", "''") + "'";
const prefix = `set role authenticated; set request.jwt.claim.sub = '${uid}'; `;
async function sql(query, authenticated = true) {
  const stdout = await new Promise((resolve, reject) => {
    const child = spawn(process.env.BF_TEST_PSQL || 'C:/Program Files/PostgreSQL/18/bin/psql.exe',
    ['-X', '-qAt', '-h', '127.0.0.1', '-p', process.env.BF_TEST_PORT || '55439', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-f', '-'], { windowsHide: true, env: { ...process.env, PGCLIENTENCODING: 'UTF8' } });
    let out = '', error = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => code ? reject(new Error(error)) : resolve(out));
    child.stdin.end((authenticated ? prefix : '') + query, 'utf8');
  });
  return stdout.trim();
}
const user = { id: uid, email: 'ui-test@example.invalid', user_metadata: { name: 'Teste', restaurant: 'BistroFlow · Teste local' } };
const authScript = `window.Auth = {getSession:async()=>({user:${JSON.stringify(user)}}),onChange:()=>{},logout:async()=>{}};`;
const clientScript = `
const testRequest = async payload => { const r = await fetch('/test-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return r.json(); };
window.supabaseClient = {
  auth:{getUser:async()=>({data:{user:${JSON.stringify(user)}}})},
  rpc:(name,args)=>testRequest({rpc:name,args}),
  from:(table)=>{ const q={table,filters:[]}; const b={
    select:(columns,options)=>{q.columns=columns;q.count=options?.count;return b;},
    eq:(column,value)=>{q.filters.push({column,value,op:'='});return b;},
    gte:(column,value)=>{q.filters.push({column,value,op:'>='});return b;},
    order:(column,options)=>{q.sort={column,ascending:options?.ascending!==false};return b;},
    single:()=>{q.single=true;return b;},
    update:values=>{q.update=values;return b;},
    insert:values=>{q.insert=values;return b;},
    then:(resolve,reject)=>testRequest(q).then(resolve,reject)
  };return b;}
};`;
const tables = new Set(['menu_items', 'recipe_items', 'orders', 'order_items', 'inventory', 'customers', 'settings']);
const identifier = value => {
  if (!/^[a-z_]+$/.test(value)) throw new Error('Identificador inválido');
  return '"' + value + '"';
};
async function api(q) {
  if (q.rpc) {
    const args = {
      set_recipe: () => `${quote(q.args.p_menu_item_id)}::uuid,${quote(JSON.stringify(q.args.p_items))}::jsonb`,
      create_order: () => `${quote(JSON.stringify(q.args.p_order))}::jsonb,${quote(JSON.stringify(q.args.p_items))}::jsonb`,
      set_order_status: () => `${quote(q.args.p_order_id)}::uuid,${quote(q.args.p_status)}::text`
    };
    if (!args[q.rpc]) throw new Error('RPC não suportada');
    if (q.rpc === 'set_recipe') { await sql(`select public.set_recipe(${args[q.rpc]()});`); return { data: null, error: null }; }
    return { data: JSON.parse(await sql(`select to_jsonb(public.${q.rpc}(${args[q.rpc]()}));`)), error: null };
  }
  if (q.table === 'subscriptions') return { data: { plan: 'salao', status: 'active' }, error: null };
  if (!tables.has(q.table)) throw new Error('Tabela não suportada');
  const where = q.filters.length ? ' where ' + q.filters.map(f => `${identifier(f.column)} ${f.op === '>=' ? '>=' : '='} ${quote(f.value)}`).join(' and ') : '';
  let statement = `select * from public.${identifier(q.table)}${where}`;
  if (q.sort) statement += ` order by ${identifier(q.sort.column)} ${q.sort.ascending ? 'asc' : 'desc'}`;
  if (q.update) statement = `update public.${identifier(q.table)} set ` + Object.entries(q.update).map(([k,v]) => `${identifier(k)}=${v === null ? 'null' : quote(v)}`).join(',') + where + ' returning *';
  if (q.insert) statement = `insert into public.${identifier(q.table)} (${Object.keys(q.insert).map(identifier).join(',')}) values (${Object.values(q.insert).map(v=>v===null?'null':quote(v)).join(',')}) returning *`;
  const data = JSON.parse(await sql(`with result as (${statement}) select coalesce(json_agg(result),'[]') from result;`));
  return { data: q.single ? data[0] ?? null : data, error: null, count: data.length };
}
async function main() {
  await sql(`insert into auth.users(id,email) values ('${uid}','ui-test@example.invalid') on conflict do nothing;`, false);
  const baseline = await sql(`select count(*) from orders;`);
  if (baseline === '0') {
    await sql(`insert into inventory(user_id,name,unit,qty,min,cost) values
      ('${uid}','Farinha de trigo','kg',0.1,10,5.20),
      ('${uid}','Queijo mussarela','kg',8,5,32);
      insert into orders(user_id,customer,items,total,status) values
      ('${uid}','Entregue sem receita','Legado',10,'entregue'),
      ('${uid}','Em preparo','Legado',999,'preparando'),
      ('${uid}','Cancelado','Legado',888,'cancelado');
      insert into orders(user_id,customer,items,total,status,created_at) values
      ('${uid}','Ontem','Legado',20,'entregue',now()-interval '1 day');`);
  }
  http.createServer(async (req,res) => {
    try {
      if (req.method === 'POST' && req.url === '/test-api') {
        let body=''; for await (const chunk of req) { body+=chunk; if(body.length>100000) throw new Error('Pedido muito grande'); }
        res.setHeader('Content-Type','application/json');
        try { res.end(JSON.stringify(await api(JSON.parse(body)))); }
        catch(e) { res.end(JSON.stringify({data:null,error:{message:e.stderr||e.message}})); }
        return;
      }
      const url = new URL(req.url,'http://127.0.0.1');
      if (/^\/migration\/20260905000[1-4]_[a-z_]+\.sql$/.test(url.pathname)) {
        res.setHeader('Content-Type','text/plain; charset=utf-8');
        res.end(await fs.readFile(path.resolve(__dirname,'../migrations',path.basename(url.pathname))));
        return;
      }
      let content;
      if (url.pathname === '/assets/js/auth.js') content=authScript;
      else if (url.pathname === '/assets/js/supabaseClient.js') content=clientScript;
      else {
        const filename=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/dashboard.html':url.pathname));
        if(!filename.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
        content=await fs.readFile(filename);
        if(filename.endsWith('.html')) content=content.toString().replace(/<script src="https:[^"]+"><\/script>/g,'');
      }
      const extension=path.extname(url.pathname||'.html');
      res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[extension]||'text/html')+'; charset=utf-8');
      res.setHeader('Cache-Control','no-store');res.end(content);
    } catch(e) {res.writeHead(500);res.end(e.message);}
  }).listen(4173,'127.0.0.1',()=>console.log('Preview local: http://127.0.0.1:4173/dashboard.html'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
