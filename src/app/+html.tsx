import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { PageLayout } from '@/hooks/page-layout';

const firstPaintCss = [
  `html,body{background-color:${PageLayout.background};color:${PageLayout.text}}`,
  `html[${PageLayout.pendingAttribute}] #root{visibility:hidden;animation:loop-reveal 0s 4s forwards}`,
  '@keyframes loop-reveal{to{visibility:visible}}',
].join('');

export default function Root({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="color-scheme" content="light" />
        <meta name="theme-color" content={PageLayout.background} />
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
