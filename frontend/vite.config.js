import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		ViteImageOptimizer({
			jpg: {
				quality: 85,
				progressive: true,
				mozjpeg: true
			},
			jpeg: {
				quality: 85,
				progressive: true,
				mozjpeg: true
			},
			png: {
				quality: 85,
				progressive: true,
				optimizationLevel: 3
			},
			webp: {
				quality: 85,
				lossless: false,
				force: true
			},
			avif: {
				quality: 85,
				lossless: false,
				force: true
			},
			cache: true,
			cacheLocation: '.vite-image-cache'
		})
	],
	server: {
		proxy: {
			"/api": "https://www.devrekbenimmarketim.com",
			"/socket.io": {
				target: 'https://www.devrekbenimmarketim.com',
				ws: true,
				changeOrigin: true
			}
		},
	},
});
