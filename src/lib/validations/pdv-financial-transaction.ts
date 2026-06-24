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
});

export type PDVFinancialTransactionFormData = z.infer<typeof pdvFinancialTransactionSchema>;
