// ECharts con sólo los módulos que usa el sitio (menos peso que importar todo)
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, AriaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, AriaComponent, SVGRenderer]);

export function creaGrafica(el) {
  const g = echarts.init(el, null, { renderer: 'svg' });
  new ResizeObserver(() => g.resize()).observe(el);
  return g;
}
