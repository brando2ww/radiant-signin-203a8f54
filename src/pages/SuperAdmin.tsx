import { Routes, Route, Navigate } from "react-router-dom";
import { AdminSidebar } from "@/components/super-admin/AdminSidebar";
import Tenants from "./super-admin/Tenants";
import TenantForm from "./super-admin/TenantForm";
import TenantDetail from "./super-admin/TenantDetail";
import AdminDashboard from "./super-admin/AdminDashboard";
import Plans from "./super-admin/Plans";
import AdminSettings from "./super-admin/AdminSettings";

export default function SuperAdmin() {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route index element={<AdminDashboard />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="tenants/novo" element={<TenantForm />} />
          <Route path="tenants/:id" element={<TenantDetail />} />
          <Route path="planos" element={<Plans />} />
          <Route path="configuracoes" element={<AdminSettings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
