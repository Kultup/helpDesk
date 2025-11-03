# 📦 Інструкції з налаштування ESLint, Prettier та Husky

## Крок 1: Встановлення залежностей

### Frontend:
```bash
cd frontend
npm install --save-dev \
  eslint \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin \
  eslint-plugin-react \
  eslint-plugin-react-hooks \
  eslint-plugin-jsx-a11y \
  prettier \
  eslint-config-prettier \
  eslint-plugin-prettier
```

### Backend:
```bash
cd backend
npm install --save-dev prettier eslint-config-prettier eslint-plugin-prettier
```

### Root (для Husky):
```bash
npm install --save-dev husky lint-staged
```

---

## Крок 2: Ініціалізація Husky

```bash
npx husky init
```

Або вручну:
```bash
mkdir -p .husky
npm pkg set scripts.prepare="husky install"
npm run prepare
```

---

## Крок 3: Створення pre-commit hook

```bash
npx husky add .husky/pre-commit "npx lint-staged"
```

---

## Крок 4: Налаштування lint-staged

Створити або оновити `.lintstagedrc.json` в корені проекту.

---

## Перевірка

Після встановлення:

1. **Перевірити ESLint:**
   ```bash
   cd frontend && npm run lint
   cd backend && npm run lint
   ```

2. **Перевірити Prettier:**
   ```bash
   cd frontend && npm run format:check
   cd backend && npm run format:check
   ```

3. **Перевірити pre-commit hook:**
   - Зробити зміну в файлі
   - Спробувати зробити commit
   - Husky має запустити lint-staged

---

## Автоматичне форматування

Для форматування всього коду:
```bash
cd frontend && npm run format
cd backend && npm run format
```

