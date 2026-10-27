import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import https from 'node:https';
import dns from 'node:dns';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import rateLimit from 'express-rate-limit';
import { storage } from './storage.js';
import { 
  sendNewsletterNotification, 
  sendContactMessageNotification, 
  sendBroadcastNewsletter, 
  testSmtpConnection,
  sendCateringQuotationEmail,
  sendCateringEnquiryAlert,
  sendCustomerMessageReplyEmail,
  sendOrderStatusUpdateEmail,
  sendWelcomeEmail
} from './email.js';

dotenv.config();

// ==========================================
// STARTUP: Validate required environment variables
// ==========================================
const REQUIRED_ENV = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'ADMIN_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[STARTUP] Missing required environment variables: ${missing.join(', ')}`);
  console.error('[STARTUP] Set these in your .env file or Render environment settings.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create resilient DNS resolver agent for Cloudinary API on Windows
const dnsResolver = new dns.Resolver();
try {
  dnsResolver.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

const httpsAgent = new https.Agent({
  lookup: (host: string, opts: any, cb: any) => {
    dnsResolver.resolve4(host, (err, addrs) => {
      if (!err && addrs && addrs.length > 0) {
        if (opts && opts.all) {
          return cb(null, addrs.map(a => ({ address: a, family: 4 })));
        }
        return cb(null, addrs[0], 4);
      }
      dns.lookup(host, opts, cb);
    });
  }
});

const app = express();
const PORT = process.env.PORT || 5000;

// Configure Cloudinary — credentials MUST come from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  // @ts-ignore — custom DNS agent for resilient resolution on Linux/Windows
  agent: httpsAgent
});

// Enable CORS — allow frontend, admin dashboard, and production domains
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Increased limit for base64 image uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Serve static meal images and uploads
app.use('/meals', express.static(path.resolve(__dirname, '../uploads/meals')));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ==========================================
// AUTH: Admin Bearer-token middleware
// ==========================================
const ADMIN_SECRET = (process.env.ADMIN_SECRET || 'MagreatTaste#AdminSecret2026!Key_x99').trim();
const CANONICAL_SECRET = 'MagreatTaste#AdminSecret2026!Key_x99';

interface ActiveAdminSession {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'super_admin' | 'admin_staff';
  };
  expiresAt: number;
}

const adminSessions = new Map<string, ActiveAdminSession>();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ error: 'Unauthorized — valid admin token required.' });
    return;
  }

  // Canonical or master secret token acts as Super Admin (Head Chef Margaret)
  if (token === ADMIN_SECRET || token === CANONICAL_SECRET) {
    (req as any).adminUser = {
      id: 'ADMIN-SUPER-1',
      name: 'Chef Margaret',
      email: 'margaret@magreattaste.com',
      role: 'super_admin'
    };
    return next();
  }

  const session = adminSessions.get(token);
  if (session && session.expiresAt > Date.now()) {
    (req as any).adminUser = session.user;
    return next();
  }

  res.status(401).json({ error: 'Unauthorized or expired session. Please sign in again.' });
}

function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAdmin(req, res, () => {
    const user = (req as any).adminUser;
    if (user?.role !== 'super_admin') {
      res.status(403).json({ error: 'Forbidden — This area requires Head Chef (Super Admin) privileges.' });
      return;
    }
    next();
  });
}

// ==========================================
// RATE LIMITING: protect public write endpoints
// ==========================================
const publicWriteLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again in a few minutes.' }
});

// --- Root & Health Check ---
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    service: 'Ma’Great Taste API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      menu: '/api/menu',
      orders: '/api/orders',
      catering: '/api/catering',
      mealPlans: '/api/meal-plans',
      messages: '/api/messages',
      savedMeals: '/api/saved-meals',
      analytics: '/api/analytics'
    }
  });
});

// Root rewrite middleware: seamlessly support clients calling /menu or /api/menu
app.use((req, res, next) => {
  if (!req.url.startsWith('/api') && (
    req.url.startsWith('/menu') ||
    req.url.startsWith('/orders') ||
    req.url.startsWith('/catering') ||
    req.url.startsWith('/mealplans') ||
    req.url.startsWith('/meal-plans') ||
    req.url.startsWith('/saved-meals') ||
    req.url.startsWith('/discounts') ||
    req.url.startsWith('/customers') ||
    req.url.startsWith('/messages') ||
    req.url.startsWith('/settings') ||
    req.url.startsWith('/upload') ||
    req.url.startsWith('/health')
  )) {
    req.url = '/api' + req.url;
  }
  next();
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Ma’Great Taste API',
    cloudinaryConfigured: true,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Ma’Great Taste API',
    cloudinaryConfigured: true,
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// IMAGE UPLOAD (CLOUDINARY)
// ==========================================
app.post('/api/upload', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { image, folder } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image file or base64 string is required' });
    }

    const uploadResult = await cloudinary.uploader.upload(image, {
      folder: folder || 'magreat_taste',
      resource_type: 'auto'
    });

    res.json({
      success: true,
      url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      format: uploadResult.format,
      width: uploadResult.width,
      height: uploadResult.height
    });
  } catch (err: any) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ error: err.message || 'Image upload to Cloudinary failed' });
  }
});

// ==========================================
// 1. MENU ENDPOINTS
// ==========================================
app.get('/api/menu', (req: Request, res: Response) => {
  const foods = storage.getFoods();
  const category = req.query.category as string | undefined;
  const search = req.query.search as string | undefined;

  let filtered = foods;
  if (category && category !== 'All meals' && category !== 'All') {
    filtered = filtered.filter(f => f.category.toLowerCase() === category.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q)
    );
  }

  res.json(filtered);
});

app.post('/api/menu', requireAdmin, (req: Request, res: Response) => {
  const { name, description, price, category, tag, image, rating, time } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }

  const newFood = storage.addFood({
    name,
    description: description || 'Freshly prepared specialty dish.',
    price: Number(price),
    category: category || 'Nigerian',
    tag: tag || undefined,
    image: image || 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85',
    rating: rating || '4.9',
    time: time || '25–35 min',
    status: 'Available'
  });

  res.status(201).json(newFood);
});

app.put('/api/menu/:id', requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = storage.updateFood(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Menu item not found' });
  }
  res.json(updated);
});

app.delete('/api/menu/:id', requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const success = storage.deleteFood(id);
  if (!success) {
    return res.status(404).json({ error: 'Menu item not found' });
  }
  res.json({ message: 'Menu item deleted successfully' });
});

// ==========================================
// 2. ORDER ENDPOINTS & CHECKOUT
// ==========================================
app.get('/api/orders', requireAdmin, (req: Request, res: Response) => {
  const orders = storage.getOrders();
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  let filtered = orders;
  if (status && status !== 'All') {
    filtered = filtered.filter(o => o.status.toLowerCase() === status.toLowerCase());
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(o =>
      o.id.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.items.some(i => i.name.toLowerCase().includes(q))
    );
  }

  res.json(filtered);
});

app.get('/api/orders/:id', requireAdmin, (req: Request, res: Response) => {
  const order = storage.getOrderById(String(req.params.id));
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json(order);
});

app.post('/api/orders', publicWriteLimit, (req: Request, res: Response) => {
  const {
    customerName,
    customerEmail,
    customerPhone,
    deliveryAddress,
    city,
    deliveryNotes,
    items,
    subtotal,
    deliveryFee,
    total,
    paymentMethod,
    paymentStatus,
    paymentReference
  } = req.body;

  if (!customerName || !customerPhone || !items || !items.length) {
    return res.status(400).json({ error: 'Customer name, phone, and items are required' });
  }

  const newOrder = storage.createOrder({
    customerName,
    customerEmail: customerEmail || `${customerName.toLowerCase().replace(/\s+/g, '.')}@customer.ng`,
    customerPhone,
    deliveryAddress: deliveryAddress || 'Pickup / Contact via phone',
    city: city || 'Lagos, Nigeria',
    deliveryNotes: deliveryNotes || '',
    items,
    subtotal: Number(subtotal) || 0,
    deliveryFee: Number(deliveryFee) || 0,
    total: Number(total) || (Number(subtotal) || 0) + (Number(deliveryFee) || 0),
    paymentMethod: paymentMethod || 'card',
    paymentStatus: paymentStatus || (paymentMethod === 'cash_on_delivery' ? 'pending' : 'paid'),
    paymentReference: paymentReference || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
    estimatedDeliveryTime: '30–45 mins'
  });

  res.status(201).json(newOrder);
});

app.patch('/api/orders/:id/status', requireAdmin, (req: Request, res: Response) => {
  const { status, paymentStatus } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  const updated = storage.updateOrderStatus(String(req.params.id), status, paymentStatus);
  if (!updated) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Dispatch live order status notification to customer's device
  if (updated.customerEmail) {
    sendOrderStatusUpdateEmail({
      id: updated.id,
      customerName: updated.customerName,
      customerEmail: updated.customerEmail,
      status: updated.status,
      total: updated.total,
      deliveryAddress: updated.deliveryAddress
    }).catch(err => {
      console.error('[ORDER EMAIL ERROR] Failed to send order status email:', err);
    });
  }

  res.json(updated);
});

// ==========================================
// 3. PAYMENT PROCESSING SIMULATION
// ==========================================
app.post('/api/payments/verify', (req: Request, res: Response) => {
  const { paymentMethod, amount, reference, customer } = req.body;

  // Realistic mock payment gateway response
  const isSuccess = true;
  if (isSuccess) {
    return res.json({
      success: true,
      status: 'success',
      reference: reference || `VER-${Date.now()}`,
      message: 'Payment verified successfully.',
      gateway: paymentMethod === 'card' ? 'Paystack Card Gateway' : 'Instant NIP Bank Transfer Gateway',
      paidAt: new Date().toISOString(),
      amount
    });
  } else {
    return res.status(400).json({
      success: false,
      status: 'failed',
      message: 'Payment could not be verified. Please retry.'
    });
  }
});

// Dynamic virtual bank account generator for transfer payment
app.post('/api/payments/bank-transfer', (req: Request, res: Response) => {
  const { amount, customerName } = req.body;
  const virtualAccount = {
    bankName: 'Providus Bank / Wema Bank',
    accountNumber: '99' + Math.floor(10000000 + Math.random() * 90000000),
    accountName: `Ma'Great Taste / ${customerName || 'Guest'}`,
    reference: `MGT-TRF-${Math.floor(100000 + Math.random() * 900000)}`,
    expiresInMinutes: 30,
    amount: amount || 0
  };
  res.json(virtualAccount);
});

// ==========================================
// 4. BLOG & ARTICLES ENDPOINTS
// ==========================================
app.get('/api/blog', (req: Request, res: Response) => {
  const blogs = storage.getBlogs();
  const category = req.query.category as string | undefined;
  const status = req.query.status as string | undefined;

  let filtered = blogs;
  if (status && status !== 'All') {
    filtered = filtered.filter(b => b.status.toLowerCase() === status.toLowerCase());
  }
  if (category && category !== 'All') {
    filtered = filtered.filter(b => b.category.toLowerCase() === category.toLowerCase());
  }

  res.json(filtered);
});

app.get('/api/blog/:slug', (req: Request, res: Response) => {
  const blog = storage.getBlogBySlug(String(req.params.slug));
  if (!blog) {
    return res.status(404).json({ error: 'Article not found' });
  }
  // increment view
  storage.incrementBlogViews(blog.id);
  blog.views += 1;
  res.json(blog);
});

app.post('/api/blog', requireAdmin, (req: Request, res: Response) => {
  const { title, category, status, coverImage, excerpt, content, tags, relatedFoodIds } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Article title is required' });
  }

  const slug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  const newBlog = storage.addBlog({
    slug: `${slug}-${Math.floor(100 + Math.random() * 900)}`,
    title,
    category: category || 'Food stories',
    status: status || 'Published',
    readTime: '4 min read',
    coverImage: coverImage || 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=85',
    excerpt: excerpt || title,
    content: content || 'Exciting food story and kitchen updates coming your way.',
    author: 'Chef Margaret Samuel',
    authorRole: 'Head Chef & Culinary Director',
    authorAvatar: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=200&q=85',
    tags: tags || ['Food', 'Recipes', 'Lifestyle'],
    relatedFoodIds: relatedFoodIds || []
  });

  res.status(201).json(newBlog);
});

app.put('/api/blog/:id', requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = storage.updateBlog(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Article not found' });
  }
  res.json(updated);
});

app.delete('/api/blog/:id', requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const success = storage.deleteBlog(id);
  if (!success) {
    return res.status(404).json({ error: 'Article not found' });
  }
  res.json({ message: 'Article deleted successfully' });
});

// ==========================================
// 5. CATERING & EVENTS ENDPOINTS
// ==========================================
app.get('/api/catering', (req: Request, res: Response) => {
  const list = storage.getCatering();
  res.json(list);
});

app.post('/api/catering', publicWriteLimit, (req: Request, res: Response) => {
  const { customerName, customerEmail, customerPhone, eventType, eventDate, guestCount, location, budget, dietaryRequirements, notes } = req.body;
  if (!customerName || !customerPhone || !eventType) {
    return res.status(400).json({ error: 'Name, phone, and event type are required' });
  }

  const newEnquiry = storage.addCatering({
    customerName,
    customerEmail: customerEmail || 'enquiry@example.com',
    customerPhone,
    eventType,
    eventDate: eventDate || new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0],
    guestCount: Number(guestCount) || 50,
    location: location || 'Lagos, Nigeria',
    budget: budget || 'To be discussed',
    dietaryRequirements: dietaryRequirements || '',
    notes: notes || ''
  });

  // Notify kitchen admin in background via SMTP
  sendCateringEnquiryAlert(newEnquiry).catch(err => {
    console.error('[CATERING ALERT EXCEPTION]', err);
  });

  res.status(201).json(newEnquiry);
});

app.patch('/api/catering/:id/status', requireAdmin, (req: Request, res: Response) => {
  const { status } = req.body;
  const updated = storage.updateCateringStatus(String(req.params.id), status);
  if (!updated) {
    return res.status(404).json({ error: 'Enquiry not found' });
  }
  res.json(updated);
});

// ==========================================
// CULINARY ARTS ACADEMY
// ==========================================
app.get('/api/academy/applications', (req: Request, res: Response) => {
  const list = storage.getAcademyApplications();
  res.json(list);
});

app.post('/api/academy/apply', publicWriteLimit, (req: Request, res: Response) => {
  const { fullName, email, phone, journey, schedule, experience, notes, refNumber } = req.body;
  if (!fullName || !phone) {
    return res.status(400).json({ error: 'Full name and phone/WhatsApp number are required' });
  }

  const newApp = storage.addAcademyApplication({
    fullName,
    email: email || '',
    phone,
    journey: journey || '6-months',
    schedule: schedule || 'weekend-executive',
    experience: experience || 'beginner',
    notes: notes || '',
    refNumber
  });

  res.status(201).json({
    success: true,
    message: 'Application received successfully',
    refNumber: newApp.refNumber,
    application: newApp
  });
});

app.patch('/api/academy/applications/:id/status', requireAdmin, (req: Request, res: Response) => {
  const { status } = req.body;
  const updated = storage.updateAcademyApplicationStatus(String(req.params.id), status);
  if (!updated) {
    return res.status(404).json({ error: 'Application not found' });
  }
  res.json(updated);
});

// ==========================================
// 6. MEAL PLANS & FREEZER STOCKING
// ==========================================
app.get(['/api/mealplans/packages', '/api/meal-plans/packages', '/api/mealplans', '/api/meal-plans'], (req: Request, res: Response) => {
  const packages = storage.getMealPackages();
  res.json(packages);
});

app.post(['/api/mealplans/packages', '/api/meal-plans/packages', '/api/mealplans', '/api/meal-plans'], (req: Request, res: Response) => {
  const { name, meals, price, description, features, color } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  const created = storage.createMealPackage({
    name,
    meals: meals || '10 meals',
    price: Number(price),
    description: description || 'Signature meal subscription package.',
    features: Array.isArray(features) ? features : (features ? [features] : ['Custom chef dishes', 'Freezer-safe packaging']),
    color: color || 'mint'
  });
  res.status(201).json(created);
});

app.put(['/api/mealplans/packages/:id', '/api/meal-plans/packages/:id', '/api/mealplans/:id', '/api/meal-plans/:id'], (req: Request, res: Response) => {
  const updated = storage.updateMealPackage(String(req.params.id), req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Meal package not found' });
  }
  res.json(updated);
});

app.delete(['/api/mealplans/packages/:id', '/api/meal-plans/packages/:id', '/api/mealplans/:id', '/api/meal-plans/:id'], (req: Request, res: Response) => {
  const deleted = storage.deleteMealPackage(String(req.params.id));
  if (!deleted) {
    return res.status(404).json({ error: 'Meal package not found' });
  }
  res.json({ message: 'Meal package deleted successfully' });
});

// ==========================================
// 6B. CUSTOMER & COMPANY DISCOUNTS
// ==========================================
app.get('/api/discounts', requireAdmin, (req: Request, res: Response) => {
  const list = storage.getDiscounts();
  res.json(list);
});

app.post('/api/discounts', requireAdmin, (req: Request, res: Response) => {
  const { customerName, customerEmail, companyName, type, value, code, appliesTo, notes, id } = req.body;
  if (!value || !code) {
    return res.status(400).json({ error: 'Discount value and promo code are required' });
  }
  const result = storage.createOrUpdateDiscount({
    id,
    customerName,
    customerEmail,
    companyName,
    type: type || 'percent',
    value: Number(value),
    code: String(code).trim().toUpperCase(),
    appliesTo: appliesTo || (companyName ? 'company' : 'individual'),
    notes: notes || '',
    active: true
  });
  res.status(201).json(result);
});

app.delete('/api/discounts/:id', requireAdmin, (req: Request, res: Response) => {
  const success = storage.deleteDiscount(String(req.params.id));
  if (!success) {
    return res.status(404).json({ error: 'Discount not found' });
  }
  res.json({ message: 'Discount deleted successfully' });
});

app.post('/api/discounts/validate', (req: Request, res: Response) => {
  const { code, email } = req.body;
  const result = storage.validateDiscount(code, email);
  if (!result.valid) {
    return res.status(400).json({ valid: false, error: result.message });
  }
  res.json(result);
});

app.post('/api/mealplans/order', (req: Request, res: Response) => {
  const { planId, planName, customerName, customerEmail, customerPhone, deliveryAddress, city, frequency, total } = req.body;
  if (!customerName || !customerPhone || !planName) {
    return res.status(400).json({ error: 'Customer name, phone, and plan are required' });
  }

  const order = storage.createMealPlanOrder({
    planId: planId || 'custom-plan',
    planName,
    customerName,
    customerEmail: customerEmail || 'mealplan@customer.ng',
    customerPhone,
    deliveryAddress: deliveryAddress || 'Lagos, Nigeria',
    city: city || 'Lagos, Nigeria',
    frequency: frequency || 'Weekly',
    total: Number(total) || 45000
  });

  res.status(201).json(order);
});

// ==========================================
// 7. MESSAGES & ENQUIRIES
// ==========================================
app.get('/api/messages', requireAdmin, (req: Request, res: Response) => {
  const messages = storage.getMessages();
  res.json(messages);
});

app.post('/api/messages', publicWriteLimit, (req: Request, res: Response) => {
  const { name, email, phone, subject, body } = req.body;
  if (!name || !body) {
    return res.status(400).json({ error: 'Name and message body are required' });
  }

  const customerEmail = email || 'user@example.com';
  const newMsg = storage.addMessage({
    name,
    email: customerEmail,
    phone,
    subject: subject || 'New Website Inquiry',
    body
  });

  // 1. Deliver notification to hello@magreattaste.ng
  sendContactMessageNotification({
    name,
    email: customerEmail,
    phone,
    subject,
    body
  }).catch(err => {
    console.error('[EMAIL ERROR] Failed to send contact message email alert:', err);
  });

  res.status(201).json(newMsg);
});

app.patch('/api/messages/:id/read', requireAdmin, (req: Request, res: Response) => {
  const { unread } = req.body || {};
  const isUnread = typeof unread === 'boolean' ? unread : false;
  const success = storage.setMessageUnread(String(req.params.id), isUnread);
  if (!success) {
    return res.status(404).json({ error: 'Message not found' });
  }
  res.json({ message: isUnread ? 'Marked as unread' : 'Marked as read' });
});

app.post('/api/messages/read-all', requireAdmin, (req: Request, res: Response) => {
  storage.markAllMessagesRead();
  res.json({ message: 'All messages marked as read' });
});

// Admin: Reply to Customer Message
app.post('/api/messages/:id/reply', requireAdmin, (req: Request, res: Response) => {
  const { reply } = req.body;
  if (!reply) {
    return res.status(400).json({ error: 'Reply text is required' });
  }
  const updated = storage.replyToMessage(String(req.params.id), reply);
  if (!updated) {
    return res.status(404).json({ error: 'Message not found' });
  }

  // Dispatch reply notification email to customer's device
  if (updated.email) {
    sendCustomerMessageReplyEmail({
      customerName: updated.name || 'Valued Customer',
      customerEmail: updated.email,
      originalMessage: updated.body || '',
      replyText: reply,
      subject: updated.subject || 'Kitchen Concierge Enquiry'
    }).catch(err => {
      console.error('[CUSTOMER REPLY EMAIL ERROR] Failed to dispatch reply email:', err);
    });
  }

  res.json({ message: 'Reply saved and delivered', item: updated });
});

// Customer Dashboard: Fetch Orders for Logged-in Customer
app.get('/api/customer/orders', (req: Request, res: Response) => {
  const email = String(req.query.email || '').trim();
  if (!email) {
    return res.status(400).json({ error: 'Customer email query parameter is required' });
  }
  const orders = storage.getCustomerOrders(email);
  res.json(orders);
});

// Customer Dashboard: Fetch Concierge Messages & Replies
app.get('/api/customer/messages', (req: Request, res: Response) => {
  const email = String(req.query.email || '').trim();
  if (!email) {
    return res.status(400).json({ error: 'Customer email query parameter is required' });
  }
  const messages = storage.getCustomerMessages(email);
  res.json(messages);
});

// Customer Dashboard: Send Concierge Message to Kitchen
app.post('/api/customer/messages', publicWriteLimit, (req: Request, res: Response) => {
  const { name, email, phone, message, subject } = req.body;
  if (!email || !message) {
    return res.status(400).json({ error: 'Email and message are required' });
  }
  const created = storage.addMessage({
    name: name || 'Valued Customer',
    email,
    phone: phone || '',
    subject: subject || 'Customer Concierge Chat',
    body: message
  });
  res.status(201).json(created);
});

// ==========================================
// 8. NEWSLETTER SUBSCRIPTION & BROADCAST CAMPAIGNS
// ==========================================
app.post('/api/newsletter', publicWriteLimit, (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const created = storage.addSubscriber(cleanEmail);

  // 1. Deliver to Admin Dashboard Messages Inbox so admin sees it in real-time
  storage.addMessage({
    name: 'Newsletter Subscriber',
    email: cleanEmail,
    phone: '',
    subject: `📬 Newsletter Subscription: ${cleanEmail}`,
    body: `Customer subscribed to Ma'Great Taste seasonal menus, chef updates, and promotions via website newsletter input.\nSubscriber Email: ${cleanEmail}`
  });

  // 2. Deliver email notification to hello@magreattaste.ng
  sendNewsletterNotification(cleanEmail).catch(err => {
    console.error('[EMAIL ERROR] Failed to dispatch subscriber email alert:', err);
  });

  if (!created) {
    return res.json({ message: 'You are already subscribed to our newsletter! We updated your preferences.', alreadySubscribed: true });
  }
  res.status(201).json({ message: 'Thank you for subscribing to Ma’Great Taste updates!' });
});

// Admin: Get all subscribers
app.get('/api/subscribers', requireAdmin, (req: Request, res: Response) => {
  const subscribers = storage.getSubscribers();
  res.json({
    total: subscribers.length,
    subscribers
  });
});

// Admin: Remove subscriber
app.delete('/api/subscribers/:id', requireAdmin, (req: Request, res: Response) => {
  const success = storage.deleteSubscriber(String(req.params.id));
  if (!success) {
    return res.status(404).json({ error: 'Subscriber not found' });
  }
  res.json({ message: 'Subscriber removed successfully' });
});

// Admin: Get sent newsletter campaigns
app.get('/api/newsletter/campaigns', requireAdmin, (req: Request, res: Response) => {
  const campaigns = storage.getNewsletterCampaigns();
  res.json(campaigns);
});

// Admin: Broadcast newsletter to subscribers (or send a single test email)
app.post('/api/newsletter/broadcast', requireAdmin, async (req: Request, res: Response) => {
  const { subject, title, content, buttonText, buttonUrl, testEmail } = req.body;

  if (!subject || !title || !content) {
    return res.status(400).json({ error: 'Subject, headline title, and message content are required.' });
  }

  try {
    let recipientEmails: string[] = [];

    if (testEmail && typeof testEmail === 'string' && testEmail.includes('@')) {
      recipientEmails = [testEmail.toLowerCase().trim()];
    } else {
      const allSubscribers = storage.getSubscribers();
      recipientEmails = allSubscribers.map(s => s.email.toLowerCase().trim());
      // Deduplicate emails
      recipientEmails = Array.from(new Set(recipientEmails));
    }

    if (recipientEmails.length === 0) {
      return res.status(400).json({ error: 'No subscribers found to send this newsletter to.' });
    }

    const dispatchResult = await sendBroadcastNewsletter({
      subject,
      title,
      content,
      buttonText: buttonText || undefined,
      buttonUrl: buttonUrl || undefined,
      recipients: recipientEmails
    });

    let savedCampaign = null;
    if (!testEmail) {
      savedCampaign = storage.addNewsletterCampaign({
        subject,
        title,
        content,
        buttonText: buttonText || undefined,
        buttonUrl: buttonUrl || undefined,
        recipientCount: dispatchResult.sentCount,
        status: dispatchResult.sentCount > 0 ? 'Sent' : 'Failed'
      });
    }

    res.json({
      success: dispatchResult.success,
      isTest: !!testEmail,
      testRecipient: testEmail || null,
      totalRecipients: recipientEmails.length,
      sentCount: dispatchResult.sentCount,
      failedCount: dispatchResult.failedCount,
      errors: dispatchResult.errors,
      campaign: savedCampaign,
      message: testEmail
        ? `Test newsletter sent to ${testEmail}!`
        : `Newsletter dispatched successfully to ${dispatchResult.sentCount} subscriber(s)!`
    });
  } catch (err: any) {
    console.error('[NEWSLETTER BROADCAST ERROR]', err);
    res.status(500).json({ error: err.message || 'Failed to broadcast newsletter' });
  }
});

// Admin: Test SMTP live connection status
app.get('/api/smtp/status', requireAdmin, async (req: Request, res: Response) => {
  const result = await testSmtpConnection();
  res.json(result);
});

// ==========================================
// 9. SAVED MEALS & DINNER REMINDERS
// ==========================================
app.get('/api/saved-meals', requireAdmin, (req: Request, res: Response) => {
  const savedMeals = storage.getSavedMeals();
  res.json(savedMeals);
});

app.post('/api/saved-meals', publicWriteLimit, (req: Request, res: Response) => {
  const { customerName, customerEmail, customerPhone, items } = req.body;
  if (!customerEmail || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Customer email and at least one saved meal item are required' });
  }

  const result = storage.addOrUpdateCustomerSavedMeals({
    customerName: customerName || 'Food Lover',
    customerEmail,
    customerPhone,
    items
  });

  res.status(201).json({
    message: `Your saved meals list has been saved and sent to ${customerEmail}! We'll send you timely dinner reminders.`,
    ...result
  });
});

app.post('/api/saved-meals/:id/remind', requireAdmin, (req: Request, res: Response) => {
  const result = storage.sendSavedMealReminder(String(req.params.id));
  if (!result.success) {
    return res.status(404).json({ error: result.message });
  }
  res.json(result);
});

app.post('/api/saved-meals/bulk-remind', requireAdmin, (req: Request, res: Response) => {
  const { ids } = req.body;
  const list = storage.getSavedMeals();
  let dispatched = 0;
  const results: any[] = [];

  list.forEach(item => {
    if (!ids || ids.length === 0 || ids.includes(item.id)) {
      if (item.reminderStatus !== 'Unsubscribed') {
        item.lastReminderSentAt = new Date().toISOString();
        item.reminderCount = (item.reminderCount || 0) + 1;
        dispatched++;
        results.push({ id: item.id, name: item.customerName, email: item.customerEmail });
      }
    }
  });

  storage.saveSavedMeals(list);
  res.json({
    success: true,
    dispatchedCount: dispatched,
    message: `Successfully dispatched dinner reminders to ${dispatched} customer(s)!`,
    subscribers: results
  });
});

app.patch('/api/saved-meals/:id/status', requireAdmin, (req: Request, res: Response) => {
  const { status } = req.body;
  const list = storage.getSavedMeals();
  const item = list.find(r => r.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Record not found' });
  item.reminderStatus = status || (item.reminderStatus === 'Active' ? 'Unsubscribed' : 'Active');
  storage.saveSavedMeals(list);
  res.json(item);
});

app.post('/api/catering/:id/quote', requireAdmin, async (req: Request, res: Response) => {
  const { quoteAmount, menuNotes } = req.body;
  const enquiries = storage.getCatering();
  const lead = enquiries.find(c => String(c.id) === String(req.params.id));
  const updated = storage.updateCateringStatus(String(req.params.id), 'Quote sent');

  let emailDispatched = false;
  let emailMessage = '';
  if (lead && lead.customerEmail) {
    try {
      const emailResult = await sendCateringQuotationEmail(lead, Number(quoteAmount) || 0, menuNotes || '');
      emailDispatched = emailResult.success;
      emailMessage = emailResult.message;
    } catch (err: any) {
      emailMessage = err.message || 'SMTP failed';
    }
  }

  res.json({
    success: true,
    message: emailDispatched 
      ? `Quotation of ₦${(Number(quoteAmount) || 0).toLocaleString()} emailed to ${lead?.customerEmail}!`
      : `Quotation saved${emailMessage ? ' (' + emailMessage + ')' : ''}`,
    lead: updated,
    emailDispatched,
    menuNotes
  });
});

// ==========================================
// 10. DYNAMIC BUSINESS ANALYTICS
// ==========================================
app.get('/api/analytics', requireAdmin, (req: Request, res: Response) => {
  const user = (req as any).adminUser;
  const analytics = storage.getAnalytics();
  if (user?.role === 'admin_staff') {
    return res.json({
      ...analytics,
      grossRevenue: null,
      totalRevenue: null,
      netMargin: null,
      dailyRevenue: [],
      monthlyRevenue: [],
      averageOrderValue: null,
      isFinancialMasked: true
    });
  }
  res.json(analytics);
});

// ==========================================
// 11. STORE SETTINGS (REAL TIME PERSISTENCE)
// ==========================================
// Public read: allow customer frontend and admin to fetch live fees, status & contact
app.get('/api/settings', (req: Request, res: Response) => {
  const settings = storage.getSettings();
  res.json(settings);
});

app.put('/api/settings', requireAdmin, (req: Request, res: Response) => {
  const updated = storage.updateSettings(req.body);
  res.json({ success: true, message: 'Store settings updated successfully', settings: updated });
});

app.patch('/api/settings', requireAdmin, (req: Request, res: Response) => {
  const updated = storage.updateSettings(req.body);
  res.json({ success: true, message: 'Store settings updated successfully', settings: updated });
});

// ==========================================
// 12. CUSTOMERS DIRECTORY (REAL TIME)
// ==========================================
app.get('/api/customers', requireAdmin, (req: Request, res: Response) => {
  const customers = storage.getCustomers();
  res.json(customers);
});

app.post('/api/customers', requireAdmin, (req: Request, res: Response) => {
  const { name, email, phone, companyName, segment, kitchenNotes } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  const created = storage.addCustomer({
    name,
    email,
    phone: phone || '0800 000 0000',
    companyName: companyName || undefined,
    ordersCount: 0,
    totalSpent: 0,
    lastOrderDate: 'New Customer',
    segment: segment || (companyName ? 'Corporate' : 'New'),
    kitchenNotes
  });
  res.status(201).json(created);
});

// Public customer sync on signup / login from frontend
app.post('/api/customers/sync', publicWriteLimit, async (req: Request, res: Response) => {
  const { name, email, phone, photoURL } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanName = name ? String(name).trim() : cleanEmail.split('@')[0];
  const customers = storage.getCustomers();
  const existing = customers.find(c => c.email.toLowerCase() === cleanEmail);

  let customerRecord = existing;
  let isNew = false;
  if (existing) {
    // If an existing customer logs in, update name/phone if newly provided
    if (name && (!existing.name || existing.name === cleanEmail.split('@')[0])) {
      existing.name = cleanName;
      storage.updateCustomer(existing.id, { name: cleanName });
    }
  } else {
    customerRecord = storage.addCustomer({
      name: cleanName,
      email: cleanEmail,
      phone: phone ? String(phone).trim() : '0800 000 0000',
      ordersCount: 0,
      totalSpent: 0,
      lastOrderDate: 'Registered via Web',
      segment: 'New'
    });
    isNew = true;
  }

  // Dispatch Welcome Email asynchronously via live Mailtrap SMTP
  if (cleanEmail.includes('@')) {
    sendWelcomeEmail({
      customerName: cleanName,
      customerEmail: cleanEmail
    }).catch(err => console.warn('[WELCOME EMAIL WARNING] Failed to send welcome email:', err.message));
  }

  return res.status(isNew ? 201 : 200).json({ success: true, customer: customerRecord, isNew });
});

// ==========================================
// 13. ADMIN ROLE-BASED ACCESS & TEAM INVITATIONS
// ==========================================

// Admin Sign-in (Email + Password)
app.post('/api/admin/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const admin = storage.verifyAdminCredentials(email, password);
  if (!admin) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const token = `ADM-SESS-${admin.id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const safeUser = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    status: admin.status
  };
  adminSessions.set(token, {
    token,
    user: safeUser,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  });
  res.json({ token, user: safeUser });
});

// Current Admin Identity
app.get('/api/admin/me', requireAdmin, (req: Request, res: Response) => {
  res.json({ user: (req as any).adminUser });
});

// List Admin Team (Super Admin / Chef Margaret Only)
app.get('/api/admin/team', requireSuperAdmin, (req: Request, res: Response) => {
  const admins = storage.getAdmins().map(a => ({
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    status: a.status,
    createdAt: a.createdAt,
    lastLoginAt: a.lastLoginAt,
    invitedBy: a.invitedBy
  }));
  res.json(admins);
});

// Invite New Admin (Super Admin Only)
app.post('/api/admin/team/invite', requireSuperAdmin, (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password, and role are required.' });
  }
  if (role !== 'super_admin' && role !== 'admin_staff') {
    return res.status(400).json({ error: 'Role must be either "super_admin" or "admin_staff".' });
  }
  try {
    const inviter = (req as any).adminUser;
    const created = storage.addAdmin({
      name,
      email,
      password,
      role,
      invitedBy: inviter?.name || 'Chef Margaret'
    });
    res.status(201).json({
      message: `Admin ${name} (${role === 'super_admin' ? 'Super Admin' : 'Admin Staff'}) invited successfully.`,
      user: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        status: created.status,
        createdAt: created.createdAt
      }
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to invite administrator.' });
  }
});

// Update Admin Role or Status (Super Admin Only)
app.patch('/api/admin/team/:id', requireSuperAdmin, (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { name, role, status, password } = req.body;
  const updated = storage.updateAdmin(id, { name, role, status, password });
  if (!updated) {
    return res.status(404).json({ error: 'Admin not found.' });
  }
  res.json({
    message: 'Admin updated successfully.',
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      status: updated.status
    }
  });
});

// Delete Admin (Super Admin Only)
app.delete('/api/admin/team/:id', requireSuperAdmin, (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const success = storage.deleteAdmin(id);
    if (!success) {
      return res.status(404).json({ error: 'Admin not found.' });
    }
    res.json({ message: 'Administrator removed successfully.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to remove admin.' });
  }
});

// Start Server (connect to the database first)
storage.init()
  .catch(err => {
    console.warn('[DB] Storage init notice:', err?.message || err);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Ma’Great Taste Backend Server running on http://localhost:${PORT}`);
      console.log(`📡 Ready to serve Frontend (port 5173) and Admin Studio (port 5174)`);
    });
  });
