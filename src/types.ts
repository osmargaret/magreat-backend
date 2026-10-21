export interface FoodItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  tag?: string;
  image: string;
  rating: string;
  time: string;
  status: 'Available' | 'Sold out';
  ordersCount: number;
  createdAt: string;
}

export interface OrderItem {
  foodId: number;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export type PaymentMethod = 'card' | 'transfer' | 'ussd' | 'cash_on_delivery';
export type PaymentStatus = 'pending' | 'paid' | 'failed';
export type OrderStatus = 'New' | 'Preparing' | 'Ready' | 'Delivered' | 'Cancelled';

export interface Order {
  id: string; // e.g. MGT-1049
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  city: string;
  deliveryNotes?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference?: string;
  status: OrderStatus;
  estimatedDeliveryTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BlogPost {
  id: number;
  slug: string;
  title: string;
  category: string;
  status: 'Published' | 'Draft';
  date: string;
  readTime: string;
  views: number;
  coverImage: string;
  excerpt: string;
  content: string;
  author: string;
  authorRole: string;
  authorAvatar: string;
  tags: string[];
  relatedFoodIds?: number[];
}

export interface CateringEnquiry {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  eventType: string; // Wedding, Birthday, Corporate, Institutional, etc.
  eventDate: string;
  guestCount: number;
  location: string;
  budget?: string;
  dietaryRequirements?: string;
  notes?: string;
  status: 'Pending' | 'Quote sent' | 'Confirmed' | 'Declined';
  createdAt: string;
}

export interface MealPlanPackage {
  id: string;
  name: string;
  meals: string;
  price: number;
  description: string;
  features: string[];
  color: string;
}

export interface MealPlanOrder {
  id: string;
  planId: string;
  planName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  city: string;
  frequency: 'Weekly' | 'Bi-weekly' | 'Monthly';
  total: number;
  status: 'Active' | 'Pending' | 'Completed';
  createdAt: string;
}

export interface CustomerMessage {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  body: string;
  time: string;
  unread: boolean;
  createdAt: string;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  subscribedAt: string;
}

export interface SavedMealItem {
  foodId: number;
  name: string;
  price: number;
  image: string;
  category: string;
  savedAt: string;
}

export interface CustomerSavedMeals {
  id: string; // e.g. SM-101
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: SavedMealItem[];
  reminderStatus: 'Active' | 'Unsubscribed';
  lastReminderSentAt?: string;
  reminderCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDiscount {
  id: string;
  customerEmail?: string;
  customerName?: string;
  companyName?: string;
  type: 'percent' | 'fixed';
  value: number; // e.g. 15 for 15%, 5000 for 5000 NGN
  code: string; // e.g. NORTHSTAR-15, VIP-ADAEZE
  appliesTo: 'individual' | 'company' | 'all';
  notes?: string;
  active: boolean;
  createdAt: string;
}
