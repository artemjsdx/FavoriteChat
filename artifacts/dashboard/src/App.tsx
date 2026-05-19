import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import Sidebar from "@/components/sidebar";
import { MobileTopBar, MobileBottomNav } from "@/components/mobile-nav";
import DashboardPage from "@/pages/dashboard";
import AgentsPage from "@/pages/agents";
import ChannelsPage from "@/pages/channels";
import ActivityPage from "@/pages/activity";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <MobileTopBar />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/agents" component={AgentsPage} />
            <Route path="/channels" component={ChannelsPage} />
            <Route path="/activity" component={ActivityPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route component={NotFound} />
          </Switch>
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Layout />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
