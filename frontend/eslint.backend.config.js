// Backend (Express + Mongoose) için ESLint ayarı. ESLint frontend/node_modules altında kurulu olduğundan
// ayar burada durur; depo kökünden çalıştırılır: `npm run lint:backend` (kök package.json).
import js from "@eslint/js";
import globals from "globals";

export default [
	{ ignores: ["**/node_modules/**", "backend/uploads/**"] },
	{
		files: ["backend/**/*.js", "backend/**/*.mjs"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: { ...globals.node, Intl: "readonly" },
		},
		rules: {
			...js.configs.recommended.rules,
			"no-unused-vars": ["error", { ignoreRestSiblings: true }],
		},
	},
];
