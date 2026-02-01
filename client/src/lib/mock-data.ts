export interface Event {
  id: string;
  title: string;
  type: 'Workshop' | 'Potluck' | 'Market' | 'Dinner';
  date: string;
  time: string;
  location: string;
  price: number;
  image: string;
  description: string;
  host: string;
  attendees: number;
}

export const EVENTS: Event[] = [
  {
    id: '1',
    title: 'Sourdough for Beginners',
    type: 'Workshop',
    date: 'Sat, Dec 14',
    time: '10:00 AM',
    location: 'Community Center Kitchen',
    price: 15,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80',
    description: 'Learn the ancient art of sourdough bread making. Starter included! Bring your own jar.',
    host: 'Sarah J.',
    attendees: 12
  },
  {
    id: '2',
    title: 'Sunday Neighborhood Potluck',
    type: 'Potluck',
    date: 'Sun, Dec 15',
    time: '1:00 PM',
    location: 'Greenwood Park Pavilion',
    price: 0,
    image: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&q=80',
    description: 'Bring a dish to share! Theme: Comfort Foods. Family friendly event.',
    host: 'Greenwood Neighbors',
    attendees: 34
  },
  {
    id: '3',
    title: 'Winter Farmers Market Tour',
    type: 'Market',
    date: 'Sat, Dec 21',
    time: '9:00 AM',
    location: 'Downtown Market Square',
    price: 5,
    image: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=800&q=80',
    description: 'Guided tour of the best seasonal produce with recipe ideas for winter root vegetables.',
    host: 'Chef Mario',
    attendees: 8
  },
  {
    id: '4',
    title: 'Budget Meal Prep Class',
    type: 'Workshop',
    date: 'Wed, Dec 18',
    time: '6:30 PM',
    location: 'The Open Kitchen',
    price: 10,
    image: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&q=80',
    description: 'Learn to prep 5 meals for under $30. Containers provided.',
    host: 'Elena R.',
    attendees: 20
  },
  {
    id: '5',
    title: 'Italian Family Dinner Night',
    type: 'Dinner',
    date: 'Fri, Dec 20',
    time: '7:00 PM',
    location: 'Maria\'s Home',
    price: 12,
    image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=80',
    description: 'Authentic pasta night. Cost covers ingredients. BYOB.',
    host: 'Maria C.',
    attendees: 6
  }
];