const path = require('path');

module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true,
    },
    extends: [
        'eslint:recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:jsx-a11y/recommended',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaFeatures: {
            jsx: true,
        },
        ecmaVersion: 'latest',
        sourceType: 'module',
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.json'],
    },
    plugins: ['react', 'react-hooks', '@typescript-eslint', 'jsx-a11y'],
    rules: {
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        '@typescript-eslint/explicit-function-return-type': 'warn',
        '@typescript-eslint/no-unused-vars': [
            'warn',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            },
        ],
        '@typescript-eslint/no-explicit-any': 'warn',
        'no-console': [
            'warn',
            {
                allow: ['warn', 'error'],
            },
        ],
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
        'jsx-a11y/anchor-is-valid': 'warn',
        'jsx-a11y/label-has-associated-control': 'warn',
        'jsx-a11y/click-events-have-key-events': 'warn',
        'jsx-a11y/no-static-element-interactions': 'warn',
        '@typescript-eslint/no-var-requires': 'warn',
        'react/no-unescaped-entities': 'warn',
        'prefer-const': 'error',
        'no-var': 'error',
    },
    settings: {
        react: {
            version: 'detect',
        },
    },
    ignorePatterns: ['build', 'dist', 'node_modules', '*.config.js', '*.config.ts'],
};
