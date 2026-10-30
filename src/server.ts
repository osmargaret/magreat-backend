import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import https from 'node:https';
import dns from 'node:dns';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import rateLimit from 'express-rate-limit';
import { storage } from './storage.js';
import { 
  sendNewsletterNotification, 
  sendNewsletterWelcomeEmail,
  sendContactMessageNotification, 
  sendBroadcastNewsletter, 
  testSmtpConnection,
  sendCateringConsultationThankYouEmail,
  sendCateringQuotationEmail,
  sendCateringEnquiryAlert,
  sendCustomerMessageReplyEmail,
  sendOrderStatusUpdateEmail,
  sendWelcomeEmail,
  sendOtpVerificationEmail,
  sendTastingRequestThankYouEmail,
  sendTastingRequestAdminAlert,
  sendSavedMealConfirmationEmail,
  sendSavedMealReminderEmail,
  sendCustomMealPlanConfirmationEmail,
  sendContactConfirmationEmailToCustomer,
  sendCustomerOrderConfirmationEmail,
  sendAdminOrderNotificationEmail,
  sendAdminInviteEmail,
  sendAdminPasswordResetEmail,
  sendAcademyApplicationConfirmationEmail,
  sendAcademyApplicationAdminAlert,
  sendAcademyStatusUpdateEmail
} from './email.js';

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_30c5651e1fa89e38d79ab5768016cda82caecdea';

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
    req.url.startsWith('/health') ||
    req.url.startsWith('/auth')
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
  const location = req.query.location as string | undefined;

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
  if (location && location !== 'all') {
    const locId = location.toLowerCase().trim();
    filtered = filtered.filter(f => {
      // If food has no specific locations defined, it is available everywhere across Lagos
      if (!f.availableLocations || f.availableLocations.length === 0) return true;
      return f.availableLocations.some(l => {
        const lNorm = l.toLowerCase().trim();
        return lNorm === locId || locId.includes(lNorm) || lNorm.includes(locId);
      });
    });
  }

  res.json(filtered);
});

app.post('/api/menu', requireAdmin, (req: Request, res: Response) => {
  const { name, description, price, category, tag, image, rating, time, availableLocations } = req.body;
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
    status: 'Available',
    availableLocations: Array.isArray(availableLocations) ? availableLocations : []
  });

  res.status(201).json(newFood);
});

app.all(['/api/menu/:id', '/api/foods/:id'], requireAdmin, (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'DELETE') {
    const id = Number(req.params.id);
    const success = storage.deleteFood(id);
    if (!success) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    return res.json({ message: 'Menu item deleted successfully' });
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    const id = Number(req.params.id);
    const updated = storage.updateFood(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    return res.json(updated);
  }

  next();
});

app.patch(['/api/menu/:id/locations', '/api/foods/:id/locations'], requireAdmin, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { locations } = req.body;
  if (!Array.isArray(locations)) {
    return res.status(400).json({ error: 'locations must be an array of location IDs' });
  }
  const updated = storage.assignMealLocations(id, locations);
  if (!updated) {
    return res.status(404).json({ error: 'Menu item not found' });
  }
  res.json({ success: true, message: 'Meal locations updated successfully', food: updated });
});

// ==========================================
// 1B. DELIVERY LOCATIONS (LAGOS STATE ONLY)
// ==========================================
app.get('/api/locations', (req: Request, res: Response) => {
  const all = req.query.all === 'true';
  const locations = storage.getLocations(!all);
  res.json(locations);
});

app.post('/api/locations', requireAdmin, (req: Request, res: Response) => {
  const { name, zone, deliveryFee, estimatedTime, isActive } = req.body;
  if (!name || deliveryFee === undefined || deliveryFee === null || isNaN(Number(deliveryFee))) {
    return res.status(400).json({ error: 'Location name and a valid deliveryFee are required' });
  }

  const newLoc = storage.addLocation({
    name: String(name).trim(),
    zone: zone ? String(zone).trim() : 'Lagos',
    deliveryFee: Number(deliveryFee) || 0,
    estimatedTime: estimatedTime ? String(estimatedTime).trim() : '25–40 min',
    isActive: isActive !== undefined ? Boolean(isActive) : true
  });

  res.status(201).json(newLoc);
});

app.all('/api/locations/:id', requireAdmin, (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const id = String(req.params.id);
    const updated = storage.updateLocation(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Location not found' });
    }
    return res.json(updated);
  }
  next();
});

app.delete('/api/locations/:id', requireAdmin, (req: Request, res: Response) => {
  const id = String(req.params.id);
  const success = storage.deleteLocation(id);
  if (!success) {
    return res.status(404).json({ error: 'Location not found' });
  }
  res.json({ success: true, message: 'Location deleted successfully' });
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
    paymentMethod: paymentMethod || 'paystack',
    paymentStatus: paymentStatus || 'paid',
    paymentReference: paymentReference || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
    estimatedDeliveryTime: '25–40 mins'
  });

  // Automatically dispatch confirmation email to customer
  sendCustomerOrderConfirmationEmail(newOrder).catch(err => {
    console.error('[ORDER EMAIL ERROR - CUSTOMER]', err);
  });

  // Send order notification email to administrator
  sendAdminOrderNotificationEmail(newOrder).catch(err => {
    console.error('[ORDER EMAIL ERROR - ADMIN]', err);
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
// 3. PAYSTACK PAYMENT PROCESSING (EXCLUSIVE GATEWAY)
// ==========================================
app.post('/api/payments/paystack/initialize', async (req: Request, res: Response) => {
  try {
    const { email, amount, customerName, customerPhone, deliveryAddress, items } = req.body;
    if (!email || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid customer email and positive order amount are required' });
    }

    const amountInKobo = Math.round(Number(amount) * 100);
    const callbackUrl = req.headers.origin 
      ? `${req.headers.origin}/?payment=success` 
      : 'http://localhost:5173/?payment=success';

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: String(email).trim().toLowerCase(),
        amount: amountInKobo,
        callback_url: callbackUrl,
        metadata: {
          customerName,
          customerPhone,
          deliveryAddress,
          itemCount: Array.isArray(items) ? items.length : 0,
          custom_fields: [
            { display_name: 'Customer Name', variable_name: 'customer_name', value: customerName },
            { display_name: 'Delivery Address', variable_name: 'delivery_address', value: deliveryAddress }
          ]
        }
      })
    });

    const data: any = await paystackRes.json();
    if (!paystackRes.ok || !data.status) {
      return res.status(400).json({
        error: data.message || 'Unable to initialize transaction with Paystack'
      });
    }

    res.json({
      success: true,
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference
    });
  } catch (err: any) {
    console.error('[PAYSTACK INITIALIZE ERROR]', err);
    res.status(500).json({ error: 'Failed to connect to Paystack gateway' });
  }
});

app.post(['/api/payments/paystack/verify', '/api/payments/verify'], async (req: Request, res: Response) => {
  try {
    const { reference, orderPayload } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Payment reference is required for verification' });
    }

    // 1. Verify directly with Paystack API using secret key
    const paystackVerifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const verifyData: any = await paystackVerifyRes.json();
    if (!paystackVerifyRes.ok || !verifyData.status || verifyData.data?.status !== 'success') {
      const reason = verifyData.data?.gateway_response || verifyData.message || 'Payment verification failed';
      return res.status(400).json({
        success: false,
        verified: false,
        error: `Paystack payment could not be confirmed: ${reason}`
      });
    }

    const paystackTx = verifyData.data;

    // 2. If orderPayload is provided, create the confirmed order
    if (orderPayload && orderPayload.items && orderPayload.items.length > 0) {
      const newOrder = storage.createOrder({
        customerName: orderPayload.customerName || paystackTx.customer?.first_name || 'Customer',
        customerEmail: orderPayload.customerEmail || paystackTx.customer?.email || 'customer@magreattaste.ng',
        customerPhone: orderPayload.customerPhone || paystackTx.customer?.phone || '',
        deliveryAddress: orderPayload.deliveryAddress || 'Central Kitchen Dispatch',
        city: orderPayload.city || 'Lagos, Nigeria',
        deliveryNotes: orderPayload.deliveryNotes || '',
        items: orderPayload.items,
        subtotal: Number(orderPayload.subtotal) || 0,
        deliveryFee: Number(orderPayload.deliveryFee) || 0,
        total: Number(orderPayload.total) || (paystackTx.amount / 100),
        paymentMethod: 'paystack',
        paymentStatus: 'paid',
        paymentReference: reference,
        estimatedDeliveryTime: '25–40 mins'
      });

      // 3. Automatically send order confirmation email to the customer
      sendCustomerOrderConfirmationEmail(newOrder).catch(err => {
        console.error('[ORDER EMAIL ERROR - CUSTOMER]', err);
      });

      // 4. Send order notification email to administrator
      sendAdminOrderNotificationEmail(newOrder).catch(err => {
        console.error('[ORDER EMAIL ERROR - ADMIN]', err);
      });

      return res.status(201).json({
        success: true,
        verified: true,
        order: newOrder,
        message: 'Payment verified and order confirmed successfully.'
      });
    }

    return res.json({
      success: true,
      verified: true,
      reference,
      amount: paystackTx.amount / 100,
      paidAt: paystackTx.paid_at,
      channel: paystackTx.channel,
      message: 'Payment verified successfully.'
    });
  } catch (err: any) {
    console.error('[PAYSTACK VERIFY ERROR]', err);
    res.status(500).json({ error: 'Error verifying payment with Paystack gateway' });
  }
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

  const todayStr = new Date().toISOString().split('T')[0];
  if (eventDate && String(eventDate).trim() < todayStr) {
    return res.status(400).json({ error: 'Target event date cannot be in the past. Please select today or a future date.' });
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

  // 1. Instantly dispatch Thank You Email with fine card to customer
  if (newEnquiry.customerEmail && !newEnquiry.customerEmail.includes('example.com')) {
    sendCateringConsultationThankYouEmail(newEnquiry).catch(err => {
      console.error('[CATERING THANK YOU EMAIL EXCEPTION]', err);
    });
  }

  // 2. Notify kitchen admin in background via SMTP
  sendCateringEnquiryAlert(newEnquiry).catch(err => {
    console.error('[CATERING ALERT EXCEPTION]', err);
  });

  res.status(201).json(newEnquiry);
});

// One-click public confirmation endpoint from quotation email
app.get('/api/catering/:id/confirm', (req: Request, res: Response) => {
  const enquiries = storage.getCatering();
  const lead = enquiries.find(c => String(c.id) === String(req.params.id));
  if (!lead) {
    return res.status(404).send(`
      <!DOCTYPE html><html><body style="font-family: sans-serif; text-align: center; padding: 50px 20px;">
        <h2 style="color: #c6381e;">Booking Not Found</h2>
        <p>This catering booking record could not be found or has expired.</p>
        <a href="https://magreattaste.ng" style="color: #182838; font-weight: bold;">Return to Ma'Great Taste</a>
      </body></html>
    `);
  }

  const updated = storage.updateCateringStatus(String(req.params.id), 'Confirmed');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmed — Ma'Great Taste</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fbfaf6; margin: 0; padding: 40px 16px; color: #182838; display: flex; justify-content: center; align-items: center; min-height: 80vh; }
        .card { background: #ffffff; max-width: 540px; width: 100%; border-radius: 16px; border: 1.5px solid #e2e8f0; padding: 40px 32px; text-align: center; box-shadow: 0 10px 30px rgba(24,40,56,0.08); }
        .badge { background: #dcfce7; color: #15803d; padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 13px; display: inline-block; margin-bottom: 16px; }
        h1 { margin: 0 0 12px; font-size: 26px; color: #182838; }
        p { color: #64748b; line-height: 1.6; font-size: 15px; margin: 0 0 24px; }
        .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; text-align: left; margin-bottom: 28px; font-size: 14px; }
        .btn { display: inline-block; background: #c6381e; color: #ffffff; text-decoration: none; font-weight: 700; padding: 12px 28px; border-radius: 24px; font-size: 14px; margin: 4px; }
        .btn-wa { background: #25d366; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">🎉 BOOKING OFFICIALLY CONFIRMED</div>
        <h1>You're All Set, ${lead.customerName}!</h1>
        <p>Executive Chef Margaret and our kitchen brigade have locked in your date on our catering calendar. We look forward to creating an unforgettable feast for your guests.</p>
        <div class="details-box">
          <div style="margin-bottom: 8px;"><b>Event:</b> ${lead.eventType}</div>
          <div style="margin-bottom: 8px;"><b>Date:</b> ${lead.eventDate}</div>
          <div style="margin-bottom: 8px;"><b>Guest Count:</b> ${lead.guestCount} guests</div>
          <div><b>Location:</b> ${lead.location}</div>
        </div>
        <a href="https://wa.me/2349058271973" class="btn btn-wa">💬 Message Chef on WhatsApp</a>
        <a href="https://magreattaste.ng" class="btn">Explore Website</a>
      </div>
    </body>
    </html>
  `);
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
// CORPORATE TASTING BOX REQUESTS
// ==========================================
app.get('/api/tasting-requests', (req: Request, res: Response) => {
  const list = storage.getTastingRequests();
  res.json(list);
});

app.post('/api/tasting-requests', publicWriteLimit, async (req: Request, res: Response) => {
  const {
    companyName,
    contactPerson,
    contactPhone,
    companyEmail,
    guestCount,
    mealCount,
    mealSelections,
    location,
    preferredDate,
    preferredTime,
    notes
  } = req.body;

  if (!companyName || !contactPerson || !contactPhone || !companyEmail) {
    return res.status(400).json({ error: 'Company name, contact person, phone number, and official email are required.' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (preferredDate && String(preferredDate).trim() < todayStr) {
    return res.status(400).json({ error: 'Preferred tasting date cannot be in the past. Please select today or a future date.' });
  }

  const newRequest = storage.addTastingRequest({
    companyName: String(companyName).trim(),
    contactPerson: String(contactPerson).trim(),
    contactPhone: String(contactPhone).trim(),
    companyEmail: String(companyEmail).trim(),
    guestCount: Number(guestCount) || 5,
    mealCount: Number(mealCount) || 4,
    mealSelections: mealSelections ? String(mealSelections).trim() : 'Chef selection of bestsellers',
    location: location ? String(location).trim() : 'Lagos',
    preferredDate: preferredDate ? String(preferredDate).trim() : 'To be confirmed',
    preferredTime: preferredTime ? String(preferredTime).trim() : 'Lunchtime',
    notes: notes ? String(notes).trim() : undefined
  });

  // Fire emails asynchronously
  sendTastingRequestThankYouEmail(newRequest).catch(err => {
    console.error('[TASTING CLIENT EMAIL EXCEPTION]', err);
  });
  sendTastingRequestAdminAlert(newRequest).catch(err => {
    console.error('[TASTING ADMIN ALERT EXCEPTION]', err);
  });

  res.status(201).json({
    success: true,
    message: 'Tasting box request received successfully!',
    tastingRequest: newRequest
  });
});

app.patch('/api/tasting-requests/:id/status', requireAdmin, (req: Request, res: Response) => {
  const { status, adminNotes } = req.body;
  const updated = storage.updateTastingRequestStatus(String(req.params.id), status, adminNotes);
  if (!updated) {
    return res.status(404).json({ error: 'Tasting request not found' });
  }
  res.json(updated);
});

app.delete('/api/tasting-requests/:id', requireAdmin, (req: Request, res: Response) => {
  const deleted = storage.deleteTastingRequest(String(req.params.id));
  if (!deleted) {
    return res.status(404).json({ error: 'Tasting request not found' });
  }
  res.json({ success: true, message: 'Tasting request deleted' });
});

// ==========================================
// SIGNATURE DISHES ENDPOINTS
// ==========================================
app.get('/api/signature-dishes', (req: Request, res: Response) => {
  const list = storage.getSignatureDishes();
  res.json(list);
});

app.post('/api/signature-dishes', requireAdmin, (req: Request, res: Response) => {
  const { name, tag, price, description, image, local, alt, order, foodId } = req.body;
  if (!name || !image) {
    return res.status(400).json({ error: 'Dish name and image URL are required.' });
  }
  const newDish = storage.addSignatureDish({
    name: String(name).trim(),
    tag: tag ? String(tag).trim() : "Chef's Pride",
    price: price ? Number(price) : undefined,
    description: description ? String(description).trim() : '',
    image: String(image).trim(),
    local: local ? String(local).trim() : undefined,
    alt: alt ? String(alt).trim() : String(name).trim(),
    order: order ? Number(order) : 99,
    foodId: foodId ? Number(foodId) : undefined
  });
  res.status(201).json(newDish);
});

app.all('/api/signature-dishes/:id', requireAdmin, (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const updated = storage.updateSignatureDish(String(req.params.id), req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Signature dish not found' });
    }
    return res.json(updated);
  }
  next();
});

app.delete('/api/signature-dishes/:id', requireAdmin, (req: Request, res: Response) => {
  const deleted = storage.deleteSignatureDish(String(req.params.id));
  if (!deleted) {
    return res.status(404).json({ error: 'Signature dish not found' });
  }
  res.json({ success: true, message: 'Signature dish removed' });
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

  // 1. Dispatch confirmation email to applicant
  if (newApp.email && newApp.email.includes('@') && !newApp.email.includes('example.com')) {
    sendAcademyApplicationConfirmationEmail({
      refNumber: newApp.refNumber,
      fullName: newApp.fullName,
      email: newApp.email,
      phone: newApp.phone,
      journey: newApp.journey,
      schedule: newApp.schedule,
      experience: newApp.experience,
      notes: newApp.notes
    }).catch(err => {
      console.error('[ACADEMY EMAIL ERROR] Failed to send applicant confirmation:', err);
    });
  }

  // 2. Dispatch alert to administrator at hello@magreattaste.ng
  sendAcademyApplicationAdminAlert({
    refNumber: newApp.refNumber,
    fullName: newApp.fullName,
    email: newApp.email,
    phone: newApp.phone,
    journey: newApp.journey,
    schedule: newApp.schedule,
    experience: newApp.experience,
    notes: newApp.notes
  }).catch(err => {
    console.error('[ACADEMY EMAIL ERROR] Failed to send admin alert:', err);
  });

  res.status(201).json({
    success: true,
    message: 'Application received successfully! Confirmation email dispatched.',
    refNumber: newApp.refNumber,
    application: newApp
  });
});

app.all(['/api/academy/applications/:id/status', '/api/academy/:id/status'], requireAdmin, (req: Request, res: Response) => {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed. Use PATCH or PUT.' });
  }
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }
  const updated = storage.updateAcademyApplicationStatus(String(req.params.id), status);
  if (!updated) {
    return res.status(404).json({ error: 'Application not found' });
  }

  // Dispatch branded status update email to applicant (e.g. Admitted, Contacted, Enrolled)
  if (updated.email && updated.email.includes('@') && !updated.email.includes('example.com')) {
    sendAcademyStatusUpdateEmail({
      refNumber: updated.refNumber,
      fullName: updated.fullName,
      email: updated.email,
      journey: updated.journey,
      schedule: updated.schedule
    }, status).catch(err => {
      console.error('[ACADEMY STATUS EMAIL ERROR] Failed to send update:', err);
    });
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

app.post(['/api/mealplans/custom-request', '/api/meal-plans/custom-request'], publicWriteLimit, async (req: Request, res: Response) => {
  const {
    planType,
    description,
    mealOptions,
    customerName,
    customerEmail,
    customerPhone,
    deliveryArea,
    preferredStartDate
  } = req.body;

  if (!planType || !String(planType).trim()) {
    return res.status(400).json({ error: 'Type of plan is required' });
  }
  if (!customerName || !String(customerName).trim()) {
    return res.status(400).json({ error: 'Customer name is required' });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (preferredStartDate && String(preferredStartDate).trim() < todayStr) {
    return res.status(400).json({ error: 'Preferred start date cannot be in the past. Please select today or a future date.' });
  }

  const cleanMealOptions = Array.isArray(mealOptions) ? mealOptions : [];
  const refId = `CMP-${Math.floor(1000 + Math.random() * 9000)}`;

  // Save to meal plans storage
  const newOrder = storage.createMealPlanOrder({
    planId: 'custom-plan',
    planName: `Custom Plan: ${String(planType).trim()}`,
    customerName: String(customerName).trim(),
    customerEmail: customerEmail ? String(customerEmail).trim() : 'customplan@magreattaste.ng',
    customerPhone: customerPhone ? String(customerPhone).trim() : '',
    deliveryAddress: deliveryArea ? String(deliveryArea).trim() : 'Lagos, Nigeria',
    city: deliveryArea ? String(deliveryArea).trim() : 'Lagos, Nigeria',
    frequency: 'Weekly',
    total: 0
  });

  // Automatically dispatch confirmation email to customer
  if (customerEmail && String(customerEmail).includes('@') && !String(customerEmail).includes('example.com')) {
    sendCustomMealPlanConfirmationEmail({
      refId,
      customerName: String(customerName).trim(),
      customerEmail: String(customerEmail).trim(),
      customerPhone: customerPhone ? String(customerPhone).trim() : undefined,
      planType: String(planType).trim(),
      description: description ? String(description).trim() : undefined,
      preferredStartDate: preferredStartDate ? String(preferredStartDate).trim() : undefined,
      deliveryArea: deliveryArea ? String(deliveryArea).trim() : undefined,
      mealOptions: cleanMealOptions
    }).catch(err => {
      console.error('[CUSTOM MEAL PLAN EMAIL EXCEPTION]', err);
    });
  }

  res.status(201).json({
    success: true,
    refId,
    orderId: newOrder.id,
    message: 'Custom meal plan request received! Confirmation email sent.'
  });
});

// ==========================================
// 7. MESSAGES & ENQUIRIES
// ==========================================
app.get('/api/messages', requireAdmin, (req: Request, res: Response) => {
  const messages = storage.getMessages();
  res.json(messages);
});

app.post(['/api/messages', '/api/contact'], publicWriteLimit, (req: Request, res: Response) => {
  const { name, email, phone, subject, body, message } = req.body;
  const messageText = body || message;
  if (!name || !String(name).trim() || !messageText || !String(messageText).trim()) {
    return res.status(400).json({ error: 'Name and message body are required' });
  }

  const customerEmail = email ? String(email).trim() : 'guest@example.com';
  const newMsg = storage.addMessage({
    name: String(name).trim(),
    email: customerEmail,
    phone: phone ? String(phone).trim() : undefined,
    subject: subject ? String(subject).trim() : 'Website Inquiry',
    body: String(messageText).trim()
  });

  // 1. Deliver notification to administrator at hello@magreattaste.ng
  sendContactMessageNotification({
    name: String(name).trim(),
    email: customerEmail,
    phone: phone ? String(phone).trim() : undefined,
    subject: subject ? String(subject).trim() : 'Website Inquiry',
    body: String(messageText).trim()
  }).catch(err => {
    console.error('[EMAIL ERROR] Failed to send contact message email alert to admin:', err);
  });

  // 2. Automatically send confirmation email to customer
  if (customerEmail && customerEmail.includes('@') && !customerEmail.includes('example.com')) {
    sendContactConfirmationEmailToCustomer({
      name: String(name).trim(),
      email: customerEmail,
      phone: phone ? String(phone).trim() : undefined,
      subject: subject ? String(subject).trim() : 'Website Inquiry',
      body: String(messageText).trim()
    }).catch(err => {
      console.error('[EMAIL ERROR] Failed to send contact confirmation email to customer:', err);
    });
  }

  res.status(201).json({
    success: true,
    message: 'Message sent successfully! A confirmation email has been dispatched to your inbox.',
    data: newMsg
  });
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

  // 3. Deliver welcome email directly to new subscriber
  sendNewsletterWelcomeEmail(cleanEmail).catch(err => {
    console.error('[EMAIL ERROR] Failed to dispatch newsletter welcome email:', err);
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
  const { customerName, customerEmail, customerPhone, items, savedMeals } = req.body;
  const mealItems = items || savedMeals;
  if (!customerEmail || !mealItems || !Array.isArray(mealItems)) {
    return res.status(400).json({ error: 'Customer email and saved meal items are required' });
  }

  const result = storage.addOrUpdateCustomerSavedMeals({
    customerName: customerName || 'Food Lover',
    customerEmail,
    customerPhone,
    items: mealItems
  });

  // Fire branded confirmation email (non-blocking)
  sendSavedMealConfirmationEmail({
    customerName: customerName || 'Food Lover',
    customerEmail,
    items: mealItems
  }).catch(err => console.error('[SAVED MEAL EMAIL] Fire error:', err.message));

  res.status(201).json({
    message: `Your saved meals list has been updated.`,
    ...result
  });
});

// Customer Dashboard: Fetch Saved Meals for Logged-in Customer
app.get('/api/customer/saved-meals', (req: Request, res: Response) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Customer email query parameter is required' });
  }
  const allSaved = storage.getSavedMeals();
  const userRecord = allSaved.find(s => s.customerEmail.toLowerCase().trim() === email);
  if (userRecord) {
    const savedMealIds = userRecord.items.map(i => i.foodId).filter(id => typeof id === 'number');
    res.json({
      ...userRecord,
      savedMealIds
    });
  } else {
    res.json({ customerEmail: email, items: [], savedMealIds: [] });
  }
});

app.post('/api/saved-meals/:id/remind', requireAdmin, async (req: Request, res: Response) => {
  const result = storage.sendSavedMealReminder(String(req.params.id));
  if (!result.success || !result.record) {
    return res.status(404).json({ error: result.message });
  }

  // Dispatch branded dinner reminder email live to customer
  let emailSent = false;
  try {
    const emailRes = await sendSavedMealReminderEmail({
      customerName: result.record.customerName,
      customerEmail: result.record.customerEmail,
      items: result.record.items,
      customMessage: result.reminderText
    });
    emailSent = emailRes.success;
  } catch (err: any) {
    console.error('[SAVED MEAL REMINDER EMAIL EXCEPTION]', err);
  }

  res.json({
    ...result,
    emailDispatched: emailSent,
    message: emailSent
      ? `Branded dinner reminder dispatched to ${result.record.customerEmail}!`
      : `Reminder recorded for ${result.record.customerEmail}.`
  });
});

app.post('/api/saved-meals/bulk-remind', requireAdmin, async (req: Request, res: Response) => {
  const { ids } = req.body;
  const list = storage.getSavedMeals();
  let dispatched = 0;
  let emailDispatchedCount = 0;
  const results: any[] = [];

  for (const item of list) {
    if (!ids || ids.length === 0 || ids.includes(item.id)) {
      if (item.reminderStatus !== 'Unsubscribed' && item.customerEmail) {
        item.lastReminderSentAt = new Date().toISOString();
        item.reminderCount = (item.reminderCount || 0) + 1;
        dispatched++;
        results.push({ id: item.id, name: item.customerName, email: item.customerEmail });

        // Dispatch email to customer (non-blocking)
        sendSavedMealReminderEmail({
          customerName: item.customerName,
          customerEmail: item.customerEmail,
          items: item.items
        }).then(res => {
          if (res.success) emailDispatchedCount++;
        }).catch(err => {
          console.error(`[BULK REMINDER EMAIL EXCEPTION for ${item.customerEmail}]`, err);
        });
      }
    }
  }

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

  // Automatically transition status to 'Quote sent' and save quote details
  const updated = storage.updateCateringStatus(String(req.params.id), 'Quote sent', {
    quoteAmount: Number(quoteAmount) || 0,
    menuNotes: menuNotes || ''
  });

  let emailDispatched = false;
  let emailMessage = '';
  const targetLead = updated || lead;

  if (targetLead && targetLead.customerEmail) {
    try {
      const emailResult = await sendCateringQuotationEmail(targetLead, Number(quoteAmount) || 0, menuNotes || '');
      emailDispatched = emailResult.success;
      emailMessage = emailResult.message;
    } catch (err: any) {
      emailMessage = err.message || 'SMTP failed';
    }
  }

  res.json({
    success: true,
    message: emailDispatched 
      ? `Quotation of ₦${(Number(quoteAmount) || 0).toLocaleString()} emailed to ${targetLead?.customerEmail}! Status automatically switched to "Quote sent".`
      : `Quotation saved and status updated to "Quote sent"${emailMessage ? ' (' + emailMessage + ')' : ''}`,
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

// Catering service prices – public read (frontend uses to build estimator) / admin write
app.get('/api/catering-service-prices', (req: Request, res: Response) => {
  const settings = storage.getSettings();
  const prices = settings.cateringServicePrices || [
    { id: 'buffet', label: 'Grand Buffet Feast', pricePerGuest: 8500 },
    { id: 'plated', label: 'Plated VIP 3-Course Banquet', pricePerGuest: 14000 },
    { id: 'cocktail', label: 'Cocktail & Grill Bar', pricePerGuest: 5500 }
  ];
  res.json(prices);
});

app.all('/api/catering-service-prices', (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') {
    const settings = storage.getSettings();
    return res.json(settings.cateringServicePrices || []);
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    return requireAdmin(req, res, () => {
      const prices = req.body;
      if (!Array.isArray(prices)) {
        return res.status(400).json({ error: 'Prices must be an array' });
      }
      storage.updateSettings({ cateringServicePrices: prices });
      res.json({ success: true, message: 'Catering service prices updated', prices });
    });
  }
  next();
});

app.patch('/api/catering-service-prices/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { pricePerGuest, label, description } = req.body;
  const settings = storage.getSettings();
  const prices = settings.cateringServicePrices || [];
  const idx = prices.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Service not found' });
  prices[idx] = { ...prices[idx], ...(pricePerGuest !== undefined && { pricePerGuest: Number(pricePerGuest) }), ...(label && { label }), ...(description && { description }) };
  storage.updateSettings({ cateringServicePrices: prices });
  res.json({ success: true, price: prices[idx] });
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

// Public OTP generation and email dispatch for Customer Account Sign Up / Sign In
app.post('/api/auth/send-otp', publicWriteLimit, async (req: Request, res: Response) => {
  try {
    const { email, name, otp, purpose } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and verification code (OTP) are required' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();
    const cleanName = name ? String(name).trim() : cleanEmail.split('@')[0];

    const emailSent = await sendOtpVerificationEmail({
      email: cleanEmail,
      name: cleanName,
      otp: cleanOtp,
      purpose: purpose === 'signin' ? 'signin' : 'signup'
    });

    return res.json({
      success: true,
      emailSent,
      message: emailSent
        ? `Verification code dispatched to ${cleanEmail}`
        : `Verification code generated (${cleanOtp})`
    });
  } catch (err: any) {
    console.error('[AUTH OTP ERROR]:', err);
    return res.status(500).json({ error: err.message || 'Failed to dispatch verification code' });
  }
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

    // Dispatch branded invitation email with login credentials
    sendAdminInviteEmail(created, password).catch(err => {
      console.error('[ADMIN INVITE EMAIL ERROR] Failed to send invite email:', err);
    });

    res.status(201).json({
      message: `Admin ${name} (${role === 'super_admin' ? 'Super Admin' : 'Admin Staff'}) invited successfully! Invitation email dispatched to ${email}.`,
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
