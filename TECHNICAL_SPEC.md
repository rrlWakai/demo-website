# Lumière Hotel — Full-Stack Technical Specification

---

## 1. Design System

### Color Palette
| Token | Hex | Usage |
|---|---|---|
| `--gold` | `#C9A96E` | Primary accent, CTAs, borders |
| `--gold-light` | `#E8D5B0` | Hover states, subtle highlights |
| `--gold-dark` | `#9A7A4A` | Body links, text accents |
| `--black` | `#0A0A0A` | Hero bg, footer |
| `--charcoal` | `#1A1A1A` | Booking bar, modal header |
| `--cream` | `#FAF8F4` | Page background |
| `--white` | `#FFFFFF` | Cards, content panels |
| `--mid` | `#3A3A3A` | Body text |

### Typography
- **Display / Headings**: `Cormorant Garamond` — weights 300, 400, 500 (italic for emphasis)
- **Body / UI**: `Jost` — weights 200, 300, 400, 500
- **Scale**: 96px hero → 60px h2 → 22px h3 → 14–16px body → 9–11px labels/eyebrows (tracked, uppercase)

### UI Principles
- Generous white space (100px+ section padding)
- 1px gold borders as dividers
- Subtle hover transitions: `0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)`
- Scroll-triggered reveal animations (IntersectionObserver)
- Image overlays: linear-gradient bottom-to-top for text legibility

---

## 2. Tech Stack Recommendation

```
Frontend          React 18 + TypeScript
Styling           Tailwind CSS + CSS Modules (for one-offs)
Animations        Framer Motion
State Management  Zustand (lightweight)
Forms             React Hook Form + Zod validation
Routing           React Router v6 (or Next.js 14 App Router)
Backend           Supabase (PostgreSQL + Auth + Storage + Edge Functions)
Payments          Stripe (Cards) + optional PayPal SDK
Deployment        Vercel (frontend) + Supabase Cloud
CDN / Images      Cloudinary or Supabase Storage
SEO               Next.js App Router (SSR/SSG) recommended
```

---

## 3. Supabase Database Schema

### `profiles` (extends Supabase auth.users)
```sql
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  phone         TEXT,
  nationality   TEXT,
  passport_no   TEXT,
  preferences   JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
```

### `room_categories`
```sql
CREATE TABLE room_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,            -- 'Presidential Suite'
  slug          TEXT UNIQUE NOT NULL,     -- 'presidential-suite'
  description   TEXT,
  size_sqm      INT,
  max_guests    INT NOT NULL DEFAULT 2,
  base_price    NUMERIC(10,2) NOT NULL,   -- USD per night
  amenities     TEXT[] DEFAULT '{}',
  images        TEXT[] DEFAULT '{}',       -- Cloudinary URLs
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

### `rooms`
```sql
CREATE TABLE rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID REFERENCES room_categories(id),
  room_number   TEXT UNIQUE NOT NULL,     -- '101', 'PH-01'
  floor         INT,
  view_type     TEXT,                     -- 'city', 'garden', 'lake', 'panoramic'
  status        TEXT DEFAULT 'available', -- 'available' | 'maintenance' | 'occupied'
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

### `seasonal_pricing`
```sql
CREATE TABLE seasonal_pricing (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID REFERENCES room_categories(id),
  name          TEXT NOT NULL,            -- 'Peak Season 2025'
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  price_per_night NUMERIC(10,2) NOT NULL,
  min_nights    INT DEFAULT 1
);
```

### `bookings`
```sql
CREATE TABLE bookings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref       TEXT UNIQUE NOT NULL,  -- 'LMR-20250315-XXXX'
  user_id           UUID REFERENCES auth.users(id),
  room_id           UUID REFERENCES rooms(id),
  category_id       UUID REFERENCES room_categories(id),
  
  -- Guest details (for non-auth guests)
  guest_name        TEXT NOT NULL,
  guest_email       TEXT NOT NULL,
  guest_phone       TEXT,
  
  -- Stay details
  check_in          DATE NOT NULL,
  check_out         DATE NOT NULL,
  nights            INT GENERATED ALWAYS AS (check_out - check_in) STORED,
  adults            INT NOT NULL DEFAULT 2,
  children          INT NOT NULL DEFAULT 0,
  
  -- Pricing
  room_rate         NUMERIC(10,2) NOT NULL,  -- rate at time of booking
  subtotal          NUMERIC(10,2) NOT NULL,
  city_tax          NUMERIC(10,2) DEFAULT 0,
  service_charge    NUMERIC(10,2) DEFAULT 0,
  total_amount      NUMERIC(10,2) NOT NULL,
  currency          TEXT DEFAULT 'USD',
  
  -- Payment
  payment_status    TEXT DEFAULT 'pending',  -- 'pending'|'paid'|'refunded'|'failed'
  stripe_payment_id TEXT,
  stripe_session_id TEXT,
  paid_at           TIMESTAMPTZ,
  
  -- Status
  status            TEXT DEFAULT 'confirmed', -- 'confirmed'|'checked_in'|'checked_out'|'cancelled'
  special_requests  TEXT,
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Index for availability checks
CREATE INDEX idx_bookings_room_dates 
  ON bookings(room_id, check_in, check_out) 
  WHERE status != 'cancelled';

-- RLS Policies
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create bookings"
  ON bookings FOR INSERT WITH CHECK (TRUE);
```

### `availability` (computed view)
```sql
CREATE OR REPLACE VIEW room_availability AS
SELECT
  r.id AS room_id,
  r.room_number,
  r.category_id,
  rc.name AS category_name,
  rc.base_price,
  CASE
    WHEN r.status != 'available' THEN FALSE
    WHEN EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.room_id = r.id
        AND b.status NOT IN ('cancelled')
        AND b.check_in < CURRENT_DATE + 1
        AND b.check_out > CURRENT_DATE
    ) THEN FALSE
    ELSE TRUE
  END AS is_available_today
FROM rooms r
JOIN room_categories rc ON r.category_id = rc.id;
```

### `admin_users`
```sql
CREATE TABLE admin_users (
  id      UUID PRIMARY KEY REFERENCES auth.users(id),
  role    TEXT DEFAULT 'staff' -- 'super_admin' | 'manager' | 'staff'
);
```

---

## 4. Supabase Edge Functions

### `check-availability`
```typescript
// supabase/functions/check-availability/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const { check_in, check_out, adults, category_id } = await req.json()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  // Find available rooms for the given dates
  const { data, error } = await supabase
    .from('rooms')
    .select(`*, room_categories(*)`)
    .eq('status', 'available')
    .eq(category_id ? 'category_id' : 'status', category_id || 'available')
    .not('id', 'in', 
      supabase
        .from('bookings')
        .select('room_id')
        .neq('status', 'cancelled')
        .lt('check_in', check_out)
        .gt('check_out', check_in)
    )
  
  return new Response(JSON.stringify({ available_rooms: data, error }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
})
```

### `create-booking` (with Stripe)
```typescript
// supabase/functions/create-booking/index.ts
import Stripe from 'https://esm.sh/stripe@13'

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2023-10-16',
  })
  
  const { room_id, check_in, check_out, guest_info, room_rate, total } = await req.json()
  
  // Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `Lumière Hotel — Room Booking` },
        unit_amount: Math.round(total * 100),
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${Deno.env.get('SITE_URL')}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${Deno.env.get('SITE_URL')}/booking/cancelled`,
    metadata: { room_id, check_in, check_out, guest_email: guest_info.email }
  })
  
  return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
})
```

---

## 5. Booking System Workflow

```
User Journey:
═══════════════════════════════════════════════════════════════

[1] SEARCH
  User selects: Check-in date, Check-out date, Guests, Room Type
  → Frontend calls: supabase.rpc('check_availability', { dates, guests })
  → Supabase queries rooms WHERE NOT EXISTS conflicting bookings
  → Returns: available rooms + real-time pricing

[2] SELECTION
  User browses available rooms with photos, amenities, prices
  → Selects preferred room
  → Pricing calculated: base_rate × nights + taxes + service charge

[3] GUEST DETAILS
  Auth users: pre-filled from profiles table
  Guests: form capture (name, email, phone, special requests)
  → Email validated, phone validated

[4] PAYMENT
  → Frontend calls Supabase Edge Function: create-booking
  → Edge Function creates Stripe Checkout Session
  → User redirected to Stripe hosted payment page
  → On success: Stripe webhook → Edge Function confirms booking
  → Booking record created in Supabase with payment_status='paid'
  → Confirmation email sent via Resend/SendGrid

[5] CONFIRMATION
  → Booking reference generated (e.g., LMR-20250315-A4B7)
  → Confirmation page shown + email dispatched
  → Admin dashboard updated in real-time (Supabase Realtime)

[6] MANAGEMENT
  → Guest can view/cancel from My Bookings (if logged in)
  → Admin can update room status, check in/out guests
  → Cancellation policy enforced by Edge Function
```

---

## 6. Admin Dashboard Features

### Tech: React + Supabase Realtime + Recharts

```
Dashboard Panels:
├── Overview KPIs
│   ├── Total bookings today / this week / this month
│   ├── Occupancy rate (%) — gauge chart
│   ├── Revenue (daily/monthly) — line chart
│   └── Upcoming check-ins / check-outs
│
├── Calendar View (react-big-calendar)
│   ├── Drag-and-drop booking management
│   ├── Room-by-room Gantt view
│   └── Color-coded by status (confirmed/checked-in/cancelled)
│
├── Bookings Table
│   ├── Filter by status, date range, room type
│   ├── Quick actions: confirm, check-in, check-out, cancel
│   └── Export to CSV
│
├── Room Management
│   ├── Toggle room availability / maintenance mode
│   ├── Update seasonal pricing
│   └── Edit room details & images
│
└── Guest CRM
    ├── Guest profiles and booking history
    ├── Special requests flagged
    └── VIP guest tagging
```

### Realtime Subscriptions
```typescript
// Real-time booking updates
supabase
  .channel('bookings-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'bookings'
  }, (payload) => {
    // Update dashboard state immediately
    updateBookingsState(payload)
  })
  .subscribe()
```

---

## 7. Authentication Flow

```typescript
// Supabase Auth with email magic link or OAuth
const signIn = async (email: string) => {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`
    }
  })
}

// Google OAuth for quick sign-in
const signInWithGoogle = async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` }
  })
}
```

---

## 8. React Frontend Structure

```
src/
├── app/
│   ├── page.tsx                    ← Homepage
│   ├── rooms/page.tsx              ← Rooms listing
│   ├── rooms/[slug]/page.tsx       ← Room detail
│   ├── booking/page.tsx            ← Booking flow
│   ├── booking/success/page.tsx    ← Confirmation
│   ├── my-bookings/page.tsx        ← Guest portal
│   ├── admin/
│   │   ├── page.tsx                ← Admin dashboard
│   │   ├── bookings/page.tsx
│   │   ├── rooms/page.tsx
│   │   └── calendar/page.tsx
│   └── auth/
│       ├── login/page.tsx
│       └── callback/page.tsx
│
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Footer.tsx
│   ├── booking/
│   │   ├── BookingModal.tsx
│   │   ├── DatePicker.tsx
│   │   ├── RoomSelector.tsx
│   │   └── PaymentForm.tsx
│   ├── rooms/
│   │   ├── RoomCard.tsx
│   │   └── RoomGallery.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Modal.tsx
│       └── Badge.tsx
│
├── lib/
│   ├── supabase.ts                 ← Supabase client
│   ├── stripe.ts                   ← Stripe helpers
│   └── utils.ts
│
├── hooks/
│   ├── useAvailability.ts          ← Real-time availability
│   ├── useBooking.ts               ← Booking state machine
│   └── useAuth.ts                  ← Auth state
│
└── stores/
    └── bookingStore.ts             ← Zustand store
```

---

## 9. SEO & Performance Checklist

- ✅ Next.js App Router SSR for all public pages
- ✅ `<title>`, `<meta description>`, Open Graph tags on every page
- ✅ Structured data (JSON-LD): `Hotel`, `LodgingBusiness`, `Offer`
- ✅ `next/image` with WebP conversion + lazy loading
- ✅ Lighthouse score targets: Performance 95+, A11y 98+
- ✅ `preconnect` to Google Fonts, Supabase, Stripe
- ✅ `sitemap.xml` auto-generated from room slugs
- ✅ `robots.txt` with admin excluded
- ✅ `aria-label`, semantic HTML, keyboard navigation
- ✅ WCAG 2.1 AA contrast ratios met by color system
- ✅ Core Web Vitals: LCP < 2.5s, CLS < 0.1, FID < 100ms

---

## 10. Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# App
NEXT_PUBLIC_SITE_URL=https://lumiere-hotel.com

# Email (Resend)
RESEND_API_KEY=re_xxx
```

---

*Lumière Hotel — Technical Specification v1.0*
*Stack: Next.js 14 · Supabase · Stripe · Tailwind CSS · TypeScript*
