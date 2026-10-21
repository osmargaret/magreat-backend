import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import https from 'node:https';
import dns from 'node:dns';
import { v2 as cloudinary } from 'cloudinary';
import { storage } from './storage.js';

dotenv.config();

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

// Configure Cloudinary with user credentials & resilient agent
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'p2pa6dfi',
  api_key: process.env.CLOUDINARY_API_KEY || '683855118821861',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'HYHymAzBXMKxkL8WqiINNokxHDI',
  // @ts-ignore
  agent: httpsAgent
});

// Enable CORS for frontend and admin apps
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Increased limit for base64 image uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// --- Health Check ---
app.get('/api/health', (req: Request, res: Response) => {
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
app.post('/api/upload', async (req: Request, res: Response) => {
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

app.post('/api/menu', (req: Request, res: Response) => {
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

app.put('/api/menu/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = storage.updateFood(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Menu item not found' });
  }
  res.json(updated);
});

app.delete('/api/menu/:id', (req: Request, res: Response) => {
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
app.get('/api/orders', (req: Request, res: Response) => {
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

app.get('/api/orders/:id', (req: Request, res: Response) => {
  const order = storage.getOrderById(String(req.params.id));
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json(order);
});

app.post('/api/orders', (req: Request, res: Response) => {
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

app.patch('/api/orders/:id/status', (req: Request, res: Response) => {
  const { status, paymentStatus } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  const updated = storage.updateOrderStatus(String(req.params.id), status, paymentStatus);
  if (!updated) {
    return res.status(404).json({ error: 'Order not found' });
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

app.post('/api/blog', (req: Request, res: Response) => {
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

app.put('/api/blog/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updated = storage.updateBlog(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Article not found' });
  }
  res.json(updated);
});

app.delete('/api/blog/:id', (req: Request, res: Response) => {
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

app.post('/api/catering', (req: Request, res: Response) => {
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

  res.status(201).json(newEnquiry);
});

app.patch('/api/catering/:id/status', (req: Request, res: Response) => {
  const { status } = req.body;
  const updated = storage.updateCateringStatus(String(req.params.id), status);
  if (!updated) {
    return res.status(404).json({ error: 'Enquiry not found' });
  }
  res.json(updated);
});

// ==========================================
// 6. MEAL PLANS & FREEZER STOCKING
// ==========================================
app.get('/api/mealplans/packages', (req: Request, res: Response) => {
  res.json([
    {
      id: 'weekly-essentials',
      name: 'Weekly Essentials',
      meals: '10 meals',
      price: 45000,
      description: 'Ideal for busy professionals who want wholesome dinners throughout the working week.',
      features: ['5 main rice & pasta dishes', '2 traditional soup bowls', 'Freezer-safe portioned containers', 'Storage & reheating guide'],
      color: 'mint'
    },
    {
      id: 'family-freezer',
      name: 'Family Freezer Pack',
      meals: '20 meals',
      price: 85000,
      description: 'Generous family-sized portions ready to defrost and enjoy anytime.',
      features: ['Family-sized portions', 'Choice of 4 hearty soups & stews', 'Smoky jollof & fried rice tubs', 'Freezer-ready vacuum seal'],
      color: 'peach'
    },
    {
      id: 'monthly-stockup',
      name: 'Monthly Stock-Up Plan',
      meals: '40 meals',
      price: 165000,
      description: 'Complete peace of mind. We stock your freezer with fresh rotations every week.',
      features: ['4 weekly fresh deliveries', 'Fully customisable menu selection', 'Priority delivery slots', 'Complimentary chef seasonal treats'],
      color: 'lavender'
    }
  ]);
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
app.get('/api/messages', (req: Request, res: Response) => {
  const messages = storage.getMessages();
  res.json(messages);
});

app.post('/api/messages', (req: Request, res: Response) => {
  const { name, email, phone, subject, body } = req.body;
  if (!name || !body) {
    return res.status(400).json({ error: 'Name and message body are required' });
  }

  const newMsg = storage.addMessage({
    name,
    email: email || 'user@example.com',
    phone,
    subject: subject || 'New Website Inquiry',
    body
  });

  res.status(201).json(newMsg);
});

app.patch('/api/messages/:id/read', (req: Request, res: Response) => {
  const success = storage.markMessageRead(String(req.params.id));
  if (!success) {
    return res.status(404).json({ error: 'Message not found' });
  }
  res.json({ message: 'Marked as read' });
});

app.post('/api/messages/read-all', (req: Request, res: Response) => {
  storage.markAllMessagesRead();
  res.json({ message: 'All messages marked as read' });
});

// ==========================================
// 8. NEWSLETTER SUBSCRIPTION
// ==========================================
app.post('/api/newsletter', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  const created = storage.addSubscriber(email);
  if (!created) {
    return res.json({ message: 'You are already subscribed to our newsletter!', alreadySubscribed: true });
  }
  res.status(201).json({ message: 'Thank you for subscribing to Ma’Great Taste updates!' });
});

// ==========================================
// 9. DYNAMIC BUSINESS ANALYTICS
// ==========================================
app.get('/api/analytics', (req: Request, res: Response) => {
  const analytics = storage.getAnalytics();
  res.json(analytics);
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Ma’Great Taste Backend Server running on http://localhost:${PORT}`);
  console.log(`📡 Ready to serve Frontend (port 5173) and Admin Studio (port 5174)`);
});
