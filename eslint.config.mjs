import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
    ],
  },
  { rules: { "react-hooks/set-state-in-effect": "off" } },
];
// Hydrate isolated demo localStorage in an effect to keep server markup deterministic.
export default config;
