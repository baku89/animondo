import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'
import vueParser from 'vue-eslint-parser'

import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
	languageOptions: {
		parser: vueParser,
		parserOptions: {
			parser: tsParser,
			ecmaVersion: 2022,
			sourceType: 'module',
		},
		globals: {
			...globals.node,
		},
	},
	plugins: {
		'@typescript-eslint': tsPlugin,
		'simple-import-sort': simpleImportSort,
		'unused-imports': unusedImports,
	},
	rules: {
		...js.configs.recommended.rules,
		...tsPlugin.configs.recommended.rules,
		'no-console': 'warn',
		'no-debugger': 'warn',
		eqeqeq: 'error',
		'prefer-const': 'error',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/explicit-module-boundary-types': 'off',
		'simple-import-sort/imports': 'error',
		'simple-import-sort/exports': 'error',
		'unused-imports/no-unused-imports': 'error',
		'@typescript-eslint/no-namespace': 'off',
		'vue/no-multiple-template-root': 'off',
		'vue/multi-word-component-names': 'off',
		'vue/no-v-model-argument': 'off',
		'vue/attribute-hyphenation': 'off',
		'vue/v-on-event-hyphenation': 'off',
		'vue/html-self-closing': 'off',
	},
})
