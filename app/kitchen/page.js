'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nowTime, setNowTime] = useState(Date.now());

  // อัปเดตเวลาปัจจุบันทุกๆ 30 วินาที เพื่อใช้คำนวณระยะเวลา (นาทีที่ผ่านไป)
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // 1. ดึงออเดอร์เริ่มต้นเฉพาะ status = 'received' หรือ 'preparing' เรียงจากเก่าไปใหม่
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['received', 'preparing'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('Error fetching kitchen orders:', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. ติดตั้ง Supabase Realtime Subscription พร้อม cleanup เมื่อออกจากหน้า
  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('kitchen-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          const { eventType, new: newOrder, old: oldOrder } = payload;

          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            setOrders((prevOrders) => {
              // หากเป็นออเดอร์ที่อยู่ในสถานะรับหรือกำลังทำอยู่ ให้เพิ่มหรืออัปเดต
              if (['received', 'preparing'].includes(newOrder.status)) {
                const exists = prevOrders.some((o) => o.id === newOrder.id);
                let updatedList;
                if (exists) {
                  updatedList = prevOrders.map((o) => (o.id === newOrder.id ? newOrder : o));
                } else {
                  updatedList = [...prevOrders, newOrder];
                }
                // จัดเรียง created_at จากเก่าไปใหม่เสมอ (ออเดอร์มาก่อนอยู่อันดับแรก)
                return updatedList.sort(
                  (a, b) => new Date(a.created_at) - new Date(b.created_at)
                );
              } else {
                // หากเปลี่ยนสถานะเป็น 'served' หรืออื่นๆ ให้เอาออกจากจอนี้ทันที
                return prevOrders.filter((o) => o.id !== newOrder.id);
              }
            });
          } else if (eventType === 'DELETE') {
            setOrders((prevOrders) => prevOrders.filter((o) => o.id !== oldOrder.id));
          }
        }
      )
      .subscribe();

    // Cleanup: ยกเลิกการ subscribe เมื่อออกจากหน้า
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 3. ปรับเปลี่ยนสถานะออเดอร์ ('preparing' หรือ 'served')
  const handleUpdateStatus = async (orderId, newStatus) => {
    // Optimistic Update เพื่อให้การตอบสนองบนหน้าจอเร็วที่สุด
    setOrders((prev) => {
      if (newStatus === 'served') {
        return prev.filter((o) => o.id !== orderId);
      }
      return prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o));
    });

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) {
        console.error('Failed to update status on server:', error);
        fetchOrders(); // ดึงข้อมูลกลับมาถ้าเกิดข้อผิดพลาด
      }
    } catch (err) {
      console.error('Error updating status:', err);
      fetchOrders();
    }
  };

  // คำนวณเวลาที่ผ่านไปเป็นนาที
  const getElapsedMinutes = (createdAt) => {
    if (!createdAt) return 0;
    const diffMs = nowTime - new Date(createdAt).getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  // ฟอร์แมตเวลา HH:mm
  const formatTime = (createdAt) => {
    if (!createdAt) return '';
    return new Date(createdAt).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={styles.container}>
      {/* Header ด้านบนของหน้าจอครัว */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.headerTitle}>🍦 ครัว / เคาน์เตอร์ทำไอศกรีม</h1>
          <span style={styles.storeBadge}>ร้านไอติมเมฆน้อย</span>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.orderCountBadge}>
            รอดำเนินการ <strong>{orders.length}</strong> รายการ
          </div>
        </div>
      </header>

      {/* ข้อความโหลด / เมื่อยังไม่มีออเดอร์ค้าง */}
      {loading ? (
        <div style={styles.centerMessage}>
          <p style={styles.loadingText}>⏳ กำลังเชื่อมต่อระบบออเดอร์...</p>
        </div>
      ) : orders.length === 0 ? (
        <div style={styles.centerMessage}>
          <div style={styles.emptyIcon}>☁️🍨</div>
          <h2 style={styles.emptyTitle}>ยังไม่มีออเดอร์ใหม่</h2>
          <p style={styles.emptySubtitle}>เมื่อลูกค้าสั่งไอศกรีม รายการจะปรากฏบนจอนี้ทันที</p>
        </div>
      ) : (
        /* กริดแสดงการ์ดออเดอร์ */
        <div style={styles.gridContainer}>
          {orders.map((order) => {
            const isPreparing = order.status === 'preparing';
            const elapsedMins = getElapsedMinutes(order.created_at);

            return (
              <div
                key={order.id}
                style={{
                  ...styles.card,
                  ...(isPreparing ? styles.cardPreparing : styles.cardReceived),
                }}
              >
                {/* หัวการ์ด: เลขโต๊ะ + เวลาที่สั่ง */}
                <div
                  style={{
                    ...styles.cardHeader,
                    ...(isPreparing ? styles.cardHeaderPreparing : styles.cardHeaderReceived),
                  }}
                >
                  <div>
                    <span style={styles.tableLabel}>โต๊ะ</span>
                    <h2 style={styles.tableNumber}>{order.table_number}</h2>
                  </div>
                  <div style={styles.timeInfo}>
                    <span style={styles.orderTime}>⏱️ {formatTime(order.created_at)}</span>
                    <span
                      style={{
                        ...styles.elapsedBadge,
                        backgroundColor: elapsedMins >= 10 ? '#E74C3C' : '#4A2E1B',
                      }}
                    >
                      {elapsedMins} นาทีที่แล้ว
                    </span>
                  </div>
                </div>

                {/* แถบสถานะ */}
                <div style={styles.statusBanner}>
                  {isPreparing ? (
                    <span style={styles.statusTextPreparing}>👩‍🍳 กำลังทำไอศกรีม...</span>
                  ) : (
                    <span style={styles.statusTextReceived}>🔔 รับออเดอร์แล้ว (รอดำเนินการ)</span>
                  )}
                </div>

                {/* รายการเมนูและจำนวน (ซูมตัวใหญ่เพื่อให้อ่านง่าย) */}
                <div style={styles.itemsList}>
                  {Array.isArray(order.items) &&
                    order.items.map((item, index) => (
                      <div key={index} style={styles.itemRow}>
                        <span style={styles.itemName}>{item.name}</span>
                        <span style={styles.itemQuantity}>x{item.quantity}</span>
                      </div>
                    ))}
                </div>

                {/* ปุ่มควบคุมสถานะ */}
                <div style={styles.cardActions}>
                  {!isPreparing ? (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'preparing')}
                      style={styles.btnStart}
                    >
                      🔥 เริ่มทำ
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'served')}
                      style={styles.btnServe}
                    >
                      ✅ เสิร์ฟแล้ว
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Inline Styles ตัวหนังสือใหญ่ คมชัด ปรับแต่งให้อ่านง่ายจากระยะไกล
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#F5F3EF',
    color: '#4A2E1B',
    padding: '24px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: '20px 28px',
    borderRadius: '20px',
    boxShadow: '0 4px 16px rgba(74, 46, 27, 0.08)',
    marginBottom: '28px',
    border: '2px solid #E2D7CE',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  headerTitle: {
    fontSize: '28px',
    fontWeight: '900',
    margin: 0,
    color: '#4A2E1B',
  },
  storeBadge: {
    backgroundColor: '#CFECF3',
    color: '#4A2E1B',
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: '15px',
    fontWeight: '700',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
  },
  orderCountBadge: {
    backgroundColor: '#F9B2D7',
    color: '#4A2E1B',
    padding: '10px 20px',
    borderRadius: '16px',
    fontSize: '18px',
    fontWeight: '700',
  },
  centerMessage: {
    minHeight: '60vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
  },
  loadingText: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#7A5C45',
  },
  emptyIcon: {
    fontSize: '80px',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '36px',
    fontWeight: '900',
    color: '#4A2E1B',
    margin: '0 0 12px 0',
  },
  emptySubtitle: {
    fontSize: '20px',
    color: '#7A5C45',
    margin: 0,
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '24px',
    alignItems: 'start',
  },
  card: {
    borderRadius: '24px',
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'all 0.2s ease',
  },
  cardReceived: {
    backgroundColor: '#FFFFFF',
    border: '4px solid #F9B2D7',
  },
  cardPreparing: {
    backgroundColor: '#FFFDF2',
    border: '4px solid #F39C12',
  },
  cardHeader: {
    padding: '18px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderReceived: {
    backgroundColor: '#CFECF3',
  },
  cardHeaderPreparing: {
    backgroundColor: '#FFE8A3',
  },
  tableLabel: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#7A5C45',
    display: 'block',
    lineHeight: '1',
  },
  tableNumber: {
    fontSize: '44px',
    fontWeight: '900',
    margin: 0,
    color: '#4A2E1B',
    lineHeight: '1.1',
  },
  timeInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '6px',
  },
  orderTime: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#4A2E1B',
  },
  elapsedBadge: {
    color: '#FFFFFF',
    fontSize: '13px',
    fontWeight: '800',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  statusBanner: {
    padding: '8px 20px',
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
  },
  statusTextReceived: {
    fontSize: '15px',
    fontWeight: '800',
    color: '#D35400',
  },
  statusTextPreparing: {
    fontSize: '15px',
    fontWeight: '800',
    color: '#B7950B',
  },
  itemsList: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flexGrow: 1,
  },
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px dashed #E2D7CE',
    paddingBottom: '10px',
  },
  itemName: {
    fontSize: '22px',
    fontWeight: '800',
    color: '#4A2E1B',
    flex: 1,
    paddingRight: '12px',
  },
  itemQuantity: {
    fontSize: '26px',
    fontWeight: '900',
    color: '#C0392B',
    backgroundColor: '#F6FFDC',
    padding: '4px 14px',
    borderRadius: '12px',
    border: '1px solid #DAF9DE',
  },
  cardActions: {
    padding: '16px 20px',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  btnStart: {
    width: '100%',
    backgroundColor: '#F39C12',
    color: '#FFFFFF',
    border: 'none',
    padding: '16px',
    borderRadius: '16px',
    fontSize: '22px',
    fontWeight: '900',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(243, 156, 18, 0.3)',
  },
  btnServe: {
    width: '100%',
    backgroundColor: '#27AE60',
    color: '#FFFFFF',
    border: 'none',
    padding: '16px',
    borderRadius: '16px',
    fontSize: '22px',
    fontWeight: '900',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(39, 174, 96, 0.3)',
  },
};
