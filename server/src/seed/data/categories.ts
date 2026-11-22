import type { AttributeDef } from '@souqly/shared';

/** Art kinds drawn by art.ts (one simple illustration per category family). */
export type ArtKind =
  | 'kurta'
  | 'shirt'
  | 'phone'
  | 'headphones'
  | 'pot'
  | 'lamp'
  | 'bottle'
  | 'jar'
  | 'teddy'
  | 'ball'
  | 'book'
  | 'watch';

export type SeedSubcategory = { slug: string; en: string; ur: string; ar: string; icon: string };
export type SeedCategory = {
  slug: string;
  en: string;
  ur: string;
  ar: string;
  icon: string;
  color: string;
  /** Gradient used by the seed art. */
  palette: [string, string];
  art: ArtKind;
  attributes: AttributeDef[];
  children: SeedSubcategory[];
};

const label = (en: string, ur: string, ar: string) => ({ en, ur, ar });

const COLOR: AttributeDef = { key: 'color', label: label('Color', 'رنگ', 'اللون'), type: 'color', filterable: true, variantDefining: true };
const SIZE: AttributeDef = {
  key: 'size',
  label: label('Size', 'سائز', 'المقاس'),
  type: 'size',
  options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  filterable: true,
  variantDefining: true,
};
const MATERIAL: AttributeDef = {
  key: 'material',
  label: label('Material', 'میٹیریل', 'الخامة'),
  type: 'select',
  options: ['Cotton', 'Lawn', 'Khaddar', 'Chiffon', 'Silk', 'Linen', 'Wool', 'Denim', 'Polyester'],
  filterable: true,
  variantDefining: false,
};
const WARRANTY: AttributeDef = {
  key: 'warranty',
  label: label('Warranty', 'وارنٹی', 'الضمان'),
  type: 'select',
  options: ['No warranty', '6 months', '1 year', '2 years'],
  filterable: true,
  variantDefining: false,
};

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    slug: 'womens-fashion',
    en: "Women's Fashion",
    ur: 'خواتین کا فیشن',
    ar: 'أزياء نسائية',
    icon: 'Shirt',
    color: '#B83C6B',
    palette: ['#F6D3DF', '#B83C6B'],
    art: 'kurta',
    attributes: [COLOR, SIZE, MATERIAL],
    children: [
      { slug: 'unstitched-suits', en: 'Unstitched Suits', ur: 'ان سلے سوٹ', ar: 'أقمشة غير مخيطة', icon: 'Scissors' },
      { slug: 'kurtas-kurtis', en: 'Kurtas & Kurtis', ur: 'کرتے اور کرتیاں', ar: 'كورتا نسائية', icon: 'Shirt' },
      { slug: 'dupattas-shawls', en: 'Dupattas & Shawls', ur: 'دوپٹے اور شالیں', ar: 'أوشحة وشالات', icon: 'Wind' },
      { slug: 'womens-bottoms', en: 'Trousers & Shalwars', ur: 'ٹراؤزر اور شلوار', ar: 'سراويل نسائية', icon: 'Ruler' },
    ],
  },
  {
    slug: 'mens-fashion',
    en: "Men's Fashion",
    ur: 'مردانہ فیشن',
    ar: 'أزياء رجالية',
    icon: 'Shirt',
    color: '#2F5D8A',
    palette: ['#D6E4F2', '#2F5D8A'],
    art: 'shirt',
    attributes: [COLOR, SIZE, MATERIAL],
    children: [
      { slug: 'kurta-shalwar', en: 'Kurta Shalwar', ur: 'کرتا شلوار', ar: 'كورتا وشلوار', icon: 'Shirt' },
      { slug: 'mens-shirts', en: 'Shirts', ur: 'شرٹس', ar: 'قمصان', icon: 'Shirt' },
      { slug: 'mens-tshirts', en: 'T-Shirts & Polos', ur: 'ٹی شرٹس اور پولو', ar: 'تيشيرتات وبولو', icon: 'Shirt' },
      { slug: 'waistcoats', en: 'Waistcoats', ur: 'واسکٹ', ar: 'صديريات', icon: 'Shield' },
      { slug: 'mens-jeans', en: 'Jeans & Chinos', ur: 'جینز اور چینوز', ar: 'جينز وتشينو', icon: 'Ruler' },
    ],
  },
  {
    slug: 'mobiles-tablets',
    en: 'Mobiles & Tablets',
    ur: 'موبائل اور ٹیبلٹس',
    ar: 'الهواتف والأجهزة اللوحية',
    icon: 'Smartphone',
    color: '#0E5E5A',
    palette: ['#CFE8E5', '#0E5E5A'],
    art: 'phone',
    attributes: [
      { key: 'storage', label: label('Storage', 'اسٹوریج', 'السعة'), type: 'select', options: ['64GB', '128GB', '256GB', '512GB'], filterable: true, variantDefining: true },
      COLOR,
      WARRANTY,
      { key: 'ram', label: label('RAM', 'ریم', 'الذاكرة العشوائية'), type: 'select', options: ['4GB', '6GB', '8GB', '12GB'], filterable: true, variantDefining: false },
    ],
    children: [
      { slug: 'smartphones', en: 'Smartphones', ur: 'اسمارٹ فونز', ar: 'هواتف ذكية', icon: 'Smartphone' },
      { slug: 'tablets', en: 'Tablets', ur: 'ٹیبلٹس', ar: 'أجهزة لوحية', icon: 'Tablet' },
      { slug: 'phone-cases', en: 'Cases & Covers', ur: 'کیسز اور کورز', ar: 'أغطية وحافظات', icon: 'Square' },
      { slug: 'chargers-cables', en: 'Chargers & Cables', ur: 'چارجرز اور کیبلز', ar: 'شواحن وكابلات', icon: 'Plug' },
      { slug: 'power-banks', en: 'Power Banks', ur: 'پاور بینک', ar: 'بطاريات متنقلة', icon: 'BatteryCharging' },
    ],
  },
  {
    slug: 'electronic-devices',
    en: 'Electronics & Audio',
    ur: 'الیکٹرانکس اور آڈیو',
    ar: 'الإلكترونيات والصوتيات',
    icon: 'Headphones',
    color: '#4B3F8F',
    palette: ['#DEDAF4', '#4B3F8F'],
    art: 'headphones',
    attributes: [COLOR, WARRANTY, { key: 'connectivity', label: label('Connectivity', 'کنیکٹیویٹی', 'الاتصال'), type: 'select', options: ['Bluetooth', 'Wired', 'Wi-Fi'], filterable: true, variantDefining: false }],
    children: [
      { slug: 'earbuds-headphones', en: 'Earbuds & Headphones', ur: 'ائیر بڈز اور ہیڈ فونز', ar: 'سماعات', icon: 'Headphones' },
      { slug: 'smart-watches', en: 'Smart Watches', ur: 'اسمارٹ واچز', ar: 'ساعات ذكية', icon: 'Watch' },
      { slug: 'speakers', en: 'Speakers', ur: 'اسپیکرز', ar: 'مكبرات صوت', icon: 'Speaker' },
      { slug: 'computer-accessories', en: 'Computer Accessories', ur: 'کمپیوٹر لوازمات', ar: 'ملحقات الكمبيوتر', icon: 'Keyboard' },
    ],
  },
  {
    slug: 'home-living',
    en: 'Home & Living',
    ur: 'گھر اور رہائش',
    ar: 'المنزل والمعيشة',
    icon: 'Lamp',
    color: '#A8642A',
    palette: ['#F5E3CF', '#A8642A'],
    art: 'lamp',
    attributes: [COLOR, MATERIAL],
    children: [
      { slug: 'lighting', en: 'Lamps & Lighting', ur: 'لیمپ اور لائٹنگ', ar: 'مصابيح وإضاءة', icon: 'Lamp' },
      { slug: 'bedding', en: 'Bedding', ur: 'بستر', ar: 'مفروشات السرير', icon: 'BedDouble' },
      { slug: 'home-decor', en: 'Home Decor', ur: 'گھر کی سجاوٹ', ar: 'ديكور المنزل', icon: 'Flower2' },
      { slug: 'rugs-cushions', en: 'Rugs & Cushions', ur: 'قالین اور کشن', ar: 'سجاد ووسائد', icon: 'Square' },
    ],
  },
  {
    slug: 'kitchen-dining',
    en: 'Kitchen & Dining',
    ur: 'باورچی خانہ',
    ar: 'المطبخ وأدوات المائدة',
    icon: 'CookingPot',
    color: '#C2362F',
    palette: ['#F7D6D3', '#C2362F'],
    art: 'pot',
    attributes: [COLOR, { key: 'capacity', label: label('Capacity', 'گنجائش', 'السعة'), type: 'select', options: ['1L', '2L', '3L', '5L'], filterable: true, variantDefining: true }],
    children: [
      { slug: 'cookware', en: 'Cookware', ur: 'برتن', ar: 'أواني الطهي', icon: 'CookingPot' },
      { slug: 'dinnerware', en: 'Dinner Sets', ur: 'ڈنر سیٹ', ar: 'أطقم العشاء', icon: 'UtensilsCrossed' },
      { slug: 'kitchen-appliances', en: 'Small Appliances', ur: 'کچن آلات', ar: 'أجهزة المطبخ الصغيرة', icon: 'Blender' },
      { slug: 'storage-containers', en: 'Storage & Containers', ur: 'ڈبے اور کنٹینرز', ar: 'حافظات وعلب', icon: 'Archive' },
    ],
  },
  {
    slug: 'beauty-personal-care',
    en: 'Beauty & Personal Care',
    ur: 'خوبصورتی اور ذاتی نگہداشت',
    ar: 'الجمال والعناية الشخصية',
    icon: 'Sparkles',
    color: '#9C4A8B',
    palette: ['#F1DCEC', '#9C4A8B'],
    art: 'bottle',
    attributes: [{ key: 'shade', label: label('Shade', 'شیڈ', 'الدرجة'), type: 'select', filterable: true, variantDefining: true }, { key: 'skin_type', label: label('Skin type', 'جلد کی قسم', 'نوع البشرة'), type: 'select', options: ['All', 'Oily', 'Dry', 'Combination', 'Sensitive'], filterable: true, variantDefining: false }],
    children: [
      { slug: 'skincare', en: 'Skincare', ur: 'جلد کی دیکھ بھال', ar: 'العناية بالبشرة', icon: 'Droplets' },
      { slug: 'makeup', en: 'Makeup', ur: 'میک اپ', ar: 'مكياج', icon: 'Palette' },
      { slug: 'fragrances', en: 'Fragrances & Attar', ur: 'خوشبو اور عطر', ar: 'العطور والعود', icon: 'SprayCan' },
      { slug: 'hair-care', en: 'Hair Care', ur: 'بالوں کی دیکھ بھال', ar: 'العناية بالشعر', icon: 'Wind' },
    ],
  },
  {
    slug: 'groceries',
    en: 'Groceries',
    ur: 'گروسری',
    ar: 'البقالة',
    icon: 'ShoppingBasket',
    color: '#1F8A5B',
    palette: ['#D5EFE2', '#1F8A5B'],
    art: 'jar',
    attributes: [{ key: 'weight', label: label('Pack size', 'پیک سائز', 'حجم العبوة'), type: 'select', options: ['250g', '500g', '1kg', '5kg'], filterable: true, variantDefining: true }],
    children: [
      { slug: 'rice-atta', en: 'Rice & Atta', ur: 'چاول اور آٹا', ar: 'الأرز والدقيق', icon: 'Wheat' },
      { slug: 'spices', en: 'Spices & Masalas', ur: 'مصالحے', ar: 'التوابل والبهارات', icon: 'Flame' },
      { slug: 'tea-beverages', en: 'Tea & Beverages', ur: 'چائے اور مشروبات', ar: 'الشاي والمشروبات', icon: 'Coffee' },
      { slug: 'dry-fruits', en: 'Dry Fruits & Honey', ur: 'خشک میوہ جات اور شہد', ar: 'المكسرات والعسل', icon: 'Nut' },
    ],
  },
  {
    slug: 'kids-toys',
    en: 'Kids & Toys',
    ur: 'بچے اور کھلونے',
    ar: 'الأطفال والألعاب',
    icon: 'Baby',
    color: '#E07A2E',
    palette: ['#FBE3CC', '#E07A2E'],
    art: 'teddy',
    attributes: [COLOR, { key: 'age', label: label('Age', 'عمر', 'العمر'), type: 'size', options: ['0-2Y', '3-4Y', '5-6Y', '7-8Y', '9-10Y'], filterable: true, variantDefining: true }],
    children: [
      { slug: 'soft-toys', en: 'Soft Toys', ur: 'نرم کھلونے', ar: 'ألعاب محشوة', icon: 'Heart' },
      { slug: 'learning-toys', en: 'Learning & Puzzles', ur: 'تعلیمی کھلونے', ar: 'ألعاب تعليمية', icon: 'Puzzle' },
      { slug: 'kids-clothing', en: 'Kids Clothing', ur: 'بچوں کے کپڑے', ar: 'ملابس الأطفال', icon: 'Shirt' },
      { slug: 'school-bags', en: 'School Bags', ur: 'اسکول بیگ', ar: 'حقائب مدرسية', icon: 'Backpack' },
    ],
  },
  {
    slug: 'sports-outdoors',
    en: 'Sports & Outdoors',
    ur: 'کھیل اور آؤٹ ڈور',
    ar: 'الرياضة والهواء الطلق',
    icon: 'Dumbbell',
    color: '#2E7D32',
    palette: ['#D8EED9', '#2E7D32'],
    art: 'ball',
    attributes: [COLOR, SIZE],
    children: [
      { slug: 'cricket', en: 'Cricket', ur: 'کرکٹ', ar: 'الكريكيت', icon: 'Trophy' },
      { slug: 'fitness', en: 'Fitness Equipment', ur: 'فٹنس کا سامان', ar: 'معدات اللياقة', icon: 'Dumbbell' },
      { slug: 'sportswear', en: 'Sportswear', ur: 'اسپورٹس ویئر', ar: 'ملابس رياضية', icon: 'Shirt' },
      { slug: 'camping', en: 'Camping & Travel', ur: 'کیمپنگ اور سفر', ar: 'التخييم والسفر', icon: 'Tent' },
    ],
  },
  {
    slug: 'books-stationery',
    en: 'Books & Stationery',
    ur: 'کتابیں اور اسٹیشنری',
    ar: 'الكتب والقرطاسية',
    icon: 'BookOpen',
    color: '#6B4E2E',
    palette: ['#EFE4D2', '#6B4E2E'],
    art: 'book',
    attributes: [{ key: 'language', label: label('Language', 'زبان', 'اللغة'), type: 'select', options: ['English', 'Urdu', 'Arabic'], filterable: true, variantDefining: false }],
    children: [
      { slug: 'books', en: 'Books', ur: 'کتابیں', ar: 'كتب', icon: 'BookOpen' },
      { slug: 'notebooks-diaries', en: 'Notebooks & Diaries', ur: 'نوٹ بکس اور ڈائریاں', ar: 'دفاتر ومذكرات', icon: 'Notebook' },
      { slug: 'pens-art', en: 'Pens & Art Supplies', ur: 'قلم اور آرٹ کا سامان', ar: 'أقلام ومستلزمات فنية', icon: 'PenTool' },
      { slug: 'calligraphy', en: 'Calligraphy', ur: 'خطاطی', ar: 'الخط العربي', icon: 'Feather' },
    ],
  },
  {
    slug: 'jewelry-watches',
    en: 'Jewelry & Watches',
    ur: 'زیورات اور گھڑیاں',
    ar: 'المجوهرات والساعات',
    icon: 'Gem',
    color: '#B8860B',
    palette: ['#F6EBCB', '#9A6F08'],
    art: 'watch',
    attributes: [{ key: 'metal', label: label('Metal', 'دھات', 'المعدن'), type: 'select', options: ['Silver', 'Gold plated', 'Rose gold', 'Steel'], filterable: true, variantDefining: true }, WARRANTY],
    children: [
      { slug: 'watches', en: 'Watches', ur: 'گھڑیاں', ar: 'ساعات', icon: 'Watch' },
      { slug: 'earrings', en: 'Earrings', ur: 'بالیاں', ar: 'أقراط', icon: 'Gem' },
      { slug: 'bangles-bracelets', en: 'Bangles & Bracelets', ur: 'چوڑیاں اور بریسلیٹ', ar: 'أساور', icon: 'Circle' },
      { slug: 'necklaces', en: 'Necklaces & Sets', ur: 'ہار اور سیٹ', ar: 'قلائد وأطقم', icon: 'Sparkle' },
    ],
  },
];
