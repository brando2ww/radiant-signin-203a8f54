import { ParsedInvoice, ParsedInvoiceItem } from "@/lib/invoice/xml-parser";

export interface EditableSupplierData {
  name: string;
  company_name?: string;
  cnpj?: string;
  state_registration?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

export interface EditableFinancialData {
  description: string;
  amount: number;
  due_date: Date;
  payment_date?: Date | null;
  payment_method?: string;
  status: 'pending' | 'paid';
  cost_center_id?: string;
  chart_account_id?: string;
  bank_account_id?: string;
  installments: number;
  notes?: string;
  /**
   * Duplicatas como vieram no XML (grupo <cobr>).
   *
   * Quando existem, mandam: cada parcela nasce com o vencimento e o valor que o
   * fornecedor declarou, e não com meses igualmente espaçados. Carnê real
   * raramente é regular — 21/28/35 dias é comum — e errar isso significa boleto
   * pago fora da data.
   */
  duplicatas?: Array<{ numero: string; vencimento: Date; valor: number }>;
}

export type LinkActionType = 'link' | 'create' | 'none';

export interface NewIngredientData {
  name: string;
  code?: string;
  ean?: string;
  category_id?: string;
  unit: string;
  min_stock: number;
  unit_cost: number;
}

export interface EditableInvoiceItem extends ParsedInvoiceItem {
  linkAction: {
    type: LinkActionType;
    ingredientId?: string;
    newIngredientData?: NewIngredientData;
  };
  /** Auto-suggested ingredient ids ranked from best to worst (top 3) */
  suggestedIngredientIds?: string[];
  /** Whether the link was set automatically by the matching engine */
  autoMatched?: boolean;
}

export interface EditableInvoiceData {
  // Dados da nota
  invoiceKey: string;
  invoiceNumber: string;
  series: string;
  emissionDate: Date;
  entryDate: Date;
  operationType: 'entrada' | 'saida';
  
  // Totais editáveis
  totals: {
    products: number;
    tax: number;
    invoice: number;
    freight: number;
    insurance: number;
    otherExpenses: number;
    discount: number;
  };
  
  // Fornecedor
  supplier: {
    mode: 'existing' | 'new';
    existingId?: string;
    newData?: EditableSupplierData;
  };
  
  // Financeiro
  financial: EditableFinancialData;
  
  // Itens
  items: EditableInvoiceItem[];
  
  // Observações gerais
  notes?: string;
}

export function parseInvoiceToEditable(invoice: ParsedInvoice): EditableInvoiceData {
  return {
    invoiceKey: invoice.invoiceKey,
    invoiceNumber: invoice.invoiceNumber,
    series: invoice.series,
    emissionDate: invoice.emissionDate,
    entryDate: new Date(),
    operationType: invoice.operationType,
    totals: {
      products: invoice.totals.products,
      tax: invoice.totals.tax,
      invoice: invoice.totals.invoice,
      freight: invoice.totals.freight || 0,
      insurance: invoice.totals.insurance || 0,
      otherExpenses: invoice.totals.otherExpenses || 0,
      discount: invoice.totals.discount || 0,
    },
    supplier: {
      mode: 'new',
      newData: {
        name: invoice.supplier.name,
        company_name: invoice.supplier.companyName,
        cnpj: invoice.supplier.cnpj,
        state_registration: invoice.supplier.stateRegistration,
        phone: invoice.supplier.phone,
        email: invoice.supplier.email,
        address: invoice.supplier.address,
        city: invoice.supplier.city,
        state: invoice.supplier.state,
        zip_code: invoice.supplier.zipCode,
      },
    },
    financial: (() => {
      const dups = invoice.payment?.duplicatas ?? [];
      return {
        description: `NF-e ${invoice.invoiceNumber} - ${invoice.supplier.name}`,
        amount: invoice.totals.invoice,
        // Vencimento da primeira duplicata; sem cobrança na nota, cai na emissão.
        due_date: dups[0]?.vencimento ?? invoice.emissionDate,
        payment_method: invoice.payment?.formaPagamento,
        status: 'pending' as const,
        installments: dups.length > 0 ? dups.length : 1,
        duplicatas: dups.length > 0 ? dups : undefined,
      };
    })(),
    items: invoice.items.map(item => ({
      ...item,
      linkAction: {
        type: 'none' as LinkActionType,
      },
    })),
  };
}
