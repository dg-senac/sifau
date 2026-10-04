import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.recife.sifau',
  appName: 'SIFAU',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
    },
  },
};

export default config;
