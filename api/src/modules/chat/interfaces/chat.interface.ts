export interface ChatContext {
  sessionId: string;
  userId?: string;
  guestId?: string;
  intent?: string;
  newGuestSecret?: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

export interface ProductRecommendation {
  id: string;
  name: string;
  slug: string;
  price: number;
  image?: string;
  stock: number;
  categoryName: string;
}

export interface StreamChunk {
  sessionId: string;
  content: string;
  done: boolean;
}
