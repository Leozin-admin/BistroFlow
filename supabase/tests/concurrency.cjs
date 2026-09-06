// Banco LOCAL descartável configurado pelo runner. Sem acesso ao Supabase real.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const assert = require('node:assert/strict');
const exec = promisify(execFile);
const psql = process.env.BF_TEST_PSQL || 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
const uid = '10000000-0000-0000-0000-000000000011';
const prefix = `set role authenticated; set request.jwt.claim.sub = '${uid}'; `;
async function sql(query) {
  const { stdout } = await exec(psql, ['-X', '-qAt', '-h', '127.0.0.1', '-p', process.env.BF_TEST_PORT || '55439',
    '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', query]);
  return stdout.trim();
}
async function main() {
  await sql(`insert into auth.users(id,email) values ('${uid}','concurrency@example.invalid');
    insert into inventory(id,user_id,name,unit,qty,cost) values ('20000000-0000-0000-0000-000000000011','${uid}','Teste paralelo','kg',1,10);
    insert into menu_items(id,user_id,name,price) values ('30000000-0000-0000-0000-000000000011','${uid}','Prato paralelo',30);`);
  await sql(prefix + `select set_recipe('30000000-0000-0000-0000-000000000011',
    '[{"inventory_id":"20000000-0000-0000-0000-000000000011","qty_used":0.125}]');`);
  const makeOrder = () => sql(prefix + `select (create_order('{}','[{"menu_item_id":"30000000-0000-0000-0000-000000000011","quantity":2}]')).id;`);
  const id = await makeOrder();
  await Promise.all(Array.from({ length: 8 }, () => sql(prefix + `select set_order_status('${id}','entregue');`)));
  assert.equal(await sql(`select qty from inventory where id='20000000-0000-0000-0000-000000000011'`), '0.750');
  assert.equal(await sql(`select count(*) from stock_movements where order_id='${id}'`), '1');
  const ids = await Promise.all(Array.from({ length: 5 }, makeOrder));
  await Promise.all(ids.map(id => sql(prefix + `select set_order_status('${id}','entregue');`)));
  assert.equal(await sql(`select qty from inventory where id='20000000-0000-0000-0000-000000000011'`), '-0.500');
  assert.equal(await sql(`select sum(cost_total) from orders where user_id='${uid}'`), '15.00');
  console.log('PASS: 8 entregas simultâneas do mesmo pedido; 5 pedidos simultâneos sem perda de baixa.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
