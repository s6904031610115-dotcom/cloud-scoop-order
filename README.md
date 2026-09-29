# 🍦 ร้านไอติมเมฆน้อย (Itim Mek Noi)

ระบบสั่งไอศกรีมผ่าน QR Code และระบบจัดการออเดอร์สำหรับห้องครัว พัฒนาด้วย **Next.js (App Router)** ร่วมกับ **Supabase** และระบบแจ้งเตือนผ่าน **Telegram**

## 🚀 เทคโนโลยีที่ใช้
- **Framework:** Next.js (App Router, JavaScript)
- **Database & Realtime:** Supabase
- **Deployment:** Vercel
- **Notifications:** Telegram Bot API

## 🛠️ โครงสร้างตารางฐานข้อมูลใน Supabase

1. **`sessions`** (สำหรับติดตามการเข้าใช้งานตามโต๊ะ)
   - `id` (uuid, primary key)
   - `table_number` (text/int)
   - `status` ('open' | 'closed')
   - `created_at` (timestamp)

2. **`menu_categories`** (หมวดหมู่ไอศกรีม/ท็อปปิ้ง)
   - `id` (uuid/int, primary key)
   - `name` (text)
   - `sort_order` (int)

3. **`menu_items`** (รายการไอศกรีม)
   - `id` (uuid/int, primary key)
   - `category_id` (foreign key)
   - `name` (text)
   - `price` (numeric)
   - `is_available` (boolean)

4. **`orders`** (รายการสั่งซื้อ)
   - `id` (uuid, primary key)
   - `session_id` (foreign key -> sessions)
   - `table_number` (text/int)
   - `items` (jsonb) -> เก็บรูปแบบ `[{ "name": "รสกะทิ", "quantity": 2, "price": 40 }]`
   - `status` ('received' | 'preparing' | 'served')
   - `notified` (boolean)
   - `created_at` (timestamp)

## 📌 ข้อกำหนดและแนวทางการพัฒนาที่สำคัญ

1. **Next.js Dynamic Route Parameters:**
   - ใน Next.js เวอร์ชันใหม่ `params` ของ Dynamic Route จะเป็น `Promise`
   - **Client Component:** ต้อง unwrap ด้วย `React.use()` เสมอ (เช่น `const { id } = use(params)`)
   - **Server Component:** ต้อง unwrap ด้วย `await params` เสมอ

2. **การจัดการราคาเมนู:**
   - ราคาไอศกรีมและท็อปปิ้งต้องดึงจากตาราง `menu_items` ใน Supabase เท่านั้น **ห้ามฮาร์ดโค้ดราคาที่ฝั่ง Client**

3. **ความปลอดภัยของ Telegram Bot Token:**
   - การส่งแจ้งเตือน Telegram ต้องกระทำผ่าน **API Route (Server-side)** เท่านั้น
   - **ห้าม** นำ `TELEGRAM_BOT_TOKEN` หรือ `TELEGRAM_CHAT_ID` มาใช้ในโค้ดฝั่ง Client (ห้ามตั้งชื่อด้วย `NEXT_PUBLIC_`)

## 💻 การเริ่มใช้งานในสภาพแวดล้อม Local

```bash
# 1. ติดตั้ง Dependencies
npm install

# 2. คัดลอก environment variables
cp .env.local.example .env.local

# 3. รัน Development Server
npm run dev
```