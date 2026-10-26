const columnSteps = [
  { minWidth: 1180, columns: 6 },
  { minWidth: 960, columns: 5 },
  { minWidth: 720, columns: 4 },
  { minWidth: 520, columns: 3 },
] as const;

const prerenderWidth = 1440;

export const PageMetrics = {
  wideMinWidth: 960,
  pageMaxWidth: 1240,
  narrowGutter: 16,
  wideGutter: 32,
} as const;

export class PageLayout {
  static readonly pendingAttribute = 'data-layout-pending';
  static readonly background = '#FFFFFF';
  static readonly text = '#0F1B2D';

  static forWidth(width: number, web: boolean) {
    const wide = web && width >= PageMetrics.wideMinWidth;
    const gutter = wide ? PageMetrics.wideGutter : PageMetrics.narrowGutter;
    const contentWidth = Math.min(width, PageMetrics.pageMaxWidth) - gutter * 2;
    const columns = columnSteps.find((step) => contentWidth >= step.minWidth)?.columns ?? 2;
    return { wide, gutter, columns };
  }

  static prerendered() {
    return PageLayout.forWidth(prerenderWidth, true);
  }

  static pendingScript(): string {
    const { wide, columns } = PageLayout.prerendered();
    return [
      '(function(){',
      `var w=window.innerWidth,wide=w>=${PageMetrics.wideMinWidth};`,
      `var g=wide?${PageMetrics.wideGutter}:${PageMetrics.narrowGutter},c=Math.min(w,${PageMetrics.pageMaxWidth})-g*2;`,
      `var steps=${JSON.stringify(columnSteps)},cols=2;`,
      'for(var i=0;i<steps.length;i++){if(c>=steps[i].minWidth){cols=steps[i].columns;break;}}',
      `if(wide!==${wide}||cols!==${columns})document.documentElement.setAttribute('${PageLayout.pendingAttribute}','');`,
      '})();',
    ].join('');
  }

  static reveal() {
    document.documentElement.removeAttribute(PageLayout.pendingAttribute);
  }
}
