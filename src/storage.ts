import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type {
  FoodItem,
  Order,
  BlogPost,
  CateringEnquiry,
  MealPlanOrder,
  CustomerMessage,
  NewsletterSubscriber,
  NewsletterCampaign,
  OrderStatus,
  CustomerSavedMeals,
  SavedMealItem,
  MealPlanPackage,
  CustomerDiscount,
  StoreSettings,
  CustomerAccount
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ---------------------------------------------------------------------
// Persistence: PostgreSQL (Neon) when DATABASE_URL is set, otherwise local JSON files.
// Data is held in a memory cache (synchronous reads) and written through to the DB.
// ---------------------------------------------------------------------
const DATABASE_URL = (process.env.DATABASE_URL || '').replace(/[?&]channel_binding=[^&]*/g, '');
const pool: pg.Pool | null = DATABASE_URL
  ? new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })
  : null;
const cache = new Map<string, unknown>();
let writeQueue: Promise<void> = Promise.resolve();

if (pool) {
  pool.on('error', err => console.error('[DB] Idle client error:', err.message));
}

export async function initStorage(): Promise<void> {
  if (!pool) {
    console.warn('[DB] DATABASE_URL not set — using local JSON files (data is NOT persistent on Render).');
    return;
  }
  await pool.query(
    `CREATE TABLE IF NOT EXISTS kv_store (
       key TEXT PRIMARY KEY,
       data JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  const { rows } = await pool.query('SELECT key, data FROM kv_store');
  for (const row of rows) cache.set(row.key, row.data);
  console.log(`[DB] Connected to PostgreSQL. Loaded ${rows.length} collection(s).`);
}

function persist(filename: string, data: unknown): void {
  if (!pool) {
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
    return;
  }
  const payload = JSON.stringify(data);
  writeQueue = writeQueue
    .then(() =>
      pool
        .query(
          `INSERT INTO kv_store (key, data, updated_at) VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          [filename, payload]
        )
        .then(() => undefined)
    )
    .catch(err => console.error(`[DB] Failed to save ${filename}:`, err.message));
}

function readJsonFile<T>(filename: string, defaultData: T): T {
  if (cache.has(filename)) return cache.get(filename) as T;

  // First access: import existing local JSON (one-time migration) or use seed defaults
  let initial: T = defaultData;
  const filePath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filePath)) {
    try {
      initial = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    } catch (err) {
      console.error(`Error reading ${filename}, using default data`, err);
    }
  }
  cache.set(filename, initial);
  persist(filename, initial);
  return initial;
}

function writeJsonFile<T>(filename: string, data: T): void {
  cache.set(filename, data);
  persist(filename, data);
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

const defaultOrders: Order[] = [];
const defaultBlogs: BlogPost[] = [];
const defaultCatering: CateringEnquiry[] = [];
const defaultMessages: CustomerMessage[] = [];
const defaultSavedMeals: CustomerSavedMeals[] = [];

const defaultSettings: StoreSettings = {
  businessName: 'Ma’Great Taste Restaurant & Catering Services',
  kitchenAddress: 'Lekki Phase 1, Lagos, Nigeria',
  phone: '+234 803 456 7890',
  email: 'orders@magreattaste.ng',
  onlineOrdering: true,
  whatsappAlerts: true,
  corporateDiscounts: true,
  minOrderAmount: 3000,
  deliveryFee: 2000,
  openingHours: '8:00 AM – 10:00 PM Daily',
  updatedAt: new Date().toISOString()
};

export const storage = {
  init: initStorage,
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
  deleteSubscriber(idOrEmail: string): boolean {
    const list = this.getSubscribers();
    const clean = idOrEmail.toLowerCase().trim();
    const filtered = list.filter(s => s.id !== idOrEmail && s.email.toLowerCase() !== clean);
    if (filtered.length === list.length) return false;
    writeJsonFile('subscribers.json', filtered);
    return true;
  },
  getNewsletterCampaigns(): NewsletterCampaign[] {
    return readJsonFile<NewsletterCampaign[]>('newsletter-campaigns.json', []);
  },
  addNewsletterCampaign(data: Omit<NewsletterCampaign, 'id' | 'sentAt'>): NewsletterCampaign {
    const list = this.getNewsletterCampaigns();
    const newCamp: NewsletterCampaign = {
      ...data,
      id: `CAMP-${Date.now()}`,
      sentAt: new Date().toISOString()
    };
    list.unshift(newCamp);
    writeJsonFile('newsletter-campaigns.json', list);
    return newCamp;
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
  },

  // ==========================================
  // MEAL PLAN PACKAGES CRUD
  // ==========================================
  getMealPackages(): MealPlanPackage[] {
    const defaultPkgs: MealPlanPackage[] = [
      {
        id: 'single-professional',
        name: 'Single Professional',
        meals: '5 meals + 1 soup tub (1.5L)',
        price: 32500,
        description: 'Perfect for busy executives who want wholesome home dinners ready in minutes without cooking or food waste.',
        features: ['5 Individual Chef Meals', '1 Bowl Signature Soup (1.5L)', '2 Portions Grilled Protein Sides', 'Free Saturday Dispatch'],
        color: 'mint'
      },
      {
        id: 'couples-duo',
        name: 'Couples & Duo',
        meals: '10 meals + 2 soup tubs (2.5L)',
        price: 58000,
        description: 'Ideal for couples or roommates desiring varied, flavorful lunches and dinners without kitchen stress.',
        features: ['10 Gourmet Meals / week', '2 Traditional Soup Bowls (2.5L)', '4 Assorted Meats & Fish', 'Custom Spice Level'],
        color: 'peach'
      },
      {
        id: 'family-feast',
        name: 'Family Feast Plan',
        meals: '20 meals + 4 soup tubs (4L)',
        price: 115000,
        description: 'Designed for households of 4–6. Abundant portions of authentic home-cooked food the whole family will love.',
        features: ['20 Full Portion Meals', '4 Large Soup Tubs (4L each)', 'Bulk Jollof & Fried Rice Trays', 'Dedicated WhatsApp Concierge'],
        color: 'amber'
      },
      {
        id: 'fit-lean',
        name: 'Fit & Lean Protein',
        meals: '7 high-protein macro bowls',
        price: 48000,
        description: 'Tailored for fitness enthusiasts and weight watchers. High protein, clean cold-pressed oils, low glycemic index.',
        features: ['7 High-Protein Low-Carb Bowls', 'Marinated Herb Chicken & Fish', 'Local Greens & Brown Rice', 'Macro Label on Every Box'],
        color: 'lavender'
      }
    ];
    return readJsonFile<MealPlanPackage[]>('meal-packages.json', defaultPkgs);
  },
  saveMealPackages(list: MealPlanPackage[]): void {
    writeJsonFile('meal-packages.json', list);
  },
  createMealPackage(data: Omit<MealPlanPackage, 'id'>): MealPlanPackage {
    const list = this.getMealPackages();
    const newPkg: MealPlanPackage = {
      ...data,
      id: `plan-${Date.now()}`
    };
    list.push(newPkg);
    this.saveMealPackages(list);
    return newPkg;
  },
  updateMealPackage(id: string, data: Partial<MealPlanPackage>): MealPlanPackage | null {
    const list = this.getMealPackages();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data };
    this.saveMealPackages(list);
    return list[idx];
  },
  deleteMealPackage(id: string): boolean {
    const list = this.getMealPackages();
    const filtered = list.filter(p => p.id !== id);
    if (filtered.length === list.length) return false;
    this.saveMealPackages(filtered);
    return true;
  },

  // ==========================================
  // CUSTOMER & COMPANY DISCOUNTS
  // ==========================================
  getDiscounts(): CustomerDiscount[] {
    return readJsonFile<CustomerDiscount[]>('discounts.json', []);
  },
  saveDiscounts(list: CustomerDiscount[]): void {
    writeJsonFile('discounts.json', list);
  },

  // ==========================================
  // STORE SETTINGS (REAL TIME)
  // ==========================================
  getSettings(): StoreSettings {
    return readJsonFile<StoreSettings>('settings.json', defaultSettings);
  },
  updateSettings(data: Partial<StoreSettings>): StoreSettings {
    const current = this.getSettings();
    const updated: StoreSettings = {
      ...current,
      ...data,
      updatedAt: new Date().toISOString()
    };
    writeJsonFile('settings.json', updated);
    return updated;
  },

  // ==========================================
  // CUSTOMERS (REAL TIME & DERIVED FROM ORDERS)
  // ==========================================
  getCustomers(): CustomerAccount[] {
    const manualCustomers = readJsonFile<CustomerAccount[]>('customers.json', []);
    const orders = this.getOrders();
    const discounts = this.getDiscounts();
    const map = new Map<string, CustomerAccount>();

    // Manual registered customers
    for (const c of manualCustomers) {
      const disc = discounts.find(d => d.customerEmail?.toLowerCase() === c.email.toLowerCase() || (c.companyName && d.companyName?.toLowerCase() === c.companyName.toLowerCase()));
      map.set(c.email.toLowerCase(), { ...c, discount: disc });
    }

    // Derive from placed orders
    for (const o of orders) {
      if (!o.customerEmail) continue;
      const key = o.customerEmail.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.ordersCount = (existing.ordersCount || 0) + 1;
        existing.totalSpent = (existing.totalSpent || 0) + (o.total || 0);
        existing.lastOrderDate = new Date(o.createdAt).toLocaleDateString();
      } else {
        const disc = discounts.find(d => d.customerEmail?.toLowerCase() === key);
        map.set(key, {
          id: `CUST-${Math.floor(100 + Math.random() * 900)}`,
          name: o.customerName,
          email: o.customerEmail,
          phone: o.customerPhone || '0800 000 0000',
          ordersCount: 1,
          totalSpent: o.total || 0,
          lastOrderDate: new Date(o.createdAt).toLocaleDateString(),
          segment: o.total > 50000 ? 'Loyal VIP' : 'Returning',
          discount: disc,
          createdAt: o.createdAt
        });
      }
    }

    return Array.from(map.values());
  },
  addCustomer(data: Omit<CustomerAccount, 'id' | 'createdAt'>): CustomerAccount {
    const manualCustomers = readJsonFile<CustomerAccount[]>('customers.json', []);
    const newCust: CustomerAccount = {
      ...data,
      id: `CUST-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toISOString()
    };
    manualCustomers.unshift(newCust);
    writeJsonFile('customers.json', manualCustomers);
    return newCust;
  },
  createOrUpdateDiscount(data: Omit<CustomerDiscount, 'id' | 'createdAt'> & { id?: string }): CustomerDiscount {
    const list = this.getDiscounts();
    if (data.id) {
      const idx = list.findIndex(d => d.id === data.id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...data, active: data.active ?? true };
        this.saveDiscounts(list);
        return list[idx];
      }
    }
    const newDisc: CustomerDiscount = {
      ...data,
      id: `DISC-${Math.floor(100 + Math.random() * 900)}`,
      active: true,
      createdAt: new Date().toISOString()
    };
    list.unshift(newDisc);
    this.saveDiscounts(list);
    return newDisc;
  },
  deleteDiscount(id: string): boolean {
    const list = this.getDiscounts();
    const filtered = list.filter(d => d.id !== id);
    if (filtered.length === list.length) return false;
    this.saveDiscounts(filtered);
    return true;
  },
  validateDiscount(code: string, email?: string): { valid: boolean; discount?: CustomerDiscount; message?: string } {
    const list = this.getDiscounts().filter(d => d.active);
    const codeClean = (code || '').trim().toUpperCase();
    const found = list.find(d => d.code.toUpperCase() === codeClean);
    if (!found) {
      return { valid: false, message: 'Invalid discount code.' };
    }
    if (found.appliesTo === 'individual' && found.customerEmail && email) {
      if (found.customerEmail.toLowerCase() !== email.toLowerCase()) {
        return { valid: false, message: `This discount code is reserved for ${found.customerEmail}.` };
      }
    }
    if (found.appliesTo === 'company' && found.customerEmail && email) {
      const domain = found.customerEmail.split('@')[1];
      const userDomain = email.split('@')[1];
      if (domain && userDomain && domain.toLowerCase() !== userDomain.toLowerCase()) {
        return { valid: false, message: `This corporate discount is only valid for @${domain} email addresses.` };
      }
    }
    return { valid: true, discount: found };
  }
};
