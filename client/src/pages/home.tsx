import { useState } from "react";
import { EVENTS } from "@/lib/mock-data";
import EventCard from "@/components/event-card";
import BottomNav from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal } from "lucide-react";
import heroImage from "@assets/generated_images/cozy_community_cooking_event_with_warm_lighting.png";

export default function Home() {
  const [activeFilter, setActiveFilter] = useState("All");
  const filters = ["All", "Workshop", "Potluck", "Market", "Dinner"];

  const filteredEvents = activeFilter === "All" 
    ? EVENTS 
    : EVENTS.filter(e => e.type === activeFilter);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Hero Section */}
      <div className="relative h-[40vh] w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-black/60 z-10" />
        <img 
          src={heroImage} 
          alt="Community cooking" 
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-0 left-0 right-0 p-6 z-20 text-white">
          <span className="inline-block py-1 px-3 rounded-full bg-primary/90 text-xs font-bold uppercase tracking-wider mb-3 backdrop-blur-sm">
            Welcome Home
          </span>
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-2 leading-tight">
            What's cooking,<br />neighbor?
          </h1>
          <p className="text-white/90 text-lg font-light max-w-md">
            Discover local food events, workshops, and potlucks in your community.
          </p>
        </div>
      </div>

      {/* Search & Filter Section */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="px-4 py-4 space-y-4 max-w-md mx-auto">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input 
                placeholder="Search for sourdough, pasta..." 
                className="pl-9 bg-secondary/50 border-transparent focus:bg-background transition-colors"
              />
            </div>
            <Button variant="outline" size="icon" className="shrink-0 border-border/50 bg-secondary/30">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar mask-gradient-right">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`
                  px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300
                  ${activeFilter === filter 
                    ? "bg-primary text-primary-foreground shadow-md scale-105" 
                    : "bg-secondary/50 text-secondary-foreground hover:bg-secondary hover:text-secondary-foreground"}
                `}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events Feed */}
      <div className="px-4 py-6 max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-2xl font-serif font-bold text-foreground">
            Nearby Events
          </h2>
          <span className="text-sm text-muted-foreground">
            {filteredEvents.length} found
          </span>
        </div>
        
        <div className="grid gap-6">
          {filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}