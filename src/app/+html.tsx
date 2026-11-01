import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { Colors } from '@/constants/theme';
import { PageLayout } from '@/hooks/page-layout';

const colorVariables = Object.entries(Colors.light)
  .map(([name, value]) => `--color-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value}`)
  .join(';');

const firstPaintCss = [
  `:root{${colorVariables}}`,
  'html,body{background-color:var(--color-background);color:var(--color-text)}',
  `html[${PageLayout.pendingAttribute}] #root{visibility:hidden;animation:loop-reveal 0s 4s forwards}`,
  '@keyframes loop-reveal{to{visibility:visible}}',
].join('');

export default function Root({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <title>Loop</title>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="color-scheme" content="light" />
        <meta name="theme-color" content={Colors.light.background} />
        <script dangerouslySetInnerHTML={{ __html: PageLayout.pendingScript() }} />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: firstPaintCss }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
