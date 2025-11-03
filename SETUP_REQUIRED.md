# ✅ Встановлення необхідних залежностей

## Крок 1: Встановити залежності для Backend

```powershell
cd backend
npm install --save-dev prettier eslint-config-prettier eslint-plugin-prettier
npm install joi
```

## Крок 2: Встановити залежності для Frontend

```powershell
cd frontend
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y prettier eslint-config-prettier eslint-plugin-prettier
```

## Крок 3: Встановити залежності в корені проекту (Husky)

```powershell
cd ..
npm install
```

## Крок 4: Ініціалізувати Husky

```powershell
npm run prepare
```

Або:

```powershell
npx husky install
```

## Крок 5: Зробити pre-commit hook виконуваним (якщо потрібно)

На Linux/Mac:
```bash
chmod +x .husky/pre-commit
```

---

## ✅ Що вже налаштовано:

1. ✅ **ESLint конфігурація:**
   - `frontend/.eslintrc.json`
   - `backend/.eslintrc.json`

2. ✅ **Prettier конфігурація:**
   - `frontend/.prettierrc.json`
   - `backend/.prettierrc.json`
   - `.prettierignore` файли

3. ✅ **Husky налаштування:**
   - `.husky/pre-commit`
   - `.lintstagedrc.json`

4. ✅ **Environment Variables валідація:**
   - `backend/config/env.js`
   - Додано в `backend/app.js`

5. ✅ **Input Sanitization:**
   - Покращено в `backend/middleware/validation.js`
   - Використовує `xss-clean` (вже встановлено)

6. ✅ **npm scripts:**
   - Додано `lint`, `lint:fix`, `format`, `format:check` для frontend та backend
   - Додано `lint`, `lint:fix`, `format` в кореневому package.json

---

## 🧪 Перевірка після встановлення:

### Frontend:
```powershell
cd frontend
npm run lint
npm run format:check
```

### Backend:
```powershell
cd backend
npm run lint
npm run format:check
```

### Перевірка env валідації:
```powershell
cd backend
node app.js
# Має показати "✅ Environment variables validated successfully"
```

---

## 📝 Наступні кроки:

Після встановлення залежностей:

1. Запустити форматування коду:
   ```powershell
   npm run format
   ```

2. Виправити ESLint помилки:
   ```powershell
   npm run lint:fix
   ```

3. Перевірити, що pre-commit hook працює:
   - Зробити зміну в файлі
   - Спробувати commit
   - Husky має автоматично запустити lint-staged

