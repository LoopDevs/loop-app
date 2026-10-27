import { Href, Link } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { type ComponentProps } from 'react';

import { useToast } from '@/components/toast';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: Href & string };

const unopenableMessage = "Couldn't open the link";

export const externalUrl = {
  isWeb(url: string): boolean {
    try {
      const { protocol } = new URL(url);
      return protocol === 'https:' || protocol === 'http:';
    } catch {
      return false;
    }
  },

  async open(url: string): Promise<void> {
    if (!externalUrl.isWeb(url)) {
      throw new Error(unopenableMessage);
    }
    if (process.env.EXPO_OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    await openBrowserAsync(url, {
      presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
    });
  },
};

export function useOpenExternal(): (url: string) => void {
  const toast = useToast();
  return (url) => {
    externalUrl.open(url).catch(() => toast(unopenableMessage));
  };
}

export function ExternalLink({ href, ...rest }: Props) {
  const openExternal = useOpenExternal();
  if (!externalUrl.isWeb(href)) {
    return null;
  }
  return (
    <Link
      target="_blank"
      rel="noopener noreferrer"
      {...rest}
      href={href}
      onPress={(event) => {
        if (process.env.EXPO_OS !== 'web') {
          event.preventDefault();
          openExternal(href);
        }
      }}
    />
  );
}
