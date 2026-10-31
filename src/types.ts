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
  status: 'Available' | 'Sold out' | 'Hidden';
  ordersCount: number;
  createdAt: string;
  availableLocations?: string[]; // Array of delivery location IDs (places in Lagos). If empty/undefined, dish is available everywhere in Lagos.
  hidden?: boolean; // Whether the dish is hidden from the public website
}

export interface OrderItem {
  foodId: number;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export type PaymentMethod = 'paystack' | 'card' | 'transfer' | 'ussd' | 'cash_on_delivery';
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
  discountCode?: string;
  discountAmount?: number;
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
  quoteAmount?: number;
  menuNotes?: string;
  confirmedAt?: string;
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
  reply?: string;
  repliedAt?: string;
  sender?: 'customer' | 'admin';
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  subscribedAt: string;
}

export interface NewsletterCampaign {
  id: string;
  subject: string;
  title: string;
  content: string;
  buttonText?: string;
  buttonUrl?: string;
  recipientCount: number;
  status: 'Sent' | 'Failed' | 'Draft';
  sentAt: string;
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

export interface CateringServicePrice {
  id: string;       // e.g. 'buffet', 'plated', 'cocktail'
  label: string;    // Display label shown on the site
  pricePerGuest: number; // NGN per guest
  description?: string;
}

export interface StoreSettings {
  businessName: string;
  kitchenAddress: string;
  phone: string;
  email: string;
  onlineOrdering: boolean;
  whatsappAlerts: boolean;
  corporateDiscounts: boolean;
  minOrderAmount?: number;
  deliveryFee?: number;
  openingHours?: string;
  cateringServicePrices?: CateringServicePrice[];
  marqueeMessages?: string[];   // Scrolling announcement bar messages
  updatedAt?: string;
}

export interface CustomerAccount {
  id: string;
  name: string;
  email: string;
  phone: string;
  companyName?: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderDate: string;
  segment: 'Corporate' | 'Loyal VIP' | 'Returning' | 'Meal plan' | 'New';
  kitchenNotes?: string;
  discount?: CustomerDiscount;
  createdAt: string;
}

export interface AcademyApplication {
  id: string;
  refNumber: string;
  fullName: string;
  email: string;
  phone: string;
  journey: string;
  schedule: string;
  experience: string;
  notes?: string;
  status: 'Pending Review' | 'Admitted' | 'Contacted' | 'Enrolled' | 'Cancelled';
  appliedAt: string;
}

export type AdminRole = 'super_admin' | 'admin_staff';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  status: 'Active' | 'Suspended';
  createdAt: string;
  lastLoginAt?: string;
  invitedBy?: string;
}

export interface SignatureDish {
  id: string;
  foodId?: number;
  name: string;
  tag: string;
  price?: number;
  description?: string;
  image: string;
  local?: string;
  alt?: string;
  order?: number;
  createdAt: string;
}

export interface TastingRequest {
  id: string;
  companyName: string;
  contactPerson: string;
  contactPhone: string;
  companyEmail: string;
  guestCount: number;
  mealCount: number;
  mealSelections: string;
  location: string;
  preferredDate: string;
  preferredTime: string;
  notes?: string;
  status: 'Pending' | 'Scheduled' | 'Delivered' | 'Declined';
  adminNotes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DeliveryLocation {
  id: string; // e.g. 'lekki-phase-1'
  name: string; // e.g. 'Lekki Phase 1'
  zone: string; // e.g. 'Lagos Island / Eti-Osa' or 'Lagos Mainland'
  state: 'Lagos';
  deliveryFee: number; // e.g. 2000
  estimatedTime: string; // e.g. '20–35 min'
  isActive: boolean;
  createdAt: string;
}

