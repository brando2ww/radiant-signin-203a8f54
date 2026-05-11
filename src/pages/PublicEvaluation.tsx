import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Star, CheckCircle2, ClipboardList, BarChart3, User, Sparkles, Send, ExternalLink } from "lucide-react";
import {
  usePublicCampaign,
  usePublicCampaignQuestions,
  useSubmitCampaignEvaluation,
} from "@/hooks/use-evaluation-campaigns";
import { usePublicBusinessSettings } from "@/hooks/use-business-settings";
import { usePublicCampaignPrizes, useRegisterPrizeWin, type CampaignPrize } from "@/hooks/use-campaign-prizes";
import { SpinWheel } from "@/components/public-evaluation/SpinWheel";
import { PrizeResult } from "@/components/public-evaluation/PrizeResult";

type Phase = "roulette" | "form" | "coupon" | "google_redirect" | "done";

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-muted/30">
      <div
        className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-r-full transition-all duration-700 ease-out"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function EncouragementMessage({ progress }: { progress: number }) {
  const message = useMemo(() => {
    if (progress >= 100) return { text: "Tudo pronto! 🚀", sub: "Agora é só enviar" };
    if (progress >= 75) return { text: "Quase lá! 🎯", sub: "Faltam só os seus dados" };
    if (progress >= 50) return { text: "Muito bem! ✨", sub: "Você já passou da metade" };
    if (progress >= 25) return { text: "Ótimo começo! 💪", sub: "Continue assim" };
    return null;
  }, [progress]);

  if (!message || progress === 0) return null;

  return (
    <div className="text-center animate-fade-in" key={message.text}>
      <p className="text-sm font-semibold text-primary">{message.text}</p>
      <p className="text-xs text-muted-foreground">{message.sub}</p>
    </div>
  );
}

export default function PublicEvaluation() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { data: campaign, isLoading: loadingCampaign } = usePublicCampaign(campaignId || "");
  const { data: questions, isLoading: loadingQuestions } = usePublicCampaignQuestions(campaignId || "");
  const submitEvaluation = useSubmitCampaignEvaluation();
  const registerWin = useRegisterPrizeWin();

  const rouletteEnabled = (campaign as any)?.roulette_enabled ?? false;
  const { data: prizes = [] } = usePublicCampaignPrizes(campaignId || "", rouletteEnabled);

  const [phase, setPhase] = useState<Phase>("roulette");
  const [wonPrize, setWonPrize] = useState<CampaignPrize | null>(null);
  const [couponData, setCouponData] = useState<{ code: string; expiresAt: string } | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [answers, setAnswers] = useState<Record<string, { score: number; comment: string; selectedOptions?: string[] }>>({});
  const [npsScore, setNpsScore] = useState<number | null>(null);
  const [npsComment, setNpsComment] = useState("");

  const { settings: businessSettings } = usePublicBusinessSettings((campaign as any)?.user_id || "");

  const bgColor = (businessSettings as any)?.background_color || "#f8fafc";
  const logoUrl = businessSettings?.logo_url;
  const welcomeMsg = businessSettings?.welcome_message;
  const thankYouMsg = businessSettings?.thank_you_message;
  const googleReviewUrl = businessSettings?.google_review_url;

  // Progress calculation (reordered: questions → NPS → personal data)
  const progress = useMemo(() => {
    const totalQuestions = questions?.length || 0;
    const answeredQuestions = questions?.filter((q) => {
      const a = answers[q.id];
      const qType = (q as any).question_type || "stars";
      if (qType === "stars") return a?.score > 0;
      return a?.selectedOptions && a.selectedOptions.length > 0;
    }).length || 0;
    const hasNps = npsScore !== null ? 1 : 0;
    const hasName = name.trim() ? 1 : 0;
    const hasPhone = phone.replace(/\D/g, "").length >= 10 ? 1 : 0;
    const hasBirth = birthDate ? 1 : 0;

    const totalSteps = totalQuestions + 1 + 3; // questions + nps + 3 personal fields
    const completedSteps = answeredQuestions + hasNps + hasName + hasPhone + hasBirth;

    return totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  }, [questions, answers, npsScore, name, phone, birthDate]);

  const wheelPrimary = (campaign as any)?.wheel_primary_color || undefined;
  const wheelSecondary = (campaign as any)?.wheel_secondary_color || undefined;
  const cooldownHours = Number((campaign as any)?.roulette_cooldown_hours) || 0;

  const isCoolingDown = useMemo(() => {
    if (!campaignId || cooldownHours <= 0) return false;
    const lastSpin = localStorage.getItem(`roulette_last_spin_${campaignId}`);
    if (!lastSpin) return false;
    return Date.now() - Number(lastSpin) < cooldownHours * 3600000;
  }, [campaignId, cooldownHours]);

  if (loadingCampaign || loadingQuestions) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: bgColor }}>
        <p className="text-muted-foreground text-center">Esta campanha não está disponível.</p>
      </div>
    );
  }

  const showRoulette = rouletteEnabled && prizes.length > 0 && !isCoolingDown;
  const currentPhase = showRoulette ? phase : (phase === "roulette" ? "form" : phase);

  const handleSetScore = (questionId: string, score: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], score, comment: prev[questionId]?.comment || "" },
    }));
  };

  const handleSetSelectedOptions = (questionId: string, selectedOptions: string[]) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], score: 0, comment: prev[questionId]?.comment || "", selectedOptions },
    }));
  };

  const handleToggleOption = (questionId: string, option: string) => {
    setAnswers((prev) => {
      const current = prev[questionId]?.selectedOptions || [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return {
        ...prev,
        [questionId]: { ...prev[questionId], score: 0, comment: prev[questionId]?.comment || "", selectedOptions: next },
      };
    });
  };

  const handleSetComment = (questionId: string, comment: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], comment },
    }));
  };

  const allQuestionsAnswered = questions?.every((q) => {
    const a = answers[q.id];
    const qType = (q as any).question_type || "stars";
    if (qType === "stars") return a?.score > 0;
    return a?.selectedOptions && a.selectedOptions.length > 0;
  }) ?? true;
  const canSubmit =
    name.trim() &&
    phone.replace(/\D/g, "").length >= 10 &&
    birthDate &&
    allQuestionsAnswered &&
    npsScore !== null;

  const handleSpinResult = (prize: CampaignPrize) => {
    setWonPrize(prize);
    if (campaignId) {
      localStorage.setItem(`roulette_last_spin_${campaignId}`, String(Date.now()));
    }
    setTimeout(() => setPhase("form"), 1500);
  };

  const handleSubmit = () => {
    if (!questions || !campaignId || npsScore === null) return;
    submitEvaluation.mutate(
      {
        campaignId,
        userId: campaign.user_id,
        customerName: name.trim(),
        customerWhatsapp: phone,
        customerBirthDate: birthDate,
        npsScore,
        npsComment: npsScore !== null && npsScore <= 8 ? npsComment.trim() : undefined,
        answers: questions.map((q) => ({
          questionId: q.id,
          score: answers[q.id]?.score || 0,
          comment: answers[q.id]?.comment?.trim() || undefined,
          selectedOptions: answers[q.id]?.selectedOptions,
        })),
      },
      {
        onSuccess: (result) => {
          const isPromoter = npsScore !== null && npsScore >= 9 && !!googleReviewUrl;
          // Promotores são redirecionados para o Google e não recebem cupom de sorteio
          if (isPromoter) {
            setPhase("google_redirect");
            return;
          }
          if (wonPrize && result?.id) {
            registerWin.mutate(
              {
                campaignId,
                prizeId: wonPrize.id,
                evaluationId: result.id,
                customerName: name.trim(),
                customerWhatsapp: phone,
                couponValidityDays: wonPrize.coupon_validity_days,
              },
              {
                onSuccess: (win) => {
                  setCouponData({ code: win.coupon_code, expiresAt: win.coupon_expires_at });
                  setPhase("coupon");
                },
                onError: () => setPhase("done"),
              }
            );
          } else {
            setPhase("done");
          }
        },
      }
    );
  };

  const Logo = logoUrl ? (
    <img src={logoUrl} alt="Logo" className="h-16 w-16 object-contain rounded-2xl mx-auto shadow-sm" />
  ) : null;

  // === PHASE: COUPON ===
  if (currentPhase === "coupon" && couponData && wonPrize) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: bgColor }}>
        <div className="max-w-sm w-full">
          {Logo}
          <div className="mt-6">
            <PrizeResult
              prizeName={wonPrize.name}
              couponCode={couponData.code}
              expiresAt={couponData.expiresAt}
            />
          </div>
        </div>
      </div>
    );
  }

  // === PHASE: GOOGLE REDIRECT (auto) ===
  if (currentPhase === "google_redirect" && googleReviewUrl) {
    return (
      <GoogleRedirectScreen
        Logo={Logo}
        bgColor={bgColor}
        url={googleReviewUrl}
        onSkip={() => setPhase("done")}
      />
    );
  }

  // === PHASE: DONE ===
  if (currentPhase === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: bgColor }}>
        <div className="text-center space-y-5 max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
          {Logo}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 mx-auto">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Obrigado!</h1>
          <p className="text-muted-foreground leading-relaxed text-sm">
            {thankYouMsg || "Sua avaliação foi enviada com sucesso. Agradecemos pelo seu feedback!"}
          </p>
        </div>
      </div>
    );
  }

  const getNpsColor = (n: number, selected: boolean) => {
    if (!selected) return "border-border/60 bg-background hover:bg-muted/50 text-muted-foreground";
    if (n <= 6) return "bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20";
    if (n <= 8) return "bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20";
    return "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20";
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor }}>
      {currentPhase === "form" && <ProgressBar value={progress} />}

      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
        {/* Header */}
        <div className="text-center space-y-2 pb-2">
          {Logo}
          <h1 className="text-xl font-semibold text-foreground mt-3">{campaign.name}</h1>
          {currentPhase === "roulette" ? (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              🎡 Gire a roleta e descubra seu prêmio!
            </p>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              {wonPrize
                ? `Você ganhou: ${wonPrize.name}! Preencha para liberar seu cupom.`
                : welcomeMsg || campaign.description || "Conte-nos sobre sua experiência"}
            </p>
          )}
        </div>

        {/* Encouragement */}
        {currentPhase === "form" && <EncouragementMessage progress={progress} />}

        {/* === PHASE: ROULETTE === */}
        {currentPhase === "roulette" && (
          <div className="flex justify-center py-8">
            <SpinWheel prizes={prizes} onResult={handleSpinResult} primaryColor={wheelPrimary} secondaryColor={wheelSecondary} />
          </div>
        )}

        {/* === PHASE: FORM (reordered: questions → NPS → personal data) === */}
        {currentPhase === "form" && (
          <>
            {/* Prize reminder banner */}
            {wonPrize && (
              <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4 text-center animate-fade-in">
                <p className="text-sm font-semibold text-primary flex items-center justify-center gap-1.5">
                  <Sparkles className="h-4 w-4" /> Prêmio: {wonPrize.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Preencha abaixo para liberar seu cupom
                </p>
              </div>
            )}

            {/* SECTION 1: Star Rating Questions */}
            {questions && questions.length > 0 && (
              <section
                className="bg-white/70 dark:bg-card/70 backdrop-blur-sm rounded-2xl p-6 shadow-sm border border-white/40 dark:border-border/30 space-y-6"
                style={{ animationDelay: "0.1s" }}
              >
                <div className="flex items-center gap-2 text-foreground">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <ClipboardList className="h-4 w-4 text-primary" />
                  </div>
                  <h2 className="text-base font-semibold">Avaliação</h2>
                </div>

                {questions.map((q, idx) => {
                  const score = answers[q.id]?.score || 0;
                  const qType = (q as any).question_type || "stars";
                  const qOptions = ((q as any).options || []) as string[];
                  const selected = answers[q.id]?.selectedOptions || [];

                  return (
                    <div key={q.id} className="space-y-3">
                      <p className="text-sm font-medium text-foreground leading-snug">
                        {idx + 1}. {q.question_text}
                      </p>

                      {qType === "stars" && (
                        <>
                          <div className="flex items-center gap-2">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => handleSetScore(q.id, s)}
                                className="p-0.5 transition-all duration-200 active:scale-75"
                              >
                                <Star
                                  className={`h-10 w-10 transition-all duration-300 ${
                                    s <= score
                                      ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.4)] scale-110"
                                      : "text-muted-foreground/15 hover:text-amber-300/50"
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                          {score > 0 && score < 5 && (
                            <div className="space-y-1.5 animate-fade-in">
                              <Label className="text-xs text-muted-foreground">
                                O que aconteceu? (opcional)
                              </Label>
                              <Textarea
                                value={answers[q.id]?.comment || ""}
                                onChange={(e) => handleSetComment(q.id, e.target.value)}
                                placeholder="Conte-nos o que podemos melhorar..."
                                maxLength={500}
                                className="min-h-[70px] rounded-xl text-sm border-border/40 bg-white/50 dark:bg-background/50"
                              />
                            </div>
                          )}
                        </>
                      )}

                      {qType === "single_choice" && (
                        <RadioGroup
                          value={selected[0] || ""}
                          onValueChange={(val) => handleSetSelectedOptions(q.id, [val])}
                          className="space-y-2"
                        >
                          {qOptions.map((opt) => (
                            <label
                              key={opt}
                              className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                                selected[0] === opt
                                  ? "border-primary bg-primary/5 shadow-sm"
                                  : "border-border/40 bg-white/50 dark:bg-background/50 hover:border-border"
                              }`}
                            >
                              <RadioGroupItem value={opt} />
                              <span className="text-sm">{opt}</span>
                            </label>
                          ))}
                        </RadioGroup>
                      )}

                      {qType === "multiple_choice" && (
                        <div className="space-y-2">
                          {qOptions.map((opt) => {
                            const checked = selected.includes(opt);
                            return (
                              <label
                                key={opt}
                                className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                                  checked
                                    ? "border-primary bg-primary/5 shadow-sm"
                                    : "border-border/40 bg-white/50 dark:bg-background/50 hover:border-border"
                                }`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => handleToggleOption(q.id, opt)}
                                />
                                <span className="text-sm">{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {idx < questions.length - 1 && (
                        <div className="border-b border-border/20 pt-1" />
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* SECTION 2: NPS */}
            <section
              className="bg-white/70 dark:bg-card/70 backdrop-blur-sm rounded-2xl p-6 shadow-sm border border-white/40 dark:border-border/30 space-y-4"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="flex items-center gap-2 text-foreground">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-base font-semibold">Recomendação</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-snug">
                De 0 a 10, o quanto indicaria nosso estabelecimento?
              </p>
              <div className="grid grid-cols-11 gap-1.5">
                {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNpsScore(n)}
                    className={`aspect-square rounded-xl text-xs font-bold border-2 transition-all duration-200 active:scale-90 ${getNpsColor(n, npsScore === n)}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground/70 px-0.5 font-medium">
                <span>😞 Nada provável</span>
                <span>😍 Muito provável</span>
              </div>
              {npsScore !== null && npsScore <= 8 && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <Label className="text-xs text-muted-foreground">
                    Deixe uma sugestão (opcional)
                  </Label>
                  <Textarea
                    value={npsComment}
                    onChange={(e) => setNpsComment(e.target.value)}
                    placeholder="O que podemos melhorar?"
                    maxLength={500}
                    className="min-h-[70px] rounded-xl text-sm border-border/40 bg-white/50 dark:bg-background/50"
                  />
                </div>
              )}
            </section>

            {/* SECTION 3: Personal Data (last — reduces friction) */}
            <section
              className="bg-white/70 dark:bg-card/70 backdrop-blur-sm rounded-2xl p-6 shadow-sm border border-white/40 dark:border-border/30 space-y-4"
              style={{ animationDelay: "0.3s" }}
            >
              <div className="flex items-center gap-2 text-foreground">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Seus Dados</h2>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {wonPrize ? "Para entregarmos seu prêmio" : "Para personalizarmos sua experiência"}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="eval-name" className="text-xs font-medium">Nome</Label>
                <Input
                  id="eval-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  maxLength={100}
                  className="h-11 rounded-xl border-border/40 bg-white/60 dark:bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eval-phone" className="text-xs font-medium">Telefone</Label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eval-birth" className="text-xs font-medium">Data de Nascimento</Label>
                <Input
                  id="eval-birth"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="h-11 rounded-xl border-border/40 bg-white/60 dark:bg-background/50"
                />
              </div>
            </section>

            {/* Submit */}
            <Button
              className={`w-full h-14 rounded-2xl text-base font-semibold transition-all duration-500 gap-2 ${
                canSubmit
                  ? "shadow-lg shadow-primary/25 scale-[1.01]"
                  : "opacity-60"
              }`}
              disabled={!canSubmit || submitEvaluation.isPending || registerWin.isPending}
              onClick={handleSubmit}
            >
              {submitEvaluation.isPending || registerWin.isPending ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Enviando...
                </>
              ) : wonPrize ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  Enviar e Liberar Cupom
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar Avaliação
                </>
              )}
            </Button>

            <div className="h-6" />
          </>
        )}
      </div>
    </div>
  );
}
