import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const dir = mkdtempSync(join(tmpdir(), "velara-consumo-test-"));
let started = false;
try {
  const db = join(dir, "db");
  execFileSync("initdb", ["-D", db, "--auth=trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", db, "-l", join(dir, "postgres.log"), "-o", `-F -k '${dir}' -p 55438 -c listen_addresses=''`, "-w", "start"], { stdio: "pipe" });
  started = true;
  execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-f", "supabase/tests/clientes_consumo_config_cashback.sql"], {
    stdio: "inherit", env: { ...process.env, PGHOST: dir, PGPORT: "55438", PGDATABASE: "postgres", PGUSER: userInfo().username },
  });
  const test = join(dir, "ui.cjs");
  await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import assert from 'node:assert/strict';
      import { billableComandas } from './src/lib/cashier-queue';
      import { customerActivity, matchesCustomerActivity, whatsappCustomerUrl, brazilDate } from './src/lib/customer-consumption';
      import { CustomerCard } from './src/components/pdv/CustomerCard';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { MemoryRouter } from 'react-router-dom';
      const comandas = ['aberta','aberta','aberta','fechada','cancelada','em_cobranca','aguardando_pagamento','aberta'].map((status,index)=>({id:String(index),status}));
      const items = [
        {comanda_id:'0',quantity:1,sent_to_kitchen_at:null},
        {comanda_id:'2',quantity:1,parent_item_id:'parent'},
        {comanda_id:'3',quantity:1}, {comanda_id:'4',quantity:1},
        {comanda_id:'7',quantity:0}
      ];
      assert.deepEqual(billableComandas(comandas,items).map(c=>c.id), ['0','5','6']);
      console.log('OK: pedido salvo sem envio à cozinha aparece; vazias, filhos, quantidades zeradas e contas encerradas não entram.');
      const consumptions = [
        {telefone:'54999990001',canal:'pdv',referencia:'c1',numero:'01',data_consumo:'2026-10-10T01:00:00Z',valor:100,status:'fechada'},
        {telefone:'54999990001',canal:'delivery',referencia:'d1',numero:'D1',data_consumo:'2026-10-20T20:00:00Z',valor:75,status:'completed'},
        {telefone:'54999990001',canal:'pdv',referencia:'c2',numero:'02',data_consumo:'2026-10-21T20:00:00Z',valor:50,status:'fechada'}
      ];
      const credits = [
        {id:'cr1',telefone:'54999990001',valor:10,restante:10,vence_em:'2099-01-10',criado_em:'2026-10-09T20:00:00Z'},
        {id:'cr2',telefone:'54999990001',valor:5,restante:5,vence_em:'2099-02-10',criado_em:'2026-10-21T20:00:00Z'},
        {id:'cr3',telefone:'54999990001',valor:3,restante:3,vence_em:'2026-01-10',criado_em:'2025-12-10T20:00:00Z'}
      ];
      const customer = {...customerActivity(['pdv','delivery'],consumptions,credits),cashback_balance:15,id:'customer',source:'pdv',name:'Cliente teste',phone:'+55 (54) 99999-0001',email:null,last_visit:'2026-10-21T20:00:00Z'};
      assert.equal(customer.salon_spent,150); assert.equal(customer.delivery_spent,75);
      assert.equal(customer.salon_visits,2); assert.equal(customer.delivery_visits,1);
      assert.equal(customer.consumptions[0].referencia,'c2');
      assert.equal(brazilDate('2026-10-10T01:00:00Z'),'2026-10-09');
      const empty = {source:'all',consumedFrom:'',consumedTo:'',expiresFrom:'',expiresTo:'',cashbackOnly:false};
      assert.equal(matchesCustomerActivity(customer,{...empty,source:'pdv',consumedFrom:'2026-10-09',consumedTo:'2026-10-09'}),true);
      assert.equal(matchesCustomerActivity(customer,{...empty,source:'delivery',consumedFrom:'2026-10-09',consumedTo:'2026-10-09'}),false);
      assert.equal(matchesCustomerActivity(customer,{...empty,expiresFrom:'2099-02-01',expiresTo:'2099-02-28'}),true);
      assert.equal(matchesCustomerActivity(customer,{...empty,expiresFrom:'2026-01-01',expiresTo:'2026-01-31'}),true);
      assert.equal(matchesCustomerActivity(customer,{...empty,expiresFrom:'2099-02-28',expiresTo:'2099-02-01'}),false);
      assert.equal(matchesCustomerActivity({...customer,cashback_balance:0},{...empty,cashbackOnly:true}),false);
      assert.equal(whatsappCustomerUrl(customer.phone),'https://wa.me/5554999990001');
      assert.equal(whatsappCustomerUrl('1234'),null);
      const html = renderToStaticMarkup(<MemoryRouter><CustomerCard customer={customer} onEdit={()=>{}} onDelete={()=>{}} /></MemoryRouter>);
      assert.ok(html.includes('href="https://wa.me/5554999990001"'));
      assert.match(html,/Salão/); assert.match(html,/Delivery/); assert.match(html,/150,00/); assert.match(html,/75,00/); assert.match(html,/Cashback ativo:/); assert.ok(html.includes('10/01/2099'));
      console.log('OK: totais por canal, datas no Brasil, visita anterior, filtros combinados e vários vencimentos, créditos vencidos e atalho WhatsApp.');
    ` },
    outfile: test, bundle: true, platform: "node", format: "cjs", jsx: "automatic", logLevel: "error",
  });
  execFileSync(process.execPath, [test], { stdio: "inherit" });
} finally {
  if (started) execFileSync("pg_ctl", ["-D", join(dir, "db"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(dir, { recursive: true, force: true });
}
