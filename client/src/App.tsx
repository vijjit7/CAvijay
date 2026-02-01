import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuditDashboard from "@/pages/audit-dashboard";
import ReportsPage from "@/pages/reports";
import ComparePage from "@/pages/compare";
import LoginPage from "@/pages/login";
import UploadPage from "@/pages/upload";
import MisPage from "@/pages/mis";
import MisDashboardPage from "@/pages/mis-dashboard";
import CreateReportPage from "@/pages/create-report";
import AssociatesPage from "@/pages/associates";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AuditProvider } from "@/lib/audit-context";

// Protected Route Wrapper
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user } = useAuth();
  if (!user) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      
      {/* Protected Routes */}
      <Route path="/">
        <ProtectedRoute component={AuditDashboard} />
      </Route>
      <Route path="/reports">
        <ProtectedRoute component={ReportsPage} />
      </Route>
      <Route path="/compare">
        <ProtectedRoute component={ComparePage} />
      </Route>
      <Route path="/upload">
        <ProtectedRoute component={UploadPage} />
      </Route>
      <Route path="/mis">
        <ProtectedRoute component={MisPage} />
      </Route>
      <Route path="/mis-dashboard">
        <ProtectedRoute component={MisDashboardPage} />
      </Route>
      <Route path="/create-report">
        <ProtectedRoute component={CreateReportPage} />
      </Route>
      <Route path="/associates">
        <ProtectedRoute component={AssociatesPage} />
      </Route>
      <Route path="/analytics">
        <ProtectedRoute component={ReportsPage} />
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuditProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuditProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;