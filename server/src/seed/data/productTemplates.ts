/**
 * Product templates per top-level category. The generator (seed/catalog.ts) combines them with a
 * brand and a style word to produce ~18 products per store. Prices are in RUPEES here and are
 * converted to minor units (×100) by the generator.
 */
export type VariantScheme = 'apparel' | 'kids' | 'phone' | 'color' | 'capacity' | 'shade' | 'weight' | 'metal' | 'none';

export type ProductTemplate = {
  name: string;
  sub: string;
  price: [number, number];
  scheme: VariantScheme;
  tags: string[];
  highlights: string[];
  specs?: [string, string][];
  attributes?: Record<string, string>;
};

export const STYLE_WORDS: Record<string, string[]> = {
  'womens-fashion': ['Festive', 'Everyday', 'Luxe', 'Summer', 'Eid', 'Classic'],
  'mens-fashion': ['Classic', 'Slim Fit', 'Premium', 'Everyday', 'Eid', 'Office'],
  'mobiles-tablets': ['Pro', 'Lite', 'Max', 'Neo', 'Plus', 'Prime'],
  'electronic-devices': ['Pro', 'Air', 'Bass', 'Lite', 'Max', 'Studio'],
  'home-living': ['Handcrafted', 'Courtyard', 'Heritage', 'Modern', 'Cozy', 'Artisan'],
  'kitchen-dining': ['Classic', 'Granite', 'Ceramic', 'Family', 'Chef', 'Essential'],
  'beauty-personal-care': ['Rose', 'Saffron', 'Aloe', 'Velvet', 'Oud', 'Glow'],
  groceries: ['Premium', 'Organic', 'Family Pack', 'Select', 'Farm Fresh', 'Classic'],
  'kids-toys': ['Happy', 'Rainbow', 'Little', 'Smart', 'Cuddly', 'Junior'],
  'sports-outdoors': ['Pro', 'Club', 'Training', 'Match', 'Trail', 'Elite'],
  'books-stationery': ['Classic', 'Student', 'Deluxe', 'Pocket', 'Illustrated', 'Signature'],
  'jewelry-watches': ['Royal', 'Classic', 'Bridal', 'Minimal', 'Heritage', 'Signature'],
};

export const COLORS = ['Black', 'White', 'Navy', 'Maroon', 'Teal', 'Mustard', 'Olive', 'Beige', 'Pink', 'Sky Blue', 'Grey', 'Emerald'];

export const COLOR_HEX: Record<string, string> = {
  Black: '#1E1E1E',
  White: '#F4F1EA',
  Navy: '#1F3A5F',
  Maroon: '#7A1F2B',
  Teal: '#0E5E5A',
  Mustard: '#D4A017',
  Olive: '#6B7A2E',
  Beige: '#D9C7A7',
  Pink: '#E58FB1',
  'Sky Blue': '#6FB1E0',
  Grey: '#8A8F94',
  Emerald: '#1F8A5B',
  Silver: '#C0C4C8',
  'Gold plated': '#D4AF37',
  'Rose gold': '#C98F7A',
  Steel: '#9AA3AB',
  Graphite: '#3B3F45',
  Midnight: '#1C2340',
  Mint: '#9BD8C3',
};

export const TEMPLATES: Record<string, ProductTemplate[]> = {
  'womens-fashion': [
    { name: 'Embroidered Lawn 3-Piece Suit', sub: 'unstitched-suits', price: [3500, 9500], scheme: 'color', tags: ['lawn', 'unstitched', 'suit', 'embroidered'], highlights: ['3-piece unstitched: shirt, dupatta, trouser', 'Embroidered neckline and daaman', 'Pure lawn, breathable for summer'], attributes: { material: 'Lawn' } },
    { name: 'Printed Khaddar 2-Piece', sub: 'unstitched-suits', price: [2800, 6500], scheme: 'color', tags: ['khaddar', 'winter', 'unstitched'], highlights: ['Warm khaddar weave', 'Digital print shirt + dyed trouser'], attributes: { material: 'Khaddar' } },
    { name: 'Cotton Straight Kurti', sub: 'kurtas-kurtis', price: [1600, 3900], scheme: 'apparel', tags: ['kurti', 'cotton', 'casual'], highlights: ['Soft cotton, ready to wear', 'Straight cut with side slits'], attributes: { material: 'Cotton' } },
    { name: 'Chikankari Kurta', sub: 'kurtas-kurtis', price: [3200, 7800], scheme: 'apparel', tags: ['kurta', 'chikankari', 'embroidered'], highlights: ['Hand-finished chikankari', 'Relaxed A-line fit'], attributes: { material: 'Cotton' } },
    { name: 'Chiffon Dupatta', sub: 'dupattas-shawls', price: [900, 2800], scheme: 'color', tags: ['dupatta', 'chiffon'], highlights: ['Lightweight chiffon', 'Finished edges with lace'], attributes: { material: 'Chiffon' } },
    { name: 'Pashmina Style Shawl', sub: 'dupattas-shawls', price: [2200, 6900], scheme: 'color', tags: ['shawl', 'winter', 'wool'], highlights: ['Soft wool blend', 'Paisley border'], attributes: { material: 'Wool' } },
    { name: 'Cigarette Pants', sub: 'womens-bottoms', price: [1200, 2600], scheme: 'apparel', tags: ['trouser', 'pants', 'cotton'], highlights: ['Stretch cotton', 'Slim ankle-length fit'], attributes: { material: 'Cotton' } },
    { name: 'Silk Shalwar', sub: 'womens-bottoms', price: [1500, 3200], scheme: 'apparel', tags: ['shalwar', 'silk'], highlights: ['Raw silk with sheen', 'Elasticated waistband'], attributes: { material: 'Silk' } },
  ],
  'mens-fashion': [
    { name: 'Wash & Wear Kurta Shalwar', sub: 'kurta-shalwar', price: [2800, 6500], scheme: 'apparel', tags: ['kurta', 'shalwar', 'wash and wear', 'eid'], highlights: ['Wrinkle-resistant wash & wear', 'Includes kurta and shalwar'], attributes: { material: 'Polyester' } },
    { name: 'Cotton Kurta', sub: 'kurta-shalwar', price: [2200, 4800], scheme: 'apparel', tags: ['kurta', 'cotton'], highlights: ['Breathable cotton', 'Band collar with placket'], attributes: { material: 'Cotton' } },
    { name: 'Oxford Formal Shirt', sub: 'mens-shirts', price: [1900, 4200], scheme: 'apparel', tags: ['shirt', 'formal', 'office'], highlights: ['Oxford weave cotton', 'Button-down collar'], attributes: { material: 'Cotton' } },
    { name: 'Linen Casual Shirt', sub: 'mens-shirts', price: [2400, 5200], scheme: 'apparel', tags: ['shirt', 'linen', 'casual', 'summer'], highlights: ['Pure linen, cool in summer', 'Relaxed fit'], attributes: { material: 'Linen' } },
    { name: 'Pique Polo T-Shirt', sub: 'mens-tshirts', price: [1100, 2600], scheme: 'apparel', tags: ['polo', 't-shirt', 'tshirt'], highlights: ['Cotton pique knit', 'Ribbed collar and cuffs'], attributes: { material: 'Cotton' } },
    { name: 'Crew Neck T-Shirt', sub: 'mens-tshirts', price: [800, 1800], scheme: 'apparel', tags: ['t-shirt', 'tshirt', 'basic'], highlights: ['Combed cotton', 'Pre-shrunk'], attributes: { material: 'Cotton' } },
    { name: 'Embroidered Waistcoat', sub: 'waistcoats', price: [3500, 8500], scheme: 'apparel', tags: ['waistcoat', 'wedding', 'eid'], highlights: ['Jamawar fabric', 'Fully lined'], attributes: { material: 'Silk' } },
    { name: 'Slim Fit Denim Jeans', sub: 'mens-jeans', price: [2500, 5500], scheme: 'apparel', tags: ['jeans', 'denim'], highlights: ['Stretch denim', '5-pocket styling'], attributes: { material: 'Denim' } },
    { name: 'Cotton Chino Pants', sub: 'mens-jeans', price: [2200, 4500], scheme: 'apparel', tags: ['chino', 'pants', 'trousers'], highlights: ['Soft twill cotton', 'Tapered leg'], attributes: { material: 'Cotton' } },
  ],
  'mobiles-tablets': [
    { name: 'Smartphone 6.7" AMOLED', sub: 'smartphones', price: [42000, 129000], scheme: 'phone', tags: ['smartphone', 'mobile', 'phone', 'amoled'], highlights: ['6.7" 120Hz AMOLED display', '50MP triple camera', '5000mAh battery with 33W charging'], specs: [['Display', '6.7" AMOLED, 120Hz'], ['Battery', '5000mAh'], ['Camera', '50MP + 8MP + 2MP'], ['SIM', 'Dual SIM, PTA approved']], attributes: { ram: '8GB', warranty: '1 year' } },
    { name: 'Smartphone 6.5" Everyday', sub: 'smartphones', price: [24000, 52000], scheme: 'phone', tags: ['smartphone', 'mobile', 'phone', 'budget'], highlights: ['6.5" HD+ display', '6000mAh long-life battery', 'Face unlock & fingerprint'], specs: [['Display', '6.5" IPS'], ['Battery', '6000mAh'], ['SIM', 'Dual SIM, PTA approved']], attributes: { ram: '4GB', warranty: '1 year' } },
    { name: 'Tablet 10.4" Wi-Fi', sub: 'tablets', price: [38000, 89000], scheme: 'phone', tags: ['tablet', 'android', 'kids', 'study'], highlights: ['10.4" 2K display', 'Quad speakers', '7040mAh battery'], specs: [['Display', '10.4" 2000x1200'], ['Battery', '7040mAh']], attributes: { ram: '6GB', warranty: '1 year' } },
    { name: 'Shockproof Phone Case', sub: 'phone-cases', price: [450, 1500], scheme: 'color', tags: ['case', 'cover', 'phone case'], highlights: ['Military-grade drop protection', 'Raised camera lip'] },
    { name: 'Fast Charger 33W', sub: 'chargers-cables', price: [1200, 3200], scheme: 'none', tags: ['charger', 'fast charging', 'usb-c'], highlights: ['33W fast charging', 'Over-heat protection'], specs: [['Output', '33W max'], ['Port', 'USB-C']], attributes: { warranty: '6 months' } },
    { name: 'Braided USB-C Cable 1.5m', sub: 'chargers-cables', price: [350, 1100], scheme: 'color', tags: ['cable', 'usb-c', 'charging cable'], highlights: ['Nylon braided, 10,000+ bends', 'Supports 60W'] },
    { name: 'Power Bank 20000mAh', sub: 'power-banks', price: [3500, 7500], scheme: 'color', tags: ['power bank', 'battery', 'portable charger'], highlights: ['20000mAh capacity', 'Charges 2 devices at once', 'LED level indicator'], specs: [['Capacity', '20000mAh'], ['Output', '22.5W']], attributes: { warranty: '6 months' } },
  ],
  'electronic-devices': [
    { name: 'Wireless Earbuds ANC', sub: 'earbuds-headphones', price: [3500, 14000], scheme: 'color', tags: ['earbuds', 'wireless', 'bluetooth', 'anc'], highlights: ['Active noise cancellation', '30h total battery with case', 'IPX5 sweat resistant'], specs: [['Bluetooth', '5.3'], ['Battery', '6h + 24h case']], attributes: { connectivity: 'Bluetooth', warranty: '1 year' } },
    { name: 'Over-Ear Headphones', sub: 'earbuds-headphones', price: [4500, 16000], scheme: 'color', tags: ['headphones', 'wireless', 'bass'], highlights: ['40mm drivers with deep bass', 'Foldable design', '45h battery'], attributes: { connectivity: 'Bluetooth', warranty: '1 year' } },
    { name: 'Smart Watch AMOLED', sub: 'smart-watches', price: [5500, 22000], scheme: 'color', tags: ['smart watch', 'smartwatch', 'fitness tracker'], highlights: ['1.43" AMOLED display', 'Heart-rate & SpO2', 'Bluetooth calling'], attributes: { connectivity: 'Bluetooth', warranty: '1 year' } },
    { name: 'Portable Bluetooth Speaker', sub: 'speakers', price: [2900, 12500], scheme: 'color', tags: ['speaker', 'bluetooth', 'portable'], highlights: ['20W stereo sound', 'IPX7 waterproof', '12h playtime'], attributes: { connectivity: 'Bluetooth', warranty: '6 months' } },
    { name: 'Soundbar 2.1', sub: 'speakers', price: [14000, 32000], scheme: 'none', tags: ['soundbar', 'tv', 'home theater'], highlights: ['Wireless subwoofer', 'HDMI ARC & optical'], attributes: { connectivity: 'Wired', warranty: '1 year' } },
    { name: 'Mechanical Keyboard', sub: 'computer-accessories', price: [4500, 12000], scheme: 'color', tags: ['keyboard', 'mechanical', 'gaming'], highlights: ['Hot-swappable switches', 'RGB backlight'], attributes: { connectivity: 'Wired', warranty: '1 year' } },
    { name: 'Wireless Mouse Silent', sub: 'computer-accessories', price: [1200, 3500], scheme: 'color', tags: ['mouse', 'wireless', 'office'], highlights: ['Silent clicks', '18-month battery'], attributes: { connectivity: 'Bluetooth', warranty: '6 months' } },
  ],
  'home-living': [
    { name: 'Brass Table Lamp', sub: 'lighting', price: [3500, 11000], scheme: 'none', tags: ['lamp', 'table lamp', 'brass', 'lighting'], highlights: ['Antique brass finish', 'Fabric shade, warm glow'] },
    { name: 'Moroccan Hanging Lantern', sub: 'lighting', price: [2800, 9000], scheme: 'color', tags: ['lantern', 'fanoos', 'lighting', 'ramadan'], highlights: ['Hand-cut metal pattern', 'Casts beautiful shadows'] },
    { name: 'Cotton Bedsheet Set (King)', sub: 'bedding', price: [3200, 7900], scheme: 'color', tags: ['bedsheet', 'bedding', 'cotton'], highlights: ['1 bedsheet + 2 pillow covers', '200 thread-count cotton'], attributes: { material: 'Cotton' } },
    { name: 'Quilted Comforter', sub: 'bedding', price: [5500, 14000], scheme: 'color', tags: ['comforter', 'razai', 'winter'], highlights: ['Microfiber filling', 'Machine washable'] },
    { name: 'Wooden Wall Mirror', sub: 'home-decor', price: [4200, 12500], scheme: 'none', tags: ['mirror', 'decor', 'wall'], highlights: ['Sheesham wood frame', 'Arch shape'] },
    { name: 'Ceramic Vase Set', sub: 'home-decor', price: [1800, 5200], scheme: 'color', tags: ['vase', 'decor', 'ceramic'], highlights: ['Set of 3 sizes', 'Glazed finish'] },
    { name: 'Hand-Knotted Rug 4x6', sub: 'rugs-cushions', price: [9500, 28000], scheme: 'color', tags: ['rug', 'carpet', 'handmade'], highlights: ['Hand-knotted wool', 'Geometric motif'], attributes: { material: 'Wool' } },
    { name: 'Embroidered Cushion Covers (Set of 4)', sub: 'rugs-cushions', price: [1500, 3800], scheme: 'color', tags: ['cushion', 'covers', 'decor'], highlights: ['Set of 4, 16x16"', 'Hidden zipper'] },
  ],
};
