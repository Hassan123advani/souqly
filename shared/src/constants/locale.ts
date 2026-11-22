export const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const CURRENCIES = {
  PKR: { code: 'PKR', symbol: 'Rs.', locale: 'en-PK', decimals: 0 },
  SAR: { code: 'SAR', symbol: 'SAR', locale: 'en-SA', decimals: 2 },
  AED: { code: 'AED', symbol: 'AED', locale: 'en-AE', decimals: 2 },
  USD: { code: 'USD', symbol: '$', locale: 'en-US', decimals: 2 },
} as const;
export type CurrencyCode = keyof typeof CURRENCIES;
export const BASE_CURRENCY: CurrencyCode = 'PKR';

export const COUNTRIES = [
  {
    code: 'PK',
    name: 'Pakistan',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
    cities: ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Sialkot'],
  },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', timezone: 'Asia/Riyadh', cities: ['Riyadh', 'Jeddah', 'Dammam', 'Makkah', 'Madinah'] },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', timezone: 'Asia/Dubai', cities: ['Dubai', 'Abu Dhabi', 'Sharjah'] },
] as const;
