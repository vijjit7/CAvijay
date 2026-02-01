import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  BarChart3, 
  Settings, 
  Search,
  Bell,
  LogOut,
  Menu,
  Upload,
  ClipboardList,
  FilePlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";

interface AuditLayoutProps {
  children: React.ReactNode;
}

export default function AuditLayout({ children }: AuditLayoutProps) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      // In a real app we'd redirect here, but for this mock we'll handle it in App.tsx
      // or just render null/loading
    }
  }, [user]);

  if (!user) return null;

  const adminNavItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: FileText, label: "Reports", path: "/reports" },
    { icon: Users, label: "Associates", path: "/associates" },
    { icon: ClipboardList, label: "MIS", path: "/mis" },
    { icon: BarChart3, label: "MIS Dashboard", path: "/mis-dashboard" },
  ];

  const associateNavItems = [
    { icon: ClipboardList, label: "MIS", path: "/mis" },
    { icon: FilePlus, label: "Create Report", path: "/create-report" },
    { icon: Upload, label: "Upload Reports", path: "/upload" },
    { icon: FileText, label: "My Reports", path: "/reports" },
  ];

  const navItems = user.isAdmin ? adminNavItems : associateNavItems;

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300">
      <div className="p-6">
        <div className="flex items-center gap-2 font-bold text-xl text-white">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          AuditGuard
        </div>
      </div>

      <div className="flex-1 px-4 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4 px-2">Platform</div>
        {navItems.map((item) => {
          const isActive = location === item.path;
          return (
            <Link key={item.path} href={item.path}>
              <div
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer
                  ${isActive 
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
                    : "hover:bg-slate-800 hover:text-white"}
                `}
              >
                <item.icon size={18} />
                {item.label}
              </div>
            </Link>
          );
        })}

        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-8 mb-4 px-2">Settings</div>
        <Link href="/settings">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium hover:bg-slate-800 hover:text-white transition-colors cursor-pointer">
            <Settings size={18} />
            Configuration
          </div>
        </Link>
      </div>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-2">
          <Avatar className="h-8 w-8 border border-slate-700">
            <AvatarImage src={user.avatar} />
            <AvatarFallback>{user.name[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate">{user.role}</p>
          </div>
          <LogOut size={16} className="text-slate-500 hover:text-white cursor-pointer" onClick={logout} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 fixed inset-y-0 left-0 z-50">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 border-r-slate-800 bg-slate-900">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 flex flex-col min-h-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="relative hidden md:block w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <Input 
                placeholder="Search reports, associates, or keywords..." 
                className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-700 relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full border-2 border-white"></span>
            </Button>
            <div className="h-8 w-px bg-slate-200 mx-1"></div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <span>Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Export Data</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem>Export as PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}