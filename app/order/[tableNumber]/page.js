'use client';

import { use, useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export default function OrderPage({ params }) {
  // Next.js 15+ App Router params เป็น Promise ใน Client Component
  const resolvedParams = use(params);
  const tableNum = Number(resolvedParams.tableNumber);

  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);

  // ตะกร้าสินค้า: { [itemId]: { item, quantity } }
  const [cart, setCart] = useState({});
  const [showCart, setShowCart] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState(false);

  // สถานะสำหรับหน้าต่าง "ออเดอร์ของฉัน"
  const [showMyOrders, setShowMyOrders] = useState(false);
  const [myOrders, setMyOrders] = useState([]);
  const [loadingMyOrders, setLoadingMyOrders] = useState(false);

  // สถานะสำหรับหน้าต่าง "เรียกเก็บเงิน"
  const [showBillModal, setShowBillModal] = useState(false);
  const [billingSessionOrders, setBillingSessionOrders] = useState([]);
  const [loadingBill, setLoadingBill] = useState(false);
  const [closingBill, setClosingBill] = useState(false);
  const [isBilled, setIsBilled] = useState(false);
  const [finalGrandTotal, setFinalGrandTotal] = useState(0);

  // 1. ตรวจสอบ Session และดึงข้อมูลเมนู
  useEffect(() => {
    if (isNaN(tableNum) || tableNum <= 0) {
      setSessionChecked(true);
      return;
    }

    async function initData() {
      try {
        // ค้นหา Session ที่เปิดอยู่ของโต๊ะนี้
        const { data: sessData, error: sessError } = await supabase
          .from('sessions')
          .select('*')
          .eq('table_number', tableNum)
          .eq('status', 'open')
          .maybeSingle();

        if (sessError) throw sessError;

        if (!sessData) {
          setSession(null);
          setSessionChecked(true);
          return;
        }

        setSession(sessData);

        // ดึงหมวดหมู่และรายการเมนูที่พร้อมขาย
        const [catRes, itemRes] = await Promise.all([
          supabase.from('menu_categories').select('*').order('sort_order', { ascending: true }),
          supabase.from('menu_items').select('*').eq('is_available', true),
        ]);

        if (catRes.error) throw catRes.error;
        if (itemRes.error) throw itemRes.error;

        const cats = catRes.data || [];
        setCategories(cats);
        setMenuItems(itemRes.data || []);
        if (cats.length > 0) {
          setActiveCategory(cats[0].id);
        }
      } catch (err) {
        console.error('Error initializing order page:', err);
      } finally {
        setSessionChecked(true);
      }
    }

    initData();
  }, [tableNum]);

  // จัดการปรับจำนวนสินค้าในตะกร้า
  const updateCartQuantity = (item, delta) => {
    setCart((prev) => {
      const currentQty = prev[item.id]?.quantity || 0;
      const newQty = currentQty + delta;

      if (newQty <= 0) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }

      if (newQty > 5) return prev; // จำกัดสูงสุด 5 ชิ้นต่อรายการ

      return {
        ...prev,
        [item.id]: {
          item,
          quantity: newQty,
        },
      };
    });
  };

  const clearCart = () => setCart({});

  // สรุปข้อมูลในตะกร้า
  const cartItemList = Object.values(cart);
  const totalCartItemsCount = cartItemList.reduce((sum, entry) => sum + entry.quantity, 0);
  const totalCartPrice = cartItemList.reduce(
    (sum, entry) => sum + entry.quantity * entry.item.price,
    0
  );

  // ส่งออเดอร์
  const handleSubmitOrder = async () => {
    if (!session || cartItemList.length === 0 || submitting) return;

    if (cartItemList.length > 10) {
      alert('สามารถสั่งได้สูงสุด 10 รายการต่อครั้ง');
      return;
    }

    setSubmitting(true);

    try {
      // ฟอร์แมตรายการสินค้าให้ตรงตามโครงสร้าง { name, quantity, price }
      const formattedItems = cartItemList.map((entry) => ({
        name: entry.item.name,
        quantity: entry.quantity,
        price: Number(entry.item.price),
      }));

      // บันทึกแถวลงตาราง orders พร้อม session_id และดึง id ของออเดอร์ใหม่ด้วย .select('id').single()
      const { data: newOrder, error } = await supabase
        .from('orders')
        .insert([
          {
            session_id: session.id,
            table_number: tableNum,
            items: formattedItems,
            status: 'received',
          },
        ])
        .select('id')
        .single();

      if (error) throw error;

      // เรียก API แจ้งเตือน Telegram แบบไม่ await และดักจับ error ด้วย .catch()
      if (newOrder && newOrder.id) {
        fetch('/api/notify-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'order',
            orderId: newOrder.id,
          }),
        }).catch((err) => {
          console.error('Failed to send Telegram order notification:', err);
        });
      }

      // แสดงผลสำเร็จและล้างตะกร้า
      clearCart();
      setShowCart(false);
      setOrderSuccessMsg(true);
      setTimeout(() => setOrderSuccessMsg(false), 3000);
    } catch (err) {
      console.error('Error submitting order:', err);
      alert('เกิดข้อผิดพลาดในการส่งออเดอร์ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  // ดึงรายการ "ออเดอร์ของฉัน"
  const handleOpenMyOrders = async () => {
    if (!session) return;
    setShowMyOrders(true);
    setLoadingMyOrders(true);

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyOrders(data || []);
    } catch (err) {
      console.error('Error fetching my orders:', err);
    } finally {
      setLoadingMyOrders(false);
    }
  };

  // เปิดหน้าต่าง "เรียกเก็บเงิน"
  const handleOpenBillModal = async () => {
    if (!session) return;
    setShowBillModal(true);
    setLoadingBill(true);

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('session_id', session.id);

      if (error) throw error;
      setBillingSessionOrders(data || []);
    } catch (err) {
      console.error('Error fetching bill details:', err);
    } finally {
      setLoadingBill(false);
    }
  };

  // คำนวณยอดรวมสำหรับเช็คบิล
  const calculateGrandTotal = (orders) => {
    let total = 0;
    if (orders && Array.isArray(orders)) {
      for (const ord of orders) {
        if (Array.isArray(ord.items)) {
          for (const item of ord.items) {
            total += (Number(item.price) || 0) * (Number(item.quantity) || 0);
          }
        }
      }
    }
    return total;
  };

  // ยืนยันปิด Session / เช็คบิล
  const handleConfirmBill = async () => {
    if (!session || closingBill) return;
    setClosingBill(true);

    const grandTotal = calculateGrandTotal(billingSessionOrders);

    try {
      // อัปเดตสถานะ session เป็น 'closed'
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', session.id)
        .eq('status', 'open');

      if (error) throw error;

      // เรียก API แจ้งเตือน Telegram แบบไม่ await และดักจับ error ด้วย .catch()
      fetch('/api/notify-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bill',
          sessionId: session.id,
        }),
      }).catch((err) => {
        console.error('Failed to send Telegram bill notification:', err);
      });

      setFinalGrandTotal(grandTotal);
      setIsBilled(true);
      setShowBillModal(false);
    } catch (err) {
      console.error('Error closing session for bill:', err);
      alert('เกิดข้อผิดพลาดในการเรียกเก็บเงิน กรุณาลองใหม่อีกครั้ง');
      setClosingBill(false);
    }
  };

  // ตัวแปลงแถบสถานะ
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'received':
        return <span style={styles.badgeReceived}>รับออเดอร์แล้ว</span>;
      case 'preparing':
        return <span style={styles.badgePreparing}>กำลังทำ</span>;
      case 'served':
        return <span style={styles.badgeServed}>เสิร์ฟแล้ว</span>;
      default:
        return <span style={styles.badgeDefault}>{status}</span>;
    }
  };

  // ----------------------------------------------------
  // Render
  // ----------------------------------------------------

  // กรณีกำลังตรวจสอบ Session
  if (!sessionChecked) {
    return (
      <div style={styles.centerContainer}>
        <p style={styles.loadingText}>🍨 กำลังโหลดข้อมูลร้าน...</p>
      </div>
    );
  }

  // กรณีปิดโต๊ะเรียบร้อยแล้ว (เช็คบิลสำเร็จ)
  if (isBilled) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.thankYouCard}>
          <div style={styles.thankYouIcon}>🎉🍦</div>
          <h1 style={styles.thankYouTitle}>ขอบคุณที่ใช้บริการ</h1>
          <p style={styles.thankYouSub}>ร้านไอติมเมฆน้อยยินดีให้บริการครับ</p>
          <div style={styles.finalBillBox}>
            <span>ยอดที่ต้องชำระทั้งสิ้น</span>
            <strong style={styles.finalTotalText}>
              {finalGrandTotal.toLocaleString('th-TH')} บาท
            </strong>
          </div>
          <p style={styles.closedNotice}>
            * โต๊ะนี้ถูกปิดระบบสั่งอาหารแล้ว กรุณาชำระเงินที่เคาน์เตอร์
          </p>
        </div>
      </div>
    );
  }

  // กรณีโต๊ะยังไม่เปิดใช้งาน
  if (!session) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.closedCard}>
          <div style={styles.closedIcon}>☁️🚫</div>
          <h1 style={styles.closedTitle}>โต๊ะนี้ยังไม่เปิดใช้งาน</h1>
          <p style={styles.closedSub}>กรุณาแจ้งพนักงานหน้าร้านเพื่อทำการเปิดโต๊ะก่อนสั่งไอศกรีม</p>
        </div>
      </div>
    );
  }

  const activeItems = menuItems.filter((i) => i.category_id === activeCategory);

  return (
    <div style={styles.container}>
      {/* Navigation Top Bar */}
      <header style={styles.header}>
        <div>
          <span style={styles.brandTitle}>☁️ ไอติมเมฆน้อย</span>
          <h1 style={styles.tableBadge}>โต๊ะ {tableNum}</h1>
        </div>
        <div style={styles.headerBtns}>
          <button onClick={handleOpenMyOrders} style={styles.myOrdersBtn}>
            📋 ออเดอร์ของฉัน
          </button>
          <button onClick={handleOpenBillModal} style={styles.billBtn}>
            🧾 เรียกเก็บเงิน
          </button>
        </div>
      </header>

      {/* แถบแจ้งเตือนส่งออเดอร์สำเร็จ */}
      {orderSuccessMsg && (
        <div style={styles.successBanner}>
          ✅ ส่งออเดอร์แล้ว! พนักงานกำลังเตรียมไอศกรีมให้คุณ
        </div>
      )}

      {/* Category Tabs */}
      <nav style={styles.categoryNav}>
        {categories.map((cat) => {
          const isActive = cat.id === activeCategory;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                ...styles.categoryTab,
                ...(isActive ? styles.categoryTabActive : {}),
              }}
            >
              {cat.name}
            </button>
          );
        })}
      </nav>

      {/* Menu Grid */}
      <main style={styles.menuContainer}>
        {activeItems.length === 0 ? (
          <p style={styles.emptyText}>ไม่มีรายการในหมวดหมู่นี้</p>
        ) : (
          <div style={styles.menuGrid}>
            {activeItems.map((item) => {
              const qtyInCart = cart[item.id]?.quantity || 0;
              return (
                <div key={item.id} style={styles.menuCard}>
                  <div style={styles.menuInfo}>
                    <h3 style={styles.menuName}>{item.name}</h3>
                    <p style={styles.menuPrice}>{item.price} บาท</p>
                  </div>

                  <div style={styles.quantityControls}>
                    {qtyInCart > 0 ? (
                      <>
                        <button
                          onClick={() => updateCartQuantity(item, -1)}
                          style={styles.qtyBtnMinus}
                        >
                          -
                        </button>
                        <span style={styles.qtyText}>{qtyInCart}</span>
                        <button
                          onClick={() => updateCartQuantity(item, 1)}
                          disabled={qtyInCart >= 5}
                          style={{
                            ...styles.qtyBtnPlus,
                            opacity: qtyInCart >= 5 ? 0.4 : 1,
                          }}
                        >
                          +
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => updateCartQuantity(item, 1)}
                        style={styles.addCartBtn}
                      >
                        + เพิ่ม
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ตะกร้าลอยด้านล่าง */}
      {totalCartItemsCount > 0 && (
        <div style={styles.floatingCartBar}>
          <div style={styles.cartBarInfo}>
            <span style={styles.cartBadge}>{totalCartItemsCount}</span>
            <div>
              <p style={styles.cartTotalLabel}>รวมทั้งสิ้น</p>
              <strong style={styles.cartTotalPrice}>
                {totalCartPrice.toLocaleString('th-TH')} บาท
              </strong>
            </div>
          </div>
          <button onClick={() => setShowCart(true)} style={styles.viewCartBtn}>
            🛒 ดูตะกร้า ({totalCartItemsCount})
          </button>
        </div>
      )}

      {/* Cart Modal */}
      {showCart && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>🛒 ตะกร้าสินค้า</h3>
              <button onClick={() => setShowCart(false)} style={styles.closeBtn}>
                ✕
              </button>
            </div>

            <div style={styles.cartList}>
              {cartItemList.map(({ item, quantity }) => (
                <div key={item.id} style={styles.cartItemRow}>
                  <div>
                    <h4 style={styles.cartItemName}>{item.name}</h4>
                    <span style={styles.cartItemSubPrice}>
                      {item.price} × {quantity} = {item.price * quantity} บาท
                    </span>
                  </div>
                  <div style={styles.quantityControls}>
                    <button
                      onClick={() => updateCartQuantity(item, -1)}
                      style={styles.qtyBtnMinus}
                    >
                      -
                    </button>
                    <span style={styles.qtyText}>{quantity}</span>
                    <button
                      onClick={() => updateCartQuantity(item, 1)}
                      disabled={quantity >= 5}
                      style={{
                        ...styles.qtyBtnPlus,
                        opacity: quantity >= 5 ? 0.4 : 1,
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.cartFooter}>
              <div style={styles.cartFooterTotal}>
                <span>ยอดรวม</span>
                <strong>{totalCartPrice.toLocaleString('th-TH')} บาท</strong>
              </div>
              <button
                onClick={handleSubmitOrder}
                disabled={submitting}
                style={{
                  ...styles.submitOrderBtn,
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'กำลังส่งออเดอร์...' : '🚀 ส่งออเดอร์'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My Orders Modal */}
      {showMyOrders && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>📋 รายการที่สั่งไปแล้ว</h3>
              <button onClick={() => setShowMyOrders(false)} style={styles.closeBtn}>
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              {loadingMyOrders ? (
                <p style={styles.loadingText}>กำลังดึงรายการสั่ง...</p>
              ) : myOrders.length === 0 ? (
                <p style={styles.emptyText}>ยังไม่มีรายการที่สั่งในรอบนี้</p>
              ) : (
                myOrders.map((ord, idx) => (
                  <div key={ord.id} style={styles.myOrderCard}>
                    <div style={styles.myOrderHeader}>
                      <span>ออเดอร์ #{myOrders.length - idx}</span>
                      {renderStatusBadge(ord.status)}
                    </div>
                    <div style={styles.myOrderItemList}>
                      {Array.isArray(ord.items) &&
                        ord.items.map((it, i) => (
                          <div key={i} style={styles.myOrderItemRow}>
                            <span>
                              {it.name} x{it.quantity}
                            </span>
                            <span>{it.price * it.quantity} บาท</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Call Bill Modal */}
      {showBillModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>🧾 ยืนยันเรียกเก็บเงิน</h3>
              <button onClick={() => setShowBillModal(false)} style={styles.closeBtn}>
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              {loadingBill ? (
                <p style={styles.loadingText}>กำลังคำนวณยอดเงิน...</p>
              ) : (
                <>
                  <h4 style={styles.billSectionTitle}>รายการอาหารทั้งหมดที่สั่ง</h4>
                  <div style={styles.billList}>
                    {billingSessionOrders.length === 0 ? (
                      <p style={styles.emptyText}>ยังไม่มีรายการสั่งซื้อ</p>
                    ) : (
                      billingSessionOrders.map((ord) =>
                        Array.isArray(ord.items)
                          ? ord.items.map((it, i) => (
                              <div key={`${ord.id}-${i}`} style={styles.billRow}>
                                <span>
                                  {it.name} × {it.quantity}
                                </span>
                                <span>{it.price * it.quantity} บาท</span>
                              </div>
                            ))
                          : null
                      )
                    )}
                  </div>

                  <div style={styles.billSummaryBox}>
                    <span>ยอดรวมสุทธิ</span>
                    <strong style={styles.billGrandTotal}>
                      {calculateGrandTotal(billingSessionOrders).toLocaleString('th-TH')} บาท
                    </strong>
                  </div>

                  <p style={styles.billWarningText}>
                    * เมื่อกดยืนยัน ระบบจะทำการปิดออเดอร์สำหรับโต๊ะนี้ทันที
                  </p>
                </>
              )}
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={() => setShowBillModal(false)}
                disabled={closingBill}
                style={styles.cancelBtn}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmBill}
                disabled={closingBill}
                style={{
                  ...styles.confirmBillBtn,
                  opacity: closingBill ? 0.6 : 1,
                }}
              >
                {closingBill ? 'กำลังดำเนินการ...' : 'ยืนยันเรียกเก็บเงิน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline Styles
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#FAF8F5',
    color: '#4A2E1B',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    paddingBottom: '100px',
  },
  centerContainer: {
    minHeight: '100vh',
    backgroundColor: '#FAF8F5',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    color: '#4A2E1B',
  },
  loadingText: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#7A5C45',
    textAlign: 'center',
  },
  closedCard: {
    backgroundColor: '#FFFFFF',
    border: '2px solid #F9B2D7',
    borderRadius: '24px',
    padding: '36px 24px',
    textAlign: 'center',
    maxWidth: '380px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
  },
  closedIcon: {
    fontSize: '54px',
    marginBottom: '16px',
  },
  closedTitle: {
    fontSize: '22px',
    fontWeight: '900',
    color: '#4A2E1B',
    margin: '0 0 10px 0',
  },
  closedSub: {
    fontSize: '14px',
    color: '#7A5C45',
    margin: 0,
    lineHeight: '1.5',
  },
  thankYouCard: {
    backgroundColor: '#FFFFFF',
    border: '3px solid #DAF9DE',
    borderRadius: '24px',
    padding: '36px 24px',
    textAlign: 'center',
    maxWidth: '400px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
  },
  thankYouIcon: {
    fontSize: '60px',
    marginBottom: '12px',
  },
  thankYouTitle: {
    fontSize: '26px',
    fontWeight: '900',
    color: '#4A2E1B',
    margin: '0 0 6px 0',
  },
  thankYouSub: {
    fontSize: '14px',
    color: '#7A5C45',
    margin: '0 0 20px 0',
  },
  finalBillBox: {
    backgroundColor: '#F6FFDC',
    padding: '16px',
    borderRadius: '16px',
    border: '1px solid #DAF9DE',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '16px',
  },
  finalTotalText: {
    fontSize: '28px',
    fontWeight: '900',
    color: '#27AE60',
  },
  closedNotice: {
    fontSize: '12px',
    color: '#C0392B',
    margin: 0,
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '2px solid #CFECF3',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  brandTitle: {
    fontSize: '12px',
    color: '#7A5C45',
    fontWeight: '700',
    display: 'block',
  },
  tableBadge: {
    fontSize: '22px',
    fontWeight: '900',
    color: '#4A2E1B',
    margin: 0,
  },
  headerBtns: {
    display: 'flex',
    gap: '8px',
  },
  myOrdersBtn: {
    backgroundColor: '#CFECF3',
    color: '#4A2E1B',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  billBtn: {
    backgroundColor: '#F9B2D7',
    color: '#4A2E1B',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  successBanner: {
    backgroundColor: '#DAF9DE',
    color: '#27AE60',
    padding: '12px 20px',
    textAlign: 'center',
    fontWeight: '800',
    fontSize: '14px',
    borderBottom: '1px solid #B8E994',
  },
  categoryNav: {
    display: 'flex',
    overflowX: 'auto',
    padding: '12px 16px',
    gap: '8px',
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #E2D7CE',
  },
  categoryTab: {
    padding: '10px 18px',
    borderRadius: '20px',
    border: 'none',
    backgroundColor: '#F5F3EF',
    color: '#7A5C45',
    fontSize: '14px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  categoryTabActive: {
    backgroundColor: '#4A2E1B',
    color: '#FFFFFF',
  },
  menuContainer: {
    padding: '16px',
  },
  emptyText: {
    textAlign: 'center',
    color: '#7A5C45',
    fontSize: '14px',
    padding: '20px 0',
  },
  menuGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '12px',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    padding: '14px',
    border: '1px solid #E2D7CE',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
  },
  menuInfo: {
    marginBottom: '12px',
  },
  menuName: {
    fontSize: '15px',
    fontWeight: '800',
    color: '#4A2E1B',
    margin: '0 0 4px 0',
  },
  menuPrice: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#C0392B',
    margin: 0,
  },
  quantityControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  addCartBtn: {
    width: '100%',
    backgroundColor: '#F6FFDC',
    color: '#4A2E1B',
    border: '1.5px solid #DAF9DE',
    padding: '8px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '800',
    cursor: 'pointer',
  },
  qtyBtnMinus: {
    backgroundColor: '#E2D7CE',
    color: '#4A2E1B',
    border: 'none',
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '800',
    cursor: 'pointer',
  },
  qtyBtnPlus: {
    backgroundColor: '#F9B2D7',
    color: '#4A2E1B',
    border: 'none',
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '800',
    cursor: 'pointer',
  },
  qtyText: {
    fontSize: '14px',
    fontWeight: '800',
    minWidth: '16px',
    textAlign: 'center',
  },
  floatingCartBar: {
    position: 'fixed',
    bottom: '20px',
    left: '16px',
    right: '16px',
    backgroundColor: '#4A2E1B',
    color: '#FFFFFF',
    borderRadius: '20px',
    padding: '12px 18px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 10px 25px rgba(74, 46, 27, 0.3)',
    zIndex: 90,
  },
  cartBarInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  cartBadge: {
    backgroundColor: '#F9B2D7',
    color: '#4A2E1B',
    borderRadius: '50%',
    width: '30px',
    height: '30px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontWeight: '900',
    fontSize: '14px',
  },
  cartTotalLabel: {
    margin: 0,
    fontSize: '11px',
    color: '#CFECF3',
  },
  cartTotalPrice: {
    fontSize: '16px',
    fontWeight: '800',
  },
  viewCartBtn: {
    backgroundColor: '#DAF9DE',
    color: '#4A2E1B',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '800',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(74, 46, 27, 0.5)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
    zIndex: 100,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '24px',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '900',
    margin: 0,
  },
  closeBtn: {
    backgroundColor: '#F5F3EF',
    border: 'none',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    fontSize: '16px',
    cursor: 'pointer',
  },
  modalBody: {
    overflowY: 'auto',
    flexGrow: 1,
    marginBottom: '16px',
  },
  cartList: {
    overflowY: 'auto',
    maxHeight: '260px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  cartItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px dashed #E2D7CE',
    paddingBottom: '10px',
  },
  cartItemName: {
    margin: '0 0 2px 0',
    fontSize: '14px',
    fontWeight: '800',
  },
  cartItemSubPrice: {
    fontSize: '12px',
    color: '#7A5C45',
  },
  cartFooter: {
    borderTop: '2px solid #E2D7CE',
    paddingTop: '16px',
  },
  cartFooterTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '18px',
    fontWeight: '900',
    marginBottom: '14px',
  },
  submitOrderBtn: {
    width: '100%',
    backgroundColor: '#F9B2D7',
    color: '#4A2E1B',
    border: 'none',
    padding: '14px',
    borderRadius: '14px',
    fontSize: '16px',
    fontWeight: '900',
    cursor: 'pointer',
  },
  myOrderCard: {
    backgroundColor: '#FFFDF9',
    border: '1px solid #E2D7CE',
    borderRadius: '14px',
    padding: '12px',
    marginBottom: '10px',
  },
  myOrderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    fontWeight: '800',
    marginBottom: '8px',
    borderBottom: '1px solid #E2D7CE',
    paddingBottom: '6px',
  },
  myOrderItemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  myOrderItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#4A2E1B',
  },
  badgeReceived: {
    backgroundColor: '#CFECF3',
    color: '#4A2E1B',
    padding: '2px 8px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '800',
  },
  badgePreparing: {
    backgroundColor: '#FFE8A3',
    color: '#D35400',
    padding: '2px 8px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '800',
  },
  badgeServed: {
    backgroundColor: '#DAF9DE',
    color: '#27AE60',
    padding: '2px 8px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '800',
  },
  badgeDefault: {
    backgroundColor: '#E2D7CE',
    padding: '2px 8px',
    borderRadius: '8px',
    fontSize: '11px',
  },
  billSectionTitle: {
    fontSize: '14px',
    fontWeight: '800',
    margin: '0 0 10px 0',
  },
  billList: {
    maxHeight: '180px',
    overflowY: 'auto',
    border: '1px solid #E2D7CE',
    borderRadius: '12px',
    padding: '10px 14px',
    marginBottom: '14px',
    backgroundColor: '#FFFDF9',
  },
  billRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    padding: '4px 0',
    borderBottom: '1px dashed #E2D7CE',
  },
  billSummaryBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F6FFDC',
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid #DAF9DE',
    marginBottom: '10px',
  },
  billGrandTotal: {
    fontSize: '20px',
    fontWeight: '900',
    color: '#27AE60',
  },
  billWarningText: {
    fontSize: '12px',
    color: '#7A5C45',
    margin: '0 0 16px 0',
  },
  modalActions: {
    display: 'flex',
    gap: '10px',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F5F3EF',
    color: '#4A2E1B',
    border: 'none',
    padding: '12px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  confirmBillBtn: {
    flex: 1,
    backgroundColor: '#C0392B',
    color: '#FFFFFF',
    border: 'none',
    padding: '12px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
  },
};
