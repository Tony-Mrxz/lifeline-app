import './globals.css';

export const metadata = {
  title: 'Life Line',
  description: 'Emergency SOS',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
