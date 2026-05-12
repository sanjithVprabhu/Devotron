import './globals.css';

export const metadata = {
  title: 'VEDA — bring your business to life on WhatsApp',
  description: 'A meta-agent that interviews your business and stands it up on WhatsApp in under an hour.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
