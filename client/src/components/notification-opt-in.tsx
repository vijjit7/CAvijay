import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  getPushState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from "@/lib/push";

/**
 * "Enable notifications" control for associates. Lets an associate subscribe this
 * device to Web Push so they're alerted when new work is auto-allocated to their
 * intray. Renders nothing when push is unsupported or not configured on the server.
 */
export function NotificationOptIn() {
  const { toast } = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  // Hide entirely when the feature can't work here (unsupported browser or no
  // server-side VAPID keys) — nothing actionable for the user.
  if (state === null || state === "unsupported" || state === "disabled") return null;

  const enable = async () => {
    setBusy(true);
    const result = await subscribeToPush();
    setBusy(false);
    if (result.ok) {
      setState("subscribed");
      toast({ title: "Notifications on", description: "You'll be alerted about new work allocations." });
    } else {
      toast({ title: "Couldn't enable notifications", description: result.error, variant: "destructive" });
      setState(await getPushState());
    }
  };

  const disable = async () => {
    setBusy(true);
    await unsubscribeFromPush();
    setBusy(false);
    setState("default");
    toast({ title: "Notifications off", description: "You won't receive new-work alerts on this device." });
  };

  if (state === "denied") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <BellOff className="h-4 w-4" />
        Notifications are blocked. Enable them for this site in your browser settings to get new-work alerts.
      </div>
    );
  }

  if (state === "subscribed") {
    return (
      <Button variant="outline" size="sm" onClick={disable} disabled={busy} data-testid="button-disable-notifications">
        <BellRing className="h-4 w-4 mr-2" />
        Notifications on
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={enable} disabled={busy} data-testid="button-enable-notifications">
      <Bell className="h-4 w-4 mr-2" />
      {busy ? "Enabling…" : "Enable notifications"}
    </Button>
  );
}
