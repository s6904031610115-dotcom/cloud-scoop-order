import './globals.css';

export const metadata = {
  title: 'ไอติมเมฆน้อย',
  description: 'ระบบสั่งไอศกรีมร้านไอติมเมฆน้อย',
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>
        <main style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
