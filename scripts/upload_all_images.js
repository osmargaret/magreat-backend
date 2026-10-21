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
  }
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

// Optimize Cloudinary URL by inserting f_auto,q_auto,w_800
function makeOptimizedUrl(secureUrl) {
  if (!secureUrl) return secureUrl;
  return secureUrl.replace('/upload/', '/upload/f_auto,q_auto,w_800/');
}

async function uploadFile(filePath, folder) {
  const filename = path.basename(filePath);
  const publicId = path.parse(filename).name;

  try {
    const res = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      public_id: publicId,
      overwrite: true,
      resource_type: 'image'
    });
    return makeOptimizedUrl(res.secure_url);
  } catch (err) {
    console.error(`Failed to upload ${filename}:`, err.message);
    return null;
  }
}

async function run() {
  console.log('🚀 Starting Cloudinary Bulk Image Upload for Ma’Great Taste...');
  const mealMap = {};

  if (fs.existsSync(MEALS_DIR)) {
    const files = fs.readdirSync(MEALS_DIR).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    console.log(`Found ${files.length} meal images in ${MEALS_DIR}`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(MEALS_DIR, file);
      process.stdout.write(`[${i + 1}/${files.length}] Uploading ${file}... `);
      const url = await uploadFile(filePath, 'magreat_meals');
      if (url) {
        mealMap[file] = url;
        mealMap[`/meals/${file}`] = url;
        console.log(`✅ OK`);
      } else {
        console.log(`❌ Failed`);
      }
    }
  }

  // Brand images
  if (fs.existsSync(IMAGES_DIR)) {
    const brandFiles = fs.readdirSync(IMAGES_DIR).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    for (const b of brandFiles) {
      const bPath = path.join(IMAGES_DIR, b);
      console.log(`Uploading brand image ${b}...`);
      const bUrl = await uploadFile(bPath, 'magreat_brand');
      if (bUrl) {
        mealMap[b] = bUrl;
        mealMap[`/images/${b}`] = bUrl;
      }
    }
  }

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
    console.log(`\n🎉 Successfully updated ${updatedCount} meals in foods.json with Cloudinary CDN URLs!`);
  }

  // Save image_map.json
  const mapPath = path.resolve(__dirname, '../data/image_map.json');
  fs.writeFileSync(mapPath, JSON.stringify(mealMap, null, 2), 'utf8');
  console.log(`💾 Saved image map to ${mapPath}`);
}

run().catch(console.error);
