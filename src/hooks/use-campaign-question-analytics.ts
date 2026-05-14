import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CampaignQuestionMeta {
  id: string;
  campaign_id: string;
  question_text: string;
  question_type: string;
  options: string[] | null;
  order_position: number;
}

export interface QuestionAnswer {
  evaluation_id: string;
  customer_name: string | null;
  evaluation_date: string;
  score: number | null;
  text_answer: string | null;
  selected_options: string[] | null;
  comment: string | null;
}

export interface CampaignQuestionAnalytics {
  question: CampaignQuestionMeta;
  answers: QuestionAnswer[];
}

function parseOptions(raw: any): string[] | null {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String);
    } catch { /* ignore */ }
  }
  return null;
}

export function useCampaignQuestionAnalytics(
  campaignId: string | null,
  startDate?: string,
  endDate?: string,
) {
  return useQuery({
    queryKey: ["campaign-question-analytics", campaignId, startDate, endDate],
    enabled: !!campaignId,
    queryFn: async (): Promise<CampaignQuestionAnalytics[]> => {
      if (!campaignId) return [];

      const { data: questionsRaw, error: qErr } = await supabase
        .from("evaluation_campaign_questions")
        .select("id, campaign_id, question_text, question_type, options, order_position, is_active")
        .eq("campaign_id", campaignId)
        .eq("is_active", true)
        .order("order_position", { ascending: true });

      if (qErr) throw qErr;

      const questions: CampaignQuestionMeta[] = (questionsRaw || []).map((q: any) => ({
        id: q.id,
        campaign_id: q.campaign_id,
        question_text: q.question_text,
        question_type: q.question_type || "stars",
        options: parseOptions(q.options),
        order_position: q.order_position ?? 0,
      }));

      let evalQuery = supabase
        .from("customer_evaluations")
        .select(`
          id,
          customer_name,
          evaluation_date,
          evaluation_answers (
            question_id,
            score,
            text_answer,
            selected_options,
            comment
          )
        `)
        .eq("campaign_id", campaignId)
        .order("evaluation_date", { ascending: false });

      if (startDate) evalQuery = evalQuery.gte("evaluation_date", `${startDate}T00:00:00`);
      if (endDate) evalQuery = evalQuery.lte("evaluation_date", `${endDate}T23:59:59.999`);

      const { data: evals, error: eErr } = await evalQuery;
      if (eErr) throw eErr;

      const byQuestion = new Map<string, QuestionAnswer[]>();
      questions.forEach(q => byQuestion.set(q.id, []));

      (evals || []).forEach((e: any) => {
        (e.evaluation_answers || []).forEach((a: any) => {
          if (!byQuestion.has(a.question_id)) return;
          byQuestion.get(a.question_id)!.push({
            evaluation_id: e.id,
            customer_name: e.customer_name,
            evaluation_date: e.evaluation_date,
            score: typeof a.score === "number" ? a.score : null,
            text_answer: a.text_answer ?? null,
            selected_options: parseOptions(a.selected_options),
            comment: a.comment ?? null,
          });
        });
      });

      return questions.map(q => ({
        question: q,
        answers: byQuestion.get(q.id) || [],
      }));
    },
  });
}
