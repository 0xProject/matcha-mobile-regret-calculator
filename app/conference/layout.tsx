import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Matcha Take Profit | ETHConf 2026',
  description:
    'See how much you left on the table by not using Take Profit. Enter your wallet and find out instantly.',
  openGraph: {
    title: 'Matcha Take Profit | ETHConf 2026',
    description: 'See how much you left on the table by not using Take Profit.',
    type: 'website',
  },
};

export default function ConferenceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
