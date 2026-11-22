import type { HomeSectionType } from '@souqly/shared';

export const HERO_SLIDES = [
  {
    key: 'every-shop',
    title: 'Every shop, one souq',
    subtitle: 'Thousands of trusted sellers across Pakistan — one cart, one checkout.',
    ctaText: 'Start exploring',
    ctaLink: '/search',
    theme: 'teal',
    colors: ['#0B4A47', '#0E5E5A'] as [string, string],
    motif: 'lanterns' as const,
  },
  {
    key: 'eid-festival',
    title: 'Eid Festival',
    subtitle: 'Up to 50% off festive wear, gifts and sweets for the whole family.',
    ctaText: 'Shop Eid deals',
    ctaLink: '/campaigns/eid-festival',
    theme: 'saffron',
    colors: ['#8A4B0F', '#D98A1E'] as [string, string],
    motif: 'crescent' as const,
  },
  {
    key: 'souqly-mall',
    title: 'Souqly Mall — verified brands',
    subtitle: '100% authentic products from verified stores, with easy returns.',
    ctaText: 'Visit the Mall',
    ctaLink: '/mall',
    theme: 'ink',
    colors: ['#1B2A29', '#2F4A47'] as [string, string],
    motif: 'arches' as const,
  },
  {
    key: 'sell-on-souqly',
    title: 'Sell on Souqly',
    subtitle: 'Open your own store in minutes and reach buyers in every city.',
    ctaText: 'Become a seller',
    ctaLink: '/sell',
    theme: 'pomegranate',
    colors: ['#7E1F1A', '#D6453D'] as [string, string],
    motif: 'stall' as const,
  },
];

export const HOME_SECTIONS: { type: HomeSectionType; title: string }[] = [
  { type: 'trending', title: 'Trending now' },
  { type: 'best_sellers', title: 'Best sellers' },
  { type: 'mall', title: 'Souqly Mall' },
  { type: 'campaign', title: 'Campaigns' },
  { type: 'new_arrivals', title: 'New arrivals' },
  { type: 'top_rated', title: 'Top rated' },
  { type: 'top_stores', title: 'Top stores' },
];

const DAY = 24 * 3600_000;

/** Campaign windows relative to "now" so the demo always has one live, one upcoming and one past campaign. */
export function seedCampaigns(now: Date) {
  const year = now.getUTCFullYear();
  let elevenStart = new Date(Date.UTC(year, 10, 10, 19, 0, 0)); // 11 Nov 00:00 PKT
  if (elevenStart.getTime() > now.getTime() + 60 * DAY) elevenStart = new Date(Date.UTC(year - 1, 10, 10, 19, 0, 0));
  return [
    {
      slug: 'eid-festival',
      name: 'Eid Festival',
      theme: 'saffron',
      description: 'Festive wear, jewelry, gifts and sweets — up to 50% off for Eid.',
      startsAt: new Date(now.getTime() - 3 * DAY),
      endsAt: new Date(now.getTime() + 10 * DAY),
      categories: ['womens-fashion', 'mens-fashion', 'jewelry-watches', 'kids-toys'],
      colors: ['#8A4B0F', '#D98A1E'] as [string, string],
      motif: 'crescent' as const,
    },
    {
      slug: 'ramadan-bazaar',
      name: 'Ramadan Bazaar',
      theme: 'teal',
      description: 'Pantry staples, dates, kitchenware and lanterns for the holy month.',
      startsAt: new Date(now.getTime() + 60 * DAY),
      endsAt: new Date(now.getTime() + 90 * DAY),
      categories: ['groceries', 'kitchen-dining', 'home-living'],
      colors: ['#0B4A47', '#1F8A5B'] as [string, string],
      motif: 'lanterns' as const,
    },
    {
      slug: '11-11-mega-sale',
      name: '11.11 Mega Sale',
      theme: 'pomegranate',
      description: 'The biggest sale of the year on electronics, phones and more.',
      startsAt: elevenStart,
      endsAt: new Date(elevenStart.getTime() + 2 * DAY),
      categories: ['mobiles-tablets', 'electronic-devices'],
      colors: ['#7E1F1A', '#D6453D'] as [string, string],
      motif: 'stall' as const,
    },
  ];
}
