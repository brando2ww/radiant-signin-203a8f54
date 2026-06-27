import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth, subMonths, format, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DashboardStats {
  totalRevenue: number;
  totalExpenses: number;
  profit: number;
  balance: number;
  revenueTrend: { percentage: number; direction: 'up' | 'down' };
  expensesTrend: { percentage: number; direction: 'up' | 'down' };
  profitTrend: { percentage: number; direction: 'up' | 'down' };
}

interface CashFlowDataPoint {
  month: string;
  receitas: number;
  despesas: number;
  lucro: number;
}

interface UpcomingBill {
  id: string;
  title: string;
  amount: number;
  dueDate: Date;
  type: 'payable' | 'receivable';
  status: string;
  category?: string;
}

interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  link?: string;
}

export const useDashboardData = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  // Buscar transações
  const { data: transactions } = useQuery({
    queryKey: ['transactions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Buscar bills
  const { data: bills } = useQuery({
    queryKey: ['bills', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('user_id', user.id)
        .order('due_date', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Buscar cartões de crédito
  const { data: creditCards } = useQuery({
    queryKey: ['credit_cards', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('credit_cards')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Buscar contas bancárias
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Buscar metas mensais
  const { data: monthlyGoals } = useQuery({
    queryKey: ['monthly_goals', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const currentMonthYear = format(new Date(), 'yyyy-MM');
      const { data, error } = await supabase
        .from('monthly_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('month_year', currentMonthYear)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!user,
  });

  // Calcular estatísticas
  const stats: DashboardStats = (() => {
    if (!transactions) return {
      totalRevenue: 0,
      totalExpenses: 0,
      profit: 0,
      balance: 0,
      revenueTrend: { percentage: 0, direction: 'up' as const },
      expensesTrend: { percentage: 0, direction: 'up' as const },
      profitTrend: { percentage: 0, direction: 'up' as const },
    };

    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const previousMonthStart = startOfMonth(subMonths(now, 1));
    const previousMonthEnd = endOfMonth(subMonths(now, 1));

    const currentMonthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date >= currentMonthStart && date <= currentMonthEnd;
    });

    const previousMonthTransactions = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return date >= previousMonthStart && date <= previousMonthEnd;
    });

    const currentRevenue = currentMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const currentExpenses = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const previousRevenue = previousMonthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const previousExpenses = previousMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const currentProfit = currentRevenue - currentExpenses;
    const previousProfit = previousRevenue - previousExpenses;

    const revenueTrendValue = previousRevenue > 0 
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
      : 0;

    const expensesTrendValue = previousExpenses > 0 
      ? ((currentExpenses - previousExpenses) / previousExpenses) * 100 
      : 0;

    const profitTrendValue = previousProfit !== 0
      ? ((currentProfit - previousProfit) / Math.abs(previousProfit)) * 100 
      : 0;

    const bankBalance = bankAccounts?.reduce((sum, acc) => sum + Number(acc.current_balance), 0) || 0;

    return {
      totalRevenue: currentRevenue,
      totalExpenses: currentExpenses,
      profit: currentProfit,
      balance: bankBalance,
      revenueTrend: {
        percentage: Math.abs(revenueTrendValue),
        direction: revenueTrendValue >= 0 ? 'up' : 'down',
      },
      expensesTrend: {
        percentage: Math.abs(expensesTrendValue),
        direction: expensesTrendValue >= 0 ? 'up' : 'down',
      },
      profitTrend: {
        percentage: Math.abs(profitTrendValue),
        direction: profitTrendValue >= 0 ? 'up' : 'down',
      },
    };
  })();

  // Calcular cash flow (últimos 6 meses)
  const cashFlowData: CashFlowDataPoint[] = (() => {
    if (!transactions) return [];

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      const monthTransactions = transactions.filter(t => {
        const date = new Date(t.transaction_date);
        return date >= monthStart && date <= monthEnd;
      });

      const receitas = monthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const despesas = monthTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      months.push({
        month: format(monthDate, 'MMM', { locale: ptBR }),
        receitas,
        despesas,
        lucro: receitas - despesas,
      });
    }

    return months;
  })();

  // Upcoming bills (próximas 30 dias)
  const upcomingBills: UpcomingBill[] = (() => {
    if (!bills) return [];

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return bills
      .filter(b => b.status === 'pending')
      .filter(b => {
        const dueDate = parseISO(b.due_date);
        return dueDate <= thirtyDaysFromNow;
      })
      .slice(0, 10)
      .map(b => ({
        id: b.id,
        title: b.title,
        amount: Number(b.amount),
        dueDate: parseISO(b.due_date),
        type: b.type as 'payable' | 'receivable',
        status: b.status || 'pending',
        category: b.category || undefined,
      }));
  })();

  // Gerar alertas dinâmicos
  const alerts: Alert[] = (() => {
    const alertsList: Alert[] = [];

    if (!bills || !creditCards || !bankAccounts) return alertsList;

    const overdueBills = bills.filter(b => {
      const dueDate = parseISO(b.due_date);
      return b.status === 'pending' && dueDate < new Date();
    });

    if (overdueBills.length > 0) {
      alertsList.push({
        id: 'overdue-bills',
        type: 'error',
        message: `Você tem ${overdueBills.length} conta(s) vencida(s)`,
        link: '/pdv/financial/accounts-payable',
      });
    }

    const upcomingSoonBills = bills.filter(b => {
      const dueDate = parseISO(b.due_date);
      const daysUntil = differenceInDays(dueDate, new Date());
      return b.status === 'pending' && daysUntil >= 0 && daysUntil <= 3;
    });

    if (upcomingSoonBills.length > 0) {
      alertsList.push({
        id: 'upcoming-bills',
        type: 'warning',
        message: `${upcomingSoonBills.length} conta(s) vencendo nos próximos 3 dias`,
        link: '/pdv/financial/accounts-payable',
      });
    }

    const highLimitCards = creditCards.filter(c => {
      const limitUsage = (Number(c.current_balance) / Number(c.credit_limit)) * 100;
      return limitUsage > 80;
    });

    if (highLimitCards.length > 0) {
      alertsList.push({
        id: 'high-limit-cards',
        type: 'warning',
        message: `${highLimitCards.length} cartão(ões) com mais de 80% do limite usado`,
        link: '/credit-cards',
      });
    }

    const upcomingInvoices = creditCards.filter(c => {
      const today = new Date();
      const dueDay = c.due_day || 10;
      const dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay);
      if (dueDate < today) {
        dueDate.setMonth(dueDate.getMonth() + 1);
      }
      const daysUntil = differenceInDays(dueDate, today);
      return daysUntil >= 0 && daysUntil <= 5;
    });

    if (upcomingInvoices.length > 0) {
      alertsList.push({
        id: 'upcoming-invoices',
        type: 'warning',
        message: `${upcomingInvoices.length} fatura(s) de cartão vencendo em até 5 dias`,
        link: '/credit-cards',
      });
    }

    const lowBalanceAccounts = bankAccounts.filter(a => Number(a.current_balance) < 100);
    if (lowBalanceAccounts.length > 0) {
      alertsList.push({
        id: 'low-balance',
        type: 'warning',
        message: `${lowBalanceAccounts.length} conta(s) com saldo baixo (< R$ 100)`,
        link: '/bank-accounts',
      });
    }

    if (monthlyGoals && stats.totalRevenue > 0) {
      const revenueGoal = Number(monthlyGoals.revenue_goal);
      if (revenueGoal > 0 && stats.totalRevenue < revenueGoal * 0.5) {
        const percentage = ((stats.totalRevenue / revenueGoal) * 100).toFixed(0);
        alertsList.push({
          id: 'goal-warning',
          type: 'info',
          message: `Meta de receita em ${percentage}% - continue focado!`,
        });
      }
    }

    return alertsList;
  })();

  // Receitas por categoria
  const revenueByCategory = (() => {
    if (!transactions) return [];

    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);

    const currentMonthRevenues = transactions.filter(t => {
      const date = new Date(t.transaction_date);
      return t.type === 'income' && date >= currentMonthStart && date <= currentMonthEnd;
    });

    const categoryTotals: Record<string, number> = {};
    currentMonthRevenues.forEach(t => {
      const category = t.category || 'Outros';
      categoryTotals[category] = (categoryTotals[category] || 0) + Number(t.amount);
    });

    // Cores para categorias
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    return Object.entries(categoryTotals).map(([name, value], index) => ({
      name,
      value,
      color: colors[index % colors.length],
    }));
  })();

  // Cartões de crédito
  const creditCardsData = creditCards?.map(card => ({
    id: card.id,
    name: card.name,
    brand: card.brand || 'Outros',
    currentBalance: Number(card.current_balance),
    creditLimit: Number(card.credit_limit),
    dueDay: card.due_day || 10,
    color: card.color || '#3b82f6',
    lastFourDigits: card.last_four_digits || '0000',
  })) || [];

  // Metas mensais
  const monthlyGoalsData = monthlyGoals ? {
    revenueGoal: Number(monthlyGoals.revenue_goal) || 0,
    savingsGoal: Number(monthlyGoals.savings_goal) || 0,
    investmentGoal: Number(monthlyGoals.investment_goal) || 0,
    currentRevenue: stats.totalRevenue,
    currentSavings: 0,
    currentInvestment: 0,
  } : {
    revenueGoal: 0,
    savingsGoal: 0,
    investmentGoal: 0,
    currentRevenue: stats.totalRevenue,
    currentSavings: 0,
    currentInvestment: 0,
  };

  // MEI info
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const meiInfo = {
    dasValue: 70.60,
    dasMonth: monthNames[new Date().getMonth()],
    dueDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 20),
    yearlyRevenue: stats.totalRevenue,
    yearlyLimit: 81000,
  };

  useEffect(() => {
    if (transactions !== undefined && bills !== undefined && creditCards !== undefined && bankAccounts !== undefined) {
      setIsLoading(false);
    }
  }, [transactions, bills, creditCards, bankAccounts]);

  return {
    stats,
    cashFlowData,
    upcomingBills,
    creditCards: creditCardsData,
    monthlyGoals: monthlyGoalsData,
    alerts,
    revenueByCategory,
    meiInfo,
    isLoading,
  };
};
