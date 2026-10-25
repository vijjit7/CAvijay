import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startAlarm, stopAlarm, resumeAlarmAudio } from "@/lib/alarm";

/**
 * Full-screen "new work allocated" alarm. When triggered it rings a looping tone +
 * vibration (see lib/alarm) and shows a blocking overlay that keeps going until the
 * associate taps "Silence".
 *
 * It fires on two paths:
 *   1. The app is open when a push arrives — the service worker postMessages us.
 *   2. The app was just opened by tapping the notification — the SW adds ?alarm=1.
 */
export function NewWorkAlarm() {
  const [alarming, setAlarming] = useState(false);
  const [body, setBody] = useState("A new case is in your intray.");

  const trigger = (text?: string) => {
    if (text) setBody(text);
    setAlarming(true);
  };

  const silence = () => {
    setAlarming(false);
    stopAlarm();
  };

  // Ring whenever the overlay is up.
  useEffect(() => {
    if (alarming) void startAlarm();
  }, [alarming]);

  // If autoplay blocked the tone, resume it on the first touch anywhere.
  useEffect(() => {
    if (!alarming) return;
    const onGesture = () => resumeAlarmAudio();
    window.addEventListener("pointerdown", onGesture);
    return () => window.removeEventListener("pointerdown", onGesture);
  }, [alarming]);

  // Path 1: a push arrived while the app is open.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "new-work") trigger(e.data?.body);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  // Path 2: opened from the notification (?alarm=1). Consume the flag so a later
  // refresh doesn't re-trigger the alarm.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("alarm") !== "1") return;
    trigger();
    params.delete("alarm");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  if (!alarming) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-blue-700 p-6 text-center text-white"
      role="alertdialog"
      aria-live="assertive"
      data-testid="new-work-alarm"
    >
      <BellRing className="h-20 w-20 animate-bounce" />
      <div>
        <h2 className="text-3xl font-bold">New work allocated</h2>
        <p className="mt-3 max-w-sm whitespace-pre-line text-blue-100">{body}</p>
      </div>
      <Button
        size="lg"
        variant="secondary"
        className="min-w-52 py-6 text-lg font-semibold"
        onClick={silence}
        data-testid="button-silence-alarm"
      >
        Silence alarm
      </Button>
      <p className="text-xs text-blue-200">Tap to stop the alarm and view your intray.</p>
    </div>
  );
}
