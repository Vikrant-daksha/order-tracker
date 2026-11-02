declare module 'react-native-svg-charts' {
  import { ComponentType } from 'react';
  import { ViewStyle } from 'react-native';
  import { PathProps } from 'react-native-svg';

  export interface Series {
    data: number[];
    color: string;
    strokeWidth?: number;
  }

  export type LineChartData = Series[] | number[];

  export interface LineChartProps {
    style?: ViewStyle;
    data: LineChartData;
    contentInset?: { left: number; right: number; top: number; bottom: number };
    curve?: (context: any) => any;
    gridProps?: { strokeDashArray?: string; stroke?: string; belowChart?: boolean };
    yAccessor?: ({ item }: { item: number }) => number;
    xAccessor?: ({ index }: { index: number }) => number;
    numberOfTicks?: number;
    color?: string;
    strokeWidth?: number;
    children?: React.ReactNode;
  }

  export const LineChart: ComponentType<LineChartProps> & {
    DashedLine: ComponentType<any>;
  };

  export interface GridProps {
    svg?: PathProps;
    belowChart?: boolean;
  }

  export const Grid: ComponentType<GridProps>;

  export interface XAxisProps {
    style?: ViewStyle;
    data: string[];
    formatLabel?: (value: string, index: number) => string;
    contentInset?: { left: number; right: number };
    svg?: PathProps;
  }

  export const XAxis: ComponentType<XAxisProps>;
}