import { Event } from "@/lib/mock-data";
import { Calendar, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface EventCardProps {
  event: Event;
}

export default function EventCard({ event }: EventCardProps) {
  const [isSaved, setIsSaved] = useState(false);

  return (
    <Card className="overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300 group bg-card">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={event.image}
          alt={event.title}
          className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute top-3 right-3">
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 rounded-full bg-white/90 backdrop-blur-sm shadow-sm hover:bg-white"
            onClick={(e) => {
              e.preventDefault();
              setIsSaved(!isSaved);
            }}
          >
            <Heart
              size={16}
              className={cn(
                "transition-colors",
                isSaved ? "fill-primary text-primary" : "text-muted-foreground"
              )}
            />
          </Button>
        </div>
        <div className="absolute top-3 left-3">
            <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-foreground font-medium shadow-sm hover:bg-white/100">
                {event.type}
            </Badge>
        </div>
      </div>
      
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-start">
          <h3 className="font-serif text-xl font-bold leading-tight text-foreground line-clamp-2">
            {event.title}
          </h3>
          <div className="text-lg font-bold text-primary shrink-0 ml-3">
            {event.price === 0 ? "Free" : `$${event.price}`}
          </div>
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-primary/70" />
            <span>{event.date} • {event.time}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-primary/70" />
            <span className="truncate">{event.location}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users size={14} className="text-primary/70" />
            <span>{event.attendees} going</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}