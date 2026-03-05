export interface User {
  id: string;
  email: string;
  venue_id: string | null;
  role: string;
}

export interface Venue {
  id: string;
  name: string;
  slug: string;
  plan: string;
  owner_id: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  venue_id: string;
  token: string;
  label: string;
  status: "waiting" | "ready" | "collected";
  created_at: string;
  notified_at: string | null;
}

export interface PushSubscription {
  id: string;
  order_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  venueName: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: string;
    venueId: string | null;
    venueName: string;
  };
}

export interface ApiError {
  message: string;
}
