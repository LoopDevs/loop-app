import Head from 'expo-router/head';

export function PageTitle({ title }: { title?: string }) {
  return (
    <Head>
      <title>{title ? `${title} – Loop` : 'Loop'}</title>
    </Head>
  );
}
