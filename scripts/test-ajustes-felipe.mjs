import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
const dir=mkdtempSync(join(tmpdir(),"velara-ajustes-test-")); let started=false;
try {
  execFileSync("initdb",["-D",join(dir,"db"),"--auth=trust","--no-locale","--encoding=UTF8"],{stdio:"pipe"});
  execFileSync("pg_ctl",["-D",join(dir,"db"),"-l",join(dir,"pg.log"),"-o",`-F -k '${dir}' -p 55439 -c listen_addresses=''`,"-w","start"],{stdio:"pipe"});started=true;
  execFileSync("psql",["-X","-v","ON_ERROR_STOP=1","-f","supabase/tests/ajustes_felipe_20261029.sql"],{stdio:"inherit",env:{...process.env,PGHOST:dir,PGPORT:"55439",PGDATABASE:"postgres",PGUSER:userInfo().username}});
  const target=join(dir,"ui.cjs");
  await build({stdin:{resolveDir:process.cwd(),loader:"ts",contents:`
    import assert from 'node:assert/strict';
    import {groupChargeItems} from './src/lib/group-charge-items';
    import {ifoodReceiptContact} from './src/lib/ifood-receipt';
    import {buildClosedComandaReceipt} from './src/lib/print-comanda-history';
    import {focusValidationMessage,canReuseFocusCertificate} from './supabase/functions/_shared/focusnfe-validation';
    const a={id:'a',product_id:'p',product_name:'Coca',unit_price:6.89,quantity:1,subtotal:6.89,notes:null};
    const b={...a,id:'b',quantity:2,subtotal:13.78};
    assert.deepEqual(groupChargeItems([a,b]).map(g=>[g.quantity,g.subtotal,g.members.length]),[[3,20.67,2]]);
    assert.equal(a.quantity,1);assert.equal(groupChargeItems([a,{...b,unit_price:7}]).length,2);
    assert.equal(groupChargeItems([a,{...b,notes:'Sem gelo'}]).length,2);
    const child={id:'child',product_id:'x',product_name:'Arroz',quantity:1,unit_price:0,subtotal:0,parent_item_id:'a'};
    assert.equal(groupChargeItems([a,b,child]).length,3);
    const contact=ifoodReceiptContact({source:'ifood',external_code:'7184',external_payload:{customer:{phone:{localizer:'84211544'}}}});
    assert.equal(contact.localizer,'84211544');assert.equal(contact.orderCode,'7184');
    assert.equal(ifoodReceiptContact({source:'own'}),null);
    const detail={business:{name:'Loja <script>alert(1)</script>'},comanda:{numero:'001',cliente:'Ana',consumo:100,fechada_em:'2026-10-28T01:00:00Z'},atendimento:{numero:'P001',mesa:'06',desconto:0,taxa_servico:0,taxa_servico_paga:0},itens:[{id:'i',produto:'Peixe',quantidade:1,preco_unitario:100,subtotal:100,complemento:false}],pagamentos_atendimento:[{id:'p',valor:155,forma:'pix'}],movimentos_comanda:[{id:'m',valor:100,forma:'pix'}],cashback_usado:0};
    const html=buildClosedComandaReceipt(detail);assert.ok(html.includes('155,00'));assert.ok(!html.includes('255,00'));
    assert.ok(html.includes('27/10/2026'));assert.ok(html.includes('MESA 06'));assert.ok(html.includes('REIMPRESSÃO'));assert.ok(!html.includes('<script>'));
    const missing=buildClosedComandaReceipt({...detail,pagamentos_atendimento:[],movimentos_comanda:[]});assert.ok(missing.includes('sem vínculo'));assert.ok(!missing.includes('TOTAL DOS PAGAMENTOS'));
    assert.equal(focusValidationMessage({mensagem:'Erro de validação',erros:[{campo:'arquivo_certificado_base64',mensagem:'Confira a senha'}]},400),'arquivo_certificado_base64: Confira a senha');
    assert.ok(canReuseFocusCertificate({cnpj:'12.345.678/0001-99',certificado_valido_ate:'2027-01-01'},'12345678000199',Date.parse('2026-10-29')));
    assert.ok(!canReuseFocusCertificate({cnpj:'111',certificado_valido_ate:'2027-01-01'},'222',Date.parse('2026-10-29')));
    assert.ok(!canReuseFocusCertificate({cnpj:'111',certificado_valido_ate:'2025-01-01'},'111',Date.parse('2026-10-29')));
    console.log('OK: agrupamento preserva valores, preço e observações; localizador correto; reimpressão sem cobrança duplicada; certificado exige CNPJ e validade.');
  `},outfile:target,bundle:true,platform:"node",format:"cjs",logLevel:"error"});
  execFileSync(process.execPath,[target],{stdio:"inherit"});
} finally {if(started)execFileSync("pg_ctl",["-D",join(dir,"db"),"-m","immediate","-w","stop"],{stdio:"pipe"});rmSync(dir,{recursive:true,force:true});}
