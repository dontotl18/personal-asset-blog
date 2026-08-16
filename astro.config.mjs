// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	site: 'https://dontotl18.github.io',
	base: '/personal-asset-blog',
	integrations: [sitemap()],
});
