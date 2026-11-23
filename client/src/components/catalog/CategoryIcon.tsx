import { Link } from 'react-router-dom';
import {
  Archive,
  Baby,
  Backpack,
  BatteryCharging,
  BedDouble,
  BookOpen,
  Camera,
  Car,
  Circle,
  Coffee,
  CookingPot,
  Droplets,
  Dumbbell,
  Feather,
  Flame,
  Flower2,
  Gamepad2,
  Gem,
  Gift,
  Glasses,
  Headphones,
  Heart,
  House,
  Keyboard,
  Lamp,
  Laptop,
  Microwave,
  Notebook,
  Nut,
  Palette,
  PawPrint,
  PenTool,
  Pill,
  Plug,
  Puzzle,
  Ruler,
  Scissors,
  Shield,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkle,
  Sparkles,
  Speaker,
  SprayCan,
  Square,
  Tablet,
  Tag,
  Tent,
  Trophy,
  Tv,
  UtensilsCrossed,
  Watch,
  Wheat,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/**
 * Curated lucide registry for category `icon` names (D-040). Importing all of lucide would add
 * ~1,500 icons to the bundle; unknown names fall back to `Tag`.
 */
const ICONS: Record<string, LucideIcon> = {
  Archive,
  Baby,
  Backpack,
  BatteryCharging,
  BedDouble,
  Blender: Microwave,
  BookOpen,
  Camera,
  Car,
  Circle,
  Coffee,
  CookingPot,
  Droplets,
  Dumbbell,
  Feather,
  Flame,
  Flower2,
  Gamepad2,
  Gem,
  Gift,
  Glasses,
  Headphones,
  Heart,
  Home: House,
  House,
  Keyboard,
  Lamp,
  Laptop,
  Microwave,
  Notebook,
  Nut,
  Palette,
  PawPrint,
  PenTool,
  Pill,
  Plug,
  Puzzle,
  Ruler,
  Scissors,
  Shield,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkle,
  Sparkles,
  Speaker,
  SprayCan,
  Square,
  Tablet,
  Tag,
  Tent,
  Trophy,
  Tv,
  UtensilsCrossed,
  Watch,
  Wheat,
  Wind,
};

/** Icon names an admin can pick for a category (keys of the curated registry). */
export const CATEGORY_ICON_NAMES = Object.keys(ICONS);

export function CategoryIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = (name && ICONS[name]) || Tag;
  return <Icon className={className} aria-hidden />;
}

/** Arch-shaped icon tile (echoes the logo) used in the home row, menus and the categories page. */
export function CategoryTile({
  to,
  name,
  icon,
  color,
  size = 'md',
  className,
  onClick,
}: {
  onClick?: () => void;
  to: string;
  name: string;
  icon?: string;
  color?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const style = color ? ({ '--cat': color } as CSSProperties) : undefined;
  return (
    <Link
      to={to}
      onClick={onClick}
      style={style}
      className={cn(
        'group flex flex-col items-center gap-2 rounded-lg text-center outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <span
        className={cn(
          'relative grid place-items-center rounded-t-[999px] rounded-b-lg border border-border bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-250 ease-souq',
          'group-hover:-translate-y-0.5 group-hover:border-[color:var(--cat,rgb(var(--primary)))] group-hover:shadow-card',
          size === 'md' ? 'aspect-[5/6] w-full max-w-[88px]' : 'size-14',
        )}
      >
        <span
          className="absolute inset-1.5 rounded-t-[999px] rounded-b-md opacity-[0.12] transition-opacity group-hover:opacity-20"
          style={{ background: 'var(--cat, rgb(var(--primary)))' }}
          aria-hidden
        />
        <CategoryIcon
          name={icon}
          className={cn('relative text-[color:var(--cat,rgb(var(--primary-700)))] dark:text-fg', size === 'md' ? 'size-7' : 'size-6')}
        />
      </span>
      <span className={cn('line-clamp-2 font-semibold leading-tight text-fg', size === 'md' ? 'text-xs sm:text-[13px]' : 'text-xs')}>
        {name}
      </span>
    </Link>
  );
}
