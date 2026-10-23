import { useEffect, useState } from "react";
import { Download, Share, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Chrome's install prompt event — not in the standard DOM lib types, so declare the
// minimal shape we use.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag on navigator.
    (window.navigator as any).standalone === true
  );
}

/**
 * Nudges associates to install the PWA to their home screen. On Android/Chrome this is
 * the single biggest reliability win for background push: an installed PWA keeps
 * receiving "new work" notifications when the app is closed, whereas a plain browser
 * tab is routinely killed by the OS. Renders nothing once installed.
 */
export function InstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    if (installed) return;

    const onPrompt = (e: Event) => {
      // Stop Chrome's default mini-infobar; we drive the prompt from our button.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [installed]);

  if (installed) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    // A prompt can only be used once; drop it either way.
    setDeferred(null);
  };

  // When Chrome has offered the install prompt, show a one-tap Install button.
  if (deferred) {
    return (
      <Button variant="default" size="sm" onClick={install} data-testid="button-install-app">
        <Download className="h-4 w-4 mr-2" />
        Install app
      </Button>
    );
  }

  // Otherwise (prompt not yet available, already dismissed, or iOS which never fires it)
  // fall back to manual instructions so there's always a path to install.
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-install-help">
          <Download className="h-4 w-4 mr-2" />
          Install app
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" align="end">
        <p className="mb-2 font-medium">Install for reliable alerts</p>
        <p className="mb-2 text-muted-foreground">
          Installing keeps new-work notifications arriving even when the app is closed.
        </p>
        <div className="mb-2 flex items-start gap-2">
          <Share className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            <strong>Android (Chrome):</strong> tap the ⋮ menu → <em>Add to Home screen</em> /{" "}
            <em>Install app</em>.
          </span>
        </div>
        <div className="mb-2 flex items-start gap-2">
          <Share className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            <strong>iPhone (Safari):</strong> tap the Share button → <em>Add to Home Screen</em>,
            then open the app from its icon.
          </span>
        </div>
        <div className="flex items-start gap-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            On Xiaomi/Redmi, Realme, Oppo, Vivo &amp; Samsung also turn <strong>off battery
            optimization</strong> and enable <strong>Autostart</strong> for the app, or the phone
            stops background alerts.
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
