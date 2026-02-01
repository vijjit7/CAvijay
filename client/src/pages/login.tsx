import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Lock, User, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const quickLoginUsers = [
  { username: "admin", name: "Admin", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&q=80" },
  { username: "bharat", name: "Bharat", avatar: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=150&q=80" },
  { username: "narender", name: "Narender", avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80" },
  { username: "upender", name: "Upender", avatar: "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&q=80" },
  { username: "avinash", name: "Avinash", avatar: "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=150&q=80" },
  { username: "prashanth", name: "Prashanth", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&q=80" },
  { username: "anosh", name: "Anosh", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80" },
];

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

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
            <CardDescription>Click on a user to sign in instantly</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {quickLoginUsers.map((user) => (
                <Button
                  key={user.username}
                  variant="outline"
                  className="h-auto py-3 flex flex-col items-center gap-2 hover:bg-slate-50 hover:border-blue-400"
                  onClick={() => handleQuickLogin(user.username)}
                  disabled={loading}
                  data-testid={`quick-login-${user.username}`}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback>{user.name[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{user.name}</span>
                </Button>
              ))}
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
                <p className="text-xs text-slate-500">Hint: use "password123" for demo</p>
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
    </div>
  );
}
