/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
				display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
			},
			keyframes: {
				blob: {
					"0%": { transform: "translate(0px, 0px) scale(1)" },
					"33%": { transform: "translate(30px, -50px) scale(1.1)" },
					"66%": { transform: "translate(-20px, 20px) scale(0.9)" },
					"100%": { transform: "translate(0px, 0px) scale(1)" }
				}
			},
			animation: {
				blob: "blob 7s infinite"
			},
			transitionDelay: {
				'2000': '2000ms',
				'4000': '4000ms',
			}
		},
	},
	plugins: [],
};
