import BottomNav from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function Saved() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-6 py-8">
        <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Saved Events</h1>
        <p className="text-muted-foreground">Your collection of upcoming food adventures.</p>
      </div>

      <div className="px-4 max-w-md mx-auto flex flex-col items-center justify-center py-12 text-center space-y-4">
        <div className="h-20 w-20 bg-secondary/50 rounded-full flex items-center justify-center mb-2">
            <AlertCircle className="h-10 w-10 text-primary/60" />
        </div>
        <h3 className="text-xl font-bold text-foreground">No saved events yet</h3>
        <p className="text-muted-foreground max-w-[250px]">
          Tap the heart icon on events you like to save them for later.
        </p>
        <Link href="/">
          <Button className="mt-4">Explore Events</Button>
        </Link>
      </div>

      <BottomNav />
    </div>
  );
}