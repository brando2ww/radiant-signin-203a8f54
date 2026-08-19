import { XMLParser } from 'fast-xml-parser';

export interface ParsedInvoice {
  invoiceKey: string;
  invoiceNumber: string;
  series: string;
  emissionDate: Date;
  operationType: 'entrada' | 'saida';
  supplier: {
    cnpj: string;
    name: string;
    companyName?: string;
    stateRegistration?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  totals: {
    products: number;
    tax: number;
    invoice: number;
    freight?: number;
    insurance?: number;
    otherExpenses?: number;
    discount?: number;
  };
  items: ParsedInvoiceItem[];
  /** Cobrança declarada na própria nota. Ausente quando o emitente não informou. */
  payment?: ParsedInvoicePayment;
}

export interface ParsedInvoiceDuplicata {
  /** Número da parcela como veio na nota ("001", "1/3"). */
  numero: string;
  vencimento: Date;
  valor: number;
}

export interface ParsedInvoicePayment {
  /** Duplicatas do grupo <cobr>: é o carnê que o fornecedor mandou. */
  duplicatas: ParsedInvoiceDuplicata[];
  /** Forma de pagamento do grupo <pag>, já traduzida para o vocabulário do PDV. */
  formaPagamento?: string;
  /** Fatura, quando informada. */
  fatura?: { numero?: string; valorOriginal?: number; valorLiquido?: number };
}

export interface ParsedInvoiceItem {
  itemNumber: number;
  productCode?: string;
  productEan?: string;
  productName: string;
  ncm?: string;
  cfop?: string;
  unit: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  discountValue?: number;
  freightValue?: number;
  insuranceValue?: number;
  otherExpenses?: number;
  taxes: {
    icms?: number;
    ipi?: number;
    pis?: number;
    cofins?: number;
  };
}

export async function parseNFeXML(xmlContent: string): Promise<ParsedInvoice> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
  });

  const result = parser.parse(xmlContent);
  
  // Navigate through the NFe structure
  const nfe = result.nfeProc?.NFe || result.NFe;
  if (!nfe) {
    throw new Error('XML inválido: estrutura de NFe não encontrada');
  }

  const infNFe = nfe.infNFe;
  if (!infNFe) {
    throw new Error('XML inválido: informações da NFe não encontradas');
  }

  const ide = infNFe.ide;
  const emit = infNFe.emit;
  const dest = infNFe.dest;
  const total = infNFe.total;
  const det = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det];

  // Determine operation type based on tNF (0 = entrada, 1 = saida)
  const operationType = ide.tNF === '1' ? 'saida' : 'entrada';

  // Extract invoice key
  const invoiceKey = infNFe['@_Id']?.replace('NFe', '') || '';

  // Parse supplier (emitente for entrada, destinatário for saida)
  const supplierData = operationType === 'entrada' ? emit : dest;
  const supplier = {
    cnpj: supplierData.CNPJ || supplierData.CPF || '',
    name: supplierData.xNome || supplierData.xFant || '',
    companyName: supplierData.xFant || '',
    stateRegistration: supplierData.IE || '',
    phone: supplierData.enderEmit?.fone || supplierData.enderDest?.fone || '',
    email: supplierData.email || '',
    address: supplierData.enderEmit?.xLgr || supplierData.enderDest?.xLgr || '',
    city: supplierData.enderEmit?.xMun || supplierData.enderDest?.xMun || '',
    state: supplierData.enderEmit?.UF || supplierData.enderDest?.UF || '',
    zipCode: supplierData.enderEmit?.CEP || supplierData.enderDest?.CEP || '',
  };

  // Parse totals
  const ICMSTot = total.ICMSTot;
  const totals = {
    products: parseFloat(ICMSTot.vProd || '0'),
    tax: parseFloat(ICMSTot.vTotTrib || '0'),
    invoice: parseFloat(ICMSTot.vNF || '0'),
    freight: parseFloat(ICMSTot.vFrete || '0'),
    insurance: parseFloat(ICMSTot.vSeg || '0'),
    otherExpenses: parseFloat(ICMSTot.vOutro || '0'),
    discount: parseFloat(ICMSTot.vDesc || '0'),
  };

  // Parse items
  const items: ParsedInvoiceItem[] = det.map((item: any, index: number) => {
    const prod = item.prod;
    const imposto = item.imposto;

    return {
      itemNumber: index + 1,
      productCode: prod.cProd || '',
      productEan: prod.cEAN || prod.cEANTrib || '',
      productName: prod.xProd || '',
      ncm: prod.NCM || '',
      cfop: prod.CFOP || '',
      unit: prod.uCom || '',
      quantity: parseFloat(prod.qCom || '0'),
      unitValue: parseFloat(prod.vUnCom || '0'),
      totalValue: parseFloat(prod.vProd || '0'),
      discountValue: parseFloat(prod.vDesc || '0'),
      freightValue: parseFloat(prod.vFrete || '0'),
      insuranceValue: parseFloat(prod.vSeg || '0'),
      otherExpenses: parseFloat(prod.vOutro || '0'),
      taxes: {
        icms: parseFloat(imposto.ICMS?.ICMS00?.vICMS || imposto.ICMS?.ICMS10?.vICMS || '0'),
        ipi: parseFloat(imposto.IPI?.IPITrib?.vIPI || '0'),
        pis: parseFloat(imposto.PIS?.PISAliq?.vPIS || '0'),
        cofins: parseFloat(imposto.COFINS?.COFINSAliq?.vCOFINS || '0'),
      },
    };
  });

  // Parse cobrança (<cobr>) e forma de pagamento (<pag>)
  //
  // É aqui que está o carnê do fornecedor: cada <dup> traz vencimento e valor
  // da parcela. Sem ler isso, a importação obriga a redigitar à mão datas que
  // já vieram na nota — e qualquer divergência vira boleto pago na data errada.
  const payment = parsePayment(infNFe);

  return {
    invoiceKey,
    invoiceNumber: ide.nNF || '',
    series: ide.serie || '',
    emissionDate: parseNFeDate(ide.dhEmi || ide.dEmi),
    operationType,
    supplier,
    totals,
    items,
    payment,
  };
}

/** Códigos de tPag da NF-e traduzidos para as formas que o PDV conhece. */
const TPAG: Record<string, string> = {
  '01': 'dinheiro',
  '02': 'cheque',
  '03': 'credito',
  '04': 'debito',
  '05': 'credito',       // crédito loja
  '10': 'dinheiro',      // vale alimentação
  '11': 'dinheiro',      // vale refeição
  '15': 'boleto',        // boleto bancário
  '16': 'boleto',        // depósito bancário
  '17': 'pix',
  '18': 'transferencia',
  '19': 'pix',
  '90': 'transferencia', // sem pagamento
};

function parsePayment(infNFe: any): ParsedInvoicePayment | undefined {
  const cobr = infNFe?.cobr;
  const pag = infNFe?.pag;

  // Um único <dup> não vira array no parser de XML; normalizar antes de mapear.
  const brutas = cobr?.dup ? (Array.isArray(cobr.dup) ? cobr.dup : [cobr.dup]) : [];
  const duplicatas: ParsedInvoiceDuplicata[] = brutas
    .map((d: any, i: number) => ({
      numero: String(d?.nDup ?? i + 1),
      vencimento: parseNFeDate(d?.dVenc),
      valor: parseFloat(d?.vDup || '0'),
    }))
    .filter((d) => d.valor > 0 && !Number.isNaN(d.vencimento.getTime()))
    .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime());

  const detPag = pag?.detPag ? (Array.isArray(pag.detPag) ? pag.detPag : [pag.detPag]) : [];
  // Com mais de uma forma, vale a de maior valor: é a que representa a nota.
  const principal = detPag
    .slice()
    .sort((a: any, b: any) => parseFloat(b?.vPag || '0') - parseFloat(a?.vPag || '0'))[0];
  const formaPagamento = principal?.tPag ? TPAG[String(principal.tPag)] : undefined;

  if (duplicatas.length === 0 && !formaPagamento) return undefined;

  const fat = cobr?.fat;
  return {
    duplicatas,
    formaPagamento,
    fatura: fat
      ? {
          numero: fat.nFat || undefined,
          valorOriginal: fat.vOrig ? parseFloat(fat.vOrig) : undefined,
          valorLiquido: fat.vLiq ? parseFloat(fat.vLiq) : undefined,
        }
      : undefined,
  };
}

function parseNFeDate(dateStr: string): Date {
  // NFe dates can be in format: 2024-01-15T10:30:00-03:00 or 2024-01-15
  try {
    return new Date(dateStr);
  } catch {
    throw new Error(`Data inválida no XML: ${dateStr}`);
  }
}

export function validateNFeKey(key: string): boolean {
  // NFe key has 44 digits
  return /^\d{44}$/.test(key);
}
