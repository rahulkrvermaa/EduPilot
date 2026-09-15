import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'backend/venv', 'node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Hooks (useToast, useTheme) live alongside their provider components
      // for code locality; the Fast Refresh warning is purely a DX hint.
      'react-refresh/only-export-components': 'off',
      // `toast` is a stable object (memoized in the context provider),
      // so listing it as a useEffect dependency would only cause churn.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
])
