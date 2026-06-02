import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Lock, User, Users, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PRIVILEGED_USERNAMES = new Set(["admin", "vijay"]);

const quickLoginUsers = [
  { username: "admin", name: "Admin", avatar: "" },
  { username: "vijay", name: "Vijay Togaru", avatar: "" },
  { username: "bharat", name: "Bharat", avatar: "" },
  { username: "narender", name: "Narender", avatar: "" },
  { username: "upender", name: "Upender", avatar: "" },
  { username: "avinash", name: "Avinash", avatar: "" },
  { username: "prashanth", name: "Prashanth", avatar: "" },
  { username: "anosh", name: "Anosh", avatar: "" },
];

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const [privUsername, setPrivUsername] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const privUser = privUsername ? quickLoginUsers.find(u => u.username === privUsername) : null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!username || !password) {
      setError("Please enter both username and password");
      setLoading(false);
      return;
    }

    try {
      const success = await login(username, password);
      if (!success) {
        setError("Invalid credentials. Please check your username and password.");
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (selectedUsername: string) => {
    if (PRIVILEGED_USERNAMES.has(selectedUsername)) {
      setAdminError("");
      setAdminPassword("");
      setPrivUsername(selectedUsername);
      return;
    }

    setError("");
    setLoading(true);
    try {
      const success = await login(selectedUsername, "password123");
      if (!success) {
        setError("Quick login failed. Please try manual login.");
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError("");

    if (!privUsername) return;
    if (!adminPassword) {
      setAdminError("Please enter the password.");
      return;
    }

    setAdminLoading(true);
    try {
      const success = await login(privUsername, adminPassword);
      if (success) {
        setPrivUsername(null);
        setAdminPassword("");
      } else {
        setAdminError("Invalid password.");
      }
    } catch (err) {
      setAdminError("Login failed. Please try again.");
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900">AuditGuard</h2>
          <p className="mt-2 text-slate-600">Secure Audit Management Portal</p>
        </div>

        {/* Quick Login Section */}
        <Card className="border-t-4 border-t-green-600 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Quick Login
            </CardTitle>
            <CardDescription>Click on a user to sign in instantly. Admin and Vijay Togaru require a password.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {quickLoginUsers.map((user) => {
                const isPrivileged = PRIVILEGED_USERNAMES.has(user.username);
                return (
                  <Button
                    key={user.username}
                    variant="outline"
                    className="h-auto py-3 flex flex-col items-center gap-2 hover:bg-slate-50 hover:border-blue-400 relative"
                    onClick={() => handleQuickLogin(user.username)}
                    disabled={loading}
                    data-testid={`quick-login-${user.username}`}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback>{user.name[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{user.name}</span>
                    {isPrivileged && (
                      <span className="absolute top-1.5 right-1.5 text-blue-600">
                        <ShieldCheck className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Manual Login Section */}
        <Card className="border-t-4 border-t-blue-600 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Manual Sign In</CardTitle>
            <CardDescription>Or enter your credentials manually</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="username"
                    placeholder="e.g., bharat, narender, admin"
                    className="pl-9"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    data-testid="input-username"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password"
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    data-testid="input-password"
                  />
                </div>
                <p className="text-xs text-slate-500">Associates: "password123". Admin default: "password@123" (must be changed on first login).</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-signin">
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <Dialog open={!!privUsername} onOpenChange={(open) => {
        if (!open) {
          setPrivUsername(null);
          setAdminPassword("");
          setAdminError("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <div className="mx-auto h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center mb-2">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <DialogTitle className="text-center">{privUser?.name ?? "Privileged"} password required</DialogTitle>
            <DialogDescription className="text-center">
              Enter the password for <strong>{privUser?.name ?? privUsername}</strong> to continue. Default is <code className="font-mono">password@123</code> on first login.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdminSubmit} className="space-y-4">
            {adminError && (
              <Alert variant="destructive">
                <AlertDescription>{adminError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                autoFocus
                data-testid="input-admin-password"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPrivUsername(null)}
                disabled={adminLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={adminLoading} data-testid="button-admin-signin">
                {adminLoading ? "Signing in..." : "Sign In"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
