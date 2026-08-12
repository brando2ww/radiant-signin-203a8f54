/**
 * Nota/cupom lançado à mão.
 *
 * O assistente de importação (InvoiceReviewWizard) já faz tudo o que um
 * lançamento manual precisa: escolhe ou cadastra o fornecedor, lança o
 * financeiro, grava a nota e os itens, vincula cada item a um insumo, atualiza
 * custo médio e estoque e ainda aprende o vínculo para a próxima importação.
 * O que faltava era uma porta de entrada sem arquivo — é o que estas funções
 * dão: uma nota vazia com a forma que o assistente espera.
 */
import type { ParsedInvoice, ParsedInvoiceItem } from "./xml-parser";
import type { EditableInvoiceItem } from "@/types/invoice";

export function blankInvoiceItem(itemNumber: number): ParsedInvoiceItem {
  return {
    itemNumber,
    productCode: "",
    productEan: "",
    productName: "",
    ncm: "",
    cfop: "",
    unit: "un",
    quantity: 1,
    unitValue: 0,
    totalValue: 0,
    discountValue: 0,
    freightValue: 0,
    insuranceValue: 0,
    otherExpenses: 0,
    taxes: { icms: 0, ipi: 0, pis: 0, cofins: 0 },
  };
}

/** Item vazio já no formato do passo de produtos, sem vínculo definido. */
export function blankEditableItem(itemNumber: number): EditableInvoiceItem {
  return {
    ...blankInvoiceItem(itemNumber),
    linkAction: { type: "none" },
  };
}

/**
 * Nota em branco. Sem chave de acesso de propósito: cupom fiscal lançado na
 * mão normalmente não tem, e o campo fica editável para quem quiser digitar.
 */
export function blankInvoice(): ParsedInvoice {
  return {
    invoiceKey: "",
    invoiceNumber: "",
    series: "",
    emissionDate: new Date(),
    operationType: "entrada",
    supplier: { cnpj: "", name: "" },
    totals: { products: 0, tax: 0, invoice: 0, freight: 0, insurance: 0, otherExpenses: 0, discount: 0 },
    items: [blankInvoiceItem(1)],
  };
}
