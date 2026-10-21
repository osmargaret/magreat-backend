const fs = require('fs');
const path = require('path');
const dns = require('dns');
const https = require('https');
const cloudinary = require('cloudinary').v2;

const resolver = new dns.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);

const agent = new https.Agent({
  lookup: (host, opts, cb) => {
    resolver.resolve4(host, (err, addrs) => {
      if (!err && addrs && addrs.length > 0) {
        return cb(null, addrs[0], 4);
      }
      dns.lookup(host, opts, cb);
    });
  },
  keepAlive: true,
  maxSockets: 10
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'p2pa6dfi',
  api_key: process.env.CLOUDINARY_API_KEY || '683855118821861',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'HYHymAzBXMKxkL8WqiINNokxHDI',
  agent: agent
});

const MEALS_DIR = path.resolve(__dirname, '../../Magreat-front/public/meals');
const IMAGES_DIR = path.resolve(__dirname, '../../Magreat-front/public/images');
const FOODS_JSON = path.resolve(__dirname, '../data/foods.json');
const MAP_PATH = path.resolve(__dirname, '../data/image_map.json');

// Optimize Cloudinary URL by inserting f_auto,q_auto,w_800
function makeOptimizedUrl(secureUrl) {
  if (!secureUrl) return secureUrl;
  return secureUrl.replace('/upload/', '/upload/f_auto,q_auto,w_800/');
}

async function uploadFile(filePath, folder, retries = 2) {
  const filename = path.basename(filePath);
  const publicId = path.parse(filename).name;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await cloudinary.uploader.upload(filePath, {
        folder: folder,
        public_id: publicId,
        overwrite: true,
        resource_type: 'image'
      });
      return makeOptimizedUrl(res.secure_url);
    } catch (err) {
      if (attempt === retries) {
        console.error(`\n❌ Failed to upload ${filename} after ${retries} attempts:`, err.message);
        return null;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Simple concurrency runner
async function runConcurrent(items, limit, fn) {
  const results = [];
  const executing = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);

    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

async function run() {
  console.log('🚀 Starting Cloudinary Bulk Image Upload for Ma’Great Taste (High-Speed Concurrent)...');
  
  let mealMap = {};
  if (fs.existsSync(MAP_PATH)) {
    try {
      mealMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    } catch {}
  }

  const tasks = [];

  // Meal images
  if (fs.existsSync(MEALS_DIR)) {
    const files = fs.readdirSync(MEALS_DIR).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    console.log(`Found ${files.length} meal images in ${MEALS_DIR}`);
    files.forEach(f => {
      tasks.push({ file: f, path: path.join(MEALS_DIR, f), folder: 'magreat_meals', type: 'meal' });
    });
  }

  // Brand images
  if (fs.existsSync(IMAGES_DIR)) {
    const brandFiles = fs.readdirSync(IMAGES_DIR).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    brandFiles.forEach(b => {
      tasks.push({ file: b, path: path.join(IMAGES_DIR, b), folder: 'magreat_brand', type: 'brand' });
    });
  }

  console.log(`Total images to process: ${tasks.length}`);

  let completed = 0;
  await runConcurrent(tasks, 5, async (task) => {
    // If already in mealMap and valid cloudinary URL, can skip or re-upload if needed
    if (mealMap[task.file] && mealMap[task.file].includes('cloudinary.com')) {
      completed++;
      process.stdout.write(`\r[${completed}/${tasks.length}] (Cached) ${task.file}`);
      return;
    }

    const url = await uploadFile(task.path, task.folder);
    completed++;
    if (url) {
      mealMap[task.file] = url;
      if (task.type === 'meal') {
        mealMap[`/meals/${task.file}`] = url;
        mealMap[`meals/${task.file}`] = url;
      } else {
        mealMap[`/images/${task.file}`] = url;
        mealMap[`images/${task.file}`] = url;
      }
      process.stdout.write(`\r[${completed}/${tasks.length}] ✅ Uploaded ${task.file}       `);
    } else {
      process.stdout.write(`\r[${completed}/${tasks.length}] ⚠️ Skipped ${task.file}        `);
    }
  });

  console.log('\n\n💾 Saving image map to data/image_map.json...');
  fs.writeFileSync(MAP_PATH, JSON.stringify(mealMap, null, 2), 'utf8');

  // Update foods.json
  if (fs.existsSync(FOODS_JSON)) {
    const raw = fs.readFileSync(FOODS_JSON, 'utf8');
    const foods = JSON.parse(raw);
    let updatedCount = 0;

    for (const item of foods) {
      if (item.image) {
        const cleanPath = item.image.trim();
        const baseName = path.basename(cleanPath);
        if (mealMap[baseName]) {
          item.image = mealMap[baseName];
          updatedCount++;
        } else if (mealMap[cleanPath]) {
          item.image = mealMap[cleanPath];
          updatedCount++;
        }
      }
    }

    fs.writeFileSync(FOODS_JSON, JSON.stringify(foods, null, 2), 'utf8');
    console.log(`🎉 Successfully updated ${updatedCount} meals in foods.json with Cloudinary CDN URLs!`);
  }
}

run().catch(console.error);
