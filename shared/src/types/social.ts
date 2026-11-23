import type { AlertType, ReviewStatus } from '../schemas/social';

/** Loyalty constants (minor units = paisa). */
export const LOYALTY = {
  /** 1 coin per Rs. 100 (10,000 paisa) of a delivered order. */
  EARN_PER_MINOR: 10_000,
  /** 100 coins = Rs. 10 → 1 coin = 10 paisa. */
  COIN_VALUE_MINOR: 10,
  /** Max share of an order payable by coins, in basis points (20%). */
  MAX_REDEEM_BPS: 2_000,
  CHECK_IN_COINS: 10,
  /** Extra coins on every 7th consecutive day. */
  STREAK_BONUS_COINS: 50,
  STREAK_LENGTH: 7,
  REFERRER_WALLET_MINOR: 20_000,
  REFEREE_COINS: 500,
} as const;

export interface ReviewMediaDTO {
  type: 'image' | 'video';
  url: string;
}

export interface ReviewDTO {
  id: string;
  productId: string;
  product?: { title: string; slug: string; image?: string };
  author: { name: string; avatar?: string };
  rating: number;
  title?: string;
  body?: string;
  variantLabel?: string;
  media: ReviewMediaDTO[];
  verified: boolean;
  status: ReviewStatus;
  helpfulCount: number;
  myVote?: boolean;
  reply?: { text: string; at: string };
  createdAt: string;
}

export interface ReviewSummaryDTO {
  avg: number;
  count: number;
  breakdown: Record<'1' | '2' | '3' | '4' | '5', number>;
  withMedia: number;
}

export interface PendingReviewDTO {
  orderId: string;
  orderNumber: string;
  productId: string;
  variantId: string;
  title: string;
  slug?: string;
  image?: string;
  options: Record<string, string>;
  deliveredAt?: string;
}

export interface QuestionDTO {
  id: string;
  productId: string;
  product?: { title: string; slug: string };
  askerName: string;
  text: string;
  answer?: { text: string; at: string };
  createdAt: string;
}

export interface WishlistDTO {
  id: string;
  name: string;
  isDefault: boolean;
  itemCount: number;
  cover?: string;
}

export interface WishlistItemDTO {
  productId: string;
  variantId?: string;
  addedAt: string;
  product: { title: string; slug: string; image?: string; price: number; compareAtPrice?: number; inStock: boolean; ratingAvg: number } | null;
}

export interface AlertDTO {
  id: string;
  productId: string;
  variantId?: string;
  type: AlertType;
  targetPrice: number;
  createdAt: string;
}

export interface FollowedStoreDTO {
  id: string;
  slug: string;
  name: string;
  logo?: string;
  followerCount: number;
  ratingAvg: number;
  followedAt: string;
}

export type MessageType = 'text' | 'image' | 'product' | 'order';

export interface MessageDTO {
  id: string;
  conversationId: string;
  senderSide: 'buyer' | 'store';
  type: MessageType;
  text?: string;
  imageUrl?: string;
  product?: { id: string; title: string; slug: string; image?: string; price: number };
  order?: { id: string; number: string; status: string; total: number };
  auto?: boolean;
  readAt?: string;
  createdAt: string;
}

export interface ConversationDTO {
  id: string;
  store: { id: string; slug: string; name: string; logo?: string };
  buyer?: { id: string; name: string; avatar?: string };
  lastMessage?: { text: string; type: MessageType; senderSide: 'buyer' | 'store'; at: string };
  unread: number;
  updatedAt: string;
}

export interface WalletTransactionDTO {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

export interface CoinTransactionDTO {
  id: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

export interface CheckInStatusDTO {
  checkedInToday: boolean;
  streak: number;
  nextReward: number;
  balance: number;
}

export interface ReferralSummaryDTO {
  code: string;
  shareUrl: string;
  invited: number;
  rewarded: number;
  earned: number;
}
