import Link from 'next/link';

export default function HomePage() {
  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1 style={{ fontSize: '2.5rem', color: '#4A5568', marginBottom: '1rem' }}>
        🍦 ร้านไอติมเมฆน้อย
      </h1>
      <p style={{ marginBottom: '2rem', color: '#718096' }}>
        ยินดีต้อนรับสู่ระบบสั่งไอศกรีมและจัดการร้าน
      </p>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <Link 
          href="/generate-qr" 
          style={{
            padding: '10px 20px',
            backgroundColor: '#3182ce',
            color: 'white',
            borderRadius: '8px',
            fontWeight: 'bold'
          }}
        >
          สร้าง QR Code (สำหรับโต๊ะ)
        </Link>
        
        <Link 
          href="/kitchen" 
          style={{
            padding: '10px 20px',
            backgroundColor: '#38a169',
            color: 'white',
            borderRadius: '8px',
            fontWeight: 'bold'
          }}
        >
          หน้าจอห้องครัว (Kitchen)
        </Link>
      </div>
    </div>
  );
}
