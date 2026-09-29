'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function GenerateQRPage() {
  const [tableNumber, setTableNumber] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  
  // สถานะเมื่อเจอ session ที่เปิดค้างอยู่
  const [existingSession, setExistingSession] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // สถานะเมื่อสร้าง session ใหม่สำเร็จ และพร้อมแสดง QR Code
  const [activeQr, setActiveQr] = useState(null);
  const [copied, setCopied] = useState(false);

  // ตรวจสอบความถูกต้องของเลขโต๊ะ (ตัวเลขจำนวนเต็ม > 0 ไม่มีเลข 0 นำหน้า)
  const isValidTableNumber = (val) => {
    return /^[1-9]\d*$/.test(val.trim());
  };

  // คำนวณระยะเวลาที่เปิดค้างไว้เป็นนาที
  const calculateElapsedMinutes = (createdAt) => {
    if (!createdAt) return 0;
    const start = new Date(createdAt).getTime();
    const now = new Date().getTime();
    const diffMs = now - start;
    return Math.max(0, Math.floor(diffMs / (1000 * 60)));
  };

  // จัดการเมื่อกดปุ่ม "เปิดโต๊ะ"
  const handleOpenTable = async (e) => {
    e?.preventDefault();
    setErrorMsg('');
    setActiveQr(null);

    const trimmed = tableNumber.trim();
    if (!isValidTableNumber(trimmed)) {
      setErrorMsg('กรุณากรอกเลขโต๊ะเป็นตัวเลขจำนวนเต็มที่มากกว่า 0 และไม่มีเลข 0 นำหน้า (เช่น 1, 2, 10)');
      return;
    }

    const tableNum = parseInt(trimmed, 10);
    setLoading(true);

    try {
      // 1. เช็คว่ามี session ที่สถานะ 'open' สำหรับโต๊ะนี้อยู่หรือไม่
      const { data: existing, error: checkError } = await supabase
        .from('sessions')
        .select('id, table_number, status, created_at')
        .eq('table_number', tableNum)
        .eq('status', 'open')
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        // พบ Session เปิดค้างอยู่ -> แสดงกล่องเตือน
        setExistingSession(existing);
        setLoading(false);
        return;
      }

      // 2. ถ้าไม่มี session เปิด ค้างอยู่ -> Insert session ใหม่
      const { data: newSession, error: insertError } = await supabase
        .from('sessions')
        .insert([{ table_number: tableNum, status: 'open' }])
        .select()
        .single();

      if (insertError) throw insertError;

      // 3. สร้าง URL และ QR Code
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const fullOrderUrl = `${origin}/order/${tableNum}`;
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullOrderUrl)}`;

      setActiveQr({
        tableNumber: tableNum,
        orderUrl: fullOrderUrl,
        qrImageUrl: qrApiUrl,
      });

    } catch (err) {
      console.error('Error opening table:', err);
      setErrorMsg('เกิดข้อผิดพลาดในการเปิดโต๊ะ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  // จัดการยืนยันปิดออเดอร์เดิม
  const handleConfirmCloseSession = async () => {
    if (!existingSession) return;
    setIsClosing(true);

    try {
      // update status เป็น 'closed' เฉพาะแถวนั้น และเช็ค status = 'open' ซ้ำเพื่อป้องกันกดซ้ำ
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'closed' })
        .eq('id', existingSession.id)
        .eq('status', 'open');

      if (error) throw error;

      // ปิดสำเร็จ -> ปิดกล่องยืนยัน, เอากล่องเตือนออก
      // คงเลขโต๊ะที่กรอกไว้ในช่องฟอร์ม เพื่อให้พนักงานกด "เปิดโต๊ะ" อีกครั้งเอง
      setShowConfirmModal(false);
      setExistingSession(null);
    } catch (err) {
      console.error('Error closing session:', err);
      alert('ไม่สามารถปิดออเดอร์เดิมได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsClosing(false);
    }
  };

  // คัดลอกลิงก์ไปยัง Clipboard
  const handleCopyLink = () => {
    if (activeQr?.orderUrl) {
      navigator.clipboard.writeText(activeQr.orderUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ปุ่มเปิดโต๊ะใหม่ (ล้างฟอร์ม)
  const handleResetForm = () => {
    setTableNumber('');
    setActiveQr(null);
    setExistingSession(null);
    setErrorMsg('');
    setCopied(false);
  };

  return (
    <div style={styles.container}>
      {/* ส่วน Header ตกแต่งธีมไอศกรีมเมฆน้อย */}
      <div style={styles.card}>
        <div style={styles.headerDecoration}>
          <span style={styles.cloudBadge}>☁️ ร้านไอติมเมฆน้อย</span>
          <div style={styles.toppingDots}>
            <span style={{ ...styles.dot, backgroundColor: '#F9B2D7' }}></span>
            <span style={{ ...styles.dot, backgroundColor: '#CFECF3' }}></span>
            <span style={{ ...styles.dot, backgroundColor: '#DAF9DE' }}></span>
            <span style={{ ...styles.dot, backgroundColor: '#F6FFDC' }}></span>
          </div>
        </div>

        <h1 style={styles.title}>🍦 ระบบเปิดโต๊ะรับลูกค้า</h1>
        <p style={styles.subtitle}>กรอกเลขโต๊ะเพื่อสร้าง QR Code สั่งอาหาร</p>

        {/* กรณีแสดง QR Code เมื่อเปิดโต๊ะสำเร็จ */}
        {activeQr ? (
          <div style={styles.qrResultBox}>
            <div style={styles.qrHeader}>
              <span style={styles.successBadge}>✅ เปิดโต๊ะสำเร็จ</span>
              <h2 style={styles.tableTitle}>โต๊ะ {activeQr.tableNumber}</h2>
            </div>

            <div style={styles.qrImageContainer}>
              <img
                src={activeQr.qrImageUrl}
                alt={`QR Code โต๊ะ ${activeQr.tableNumber}`}
                style={styles.qrImage}
              />
            </div>

            <div style={styles.linkContainer}>
              <p style={styles.linkText}>{activeQr.orderUrl}</p>
              <button onClick={handleCopyLink} style={styles.copyBtn}>
                {copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกลิงก์'}
              </button>
            </div>

            <button onClick={handleResetForm} style={styles.resetBtn}>
              ✨ เปิดโต๊ะใหม่
            </button>
          </div>
        ) : (
          /* กรณีฟอร์มเปิดโต๊ะ */
          <form onSubmit={handleOpenTable} style={styles.form}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>เลขโต๊ะ</label>
              <input
                type="text"
                value={tableNumber}
                onChange={(e) => {
                  setTableNumber(e.target.value);
                  setErrorMsg('');
                  setExistingSession(null);
                }}
                placeholder="ระบุเลขโต๊ะ เช่น 1, 2, 7"
                style={styles.input}
                disabled={loading}
              />
            </div>

            {errorMsg && <div style={styles.errorBox}>⚠️ {errorMsg}</div>}

            {/* กล่องเตือนเมื่อพบ Session ค้างอยู่ */}
            {existingSession && (
              <div style={styles.warningAlertBox}>
                <p style={styles.warningText}>
                  ⚠️ โต๊ะนี้ยังมีลูกค้าใช้งานอยู่ กรุณาปิดออเดอร์เดิมก่อน
                </p>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  style={styles.closeOldOrderBtn}
                >
                  🚪 ปิดออเดอร์เดิม
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !tableNumber.trim()}
              style={{
                ...styles.submitBtn,
                opacity: loading || !tableNumber.trim() ? 0.6 : 1,
                cursor: loading || !tableNumber.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'กำลังตรวจสอบ...' : '🍦 เปิดโต๊ะ'}
            </button>
          </form>
        )}
      </div>

      {/* Modal ยืนยันปิดออเดอร์เดิม */}
      {showConfirmModal && existingSession && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <span style={styles.modalIcon}>🍨</span>
              <h3 style={styles.modalTitle}>ยืนยันปิดออเดอร์เดิม</h3>
            </div>

            <div style={styles.modalBody}>
              <p style={styles.modalTableText}>
                โต๊ะ <strong>{existingSession.table_number}</strong>
              </p>
              <p style={styles.modalTimeText}>
                ⏱️ เปิดมาแล้ว <strong>{calculateElapsedMinutes(existingSession.created_at)}</strong> นาที
              </p>
              <p style={styles.modalHint}>
                ต้องการปิดออเดอร์เดิมเพื่อเปิดใช้งานใหม่ใช่หรือไม่?
              </p>
            </div>

            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isClosing}
                style={styles.cancelBtn}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmCloseSession}
                disabled={isClosing}
                style={{
                  ...styles.confirmBtn,
                  opacity: isClosing ? 0.6 : 1,
                }}
              >
                {isClosing ? 'กำลังปิด...' : 'ยืนยันปิดโต๊ะเดิม'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline Styles ตกแต่งธีมไอติมมินิมอล
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#FAF8F5',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '24px 16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#4A2E1B', // สีน้ำตาลเข้ม
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: '24px',
    padding: '32px 28px',
    width: '100%',
    maxWidth: '440px',
    boxShadow: '0 10px 30px rgba(74, 46, 27, 0.08)',
    border: '2px solid #CFECF3',
    position: 'relative',
  },
  headerDecoration: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  cloudBadge: {
    backgroundColor: '#CFECF3',
    color: '#4A2E1B',
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
  },
  toppingDots: {
    display: 'flex',
    gap: '6px',
  },
  dot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  title: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#4A2E1B',
    margin: '0 0 6px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#7A5C45',
    margin: '0 0 24px 0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#4A2E1B',
  },
  input: {
    padding: '14px 16px',
    borderRadius: '14px',
    border: '2px solid #E2D7CE',
    fontSize: '18px',
    fontWeight: '600',
    color: '#4A2E1B',
    outline: 'none',
    backgroundColor: '#FFFDF9',
    transition: 'all 0.2s',
  },
  submitBtn: {
    backgroundColor: '#F9B2D7',
    color: '#4A2E1B',
    border: 'none',
    padding: '16px',
    borderRadius: '16px',
    fontSize: '18px',
    fontWeight: '800',
    marginTop: '8px',
    boxShadow: '0 4px 12px rgba(249, 178, 215, 0.4)',
  },
  errorBox: {
    backgroundColor: '#FFF0F0',
    color: '#C0392B',
    padding: '12px 14px',
    borderRadius: '12px',
    fontSize: '14px',
    border: '1px solid #FADBD8',
  },
  warningAlertBox: {
    backgroundColor: '#F6FFDC',
    border: '2px solid #DAF9DE',
    borderRadius: '16px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  warningText: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '600',
    color: '#4A2E1B',
    lineHeight: '1.4',
  },
  closeOldOrderBtn: {
    backgroundColor: '#4A2E1B',
    color: '#FFFFFF',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },

  // ผลลัพธ์ QR Code
  qrResultBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    animation: 'fadeIn 0.3s ease-in-out',
  },
  qrHeader: {
    textAlign: 'center',
  },
  successBadge: {
    backgroundColor: '#DAF9DE',
    color: '#27AE60',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '700',
  },
  tableTitle: {
    fontSize: '36px',
    fontWeight: '900',
    color: '#4A2E1B',
    margin: '8px 0 0 0',
  },
  qrImageContainer: {
    backgroundColor: '#FFFFFF',
    padding: '16px',
    borderRadius: '20px',
    border: '3px solid #CFECF3',
    boxShadow: '0 6px 18px rgba(0,0,0,0.05)',
  },
  qrImage: {
    width: '220px',
    height: '220px',
    display: 'block',
    borderRadius: '8px',
  },
  linkContainer: {
    width: '100%',
    backgroundColor: '#FFFDF9',
    border: '1px dashed #E2D7CE',
    borderRadius: '12px',
    padding: '12px',
    textAlign: 'center',
  },
  linkText: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    color: '#7A5C45',
    wordBreak: 'break-all',
  },
  copyBtn: {
    backgroundColor: '#CFECF3',
    color: '#4A2E1B',
    border: 'none',
    padding: '6px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  resetBtn: {
    backgroundColor: '#F6FFDC',
    color: '#4A2E1B',
    border: '2px solid #DAF9DE',
    padding: '12px 24px',
    borderRadius: '14px',
    fontSize: '15px',
    fontWeight: '800',
    cursor: 'pointer',
    width: '100%',
    marginTop: '8px',
  },

  // Modal ยืนยันปิดโต๊ะ
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
    alignItems: 'center',
    padding: '16px',
    zIndex: 1000,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '24px',
    padding: '24px',
    width: '100%',
    maxWidth: '360px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
    border: '2px solid #F9B2D7',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
  },
  modalIcon: {
    fontSize: '24px',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#4A2E1B',
    margin: 0,
  },
  modalBody: {
    backgroundColor: '#FFFDF9',
    padding: '16px',
    borderRadius: '14px',
    border: '1px solid #E2D7CE',
    marginBottom: '20px',
  },
  modalTableText: {
    fontSize: '20px',
    margin: '0 0 6px 0',
    color: '#4A2E1B',
  },
  modalTimeText: {
    fontSize: '14px',
    margin: '0 0 10px 0',
    color: '#C0392B',
  },
  modalHint: {
    fontSize: '13px',
    margin: 0,
    color: '#7A5C45',
  },
  modalActions: {
    display: 'flex',
    gap: '10px',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    color: '#4A2E1B',
    border: 'none',
    padding: '12px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  confirmBtn: {
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
