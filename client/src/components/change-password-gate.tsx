import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock } from "lucide-react";

export function ChangePasswordGate() {
  const { user, changePassword } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = !!user?.mustChangePassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword === "password@123") {
      setError("Choose a password different from the default.");
      return;
    }

    setSubmitting(true);
    const result = await changePassword("password@123", newPassword);
    setSubmitting(false);

    if (!result.success) {
      setError(result.error || "Failed to change password.");
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="[&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center mb-2">
            <Lock className="h-5 w-5 text-white" />
          </div>
          <DialogTitle className="text-center">Set a new admin password</DialogTitle>
          <DialogDescription className="text-center">
            You're signed in with the default password. Pick a new password to continue.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
              data-testid="input-new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              data-testid="input-confirm-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting} data-testid="button-set-password">
            {submitting ? "Saving..." : "Set new password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
