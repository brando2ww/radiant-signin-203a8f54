import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  category: string;
  description: string | null;
  transaction_date: string;
}

interface BankAccount {
  id: string;
  name: string;
  bank_name: string | null;
  current_balance: number | null;
  account_type: string | null;
}

interface CreditCard {
  id: string;
  name: string;
  brand: string | null;
  credit_limit: number | null;
  current_balance: number | null;
  due_day: number | null;
  closing_day: number | null;
}

interface Bill {
  id: string;
  title: string;
  amount: number;
  due_date: string;
  status: string | null;
  type: string;
}

// Export transactions to CSV
export function exportTransactionsToCSV(transactions: Transaction[]): void {
  const headers = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor'];
  
  const rows = transactions.map(t => [
    format(new Date(t.transaction_date), 'dd/MM/yyyy'),
    t.type === 'income' ? 'Receita' : 'Despesa',
    t.category || '',
    t.description || '',
    formatCurrency(t.amount),
  ]);

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
  ].join('\n');

  downloadFile(csvContent, `transacoes_${format(new Date(), 'yyyy-MM-dd')}.csv`, 'text/csv;charset=utf-8;');
}

// Export transactions to Excel
export function exportTransactionsToExcel(transactions: Transaction[]): void {
  // Create workbook
  const wb = XLSX.utils.book_new();

  // Transactions sheet
  const transactionsData = transactions.map(t => ({
    'Data': format(new Date(t.transaction_date), 'dd/MM/yyyy'),
    'Tipo': t.type === 'income' ? 'Receita' : 'Despesa',
    'Categoria': t.category || '',
    'Descrição': t.description || '',
    'Valor': t.amount,
  }));
  const wsTransactions = XLSX.utils.json_to_sheet(transactionsData);
  XLSX.utils.book_append_sheet(wb, wsTransactions, 'Transações');

  // Summary sheet
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const summaryData = [
    { 'Resumo': 'Total de Receitas', 'Valor': totalIncome },
    { 'Resumo': 'Total de Despesas', 'Valor': totalExpense },
    { 'Resumo': 'Saldo', 'Valor': totalIncome - totalExpense },
    { 'Resumo': 'Quantidade de Transações', 'Valor': transactions.length },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');

  // Categories sheet
  const categoryMap = new Map<string, { income: number; expense: number }>();
  transactions.forEach(t => {
    const cat = t.category || 'Sem categoria';
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { income: 0, expense: 0 });
    }
    const data = categoryMap.get(cat)!;
    if (t.type === 'income') {
      data.income += t.amount;
    } else {
      data.expense += t.amount;
    }
  });

  const categoriesData = Array.from(categoryMap.entries()).map(([cat, data]) => ({
    'Categoria': cat,
    'Receitas': data.income,
    'Despesas': data.expense,
    'Saldo': data.income - data.expense,
  }));
  const wsCategories = XLSX.utils.json_to_sheet(categoriesData);
  XLSX.utils.book_append_sheet(wb, wsCategories, 'Por Categoria');

  // Download
  XLSX.writeFile(wb, `transacoes_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

// Export full backup as JSON
export async function exportFullBackup(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  // Defense-in-depth: resolve owner do estabelecimento (caso usuário seja membro/staff)
  // mesmo que a RLS regrida, o filtro explícito mantém o isolamento por tenant.
  let ownerId = user.id;
  try {
    const { data: resolved } = await supabase.rpc('pdv_resolve_owner', { _user_id: user.id });
    if (resolved) ownerId = resolved as string;
  } catch {
    // mantém ownerId = user.id como fallback
  }

  // Fetch all user data in parallel
  const [
    transactionsRes,
    bankAccountsRes,
    creditCardsRes,
    billsRes,
    settingsRes,
    goalsRes,
  ] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', ownerId),
    supabase.from('bank_accounts').select('*').eq('user_id', ownerId),
    supabase.from('credit_cards').select('*').eq('user_id', ownerId),
    supabase.from('bills').select('*').eq('user_id', ownerId),
    supabase.from('user_settings').select('*').eq('user_id', ownerId).single(),
    supabase.from('monthly_goals').select('*').eq('user_id', ownerId),
  ]);


  const backup = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    userId: user.id,
    userEmail: user.email,
    data: {
      transactions: transactionsRes.data || [],
      bankAccounts: bankAccountsRes.data || [],
      creditCards: creditCardsRes.data || [],
      bills: billsRes.data || [],
      settings: settingsRes.data || null,
      monthlyGoals: goalsRes.data || [],
    },
    metadata: {
      transactionsCount: transactionsRes.data?.length || 0,
      bankAccountsCount: bankAccountsRes.data?.length || 0,
      creditCardsCount: creditCardsRes.data?.length || 0,
      billsCount: billsRes.data?.length || 0,
      goalsCount: goalsRes.data?.length || 0,
    },
  };

  const jsonContent = JSON.stringify(backup, null, 2);
  downloadFile(
    jsonContent, 
    `backup_velara_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`, 
    'application/json'
  );
}

// Helper: Format currency
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

// Helper: Download file
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob(['\ufeff' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
