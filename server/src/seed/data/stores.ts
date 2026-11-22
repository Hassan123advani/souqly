import type { StoreLayout } from '@souqly/shared';

export type SeedStore = {
  name: string;
  slug: string;
  owner: { name: string; email: string; phone: string };
  tagline: string;
  description: string;
  themeColor: string;
  layoutTemplate: StoreLayout;
  /** Top-level category slug the store sells in. */
  category: string;
  /** Brands this store carries (by name). */
  brands: string[];
  city: string;
  isMall?: boolean;
  holiday?: string;
  plan: 'free' | 'pro' | 'business';
};

export const SEED_STORES: SeedStore[] = [
  {
    name: 'Noor Textiles',
    slug: 'noor-textiles',
    owner: { name: 'Noor Fatima', email: 'noor@demo.souqly.pk', phone: '+923002220001' },
    tagline: 'Lawn, chiffon and khaddar woven with light',
    description: 'Family-run textile house from Faisalabad offering unstitched suits, kurtis and shawls since 1998.',
    themeColor: '#B83C6B',
    layoutTemplate: 'boutique',
    category: 'womens-fashion',
    brands: ['Sitara', 'Riwaj'],
    city: 'Faisalabad',
    isMall: true,
    plan: 'business',
  },
  {
    name: 'Mehrab Menswear',
    slug: 'mehrab-menswear',
    owner: { name: 'Hamza Qureshi', email: 'hamza@demo.souqly.pk', phone: '+923002220002' },
    tagline: 'Tailored kurtas and crisp shirts for every occasion',
    description: 'Lahore-based menswear label known for kurta shalwar, waistcoats and office shirts.',
    themeColor: '#2F5D8A',
    layoutTemplate: 'classic',
    category: 'mens-fashion',
    brands: ['Mehrab', 'Riwaj'],
    city: 'Lahore',
    plan: 'pro',
  },
  {
    name: 'Volt Bazaar',
    slug: 'volt-bazaar',
    owner: { name: 'Usman Tariq', email: 'usman@demo.souqly.pk', phone: '+923002220003' },
    tagline: 'Phones, tablets and power — with official warranty',
    description: 'Authorized reseller of smartphones, tablets and mobile accessories with nationwide delivery.',
    themeColor: '#0E5E5A',
    layoutTemplate: 'bold',
    category: 'mobiles-tablets',
    brands: ['Shams', 'Qavi'],
    city: 'Karachi',
    isMall: true,
    plan: 'business',
  },
  {
    name: 'Tarang Audio Hub',
    slug: 'tarang-audio',
    owner: { name: 'Zain Abbasi', email: 'zain@demo.souqly.pk', phone: '+923002220004' },
    tagline: 'Hear every beat',
    description: 'Earbuds, speakers, smart watches and desk gear, tested before shipping.',
    themeColor: '#4B3F8F',
    layoutTemplate: 'bold',
    category: 'electronic-devices',
    brands: ['Tarang', 'Barqi'],
    city: 'Islamabad',
    plan: 'pro',
  },
  {
    name: 'Lantern & Loom',
    slug: 'lantern-loom',
    owner: { name: 'Mariam Siddiqui', email: 'mariam@demo.souqly.pk', phone: '+923002220005' },
    tagline: 'Warm homes, hand-made details',
    description: 'Lamps, bedding, rugs and decor inspired by old city courtyards.',
    themeColor: '#A8642A',
    layoutTemplate: 'boutique',
    category: 'home-living',
    brands: ['Lumora', 'Saya', 'Aangan', 'Chirag'],
    city: 'Lahore',
    isMall: true,
    plan: 'business',
  },
  {
    name: 'Dastarkhwan Kitchen',
    slug: 'dastarkhwan-kitchen',
    owner: { name: 'Asma Raza', email: 'asma@demo.souqly.pk', phone: '+923002220006' },
    tagline: 'Everything for a generous table',
    description: 'Cookware, dinner sets and kitchen helpers for Pakistani home cooking.',
    themeColor: '#C2362F',
    layoutTemplate: 'classic',
    category: 'kitchen-dining',
    brands: ['Mitti', 'Barqi'],
    city: 'Karachi',
    plan: 'free',
  },
  {
    name: 'Gulnar Beauty',
    slug: 'gulnar-beauty',
    owner: { name: 'Hira Javed', email: 'hira@demo.souqly.pk', phone: '+923002220007' },
    tagline: 'Botanical care, gentle on every skin',
    description: 'Skincare, makeup, hair care and attars made with locally sourced botanicals.',
    themeColor: '#9C4A8B',
    layoutTemplate: 'minimal',
    category: 'beauty-personal-care',
    brands: ['Gulnar', 'Taaruf'],
    city: 'Rawalpindi',
    plan: 'pro',
  },
  {
    name: 'Mandi Fresh',
    slug: 'mandi-fresh',
    owner: { name: 'Bilal Chaudhry', email: 'mandi@demo.souqly.pk', phone: '+923002220008' },
    tagline: 'Pantry staples, straight from the mandi',
    description: 'Rice, atta, spices, tea and dry fruits packed fresh every week.',
    themeColor: '#1F8A5B',
    layoutTemplate: 'minimal',
    category: 'groceries',
    brands: ['Khaas', 'Zaiqa'],
    city: 'Multan',
    plan: 'free',
  },
  {
    name: 'Little Khazana',
    slug: 'little-khazana',
    owner: { name: 'Sadia Noman', email: 'sadia@demo.souqly.pk', phone: '+923002220009' },
    tagline: 'Treasures for tiny hands',
    description: 'Soft toys, learning puzzles, kids clothing and school bags.',
    themeColor: '#E07A2E',
    layoutTemplate: 'bold',
    category: 'kids-toys',
    brands: ['Dhanak', 'Bachpan'],
    city: 'Islamabad',
    plan: 'pro',
  },
  {
    name: 'Pitch & Peak Sports',
    slug: 'pitch-peak',
    owner: { name: 'Faisal Khan', email: 'faisal@demo.souqly.pk', phone: '+923002220010' },
    tagline: 'From the crease to the summit',
    description: 'Cricket gear, fitness equipment, sportswear and camping essentials from Sialkot.',
    themeColor: '#2E7D32',
    layoutTemplate: 'classic',
    category: 'sports-outdoors',
    brands: ['Kohsar', 'Pehlwan'],
    city: 'Sialkot',
    holiday: 'We are on a short team retreat. Orders placed now ship after we return. Shukriya!',
    plan: 'free',
  },
  {
    name: 'Qalam Corner',
    slug: 'qalam-corner',
    owner: { name: 'Ahmed Rauf', email: 'ahmed@demo.souqly.pk', phone: '+923002220011' },
    tagline: 'Books, ink and paper for curious minds',
    description: 'Books in English and Urdu, notebooks, art supplies and calligraphy sets.',
    themeColor: '#6B4E2E',
    layoutTemplate: 'minimal',
    category: 'books-stationery',
    brands: ['Qirtas', 'Nukta', 'Rangeen'],
    city: 'Peshawar',
    plan: 'free',
  },
  {
    name: 'Zewar House',
    slug: 'zewar-house',
    owner: { name: 'Sana Iqbal', email: 'zewar@demo.souqly.pk', phone: '+923002220012' },
    tagline: 'Heirloom looks, everyday prices',
    description: 'Watches, earrings, bangles and bridal sets with a certificate of finish.',
    themeColor: '#9A6F08',
    layoutTemplate: 'boutique',
    category: 'jewelry-watches',
    brands: ['Zarnaab', 'Hilal'],
    city: 'Hyderabad',
    isMall: true,
    plan: 'business',
  },
];

export const STORE_POLICIES = {
  shipping:
    '<p>Orders are packed within 1–2 working days and delivered in 2–5 days across Pakistan.</p><ul><li>Free shipping on eligible items</li><li>Cash on delivery available</li></ul>',
  returns: '<p>Easy 7-day returns on unused items in original packaging. Refunds are processed within 5 working days.</p>',
  warranty: '<p>Electronics carry the warranty mentioned on the product page. Keep your invoice for claims.</p>',
};
