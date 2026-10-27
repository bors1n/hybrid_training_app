import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.2, resizeOptions: { background: '#15181E' } },
    apple: { ...minimal2023Preset.apple, padding: 0.2, resizeOptions: { background: '#15181E' } },
  },
  images: ['public/favicon.svg'],
});
