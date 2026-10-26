// react-native-vector-icons 10.x ships no TypeScript types; declare the one set we use.
declare module 'react-native-vector-icons/Ionicons' {
  import type { ComponentType } from 'react';
  import type { TextProps } from 'react-native';

  export interface IoniconsProps extends TextProps {
    name: string;
    size?: number;
    color?: string;
  }

  const Icon: ComponentType<IoniconsProps> & {
    loadFont: (file?: string) => Promise<void>;
  };
  export default Icon;
}
