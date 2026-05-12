import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CustomerEvaluation {
  id: string;
  user_id: string;
  customer_name: string;
  customer_whatsapp: string;
  customer_birth_date: string;
  nps_score: number | null;
  nps_comment?: string | null;
  evaluation_date: string;
  created_at: string;
  campaign_id?: string | null;
}

export interface EvaluationAnswer {
  id: string;
  evaluation_id?: string;
  question_id: string;
  score: number;
  created_at?: string;
  comment?: string | null;
  selected_options?: unknown;
  text_answer?: string | null;
  /** Tipo da pergunta — apenas "stars" entra nos cálculos numéricos.
   *  Outros tipos (multiple_choice, single_choice, text...) NÃO. */
  question_type?: string;
}

export interface EvaluationWithAnswers extends CustomerEvaluation {
  evaluation_answers: EvaluationAnswer[];
}

/** Helper canônico: respostas que contam como "nota" para médias / NPS por pergunta. */
export const isStarsAnswer = (a: { question_type?: string }) =>
  (a?.question_type || "stars") === "stars";

/** Carrega o map { question_id -> question_type }.
 *  Apenas perguntas de campanha podem ter tipos diferentes de "stars";
 *  perguntas legacy (evaluation_questions) são sempre "stars". */
async function fetchQuestionTypeMap(): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("evaluation_campaign_questions")
    .select("id, question_type");
  const map = new Map<string, string>();
  (data || []).forEach((q: any) => map.set(q.id, q.question_type || "stars"));
  return map;
}

export const useCustomerEvaluations = (filters?: { startDate?: string; endDate?: string }) => {
  return useQuery({
    queryKey: ["customer-evaluations", filters],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      let query = supabase
        .from("customer_evaluations")
        .select(`
          *,
          evaluation_answers (
            id,
            question_id,
            score,
            comment,
            selected_options,
            text_answer
          )
        `)
        // nps_comment is included via * selector
        .eq("user_id", user.id)
        .order("evaluation_date", { ascending: false });

      if (filters?.startDate) {
        query = query.gte("evaluation_date", `${filters.startDate}T00:00:00`);
      }
      if (filters?.endDate) {
        query = query.lte("evaluation_date", `${filters.endDate}T23:59:59.999`);
      }

      const [{ data, error }, typeMap] = await Promise.all([
        query,
        fetchQuestionTypeMap(),
      ]);

      if (error) throw error;

      // Enriquece cada answer com question_type para que TODOS os relatórios
      // possam excluir respostas de múltipla escolha / texto dos cálculos.
      const enriched = (data || []).map((e: any) => ({
        ...e,
        evaluation_answers: (e.evaluation_answers || []).map((a: any) => ({
          ...a,
          question_type: typeMap.get(a.question_id) || "stars",
        })),
      }));

      return enriched as EvaluationWithAnswers[];
    },
  });
};

export const useEvaluationStats = (startDate?: string, endDate?: string) => {
  const { data: evaluations } = useCustomerEvaluations({ startDate, endDate });

  if (!evaluations) return null;

  const totalEvaluations = evaluations.length;

  // Helper para calcular idade
  const calculateAge = (birthDate: string) => {
    if (!birthDate) return null;
    
    const today = new Date();
    const birth = new Date(birthDate);
    
    // Validar se a data é válida
    if (isNaN(birth.getTime())) return null;
    
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    // Retornar null se a idade for inválida (negativa ou maior que 120)
    if (age < 0 || age > 120) return null;
    
    return age;
  };

  // Calcular média geral de satisfação (1-5) — apenas perguntas tipo "stars"
  const allScores = evaluations.flatMap(e => e.evaluation_answers.filter(isStarsAnswer).map(a => a.score));
  const avgSatisfaction = allScores.length > 0 
    ? allScores.reduce((sum, score) => sum + score, 0) / allScores.length
    : 0;

  // Calcular NPS
  const npsScores = evaluations.filter(e => e.nps_score !== null).map(e => e.nps_score!);
  const promoters = npsScores.filter(s => s >= 9).length;
  const detractors = npsScores.filter(s => s <= 6).length;
  const nps = npsScores.length > 0 
    ? Math.round(((promoters - detractors) / npsScores.length) * 100)
    : 0;

  const avgNps = npsScores.length > 0
    ? npsScores.reduce((sum, score) => sum + score, 0) / npsScores.length
    : 0;

  // Calcular idade média
  const ages = evaluations
    .map(e => calculateAge(e.customer_birth_date))
    .filter((age): age is number => age !== null);
  const avgAge = ages.length > 0 
    ? Math.round(ages.reduce((sum, a) => sum + a, 0) / ages.length)
    : 0;

  // Distribuição por faixa etária (apenas idades válidas)
  const validAges = ages.filter(a => a !== null && a >= 0);
  const ageDistribution = [
    { ageGroup: '18-25', count: validAges.filter(a => a >= 18 && a <= 25).length },
    { ageGroup: '26-35', count: validAges.filter(a => a >= 26 && a <= 35).length },
    { ageGroup: '36-45', count: validAges.filter(a => a >= 36 && a <= 45).length },
    { ageGroup: '46-60', count: validAges.filter(a => a >= 46 && a <= 60).length },
    { ageGroup: '60+', count: validAges.filter(a => a > 60).length },
  ];

  // Satisfação por faixa etária
  const satisfactionByAge = [
    { ageGroup: '18-25', avgScore: 0, count: 0 },
    { ageGroup: '26-35', avgScore: 0, count: 0 },
    { ageGroup: '36-45', avgScore: 0, count: 0 },
    { ageGroup: '46-60', avgScore: 0, count: 0 },
    { ageGroup: '60+', avgScore: 0, count: 0 },
  ];

  evaluations.forEach(e => {
    const age = calculateAge(e.customer_birth_date);
    
    // Pular se idade inválida
    if (age === null) return;
    
    const starsAnswers = e.evaluation_answers.filter(isStarsAnswer);
    if (starsAnswers.length === 0) return;
    const avgScore = starsAnswers.reduce((sum, a) => sum + a.score, 0) / starsAnswers.length;
    
    let index = -1;
    if (age >= 18 && age <= 25) index = 0;
    else if (age >= 26 && age <= 35) index = 1;
    else if (age >= 36 && age <= 45) index = 2;
    else if (age >= 46 && age <= 60) index = 3;
    else if (age > 60) index = 4;

    if (index >= 0) {
      satisfactionByAge[index].avgScore += avgScore;
      satisfactionByAge[index].count += 1;
    }
  });

  satisfactionByAge.forEach(group => {
    if (group.count > 0) {
      group.avgScore = group.avgScore / group.count;
    }
  });

  // Horários de pico
  const hourlyData = new Map<number, number>();
  evaluations.forEach(e => {
    const hour = new Date(e.evaluation_date).getHours();
    hourlyData.set(hour, (hourlyData.get(hour) || 0) + 1);
  });
  const peakHours = Array.from(hourlyData.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, count]) => ({ hour, count }));

  // Avaliações por dia da semana
  const weekdayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const weekdayData = Array.from({ length: 7 }, (_, i) => ({ 
    day: weekdayNames[i], 
    count: 0, 
    totalScore: 0 
  }));
  
  evaluations.forEach(e => {
    const day = new Date(e.evaluation_date).getDay();
    const starsAnswers = e.evaluation_answers.filter(isStarsAnswer);
    if (starsAnswers.length === 0) return;
    weekdayData[day].count++;
    const avgScore = starsAnswers.reduce((sum, a) => sum + a.score, 0) / starsAnswers.length;
    weekdayData[day].totalScore += avgScore;
  });

  const weekdayStats = weekdayData.map(d => ({
    day: d.day,
    count: d.count,
    avgScore: d.count > 0 ? d.totalScore / d.count : 0,
  }));

  // Avaliações negativas recentes (últimas 24h com nota < 3) — somente notas reais
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const recentNegative = evaluations.filter(e => {
    const evalDate = new Date(e.evaluation_date);
    const starsAnswers = e.evaluation_answers.filter(isStarsAnswer);
    if (starsAnswers.length === 0) return false;
    const avgScore = starsAnswers.reduce((sum, a) => sum + a.score, 0) / starsAnswers.length;
    return evalDate >= yesterday && avgScore < 3;
  }).map(e => {
    const starsAnswers = e.evaluation_answers.filter(isStarsAnswer);
    return {
      ...e,
      avgScore: starsAnswers.length > 0
        ? starsAnswers.reduce((sum, a) => sum + a.score, 0) / starsAnswers.length
        : 0,
    };
  });

  // Clientes VIP (recorrentes)
  const customerFrequency = new Map<string, { count: number; evaluations: any[] }>();
  evaluations.forEach(e => {
    const key = e.customer_whatsapp;
    if (!customerFrequency.has(key)) {
      customerFrequency.set(key, { count: 0, evaluations: [] });
    }
    const data = customerFrequency.get(key)!;
    data.count++;
    data.evaluations.push(e);
  });

  const vipCustomers = Array.from(customerFrequency.entries())
    .filter(([_, data]) => data.count > 1)
    .map(([phone, data]) => {
      const allScores = data.evaluations.flatMap(e => 
        (e.evaluation_answers as any[]).filter(isStarsAnswer).map((a: any) => a.score)
      );
      const avgScore = allScores.length > 0
        ? allScores.reduce((sum: number, s: number) => sum + s, 0) / allScores.length
        : 0;
      
      return {
        customer_name: data.evaluations[0].customer_name,
        customer_whatsapp: phone,
        evaluation_count: data.count,
        avgScore,
        last_evaluation: data.evaluations[0].evaluation_date,
      };
    })
    .sort((a, b) => b.evaluation_count - a.evaluation_count);

  // Calcular média por pergunta — somente perguntas tipo "stars"
  const questionStats = new Map<string, { text: string; scores: number[] }>();
  
  evaluations.forEach(evaluation => {
    evaluation.evaluation_answers.forEach(answer => {
      if (!isStarsAnswer(answer)) return;
      if (!questionStats.has(answer.question_id)) {
        questionStats.set(answer.question_id, {
          text: "Pergunta",
          scores: [],
        });
      }
      questionStats.get(answer.question_id)!.scores.push(answer.score);
    });
  });

  const questionAverages = Array.from(questionStats.entries()).map(([id, data]) => ({
    question_id: id,
    question_text: data.text,
    average: data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length,
    total: data.scores.length,
  })).sort((a, b) => a.average - b.average);

  // Evolução diária — apenas notas
  const dailyData = new Map<string, { date: string; scores: number[]; npsScores: number[] }>();
  
  evaluations.forEach(evaluation => {
    const date = new Date(evaluation.evaluation_date).toISOString().split('T')[0];
    if (!dailyData.has(date)) {
      dailyData.set(date, { date, scores: [], npsScores: [] });
    }
    const dayData = dailyData.get(date)!;
    evaluation.evaluation_answers.forEach(answer => {
      if (isStarsAnswer(answer)) dayData.scores.push(answer.score);
    });
    if (evaluation.nps_score !== null) {
      dayData.npsScores.push(evaluation.nps_score);
    }
  });

  const evolutionData = Array.from(dailyData.values()).map(day => ({
    date: day.date,
    avgSatisfaction: day.scores.length > 0 
      ? day.scores.reduce((sum, s) => sum + s, 0) / day.scores.length
      : 0,
    avgNps: day.npsScores.length > 0
      ? day.npsScores.reduce((sum, s) => sum + s, 0) / day.npsScores.length
      : 0,
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Distribuição NPS
  const npsDistribution = Array.from({ length: 11 }, (_, i) => ({
    score: i,
    count: npsScores.filter(s => s === i).length,
  }));

  return {
    totalEvaluations,
    avgSatisfaction,
    nps,
    avgNps,
    avgAge,
    ageDistribution,
    satisfactionByAge,
    peakHours,
    weekdayStats,
    recentNegative,
    vipCustomers,
    questionAverages,
    evolutionData,
    npsDistribution,
    promoters,
    detractors,
    neutrals: npsScores.length - promoters - detractors,
  };
};

export const useEvaluationById = (id: string) => {
  return useQuery({
    queryKey: ["evaluation", id],
    queryFn: async () => {
      const [{ data, error }, typeMap] = await Promise.all([
        supabase
          .from("customer_evaluations")
          .select(`
            *,
            evaluation_answers (
              id,
              question_id,
              score,
              comment,
              selected_options,
              text_answer
            )
          `)
          .eq("id", id)
          .single(),
        fetchQuestionTypeMap(),
      ]);

      if (error) throw error;
      const enriched: any = {
        ...data,
        evaluation_answers: ((data as any)?.evaluation_answers || []).map((a: any) => ({
          ...a,
          question_type: typeMap.get(a.question_id) || "stars",
        })),
      };
      return enriched as EvaluationWithAnswers;
    },
  });
};

export const useExportEvaluations = () => {
  return useMutation({
    mutationFn: async (filters?: { startDate?: string; endDate?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      let query = supabase
        .from("customer_evaluations")
        .select(`
          *,
          evaluation_answers (
            question_id,
            score,
            evaluation_questions (
              question_text
            )
          )
        `)
        .eq("user_id", user.id)
        .order("evaluation_date", { ascending: false });

      if (filters?.startDate) {
        query = query.gte("evaluation_date", `${filters.startDate}T00:00:00`);
      }
      if (filters?.endDate) {
        query = query.lte("evaluation_date", `${filters.endDate}T23:59:59.999`);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Carrega tipos para excluir múltipla escolha da Média Geral do CSV
      const typeMap = await fetchQuestionTypeMap();

      // Criar CSV
      const csvRows = [];
      csvRows.push(["Data", "Nome", "WhatsApp", "Data Nascimento", "NPS", "Média Geral"].join(","));

      data.forEach((evaluation: any) => {
        const starsAnswers = (evaluation.evaluation_answers as any[]).filter(
          (a) => (typeMap.get(a.question_id) || "stars") === "stars"
        );
        const avgScore = starsAnswers.length > 0
          ? starsAnswers.reduce((sum: number, a: any) => sum + a.score, 0) / starsAnswers.length
          : 0;

        csvRows.push([
          new Date(evaluation.evaluation_date).toLocaleDateString("pt-BR"),
          evaluation.customer_name,
          evaluation.customer_whatsapp,
          new Date(evaluation.customer_birth_date).toLocaleDateString("pt-BR"),
          evaluation.nps_score || "",
          avgScore.toFixed(2),
        ].join(","));
      });

      const csv = csvRows.join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `avaliacoes-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success("CSV exportado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao exportar: " + error.message);
    },
  });
};
