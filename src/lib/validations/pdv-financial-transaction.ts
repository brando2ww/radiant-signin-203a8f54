import { z } from 'zod';

export const pdvFinancialTransactionSchema = z.object({
  transaction_type: z.enum(['payable', 'receivable'], {
    required_error: 'Selecione o tipo de transação',
  }),
  description: z.string()
    .min(3, 'Descrição deve ter no mínimo 3 caracteres')
    .max(200, 'Descrição muito longa'),
  amount: z.coerce.number()
    .positive('Valor deve ser positivo')
    .max(10000000, 'Valor muito alto'),
  due_date: z.date({
    required_error: 'Selecione a data de vencimento',
  }),
  competence_date: z.date().optional().nullable(),
  payment_date: z.date().optional().nullable(),
  status: z.enum(['pending', 'paid', 'cancelled', 'overdue']).default('pending'),
  chart_account_id: z.string().optional().nullable(),
  cost_center_id: z.string().optional().nullable(),
  bank_account_id: z.string().optional().nullable(),
  supplier_id: z.string().optional().nullable(),
  customer_id: z.string().optional().nullable(),
  payment_method: z.string().optional().nullable(),
  document_number: z.string().optional().nullable(),
  notes: z.string().max(500, 'Observações muito longas').optional().nullable(),

  // Repetição. Parcelamento e recorrência são coisas diferentes: parcelar
  // divide um valor conhecido em N vencimentos; repetir lança o mesmo valor
  // indefinidamente. Misturar os dois num campo só é o que confunde na hora do
  // lançamento.
  repeat_mode: z.enum(['single', 'installments', 'recurring']).default('single'),
  installment_total: z.coerce.number().int().min(2).max(120).optional().nullable(),
  /** O valor digitado é o total a parcelar, ou o valor de cada parcela? */
  installment_amount_is_total: z.boolean().default(true),
  recurrence: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).default('monthly'),
  recurrence_until: z.date().optional().nullable(),
})
.refine(
  (d) => d.repeat_mode !== 'installments' || (d.installment_total ?? 0) >= 2,
  { message: 'Informe ao menos 2 parcelas', path: ['installment_total'] },
);

export type PDVFinancialTransactionFormData = z.infer<typeof pdvFinancialTransactionSchema>;
