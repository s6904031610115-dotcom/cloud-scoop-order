import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ฟังก์ชันสำหรับ Escape อักขระ HTML ป้องกันข้อผิดพลาดตอนส่งเข้า Telegram (parse_mode: 'HTML')
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ฟังก์ชันแปลงเวลาเป็นเขตเวลาประเทศไทย (Asia/Bangkok) ในรูปแบบ HH:mm
function formatThaiTime(dateString) {
  const date = dateString ? new Date(dateString) : new Date();
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

export async function POST(request) {
  try {
    // 1. อ่าน Environment Variables ฝั่งเซิร์ฟเวอร์ (ห้ามใช้ NEXT_PUBLIC_)
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error('Telegram bot token or chat ID is not configured.');
      return NextResponse.json(
        { ok: false, error: 'telegram not configured' },
        { status: 500 }
      );
    }

    // 2. อ่าน JSON Body ที่ส่งมาจากหน้าเว็บ
    const body = await request.json().catch(() => ({}));
    const { type, orderId, sessionId } = body;

    // ตรวจสอบความถูกต้องของ type
    if (!type || (type !== 'order' && type !== 'bill')) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request type' },
        { status: 400 }
      );
    }

    // 3. เชื่อมต่อ Supabase ฝั่งเซิร์ฟเวอร์
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { ok: false, error: 'Supabase configuration missing' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // ===================================================
    // กรณีที่ 1: type = "order" (แจ้งเตือนมีออเดอร์ใหม่)
    // ===================================================
    if (type === 'order') {
      const numericOrderId = Number(orderId);
      if (!Number.isInteger(numericOrderId) || numericOrderId <= 0) {
        return NextResponse.json(
          { ok: false, error: 'Invalid orderId' },
          { status: 400 }
        );
      }

      // ดึงข้อมูลออเดอร์จาก Supabase เองเพื่อความปลอดภัย
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('id, table_number, items, notified, created_at')
        .eq('id', numericOrderId)
        .single();

      if (fetchError || !order) {
        return NextResponse.json(
          { ok: false, error: 'Order not found' },
          { status: 404 }
        );
      }

      // ป้องกันการส่งข้อความซ้ำ
      if (order.notified) {
        return NextResponse.json({ ok: true, skipped: true });
      }

      // คำนวณรายการอาหารและยอดรวมประจำรอบนี้
      let totalAmount = 0;
      const itemLines = [];

      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          const qty = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          totalAmount += qty * price;

          const escapedName = escapeHtml(item.name);
          itemLines.push(`• ${escapedName} ×${qty}`);
        }
      }

      const formattedTime = formatThaiTime(order.created_at);

      // ประกอบข้อความ HTML ฝั่งเซิร์ฟเวอร์
      const messageText = `🍦 <b>ออเดอร์ใหม่ · โต๊ะ ${order.table_number}</b>
🕒 ${formattedTime}
${itemLines.join('\n')}
💰 รวมรอบนี้ ${totalAmount.toLocaleString('th-TH')} บาท`;

      // ส่งข้อความไป Telegram API
      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const tgRes = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: 'HTML',
        }),
      });

      if (!tgRes.ok) {
        const errText = await tgRes.text();
        console.error('Telegram API response error:', errText);
        return NextResponse.json(
          { ok: false, error: 'telegram send failed' },
          { status: 502 }
        );
      }

      // อัปเดต notified = true เมื่อส่งสำเร็จ
      await supabase
        .from('orders')
        .update({ notified: true })
        .eq('id', numericOrderId);

      return NextResponse.json({ ok: true });
    }

    // ===================================================
    // กรณีที่ 2: type = "bill" (แจ้งเตือนลูกค้าขอเช็คบิล)
    // ===================================================
    if (type === 'bill') {
      const numericSessionId = Number(sessionId);
      if (!Number.isInteger(numericSessionId) || numericSessionId <= 0) {
        return NextResponse.json(
          { ok: false, error: 'Invalid sessionId' },
          { status: 400 }
        );
      }

      // ดึง session จาก Supabase
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, table_number')
        .eq('id', numericSessionId)
        .single();

      if (sessionError || !session) {
        return NextResponse.json(
          { ok: false, error: 'Session not found' },
          { status: 404 }
        );
      }

      // ดึงออเดอร์ทั้งหมดใน session นี้เพื่อคำนวณยอดรวมทั้งสิ้น
      const { data: sessionOrders, error: ordersError } = await supabase
        .from('orders')
        .select('items')
        .eq('session_id', numericSessionId);

      if (ordersError) {
        return NextResponse.json(
          { ok: false, error: 'Failed to fetch session orders' },
          { status: 500 }
        );
      }

      let grandTotal = 0;
      const orderCount = sessionOrders ? sessionOrders.length : 0;

      if (sessionOrders) {
        for (const ord of sessionOrders) {
          if (Array.isArray(ord.items)) {
            for (const item of ord.items) {
              const qty = Number(item.quantity) || 0;
              const price = Number(item.price) || 0;
              grandTotal += qty * price;
            }
          }
        }
      }

      // ประกอบข้อความ HTML ภาษาไทยสำหรับเช็คบิล
      const messageText = `🧾 <b>โต๊ะ ${session.table_number} ขอเช็คบิล</b>
💰 ยอดรวม ${grandTotal.toLocaleString('th-TH')} บาท (${orderCount} ออเดอร์)`;

      // ส่งข้อความไป Telegram API
      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const tgRes = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: 'HTML',
        }),
      });

      if (!tgRes.ok) {
        const errText = await tgRes.text();
        console.error('Telegram API response error:', errText);
        return NextResponse.json(
          { ok: false, error: 'telegram send failed' },
          { status: 502 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: 'Unhandled request' },
      { status: 400 }
    );

  } catch (err) {
    console.error('Unhandled error in /api/notify-order:', err);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}