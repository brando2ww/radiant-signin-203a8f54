import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "velara-reports-test-"));
const dbDir = join(dir, "db");
let pgStarted = false;
try {
  await build({
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import assert from 'node:assert/strict';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { buildLines, applyFilters, buildPriceVariation } from './src/lib/purchase-reports/aggregate';
      import { PriceVariationSection } from './src/components/pdv/purchases/reports/PriceVariationSection';
      import { cancellationDays } from './src/lib/reports/cancellation-days';
      import { receivedInvoiceState, focusReceivedAccessError } from './supabase/functions/_shared/focusnfe-received-state';
      import { mdeSyncErrorMessage } from './src/lib/nfe-mde-status';
      import { matchesPurchaseSearch } from './src/lib/purchase-reports/search';
      let checks = 0;
      function check(name, fn) { fn(); checks++; console.log('OK:', name); }
      const filters = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) };
      function raw(id, ingredient, price, date = '2026-10-19', unit = 'balde') {
        return { id, ingredient_id: ingredient, quantity: 2, quantity_received: 2, unit,
          unit_price: price, total_price: price*2, quotation_response_id: null,
          order: { id, order_number: id, status: 'received', supplier_id: 'supplier', order_date: date,
            actual_delivery: date, expected_delivery: date, freight: 0, closed_incomplete: false, closure_reason: null } };
      }
      const lines = buildLines([
        raw('old','oil',177.5,'2026-09-01'), raw('new','oil',177.5),
        raw('single','rice',32), raw('other-unit','oil',12,'2026-10-20','litro'),
      ], [{ id:'supplier', name:'Fornecedor', category:null }], [
        { id:'oil', name:'Óleo de algodão', unit:'balde', category:'Óleos' },
        { id:'rice', name:'Arroz', unit:'balde', category:'Grãos' },
      ], filters);
      const block = buildPriceVariation(lines, filters);
      check('busca o nome real do estoque sem acentos ou preposições extras', () => {
        assert(matchesPurchaseSearch('Oleo Algodão Balde 15l','óleo de algodão'));
        assert(matchesPurchaseSearch('Oleo Algodão','algodao oleo'));
        assert(!matchesPurchaseSearch('Arroz','óleo de algodão'));
      });
      check('insumo com preço estável existe mesmo sem entrar no ranking', () => {
        assert.equal(block.topIncreases.length,0); assert.equal(block.topDecreases.length,0);
        assert.equal(block.rows.find(r=>r.key==='oil|balde')?.last_price ?? block.rows.find(r=>r.ingredient_id==='oil'&&r.last_price===177.5)?.last_price,177.5);
      });
      check('insumo com uma compra continua consultável', () => assert.equal(block.rows.find(r=>r.ingredient_id==='rice').prev_price,null));
      check('filtro do estoque preserva histórico da compra anterior', () => {
        const filtered = applyFilters(lines,{...filters,ingredientIds:['oil']});
        assert.equal(filtered.length,3); assert(filtered.every(l=>l.ingredient_id==='oil'));
        assert(filtered.some(l=>!l.in_period));
      });
      check('unidades de compra diferentes não são comparadas como o mesmo preço', () => assert.equal(block.rows.filter(r=>r.ingredient_id==='oil').length,2));
      check('tela mostra preços estáveis e de compra única fora dos rankings', () => {
        const html=renderToStaticMarkup(<PriceVariationSection block={block} loading={false} getSeries={()=>null}/>);
        assert.match(html,/Óleo de algodão/); assert.match(html,/177,50/); assert.match(html,/Arroz/);
        assert.match(html,/Preço pago por insumo/);
      });
      check('cancelamentos geram evolução diária com valores reais no fuso brasileiro', () => {
        const days=cancellationDays([
          {cancelled_at:'2026-10-06T01:00:00Z',opened_at:null,total:23.5},
          {cancelled_at:null,opened_at:'2026-10-05T15:00:00Z',total:10},
          {cancelled_at:'2026-11-01T15:00:00Z',opened_at:null,total:999},
        ],new Date(2026,9,1),new Date(2026,9,31));
        assert.equal(days.length,31); assert.deepEqual(days.find(d=>d.day==='2026-10-05'),{day:'2026-10-05',count:2,value:33.5});
        assert.equal(days.reduce((s,d)=>s+d.value,0),33.5);
      });
      check('varredura propaga disponibilidade do XML completo', () => assert.deepEqual(receivedInvoiceState({nfe_completa:true,manifestacao_destinatario:'ciencia'}),{mde_status:'ciencia',mde_nfe_completa:true}));
      check('situação autorizada não substitui manifestação', () => assert.equal(receivedInvoiceState({situacao:'autorizada'}).mde_status,'pendente'));
      check('consulta incompleta não regride XML já disponível nem manifestação final', () => {
        assert.deepEqual(receivedInvoiceState({nfe_completa:false,manifestacao_destinatario:'ciencia'},{mde_status:'confirmado',mde_nfe_completa:true}),{mde_status:'confirmado',mde_nfe_completa:true});
      });
      check('normaliza manifestação recebida e preserva ciência quando resumo não informa status', () => {
        assert.equal(receivedInvoiceState({manifestacao_destinatario:'confirmacao'}).mde_status,'confirmado');
        assert.equal(receivedInvoiceState({}, {mde_status:'ciencia'}).mde_status,'ciencia');
      });
      check('bloqueio da Focus é informado como acesso recusado', () => {
        assert.match(focusReceivedAccessError(401),/recusou o acesso/); assert.match(focusReceivedAccessError(403),/recusou o acesso/);
        assert.equal(focusReceivedAccessError(200),null); assert.match(mdeSyncErrorMessage('401: Permissão negada no Gateway'),/recusando o acesso/);
      });
      async function testXml() {
        globalThis.Deno={serve(handler){globalThis.xmlHandler=handler;}};
        await import('./supabase/functions/focusnfe-nfe-xml/index.ts');
        const req=()=>new Request('https://test.invalid',{method:'POST',body:JSON.stringify({chave:'1'.repeat(44)})});
        globalThis.testInvoice={id:'invoice',mde_status:'ciencia'};
        globalThis.dbUpdates=[];
        let requests=0;
        globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({codigo:'permissao_negada'}),{status:401});};
        const denied=await globalThis.xmlHandler(req());
        check('download com 401 não emite ciência nem atribui atraso à SEFAZ',()=>{
          assert.equal(denied.status,502); assert.equal(requests,1); assert.equal(globalThis.dbUpdates.length,0);
        });
        globalThis.testInvoice={id:'invoice',mde_status:'pendente'};
        requests=0;
        globalThis.fetch=async()=>++requests===1 ? new Response('<resNFe/>') : new Response('{}',{status:403});
        const manifestDenied=await globalThis.xmlHandler(req());
        check('ciência recusada não é registrada como emitida',()=>{
          assert.equal(manifestDenied.status,502); assert.equal(requests,2); assert.equal(globalThis.dbUpdates.length,0);
        });
        globalThis.fetch=async()=>new Response('<nfeProc><NFe><infNFe><det/></infNFe></NFe></nfeProc>');
        const full=await globalThis.xmlHandler(req());
        const body=await full.json();
        check('download completo persiste disponibilidade antes de devolver XML',()=>{
          assert.equal(body.complete,true); assert(globalThis.dbUpdates.some(p=>p.mde_nfe_completa===true));
        });
        globalThis.testInvoice=null;
        globalThis.fetch=async()=>{throw Error('Não deveria consultar outra loja');};
        const missing=await globalThis.xmlHandler(req());
        check('download exige nota pertencente à loja autenticada',()=>assert.equal(missing.status,404));
        console.log(checks+' verificações aprovadas');
      }
      testXml().catch(error=>{console.error(error);process.exitCode=1;});
    ` },
    outfile: join(dir, "tests.cjs"), bundle: true, platform: "node", format: "cjs", jsx: "automatic", logLevel: "error",
    plugins: [{ name: "isolated-services", setup(builder) {
      builder.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, () => ({ path: "db", namespace: "test" }));
      builder.onResolve({ filter: /focusnfe-utils\.ts$/ }, () => ({ path: "focus-utils", namespace: "test" }));
      builder.onResolve({ filter: /^jsr:/ }, () => ({ path: "empty", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({ contents: path === "db" ? "export const supabase = {};" : path === "empty" ? "" : `
        export const corsHeaders={};
        export const authedOwner=async()=>({ownerId:'owner',userId:'owner'});
        export const getTenantToken=async()=>({token:'test',ambiente:'producao',config:{}});
        export const basicAuth=()=>'';
        export const focusBaseUrl=()=> 'https://focus.invalid';
        export const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
        export function getServiceClient(){return {from(){return {
          select(){return this;},eq(){return this;},maybeSingle:async()=>({data:globalThis.testInvoice,error:null}),
          update(patch){globalThis.dbUpdates.push(patch);return this;},
          then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject);}
        };}};}
      ` }));
    } }],
  });
  execFileSync(process.execPath, [join(dir, "tests.cjs")], { stdio: "inherit", env: { ...process.env, TZ: "America/Sao_Paulo" } });
  execFileSync("initdb", ["-D", dbDir, "--auth=trust", "--no-locale", "--encoding=UTF8"], { stdio: "pipe" });
  execFileSync("pg_ctl", ["-D", dbDir, "-l", join(dir,"postgres.log"), "-o", `-F -k '${dir}' -p 55439 -c listen_addresses=''`, "-w", "start"], { stdio: "pipe" });
  pgStarted = true;
  execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-f", "supabase/tests/mde_estado_documentos.sql"], {
    stdio: "inherit", env: { ...process.env, PGHOST: dir, PGPORT: "55439", PGDATABASE: "postgres", PGUSER: userInfo().username },
  });
} finally {
  if (pgStarted) execFileSync("pg_ctl", ["-D",dbDir,"-m","immediate","-w","stop"], { stdio: "pipe" });
  rmSync(dir, { recursive: true, force: true });
}
