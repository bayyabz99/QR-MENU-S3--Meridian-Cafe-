// scripts/seed-meridian.js
// Meridian Cafe menü, tema ve işletme verilerini SQLite (database/menu.db) veritabanına aktarır.

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(__dirname, '../database/menu.db');
const db = new sqlite3.Database(dbPath);

const jsonPath = path.join(__dirname, '../database/meridian-menu.json');
const meridianData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function seedDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Tabloları oluştur
      db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        image TEXT,
        order_index INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        image TEXT,
        preparation_time INTEGER DEFAULT 3,
        order_index INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      console.log('🧹 Eski veriler temizleniyor...');
      db.run('DELETE FROM products');
      db.run('DELETE FROM categories');
      db.run('DELETE FROM product_allergens');
      db.run("DELETE FROM sqlite_sequence WHERE name IN ('products', 'categories', 'product_allergens')");

      // Meridian Cafe İşletme Ayarlarını Ekle/Güncelle
      const info = meridianData.restaurant;
      const themeColors = meridianData.theme.colors;

      const settingsToInsert = [
        { key: 'company_name', value: info.name },
        { key: 'restaurant_name', value: info.name },
        { key: 'admin_brand_text', value: info.name },
        { key: 'phone', value: info.phone },
        { key: 'address', value: info.address },
        { key: 'plus_code', value: info.plus_code },
        { key: 'rating', value: String(info.google_rating) },
        { key: 'reviews_count', value: String(info.reviews_count) },
        { key: 'price_range', value: info.price_range },
        { key: 'working_hours', value: info.working_hours },
        { key: 'restaurant_description', value: `${info.address} | Tel: ${info.phone}` },
        { key: 'restaurant_slogan', value: info.slogan },
        { key: 'company_slogan', value: info.slogan },
        { key: 'google_maps_url', value: info.google_maps_url },
        { key: 'google_maps_embed', value: info.google_maps_embed },

        // UI CSS Tema Değişkenleri
        { key: 'primary_color', value: themeColors.primary_sage },
        { key: 'primary_sage_dark', value: themeColors.primary_sage_dark },
        { key: 'warm_wood', value: themeColors.warm_wood },
        { key: 'dark_oak', value: themeColors.dark_oak },
        { key: 'hover_color', value: themeColors.amber_accent },
        { key: 'header_color', value: themeColors.matte_black },
        { key: 'menu_background_color', value: themeColors.cream_bg },
        { key: 'paper_background_color', value: themeColors.cream_paper },
        { key: 'text_color', value: themeColors.text_main },
        { key: 'text_muted', value: themeColors.text_muted },
        { key: 'font_family', value: meridianData.theme.typography.body_font },
        { key: 'heading_font_family', value: meridianData.theme.typography.heading_font }
      ];

      const stmtSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
      settingsToInsert.forEach((s) => {
        stmtSetting.run(s.key, s.value);
      });
      stmtSetting.finalize();
      console.log('⚙️  Meridian Cafe işletme ve tema ayarları güncellendi.');

      // Alerjen Belirleme Yardımcı Fonksiyonu
      const getProductAllergens = (catName, prodName) => {
        const catLower = (catName || '').toLowerCase();
        const prodLower = (prodName || '').toLowerCase();
        const allergens = [];

        // Kahveler & Çaylar -> Kafein
        if (catLower.includes('kahve') || catLower.includes('demleme') || catLower.includes('geleneksel') || prodLower.includes('latte') || prodLower.includes('mocha') || prodLower.includes('americano') || prodLower.includes('frappe') || prodLower.includes('çikolata')) {
          if (!prodLower.includes('bitki') && !prodLower.includes('su') && !prodLower.includes('soda') && !prodLower.includes('limonata')) {
            allergens.push({ name: 'Kafein', icon: 'fas fa-coffee' });
          }
        }

        // Süt içeren ürünler
        if (prodLower.includes('latte') || prodLower.includes('cappuccino') || prodLower.includes('mocha') || prodLower.includes('flat') || prodLower.includes('salep') || prodLower.includes('milkshake') || prodLower.includes('çikolata') || catLower.includes('tatlı') || prodLower.includes('fincan çay')) {
          if (!prodLower.includes('su') && !prodLower.includes('soda') && !prodLower.includes('gazoz') && !prodLower.includes('limonata') && !prodLower.includes('americano') && !prodLower.includes('espresso') && !prodLower.includes('v60') && !prodLower.includes('chemex')) {
            allergens.push({ name: 'Süt & Laktoz', icon: 'fas fa-glass-whiskey' });
          }
        }

        // Gluten içeren ürünler (Tatlılar, Kurabiyeler)
        if (catLower.includes('tatlı') || prodLower.includes('cookie') || prodLower.includes('burger') || prodLower.includes('pasta') || prodLower.includes('brownie') || prodLower.includes('cup') || prodLower.includes('cedric') || prodLower.includes('krep')) {
          allergens.push({ name: 'Gluten / Buğday', icon: 'fas fa-wheat-awn' });
        }

        // Yumurta içeren ürünler
        if (catLower.includes('tatlı') || prodLower.includes('pasta') || prodLower.includes('cheesecake') || prodLower.includes('brownie') || prodLower.includes('cedric') || prodLower.includes('krep')) {
          allergens.push({ name: 'Yumurta', icon: 'fas fa-egg' });
        }

        // Kuruyemiş (Fındık/Fıstık/Ceviz/Badem)
        if (prodLower.includes('fındık') || prodLower.includes('hazelnut') || prodLower.includes('toffenut') || prodLower.includes('fıstık') || prodLower.includes('ceviz') || prodLower.includes('badem') || prodLower.includes('lotus') || prodLower.includes('dubai')) {
          allergens.push({ name: 'Kuruyemiş (Fındık/Fıstık/Ceviz/Badem)', icon: 'fas fa-seedling' });
        }

        // Soya (Çikolata sosları, Moçha, Belçika Çikolatası)
        if (prodLower.includes('mocha') || prodLower.includes('çikolata') || prodLower.includes('crunch') || prodLower.includes('snickers') || prodLower.includes('brownie') || prodLower.includes('pasta')) {
          allergens.push({ name: 'Soya (Çikolata & Soslar)', icon: 'fas fa-leaf' });
        }

        return allergens;
      };

      const getCategoryImage = (catSlug) => {
        if (catSlug.includes('sicak-kahveler')) return '/images/cat-hot-coffee.jpg';
        if (catSlug.includes('soguk-kahveler')) return '/images/cat-cold-coffee.jpg';
        if (catSlug.includes('tatlilar')) return '/images/cat-desserts.jpg';
        if (catSlug.includes('geleneksel')) return '/images/cat-turkish-coffee.jpg';
        if (catSlug.includes('demleme') || catSlug.includes('3-nesil')) return '/images/cat-espresso.jpg';
        if (catSlug.includes('buzlu') || catSlug.includes('kokteyler')) return '/images/cat-cold-coffee.jpg';
        if (catSlug.includes('sicak-soguk')) return '/images/cat-tea-hot.jpg';
        return '/images/cat-hot-coffee.jpg';
      };

      // Kategorileri ve Ürünleri Ekle
      let catOrder = 0;
      meridianData.categories.forEach((catData) => {
        catOrder++;
        const catSlug = catData.slug || slugify(catData.name);
        const catImage = getCategoryImage(catSlug);

        db.run(
          'INSERT INTO categories (name, slug, description, image, order_index, is_active) VALUES (?, ?, ?, ?, ?, 1)',
          [catData.name, catSlug, catData.description || '', catImage, catOrder],
          function (err) {
            if (err) {
              console.error(`❌ Kategori eklenirken hata (${catData.name}):`, err.message);
              return;
            }

            const categoryId = this.lastID;
            console.log(`📁 Kategori eklendi: [ID:${categoryId}] ${catData.name}`);

            let prodOrder = 0;
            const stmtProd = db.prepare(
              'INSERT INTO products (category_id, name, slug, description, price, image, order_index, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
            );

            catData.products.forEach((prod) => {
              prodOrder++;

              let price = prod.base_price;
              let descParts = [];

              if (prod.description) {
                descParts.push(prod.description);
              }

              if (prod.has_variants && prod.variants && prod.variants.length > 0) {
                const varText = prod.variants.map((v) => `${v.size}: ₺${v.price}`).join(' | ');
                descParts.push(`Boyut Seçenekleri: ${varText}`);
              }

              const description = descParts.join('\n');
              const prodSlug = slugify(`${catSlug}-${prod.name}`);
              const prodImage = catImage;

              stmtProd.run(categoryId, prod.name, prodSlug, description, price, prodImage, prodOrder, function (pErr) {
                if (pErr) {
                  console.error(`   ❌ Ürün eklenirken hata (${prod.name}):`, pErr.message);
                } else {
                  const newProdId = this.lastID;
                  console.log(`   ☕ Ürün eklendi: ${prod.name} (₺${price}) -> ${prodImage}`);

                  // Otomatik Kahve/Kafe Alerjenlerini Veritabanına Ekle
                  const allergensList = getProductAllergens(catData.name, prod.name);
                  allergensList.forEach((aItem, aIdx) => {
                    db.run(
                      'INSERT INTO product_allergens (product_id, allergen_name, allergen_icon, order_index) VALUES (?, ?, ?, ?)',
                      [newProdId, aItem.name, aItem.icon, aIdx + 1]
                    );
                  });
                }
              });
            });

            stmtProd.finalize();
          }
        );
      });

      console.log('🎉 Seed script tamamlanıyor...');
      setTimeout(() => {
        resolve();
      }, 1000);
    });
  });
}

seedDatabase()
  .then(() => {
    console.log('✅ Meridian Cafe verileri SQLite (database/menu.db) veritabanına başarıyla aktarıldı!');
    db.close();
  })
  .catch((err) => {
    console.error('❌ Hata oluştu:', err);
    db.close();
  });
