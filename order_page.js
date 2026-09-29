'use client';

import React, { use, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function OrderPage({ params }) {
  const { tableNumber } = use(params);
  const numericTableNumber = Number(tableNumber);

  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);

  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);

  // Cart format: { [itemId]: { id, name, price, quantity } }
  const [cart, setCart] = useState({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // My Orders
  const [myOrders, setMyOrders] = useState([]);
  const [isMyOrdersOpen, setIsMyOrdersOpen] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Billing
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [closingSession, setClosingSession] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [finalBillAmount, setFinalBillAmount] = useState(0);

  useEffect(() => {
    if (!numericTableNumber || isNaN(numericTableNumber)) {
      setSessionError(true);
      setSessionLoading(false);
      return;
    }

    const checkSession = async () => {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('id, table_number, status')
          .eq('table_number', numericTableNumber)
          .eq('status', 'open')
          .maybeSingle();

        if (error || !data) {
          setSessionError(true);
        } else {
          setSession(data);
          fetchMenuData();
          fetchMyOrders(data.id);
        }
      } catch (err) {
        console.error('Session check error:', err);
        setSessionError(true);
      } finally {
        setSessionLoading(false);
      }
    };

    checkSession();
  }, [numericTableNumber]);

  const fetchMenuData = async () => {
    setLoadingMenu(true);
    try {
      const { data: catData, error: catError } = await supabase
        .from('menu_categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (catError) throw catError;
      setCategories(catData || []);
      if (catData && catData.length > 0) {
        setSelectedCategoryId(catData[0].id);
      }

      const { data: itemData, error: itemError } = await supabase
        .from('menu_items')
        .select('*')
        .eq('is_available', true);

      if (itemError) throw itemError;
      setMenuItems(itemData || []);
    } catch (err) {
      console.error('Error loading menu:', err);
    } finally {
      setLoadingMenu(false);
    }
  };

  const fetchMyOrders = async (sessionId) => {
    if (!sessionId) return;
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyOrders(data || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleAddToCart = (item) => {
    setCart((prev) => {
      const currentQty = prev[item.id]?.quantity || 0;
      if (currentQty >= 5) return prev; // Limit 5 per item
      return {
        ...prev,
        [item.id]: {
          id: item.id,
          name: item.name,
          price: Number(item.price),
          quantity: currentQty + 1,
        },
      };
    });
  };

  const handleRemoveFromCart = (itemId) => {
    setCart((prev) => {
      const currentQty = prev[itemId]?.quantity || 0;
      if (currentQty <= 1) {
        const newCart = { ...prev };
        delete newCart[itemId];
        return newCart;
      }
      return {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          quantity: currentQty - 1,
        },
      };
    });
  };

  const cartItemsList = Object.values(cart);
  const totalCartCount = cartItemsList.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartPrice = cartItemsList.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleSubmitOrder = async () => {
    if (cartItemsList.length === 0 || !session) return;
    if (totalCartCount > 10) {
      alert('สั่งได้สูงสุดไม่เกิน 10 รายการต่อครั้ง');
      return;
    }

    setSubmittingOrder(true);
    try {
      const formattedItems = cartItemsList.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      }));

      const { data: newOrder, error } = await supabase
        .from('orders')
        .insert([
          {
            session_id: session.id,
            table_number: numericTableNumber,
            items: formattedItems,
            status: 'received',
          },
        ])
        .select('id')
        .single();

      if (error) throw error;

      // Order created successfully with stored newOrder.id
      console.log('Created order ID:', newOrder?.id);

      setCart({});
      setIsCartOpen(false);
      setToastMsg('✨ ส่งออเดอร์เรียบร้อยแล้ว!');
      setTimeout(() => setToastMsg(''), 3000);

      // Refresh orders list
      fetchMyOrders(session.id);
    } catch (err) {
      console.error('Error submitting order:', err);
      alert('เกิดข้อผิดพลาดในการส่งออเดอร์ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const calculateGrandTotal = () => {
    return myOrders.reduce((sum, order) => {
      const orderItems = Array.isArray(order.items) ? order.items : [];
      const orderTotal = orderItems.reduce((iSum, item) => iSum + (Number(item.price) * Number(item.quantity)), 0);
      return sum + orderTotal;
    }, 0);
  };

  const handleConfirmCheckout = async () => {
    if (!session) return;
    setClosingSession(true);

    try {
      const grandTotal = calculateGrandTotal();

      const { error } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', session.id)
        .eq('status', 'open');

      if (error) throw error;

      setFinalBillAmount(grandTotal);
      setIsClosed(true);
      setIsBillingOpen(false);
    } catch (err) {
      console.error('Error during checkout:', err);
      alert('เกิดข้อผิดพลาดในการเรียกเก็บเงิน กรุณาลองใหม่อีกครั้ง');
    } finally {
      setClosingSession(false);
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'received':
        return { text: 'รับออเดอร์แล้ว', bg: '#CFECF3', color: '#4A2E1B' };
      case 'preparing':
        return { text: 'กำลังทำ', bg: '#F6FFDC', color: '#4A2E1B' };
      case 'served':
        return { text: 'เสิร์ฟแล้ว', bg: '#DAF9DE', color: '#27AE60' };
      default:
        return { text: status, bg: '#E2E8F0', color: '#4A2E1B' };
    }
  };

  if (isClosed) {
    return (
      <div style={styles.fullScreenContainer}>
        <div style={styles.fullScreenCard}>
          <span style={{ fontSize: '64px' }}>🍦</span>
          <h1 style={{ ...styles.title, fontSize: '28px', color: '#4A2E1B' }}>ขอบคุณที่ใช้บริการ</h1>
          <p style={{ color: '#7A5C45', margin: '8px 0 24px 0' }}>ร้านไอติมเมฆน้อย ยินดีต้อนรับเสมอค่ะ</p>
          <div style={styles.billBox}>
            <span style={{ fontSize: '15px', color: '#7A5C45' }}>ยอดที่ต้องชำระทั้งหมด (โต๊ะ {numericTableNumber})</span>
            <span style={styles.billPriceText}>{finalBillAmount.toLocaleString()} บาท</span>
          </div>
          <p style={{ fontSize: '13px', color: '#A020F0', marginTop: '16px' }}>
            กรุณาติดต่อชำระเงินที่เคาน์เตอร์หน้าร้าน
          </p>
        </div>
      </div>
    );
  }

  if (sessionLoading) {
    return (
      <div style={styles.fullScreenContainer}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '48px' }}>☁️</span>
          <p style={{ marginTop: '12px', color: '#4A2E1B', fontWeight: 'bold' }}>กำลังโหลดข้อมูลโต๊ะ...</p>
        </div>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div style={styles.fullScreenContainer}>
        <div style={{ ...styles.fullScreenCard, border: '2px solid #F9B2D7' }}>
          <span style={{ fontSize: '60px' }}>⚠️</span>
          <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#4A2E1B', margin: '16px 0 8px 0' }}>
            โต๊ะนี้ยังไม่เปิดใช้งาน
          </h2>
          <p style={{ fontSize: '16px', color: '#7A5C45', margin: 0 }}>
            กรุณาแจ้งพนักงานเพื่อเปิดโต๊ะ {numericTableNumber || ''} ก่อนสั่งอาหาร
          </p>
        </div>
      </div>
    );
  }

  const activeMenuItems = menuItems.filter((item) => item.category_id === selectedCategoryId);

  return (
    <div style={styles.container}>
      {/* Toast Notification */}
      {toastMsg && <div style={styles.toast}>{toastMsg}</div>}

      {/* Header Bar */}
      <header style={styles.header}>
        <div>
          <span style={styles.tableBadge}>☁️ โต๊ะ {session.table_number}</span>
          <h1 style={styles.headerTitle}>ไอติมเมฆน้อย</h1>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              fetchMyOrders(session.id);
              setIsMyOrdersOpen(true);
            }}
            style={styles.myOrdersBtn}
          >
            📋 ออเดอร์ของฉัน
          </button>
          <button
            onClick={() => {
              fetchMyOrders(session.id);
              setIsBillingOpen(true);
            }}
            style={styles.billBtn}
          >
            💰 เรียกเก็บเงิน
          </button>
        </div>
      </header>

      {/* Category Tabs */}
      {}
      <div style={styles.tabContainer}>
        {categories.map((cat) => {
          const isActive = cat.id === selectedCategoryId;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              style={{
                ...styles.tabButton,
                backgroundColor: isActive ? '#F9B2D7' : '#FFFFFF',
                color: '#4A2E1B',
                border: isActive ? '2px solid #F9B2D7' : '1px solid #E2D7CE',
                fontWeight: isActive ? '800' : '600',
              }}
            >
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Menu List */}
      {}
      <main style={styles.menuGrid}>
        {loadingMenu ? (
          <p style={{ textAlign: 'center', gridColumn: '1/-1', color: '#7A5C45', padding: '40px 0' }}>
            กำลังโหลดรายการเมนู...
          </p>
        ) : activeMenuItems.length === 0 ? (
          <p style={{ textAlign: 'center', gridColumn: '1/-1', color: '#7A5C45', padding: '40px 0' }}>
            ไม่มีรายการเมนูในหมวดนี้
          </p>
        ) : (
          activeMenuItems.map((item) => {
            const qty = cart[item.id]?.quantity || 0;
            return (
              <div key={item.id} style={styles.menuCard}>
                <div style={{ flex: 1 }}>
                  <h3 style={styles.itemName}>{item.name}</h3>
                  <p style={styles.itemPrice}>{Number(item.price).toLocaleString()} บาท</p>
                </div>

                <div style={styles.qtyControls}>
                  {qty > 0 && (
                    <>
                      <button onClick={() => handleRemoveFromCart(item.id)} style={styles.qtyBtn}>
                        -
                      </button>
                      <span style={styles.qtyText}>{qty}</span>
                    </>
                  )}
                  <button
                    onClick={() => handleAddToCart(item)}
                    disabled={qty >= 5}
                    style={{
                      ...styles.qtyBtn,
                      backgroundColor: qty >= 5 ? '#E2E8F0' : '#DAF9DE',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Floating Cart Button */}
      {}
      {totalCartCount > 0 && (
        <div style={styles.floatingCartBar}>
          <div style={styles.cartBarContent} onClick={() => setIsCartOpen(true)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={styles.cartBadge}>{totalCartCount}</span>
              <span style={{ fontWeight: '700', fontSize: '15px' }}>ดูตะกร้าสินค้า</span>
            </div>
            <span style={{ fontWeight: '800', fontSize: '16px' }}>
              {totalCartPrice.toLocaleString()} บาท ❯
            </span>
          </div>
        </div>
      )}

      {/* Cart Drawer / Modal */}
      {}
      {isCartOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>🛒 รายการในตะกร้า</h3>
              <button onClick={() => setIsCartOpen(false)} style={styles.closeIconBtn}>
                ✕
              </button>
            </div>

            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
              {cartItemsList.map((item) => (
                <div key={item.id} style={styles.cartItemRow}>
                  <div>
                    <div style={{ fontWeight: '700', color: '#4A2E1B' }}>{item.name}</div>
                    <div style={{ fontSize: '13px', color: '#7A5C45' }}>{item.price} บาท/ชิ้น</div>
                  </div>
                  <div style={styles.qtyControls}>
                    <button onClick={() => handleRemoveFromCart(item.id)} style={styles.qtyBtn}>
                      -
                    </button>
                    <span style={styles.qtyText}>{item.quantity}</span>
                    <button
                      onClick={() => handleAddToCart(item)}
                      disabled={item.quantity >= 5}
                      style={{
                        ...styles.qtyBtn,
                        backgroundColor: item.quantity >= 5 ? '#E2E8F0' : '#DAF9DE',
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.summaryBox}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span>จำนวนรวม</span>
                <span>{totalCartCount} รายการ (สูงสุด 10)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '800', fontSize: '18px' }}>
                <span>ราคารวม</span>
                <span>{totalCartPrice.toLocaleString()} บาท</span>
              </div>
            </div>

            <button
              onClick={handleSubmitOrder}
              disabled={submittingOrder || totalCartCount === 0 || totalCartCount > 10}
              style={{
                ...styles.submitOrderBtn,
                opacity: submittingOrder || totalCartCount > 10 ? 0.6 : 1,
              }}
            >
              {submittingOrder ? 'กำลังส่งออเดอร์...' : '✨ ยืนยันส่งออเดอร์'}
            </button>
          </div>
        </div>
      )}

      {/* My Orders Modal */}
      {}
      {isMyOrdersOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>📋 ออเดอร์ของฉัน (โต๊ะ {session.table_number})</h3>
              <button onClick={() => setIsMyOrdersOpen(false)} style={styles.closeIconBtn}>
                ✕
              </button>
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '16px' }}>
              {loadingOrders ? (
                <p style={{ textAlign: 'center', color: '#7A5C45' }}>กำลังโหลดออเดอร์...</p>
              ) : myOrders.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#7A5C45', padding: '20px 0' }}>ยังไม่มีรายการสั่งซื้อ</p>
              ) : (
                myOrders.map((ord, idx) => {
                  const statusInfo = getStatusLabel(ord.status);
                  const items = Array.isArray(ord.items) ? ord.items : [];
                  const orderTotal = items.reduce(
                    (s, i) => s + Number(i.price) * Number(i.quantity),
                    0
                  );

                  return (
                    <div key={ord.id || idx} style={styles.myOrderCard}>
                      <div style={styles.myOrderHeader}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#7A5C45' }}>
                          ออเดอร์ #{myOrders.length - idx}
                        </span>
                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor: statusInfo.bg,
                            color: statusInfo.color,
                          }}
                        >
                          {statusInfo.text}
                        </span>
                      </div>

                      <div style={{ marginTop: '8px' }}>
                        {items.map((it, i) => (
                          <div key={i} style={styles.orderDetailRow}>
                            <span>
                              {it.name} x {it.quantity}
                            </span>
                            <span>{(Number(it.price) * Number(it.quantity)).toLocaleString()} บาท</span>
                          </div>
                        ))}
                      </div>

                      <div style={styles.orderFooter}>
                        <span>ยอดรวมออเดอร์นี้</span>
                        <span style={{ fontWeight: '800' }}>{orderTotal.toLocaleString()} บาท</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Billing Modal */}
      {}
      {isBillingOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>💰 ยืนยันเรียกเก็บเงิน</h3>
              <button onClick={() => setIsBillingOpen(false)} style={styles.closeIconBtn}>
                ✕
              </button>
            </div>

            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#4A2E1B', marginBottom: '12px' }}>
                รายการอาหารทั้งหมดที่สั่ง (โต๊ะ {session.table_number})
              </p>

              {myOrders.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#7A5C45', padding: '20px 0' }}>
                  ยังไม่มีรายการสั่งอาหารในโต๊ะนี้
                </p>
              ) : (
                myOrders.map((ord, idx) => {
                  const items = Array.isArray(ord.items) ? ord.items : [];
                  return (
                    <div key={ord.id || idx} style={{ marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px dashed #E2D7CE' }}>
                      {items.map((it, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#4A2E1B' }}>
                          <span>{it.name} x {it.quantity}</span>
                          <span>{(Number(it.price) * Number(it.quantity)).toLocaleString()} บาท</span>
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>

            <div style={styles.grandTotalBox}>
              <span style={{ fontSize: '15px', color: '#4A2E1B', fontWeight: '600' }}>ราคารวมสุทธิ</span>
              <span style={{ fontSize: '22px', fontWeight: '900', color: '#4A2E1B' }}>
                {calculateGrandTotal().toLocaleString()} บาท
              </span>
            </div>

            <p style={{ fontSize: '12px', color: '#7A5C45', margin: '12px 0', textAlign: 'center' }}>
              หากยืนยันแล้ว ระบบจะปิดการสั่งอาหารของโต๊ะนี้ทันที
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setIsBillingOpen(false)} style={styles.cancelBtn}>
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmCheckout}
                disabled={closingSession}
                style={{
                  ...styles.confirmCheckoutBtn,
                  opacity: closingSession ? 0.6 : 1,
                }}
              >
                {closingSession ? 'กำลังปิดโต๊ะ...' : 'ยืนยันเรียกเก็บเงิน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#FAF8F5',
    color: '#4A2E1B',
    paddingBottom: '100px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
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
    zIndex: 100,
  },
  tableBadge: {
    backgroundColor: '#CFECF3',
    color: '#4A2E1B',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#4A2E1B',
    margin: '4px 0 0 0',
  },
  myOrdersBtn: {
    backgroundColor: '#F6FFDC',
    color: '#4A2E1B',
    border: '1px solid #DAF9DE',
    padding: '8px 12px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  billBtn: {
    backgroundColor: '#F9B2D7',
    color: '#4A2E1B',
    border: 'none',
    padding: '8px 12px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },

  // Tabs
  tabContainer: {
    display: 'flex',
    gap: '8px',
    padding: '16px 20px',
    overflowX: 'auto',
    backgroundColor: '#FAF8F5',
  },
  tabButton: {
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '14px',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // Menu Grid
  menuGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '12px',
    padding: '0 20px',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    padding: '14px',
    border: '1px solid #E2D7CE',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxShadow: '0 4px 10px rgba(74, 46, 27, 0.03)',
  },
  itemName: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#4A2E1B',
    margin: '0 0 6px 0',
  },
  itemPrice: {
    fontSize: '14px',
    fontWeight: '800',
    color: '#7A5C45',
    margin: '0 0 12px 0',
  },
  qtyControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  qtyBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#DAF9DE',
    color: '#4A2E1B',
    fontWeight: '800',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: '14px',
    fontWeight: '800',
    color: '#4A2E1B',
    minWidth: '16px',
    textAlign: 'center',
  },

  // Floating Cart Bar
  floatingCartBar: {
    position: 'fixed',
    bottom: '20px',
    left: '20px',
    right: '20px',
    maxWidth: '440px',
    margin: '0 auto',
    zIndex: 200,
  },
  cartBarContent: {
    backgroundColor: '#4A2E1B',
    color: '#FFFFFF',
    borderRadius: '18px',
    padding: '14px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 10px 25px rgba(74, 46, 27, 0.3)',
    cursor: 'pointer',
  },
  cartBadge: {
    backgroundColor: '#F9B2D7',
    color: '#4A2E1B',
    padding: '2px 8px',
    borderRadius: '10px',
    fontWeight: '800',
    fontSize: '13px',
  },

  // Modal / Overlay
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(74, 46, 27, 0.4)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
    zIndex: 1000,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    padding: '24px',
    width: '100%',
    maxWidth: '480px',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.15)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#4A2E1B',
    margin: 0,
  },
  closeIconBtn: {
    backgroundColor: '#F3F4F6',
    border: 'none',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    fontSize: '16px',
    color: '#4A2E1B',
    cursor: 'pointer',
  },
  cartItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #FAF8F5',
  },
  summaryBox: {
    backgroundColor: '#FFFDF9',
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid #E2D7CE',
    fontSize: '14px',
    color: '#4A2E1B',
    marginBottom: '16px',
  },
  submitOrderBtn: {
    backgroundColor: '#F9B2D7',
    color: '#4A2E1B',
    border: 'none',
    padding: '14px',
    borderRadius: '14px',
    fontSize: '16px',
    fontWeight: '800',
    width: '100%',
    cursor: 'pointer',
  },

  // My Orders List
  myOrderCard: {
    backgroundColor: '#FFFDF9',
    border: '1px solid #E2D7CE',
    borderRadius: '14px',
    padding: '12px 14px',
    marginBottom: '10px',
  },
  myOrderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    padding: '3px 8px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '700',
  },
  orderDetailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#4A2E1B',
    marginTop: '4px',
  },
  orderFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    borderTop: '1px dashed #E2D7CE',
    marginTop: '8px',
    paddingTop: '6px',
    color: '#4A2E1B',
  },

  // Billing
  grandTotalBox: {
    backgroundColor: '#F6FFDC',
    border: '2px solid #DAF9DE',
    padding: '16px',
    borderRadius: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    color: '#4A2E1B',
    border: 'none',
    padding: '12px',
    borderRadius: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  confirmCheckoutBtn: {
    flex: 1,
    backgroundColor: '#F9B2D7',
    color: '#4A2E1B',
    border: 'none',
    padding: '12px',
    borderRadius: '12px',
    fontWeight: '800',
    cursor: 'pointer',
  },

  // Toast
  toast: {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#4A2E1B',
    color: '#FFFFFF',
    padding: '10px 20px',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: '700',
    zIndex: 2000,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },

  // Full Screen States
  fullScreenContainer: {
    minHeight: '100vh',
    backgroundColor: '#FAF8F5',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  fullScreenCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '24px',
    padding: '36px 28px',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
    boxShadow: '0 10px 30px rgba(74, 46, 27, 0.08)',
    border: '2px solid #CFECF3',
  },
  billBox: {
    backgroundColor: '#F6FFDC',
    border: '2px solid #DAF9DE',
    borderRadius: '16px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '12px',
  },
  billPriceText: {
    fontSize: '32px',
    fontWeight: '900',
    color: '#4A2E1B',
  },
};