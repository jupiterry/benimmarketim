import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		ViteImageOptimizer({
			jpg: {
				quality: 80,
				progressive: true
			},
			jpeg: {
				quality: 80,
				progressive: true
			},
			png: {
				quality: 80,
				progressive: true
			},
			webp: {
				quality: 80,
				lossless: false
			}
		})
	],
	server: {
		proxy: {
			"/api": "http://localhost:5000",
		},
	},
});
