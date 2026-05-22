import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DraftCartProvider } from "@/contexts/DraftCartContext";
import { ThemeProvider } from "next-themes";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SuperAdminGuard } from "@/components/SuperAdminGuard";
import Index from "./pages/Index";
import PDV from "./pages/PDV";
import Garcom from "./pages/Garcom";
import SuperAdmin from "./pages/SuperAdmin";
import PublicMenu from "./pages/PublicMenu";
import PublicMenuLoyalty from "./pages/PublicMenuLoyalty";
import PublicEvaluation from "./pages/PublicEvaluation";
import PublicTasks from "./pages/PublicTasks";
import PublicChecklistAccess from "./pages/PublicChecklistAccess";
import EvaluationsPanel from "./pages/EvaluationsPanel";
import NotFound from "./pages/NotFound";
import { RadixBodyUnlock } from "@/components/RadixBodyUnlock";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DraftCartProvider>
          <PreferencesProvider>
            <TooltipProvider>
              <RadixBodyUnlock />
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route
                    path="/pdv/*"
                    element={
                      <ProtectedRoute>
                        <PDV />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/garcom/*"
                    element={
                      <ProtectedRoute>
                        <Garcom />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/avaliacoes/*"
                    element={
                      <ProtectedRoute>
                        <EvaluationsPanel />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/*"
                    element={
                      <SuperAdminGuard>
                        <SuperAdmin />
                      </SuperAdminGuard>
                    }
                  />
                  {/* Public routes - no authentication required */}
                  <Route path="/cardapio/:userId" element={<PublicMenu />} />
                  <Route path="/cardapio/:userId/meus-pontos" element={<PublicMenuLoyalty />} />
                  <Route path="/avaliacao/:campaignId" element={<PublicEvaluation />} />
                  <Route path="/tarefas/:userId" element={<PublicTasks />} />
                  <Route path="/c/:checklistId" element={<PublicChecklistAccess />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </PreferencesProvider>
        </DraftCartProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
