import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  FoodItem,
  Order,
  BlogPost,
  CateringEnquiry,
  MealPlanOrder,
  CustomerMessage,
  NewsletterSubscriber,
  OrderStatus,
  CustomerSavedMeals,
  SavedMealItem
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonFile<T>(filename: string, defaultData: T): T {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`Error reading ${filename}, recreating with default data`, err);
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }
}

function writeJsonFile<T>(filename: string, data: T): void {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Initial default seeds
const defaultFoods: FoodItem[] = [
  {
    id: 1,
    name: 'Smoky Party Jollof & Grilled Chicken',
    description: 'Firewood-infused party jollof rice, seasoned grilled chicken, sweet fried dodo plantain & creamy coleslaw',
    price: 6500,
    category: 'Nigerian',
    tag: 'Bestseller',
    image: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=900&q=85',
    rating: '4.9',
    time: '25–35 min',
    status: 'Available',
    ordersCount: 142,
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    name: 'Authentic Ghanaian Waakye Bowl',
    description: 'Traditional rice and beans cooked with sorghum leaves, served with spicy shito, boiled egg, spaghetti and wele',
    price: 5800,
    category: 'Ghanaian',
    tag: 'Popular',
    image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=85',
    rating: '4.8',
    time: '30–40 min',
    status: 'Available',
    ordersCount: 89,
    createdAt: new Date().toISOString()
  },
  {
    id: 3,
    name: 'Creamy Herb Chicken Alfredo Pasta',
    description: 'Fettuccine tossed in rich garlic parmesan cream sauce, topped with marinated grilled chicken breast & herb drizzle',
    price: 7200,
    category: 'Continental',
    tag: 'Chef Choice',
    image: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=85',
    rating: '4.7',
    time: '20–30 min',
    status: 'Available',
    ordersCount: 76,
    createdAt: new Date().toISOString()
  },
  {
    id: 4,
    name: 'Royal English Breakfast Platter',
    description: 'Two sunny-side eggs, gourmet beef sausages, crispy bacon, baked beans, sautéed mushrooms, grilled tomatoes & buttered toast',
    price: 8000,
    category: 'Breakfast',
    image: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=900&q=85',
    rating: '4.9',
    time: '20–30 min',
    status: 'Available',
    ordersCount: 64,
    createdAt: new Date().toISOString()
  },
  {
    id: 5,
    name: 'Wok Special Stir-fry Rice & Chilli Chicken',
    description: 'Jasmine rice stir-fried with farm fresh veggies, sweet & spicy glazed shredded chicken and sesame seed crunch',
    price: 6900,
    category: 'Asian',
    image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=900&q=85',
    rating: '4.6',
    time: '25–35 min',
    status: 'Available',
    ordersCount: 58,
    createdAt: new Date().toISOString()
  },
  {
    id: 6,
    name: 'Heritage Ofada Rice & Designer Ayamase',
    description: 'Steamed local unpolished ofada rice wrapped in banana leaves with hot bleached palm oil pepper sauce, boiled egg & assorted meat',
    price: 6200,
    category: 'Nigerian',
    tag: 'Local favourite',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85',
    rating: '4.8',
    time: '30–40 min',
    status: 'Available',
    ordersCount: 115,
    createdAt: new Date().toISOString()
  },
  {
    id: 7,
    name: 'Rich Egusi Soup with Goat Meat & Pounded Yam',
    description: 'Stone-ground melon seeds cooked with bitterleaf, smoked fish, tender goat meat cuts, served with velvety pounded yam',
    price: 7500,
    category: 'Nigerian',
    tag: 'Bestseller',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85',
    rating: '4.9',
    time: '35–45 min',
    status: 'Available',
    ordersCount: 130,
    createdAt: new Date().toISOString()
  },
  {
    id: 8,
    name: 'Spicy Peppered Asun & Yam Chips',
    description: 'Slow-charred goat meat diced and tossed in fiery Scotch bonnet relish, accompanied by golden crispy yam fries',
    price: 6800,
    category: 'Nigerian',
    tag: 'Night Delight',
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=85',
    rating: '4.9',
    time: '25–35 min',
    status: 'Available',
    ordersCount: 92,
    createdAt: new Date().toISOString()
  }
];

const defaultOrders: Order[] = [
  {
    id: 'MGT-1048',
    customerName: 'Adaeze Okafor',
    customerEmail: 'adaeze.okafor@example.com',
    customerPhone: '+234 803 456 7891',
    deliveryAddress: 'Block 4, Flat 12, Parkview Estate, Ikoyi',
    city: 'Lagos, Nigeria',
    deliveryNotes: 'Please ring bell twice upon arrival',
    items: [
      {
        foodId: 1,
        name: 'Smoky Party Jollof & Grilled Chicken',
        price: 6500,
        quantity: 2,
        image: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=900&q=85'
      },
      {
        foodId: 8,
        name: 'Spicy Peppered Asun & Yam Chips',
        price: 6800,
        quantity: 1,
        image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=85'
      }
    ],
    subtotal: 19800,
    deliveryFee: 2000,
    total: 21800,
    paymentMethod: 'card',
    paymentStatus: 'paid',
    paymentReference: 'PAY-CARD-99128',
    status: 'New',
    estimatedDeliveryTime: '35–45 min',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString()
  },
  {
    id: 'MGT-1047',
    customerName: 'David Akinola',
    customerEmail: 'd.akinola@northstar.ng',
    customerPhone: '+234 806 912 3345',
    deliveryAddress: '15 Bishop Aboyade Cole St, Victoria Island',
    city: 'Lagos, Nigeria',
    deliveryNotes: 'Drop with 4th floor reception desk',
    items: [
      {
        foodId: 1,
        name: 'Smoky Party Jollof & Grilled Chicken',
        price: 6500,
        quantity: 5,
        image: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=900&q=85'
      },
      {
        foodId: 3,
        name: 'Creamy Herb Chicken Alfredo Pasta',
        price: 7200,
        quantity: 3,
        image: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=900&q=85'
      }
    ],
    subtotal: 54100,
    deliveryFee: 2500,
    total: 56600,
    paymentMethod: 'transfer',
    paymentStatus: 'paid',
    paymentReference: 'TRF-WEMA-78234',
    status: 'Preparing',
    estimatedDeliveryTime: '20–30 min',
    createdAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString()
  },
  {
    id: 'MGT-1046',
    customerName: 'Zainab Bello',
    customerEmail: 'zainab.bello@gmail.com',
    customerPhone: '+234 812 345 6780',
    deliveryAddress: 'Plot 1204, Garki II, Area 11',
    city: 'Abuja, Nigeria',
    items: [
      {
        foodId: 7,
        name: 'Rich Egusi Soup with Goat Meat & Pounded Yam',
        price: 7500,
        quantity: 2,
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85'
      }
    ],
    subtotal: 15000,
    deliveryFee: 1500,
    total: 16500,
    paymentMethod: 'card',
    paymentStatus: 'paid',
    paymentReference: 'PAY-CARD-44182',
    status: 'Ready',
    estimatedDeliveryTime: '10–15 min',
    createdAt: new Date(Date.now() - 80 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString()
  },
  {
    id: 'MGT-1045',
    customerName: 'Chika Nwosu',
    customerEmail: 'chika.nwosu@outlook.com',
    customerPhone: '+234 705 678 1234',
    deliveryAddress: '24 Admiralty Way, Lekki Phase 1',
    city: 'Lagos, Nigeria',
    items: [
      {
        foodId: 6,
        name: 'Heritage Ofada Rice & Designer Ayamase',
        price: 6200,
        quantity: 2,
        image: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85'
      }
    ],
    subtotal: 12400,
    deliveryFee: 1800,
    total: 14200,
    paymentMethod: 'ussd',
    paymentStatus: 'paid',
    paymentReference: 'USSD-GTB-8912',
    status: 'Delivered',
    estimatedDeliveryTime: 'Completed',
    createdAt: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString()
  }
];

const defaultBlogs: BlogPost[] = [
  {
    id: 1,
    slug: 'the-art-of-smoky-party-jollof',
    title: 'The Secret Behind Authentic Smoky Nigerian Party Jollof',
    category: 'Culinary Secrets',
    status: 'Published',
    date: 'Oct 18, 2026',
    readTime: '4 min read',
    views: 542,
    coverImage: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=1200&q=85',
    excerpt: 'Discover why firewood, bay leaf infusion, and cast-iron bottom charring create that unforgettable Nigerian wedding party flavour.',
    content: `
# The Soul of West African Celebrations

No Nigerian party is complete without that unmistakably fragrant, crimson mound of party jollof. The question food lovers have asked for decades: *How does one achieve that deep, woodsmoke aroma without an open outdoor firewood fire?*

### 1. The Tomato-Pepper Reduction (The Base)
The bedrock of great jollof is the blend: tatashey (red bell peppers) for vibrant hue, rodo (scotch bonnets) for kick, sweet plum tomatoes, garlic, ginger, and abundant red onions. The sauce must be parboiled and thoroughly fried in vegetable oil until the acidity gives way to a sweet, savory richness.

### 2. High-Grade Long-Grain Rice & Rich Stock
We simmer our rice in concentrated stock brewed from seasoned beef cuts, goat meat, thyme, bay leaves, curry powder, and white pepper. The grains absorb the depth of the stock before steaming in the tomato-pepper reduction.

### 3. The Controlled Char Technique
To capture that iconic party smokiness indoors, we cover the pot with heavy foil to seal the steam, allowing the bottom layer to gently scorch during the final 12 minutes of cooking. The rising smoke perfumes each individual grain of rice with that irresistible celebratory charm.

At **Ma’Great Taste**, every batch is prepared with this unwavering attention to tradition. Next time you order our Smoky Party Jollof, notice that subtle aroma—it's pure culinary artistry.
    `,
    author: 'Chef Margaret Samuel',
    authorRole: 'Founder & Head Chef',
    authorAvatar: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=200&q=85',
    tags: ['Jollof Rice', 'Nigerian Food', 'Culinary Secrets', 'Party Food'],
    relatedFoodIds: [1, 6]
  },
  {
    id: 2,
    slug: 'how-to-plan-stress-free-event-catering',
    title: 'The Ultimate Guide to Stress-Free Event Catering in Nigeria',
    category: 'Event Planning',
    status: 'Published',
    date: 'Oct 14, 2026',
    readTime: '6 min read',
    views: 389,
    coverImage: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=85',
    excerpt: 'Whether hosting 50 or 500 guests, here is how to calculate portion sizes, satisfy diverse palates, and ensure piping-hot service.',
    content: `
# Food is the Heartbeat of Your Event

When guests leave your wedding reception, birthday gala, or corporate symposium, the one thing they will debate for weeks is the food. Planning catering shouldn't feel like a high-wire act.

### Rule 1: The Golden Ratio of Swallow vs. Rice
In urban Nigerian celebrations, the crowd usually splits:
- 55% gravitate towards Rice dishes (Smoky Jollof, Fried Rice, Ofada Rice)
- 30% choose Soups & Swallows (Egusi, Edikang Ikong, Afang with Pounded Yam or Semo)
- 15% prefer lighter continental or grilled protein platters

Always allow for a 10% buffer so late arrivals receive the exact same generous portions as the first table served.

### Rule 2: Live Finger Food Stations (Small Chops)
Keep hunger at bay while the formal proceedings or photos take place. Spicy puff puff, spring rolls, samosas, and tender peppered gizzards buy your event schedule valuable breathing room.

### Rule 3: Professional Chafing and Temperature Control
Lukewarm jollof loses its magic. Ensure your caterer uses heavy-duty food warmers with calibrated fuel burners, and pre-heats dishes to preserve texture and aroma.

*Planning an upcoming milestone? Speak with the Ma’Great Taste events concierge today for customized tasting sessions and bespoke menus!*
    `,
    author: 'Margaret Samuel',
    authorRole: 'Founder & Head Chef',
    authorAvatar: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=200&q=85',
    tags: ['Catering', 'Event Tips', 'Weddings', 'Parties'],
    relatedFoodIds: [1, 7, 8]
  },
  {
    id: 3,
    slug: 'five-nigerian-meals-that-freeze-and-reheat-beautifully',
    title: 'Five Wholesome Nigerian Meals That Freeze and Reheat Like Magic',
    category: 'Meal Prep',
    status: 'Published',
    date: 'Oct 09, 2026',
    readTime: '5 min read',
    views: 421,
    coverImage: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1200&q=85',
    excerpt: 'Save hours in the kitchen without sacrificing fresh home-cooked flavor with our freezer-stocking tips and favorite freezer-friendly dishes.',
    content: `
# Busy Professionals, Meet Peace of Mind

Between commuting in traffic and demanding work hours, standing by a stove for three hours every evening simply isn't realistic. The solution isn't mediocre fast food—it's smart batch freezing.

Here are the top five Nigerian dishes that preserve their taste, nutrients, and texture when frozen:

1. **Thick Egusi & Ogbono Soups**: Because of the high oil and seed content, egusi freezes exceptionally well for up to 3 months. When reheated over low heat with a splash of water, it returns to freshly made glory.
2. **Designer Ayamase / Ofada Sauce**: Bleached palm oil sauces actually develop deeper flavor as they mature!
3. **Pepper Soup Bases (Catfish, Goat Meat, Chicken)**: Store in airtight glass or freezer-safe tubs. Defrost overnight in the fridge and simmer for 5 minutes.
4. **Smoky Party Jollof & Fried Rice**: Cool completely before portioning. Reheat with a wet paper towel over the bowl to re-hydrate the grains.
5. **Slow-Cooked Stews (Obe Ata)**: Your multi-purpose savior for rice, boiled yam, plantain, and pasta.

Check out our **Ma’Great Taste Freezer Stocking Plans** to have your freezer loaded with portion-controlled packages ready whenever hunger strikes!
    `,
    author: 'Tomi Adeyemi',
    authorRole: 'Nutrition & Meal Prep Lead',
    authorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=85',
    tags: ['Meal Prep', 'Freezer Stocking', 'Busy Life', 'Healthy Eating'],
    relatedFoodIds: [6, 7]
  }
];

const defaultCatering: CateringEnquiry[] = [
  {
    id: 'CAT-201',
    customerName: 'Nneka Eze',
    customerEmail: 'nneka.eze@gmail.com',
    customerPhone: '+234 802 334 5567',
    eventType: 'Birthday Dinner',
    eventDate: '2026-11-08',
    guestCount: 60,
    location: 'Lekki Phase 1, Lagos',
    budget: '₦600,000 - ₦800,000',
    dietaryRequirements: 'Halal options required, 5 vegetarians',
    notes: 'Looking for a plated 3-course dinner with jollof, grilled fish and continental dessert.',
    status: 'Quote sent',
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
  },
  {
    id: 'CAT-202',
    customerName: 'Kelechi Opara (Northstar Ltd)',
    customerEmail: 'kelechi@northstar.ng',
    customerPhone: '+234 803 777 9901',
    eventType: 'Corporate Lunch Subscription',
    eventDate: '2026-11-02',
    guestCount: 25,
    location: 'Victoria Island, Lagos',
    budget: '₦450,000 / week',
    notes: 'Daily boxed lunches for engineering team Monday to Friday.',
    status: 'Pending',
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString()
  },
  {
    id: 'CAT-203',
    customerName: 'Olu & Tobi Adeleke',
    customerEmail: 'olu.tobi2026@gmail.com',
    customerPhone: '+234 818 901 2345',
    eventType: 'Wedding Reception',
    eventDate: '2026-12-12',
    guestCount: 180,
    location: 'Ikeja GRA, Lagos',
    budget: '₦1,800,000 - ₦2,200,000',
    notes: 'Full buffet spread: Nigerian traditional swallows, party jollof, small chops and cocktail bar.',
    status: 'Confirmed',
    createdAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString()
  }
];

const defaultMessages: CustomerMessage[] = [
  {
    id: 'MSG-301',
    name: 'Nneka Eze',
    email: 'nneka.eze@gmail.com',
    phone: '+234 802 334 5567',
    subject: 'Catering for a 60-person birthday',
    body: 'Hello, please can I get a quote for a birthday dinner for 60 guests in Lekki on November 8? Would love tasting beforehand.',
    time: '12 min ago',
    unread: true,
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString()
  },
  {
    id: 'MSG-302',
    name: 'Kelechi from Northstar Ltd',
    email: 'kelechi@northstar.ng',
    phone: '+234 803 777 9901',
    subject: 'Corporate lunch subscription',
    body: 'We are interested in lunch delivery for our team of 25, Monday to Friday. Can we schedule a quick call?',
    time: '38 min ago',
    unread: true,
    createdAt: new Date(Date.now() - 38 * 60 * 1000).toISOString()
  },
  {
    id: 'MSG-303',
    name: 'Tomi Adeyemi',
    email: 'tomi.adeyemi@yahoo.com',
    subject: 'Question about freezer meal plans',
    body: 'Can I mix different soups and swallows in the monthly package? Specifically Egusi and Afang?',
    time: '1 hr ago',
    unread: true,
    createdAt: new Date(Date.now() - 65 * 60 * 1000).toISOString()
  },
  {
    id: 'MSG-304',
    name: 'Aisha Bello',
    email: 'aisha.bello@gmail.com',
    subject: 'Delivery feedback',
    body: 'The food was lovely! Arrived hot and nicely packaged. Please add more spicy sauce options to the checkout!',
    time: 'Yesterday',
    unread: false,
    createdAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString()
  }
];

const defaultSavedMeals: CustomerSavedMeals[] = [
  {
    id: 'SM-101',
    customerName: 'Sarah Adeleke',
    customerEmail: 'sarah.adeleke@gmail.com',
    customerPhone: '0803 456 7890',
    items: [
      {
        foodId: 1,
        name: 'Smoky Party Jollof & Grilled Chicken',
        price: 6500,
        image: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=900&q=85',
        category: 'Nigerian',
        savedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString()
      },
      {
        foodId: 4,
        name: 'Designer Ayamase (Special Ofada Pepper Stew)',
        price: 7800,
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85',
        category: 'Nigerian',
        savedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString()
      }
    ],
    reminderStatus: 'Active',
    reminderCount: 1,
    lastReminderSentAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString()
  },
  {
    id: 'SM-102',
    customerName: 'Kelechi Nwosu',
    customerEmail: 'kelechi.nwosu@yahoo.com',
    customerPhone: '0812 345 6789',
    items: [
      {
        foodId: 7,
        name: 'Rich Egusi Soup with Goat Meat & Pounded Yam',
        price: 7500,
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85',
        category: 'Nigerian',
        savedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString()
      }
    ],
    reminderStatus: 'Active',
    reminderCount: 0,
    createdAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString()
  }
];

export const storage = {
  // Foods
  getFoods(): FoodItem[] {
    return readJsonFile<FoodItem[]>('foods.json', defaultFoods);
  },
  saveFoods(foods: FoodItem[]): void {
    writeJsonFile('foods.json', foods);
  },
  addFood(food: Omit<FoodItem, 'id' | 'ordersCount' | 'createdAt'>): FoodItem {
    const list = this.getFoods();
    const newId = list.length > 0 ? Math.max(...list.map(f => f.id)) + 1 : 1;
    const newItem: FoodItem = {
      ...food,
      id: newId,
      ordersCount: 0,
      createdAt: new Date().toISOString()
    };
    list.unshift(newItem);
    this.saveFoods(list);
    return newItem;
  },
  updateFood(id: number, updates: Partial<FoodItem>): FoodItem | null {
    const list = this.getFoods();
    const index = list.findIndex(f => f.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...updates };
    this.saveFoods(list);
    return list[index];
  },
  deleteFood(id: number): boolean {
    const list = this.getFoods();
    const filtered = list.filter(f => f.id !== id);
    if (filtered.length === list.length) return false;
    this.saveFoods(filtered);
    return true;
  },

  // Orders
  getOrders(): Order[] {
    return readJsonFile<Order[]>('orders.json', defaultOrders);
  },
  saveOrders(orders: Order[]): void {
    writeJsonFile('orders.json', orders);
  },
  getOrderById(id: string): Order | null {
    const orders = this.getOrders();
    return orders.find(o => o.id.toLowerCase() === id.toLowerCase()) || null;
  },
  createOrder(data: Omit<Order, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { id?: string }): Order {
    const orders = this.getOrders();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newOrder: Order = {
      ...data,
      id: data.id || `MGT-${randomSuffix}`,
      status: 'New',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    orders.unshift(newOrder);
    this.saveOrders(orders);

    // Increment orders count on the ordered food items
    const foods = this.getFoods();
    for (const item of newOrder.items) {
      const food = foods.find(f => f.id === item.foodId);
      if (food) {
        food.ordersCount += item.quantity;
      }
    }
    this.saveFoods(foods);

    return newOrder;
  },
  updateOrderStatus(id: string, status: OrderStatus, paymentStatus?: 'pending' | 'paid' | 'failed'): Order | null {
    const orders = this.getOrders();
    const index = orders.findIndex(o => o.id.toLowerCase() === id.toLowerCase());
    if (index === -1) return null;
    orders[index].status = status;
    if (paymentStatus) {
      orders[index].paymentStatus = paymentStatus;
    }
    orders[index].updatedAt = new Date().toISOString();
    this.saveOrders(orders);
    return orders[index];
  },

  // Blogs
  getBlogs(): BlogPost[] {
    return readJsonFile<BlogPost[]>('blogs.json', defaultBlogs);
  },
  saveBlogs(blogs: BlogPost[]): void {
    writeJsonFile('blogs.json', blogs);
  },
  getBlogBySlug(slug: string): BlogPost | null {
    const blogs = this.getBlogs();
    return blogs.find(b => b.slug === slug || String(b.id) === slug) || null;
  },
  addBlog(blog: Omit<BlogPost, 'id' | 'views' | 'date'> & { date?: string }): BlogPost {
    const list = this.getBlogs();
    const newId = list.length > 0 ? Math.max(...list.map(b => b.id)) + 1 : 1;
    const newBlog: BlogPost = {
      ...blog,
      id: newId,
      views: 0,
      date: blog.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };
    list.unshift(newBlog);
    this.saveBlogs(list);
    return newBlog;
  },
  updateBlog(id: number, updates: Partial<BlogPost>): BlogPost | null {
    const list = this.getBlogs();
    const index = list.findIndex(b => b.id === id);
    if (index === -1) return null;
    list[index] = { ...list[index], ...updates };
    this.saveBlogs(list);
    return list[index];
  },
  incrementBlogViews(id: number): void {
    const list = this.getBlogs();
    const blog = list.find(b => b.id === id);
    if (blog) {
      blog.views += 1;
      this.saveBlogs(list);
    }
  },
  deleteBlog(id: number): boolean {
    const list = this.getBlogs();
    const filtered = list.filter(b => b.id !== id);
    if (filtered.length === list.length) return false;
    this.saveBlogs(filtered);
    return true;
  },

  // Catering
  getCatering(): CateringEnquiry[] {
    return readJsonFile<CateringEnquiry[]>('catering.json', defaultCatering);
  },
  saveCatering(items: CateringEnquiry[]): void {
    writeJsonFile('catering.json', items);
  },
  addCatering(data: Omit<CateringEnquiry, 'id' | 'status' | 'createdAt'>): CateringEnquiry {
    const list = this.getCatering();
    const newId = `CAT-${Math.floor(100 + Math.random() * 900)}`;
    const newEnquiry: CateringEnquiry = {
      ...data,
      id: newId,
      status: 'Pending',
      createdAt: new Date().toISOString()
    };
    list.unshift(newEnquiry);
    this.saveCatering(list);
    return newEnquiry;
  },
  updateCateringStatus(id: string, status: CateringEnquiry['status']): CateringEnquiry | null {
    const list = this.getCatering();
    const item = list.find(c => c.id === id);
    if (!item) return null;
    item.status = status;
    this.saveCatering(list);
    return item;
  },

  // Meal Plans
  getMealPlanOrders(): MealPlanOrder[] {
    return readJsonFile<MealPlanOrder[]>('meal_plans.json', []);
  },
  saveMealPlanOrders(items: MealPlanOrder[]): void {
    writeJsonFile('meal_plans.json', items);
  },
  createMealPlanOrder(data: Omit<MealPlanOrder, 'id' | 'status' | 'createdAt'>): MealPlanOrder {
    const list = this.getMealPlanOrders();
    const newOrder: MealPlanOrder = {
      ...data,
      id: `MP-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'Active',
      createdAt: new Date().toISOString()
    };
    list.unshift(newOrder);
    this.saveMealPlanOrders(list);
    return newOrder;
  },

  // Messages
  getMessages(): CustomerMessage[] {
    return readJsonFile<CustomerMessage[]>('messages.json', defaultMessages);
  },
  saveMessages(items: CustomerMessage[]): void {
    writeJsonFile('messages.json', items);
  },
  addMessage(data: Omit<CustomerMessage, 'id' | 'time' | 'unread' | 'createdAt'>): CustomerMessage {
    const list = this.getMessages();
    const newMsg: CustomerMessage = {
      ...data,
      id: `MSG-${Math.floor(100 + Math.random() * 900)}`,
      time: 'Just now',
      unread: true,
      createdAt: new Date().toISOString()
    };
    list.unshift(newMsg);
    this.saveMessages(list);
    return newMsg;
  },
  markMessageRead(id: string): boolean {
    const list = this.getMessages();
    const msg = list.find(m => m.id === id);
    if (!msg) return false;
    msg.unread = false;
    this.saveMessages(list);
    return true;
  },
  markAllMessagesRead(): void {
    const list = this.getMessages();
    for (const msg of list) {
      msg.unread = false;
    }
    this.saveMessages(list);
  },

  // Newsletter
  getSubscribers(): NewsletterSubscriber[] {
    return readJsonFile<NewsletterSubscriber[]>('subscribers.json', []);
  },
  addSubscriber(email: string): boolean {
    const list = this.getSubscribers();
    if (list.some(s => s.email.toLowerCase() === email.toLowerCase())) {
      return false; // Already subscribed
    }
    list.push({
      id: `SUB-${Date.now()}`,
      email: email.toLowerCase().trim(),
      subscribedAt: new Date().toISOString()
    });
    writeJsonFile('subscribers.json', list);
    return true;
  },

  // Dynamic Analytics
  getAnalytics() {
    const orders = this.getOrders();
    const foods = this.getFoods();
    const catering = this.getCatering();
    const messages = this.getMessages();

    const totalRevenue = orders
      .filter(o => o.paymentStatus === 'paid' && o.status !== 'Cancelled')
      .reduce((sum, o) => sum + o.total, 0);

    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'Delivered').length;
    const activeOrders = orders.filter(o => o.status === 'New' || o.status === 'Preparing' || o.status === 'Ready').length;
    const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / (orders.filter(o => o.status !== 'Cancelled').length || 1)) : 0;

    // Top foods
    const topFoods = [...foods].sort((a, b) => b.ordersCount - a.ordersCount).slice(0, 5);

    // Sales by category
    const categoryCounts: Record<string, number> = {};
    for (const order of orders) {
      for (const item of order.items) {
        const found = foods.find(f => f.id === item.foodId);
        const cat = found ? found.category : 'Meals';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + item.quantity;
      }
    }

    return {
      totalRevenue,
      totalOrders,
      completedOrders,
      activeOrders,
      averageOrderValue,
      cateringPending: catering.filter(c => c.status === 'Pending').length,
      unreadMessages: messages.filter(m => m.unread).length,
      topFoods,
      categoryCounts
    };
  },

  // Saved Meals & Reminders
  getSavedMeals(): CustomerSavedMeals[] {
    return readJsonFile<CustomerSavedMeals[]>('saved-meals.json', defaultSavedMeals);
  },
  saveSavedMeals(list: CustomerSavedMeals[]): void {
    writeJsonFile('saved-meals.json', list);
  },
  addOrUpdateCustomerSavedMeals(data: {
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    items: SavedMealItem[];
  }): { record: CustomerSavedMeals; isNew: boolean; reminderPreview: string } {
    const list = this.getSavedMeals();
    const existingIndex = list.findIndex(r => r.customerEmail.toLowerCase() === data.customerEmail.toLowerCase());
    
    const mealNames = data.items.map(i => i.name).join(', ');
    const reminderPreview = `Dear ${data.customerName || 'Food Lover'}, you saved ${mealNames} at Ma’Great Taste. Ready to treat yourself today? We're cooking fresh now!`;

    if (existingIndex >= 0) {
      list[existingIndex] = {
        ...list[existingIndex],
        customerName: data.customerName || list[existingIndex].customerName,
        customerPhone: data.customerPhone || list[existingIndex].customerPhone,
        items: data.items,
        updatedAt: new Date().toISOString()
      };
      this.saveSavedMeals(list);
      return { record: list[existingIndex], isNew: false, reminderPreview };
    } else {
      const newRecord: CustomerSavedMeals = {
        id: `SM-${Math.floor(100 + Math.random() * 900)}`,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        items: data.items,
        reminderStatus: 'Active',
        reminderCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      list.unshift(newRecord);
      this.saveSavedMeals(list);
      return { record: newRecord, isNew: true, reminderPreview };
    }
  },
  sendSavedMealReminder(id: string): { success: boolean; message: string; record?: CustomerSavedMeals; reminderText?: string } {
    const list = this.getSavedMeals();
    const item = list.find(r => r.id === id);
    if (!item) {
      return { success: false, message: 'Saved meal record not found' };
    }
    const mealNames = item.items.map(i => i.name).slice(0, 3).join(', ');
    const dateFormatted = new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const reminderText = `Dear ${item.customerName}, you saved ${mealNames} on ${dateFormatted} at Ma’Great Taste! We have a hot pot on the fire ready for you today. Order now for 25-minute fast delivery.`;
    
    item.lastReminderSentAt = new Date().toISOString();
    item.reminderCount = (item.reminderCount || 0) + 1;
    this.saveSavedMeals(list);

    return {
      success: true,
      message: `Reminder sent to ${item.customerEmail}!`,
      record: item,
      reminderText
    };
  }
};
