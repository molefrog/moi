import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const commonLanguageOptions = {
  ecmaVersion: 'latest',
  sourceType: 'module'
}

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'server/workspace/**', 'server/test/__fixtures__/**', 'workspace/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ...commonLanguageOptions,
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      '@typescript-eslint/no-explicit-any': 'error'
    }
  },
  {
    files: ['server/**/*.ts'],
    languageOptions: {
      ...commonLanguageOptions,
      globals: {
        ...globals.node,
        Bun: 'readonly'
      }
    }
  },
  eslintConfigPrettier
)
