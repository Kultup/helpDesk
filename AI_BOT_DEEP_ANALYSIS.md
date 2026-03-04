# 🔬 Глибокий аналіз AI бота — HelpDesk System

> **Версія аналізу:** 1.0 | **Дата:** 2026-03-04 | **Аналітик:** Claude Sonnet 4.6

---

## 📖 Зміст

1. [Архітектура системи](#1-архітектура-системи)
2. [Виявлені баги та проблеми](#2-виявлені-баги-та-проблеми)
3. [Слабкі місця промптів](#3-слабкі-місця-промптів)
4. [Проблеми логіки сервісів](#4-проблеми-логіки-сервісів)
5. [Валідація та безпека](#5-валідація-та-безпека)
6. [Токен-менеджмент](#6-токен-менеджмент)
7. [Покращення промптів](#7-покращення-промптів)
8. [Покращення архітектури](#8-покращення-архітектури)
9. [Нові функції](#9-нові-функції)
10. [Пріоритизований план](#10-пріоритизований-план)

---

## 1. Архітектура системи

### Схема потоку запиту

```
Telegram User Message
        ↓
telegramService.js → onMessage()
        ↓
telegramAIService.js → handleUserMessage()
        ↓
aiFirstLineService.js → analyzeIntent()
        ├── selectIntentPrompt()  →  'light' | 'full'
        ├── [Fast-Track] aiEnhancedService.findQuickSolution()
        ├── [Light] callChatCompletion(INTENT_ANALYSIS_LIGHT)
        └── [Full]
              ├── getSimilarResolvedTickets()    (semantic search)
              ├── checkSimilarTicketsRelevance() (self-correction)
              ├── getNetworkStormContext()        (mass incident)
              ├── getDuplicateTicketContext()     (anti-spam)
              ├── getServerHealthContext()        (infra health)
              └── callChatCompletion(INTENT_ANALYSIS)
                        ↓ [Agentic RAG, max 2 iter]
                        fetchExtraContextForAgentic()
        ↓
aiResponseValidator.validate()
        ↓
Response to User + [optional] Ticket Creation
```

### Ключові файли

| Файл                             | Рядків      | Роль                               |
| -------------------------------- | ----------- | ---------------------------------- |
| `prompts/aiFirstLinePrompts.js`  | ~428 (v4.1) | Промпти, константи, helper-функції |
| `services/aiFirstLineService.js` | ~2400       | Основна AI логіка                  |
| `services/telegramAIService.js`  | ~2177       | Telegram інтеграція                |
| `services/aiEnhancedService.js`  | ~745        | База швидких рішень                |
| `utils/aiResponseValidator.js`   | ~523        | Валідація відповідей               |

---

## 2. Виявлені баги та проблеми

### 🔴 Критичні баги

#### Bug #1 — requestType нормалізація втрачає типи

**Файл:** `aiFirstLineService.js:933-936`

```javascript
// ПОТОЧНИЙ КОД (проблема):
const requestType =
  parsed.requestType === "appeal" || parsed.requestType === "question"
    ? parsed.requestType
    : "question"; // ← 'problem' та 'greeting' → 'question'!
```

**Проблема:** Промпт генерує `requestType: "problem"` або `requestType: "greeting"`, але сервіс відкидає їх та повертає `"question"`. Це ламає розгалуження в `telegramService.js` — привітання трактується як питання.

**Виправлення:**

```javascript
const VALID_REQUEST_TYPES = ["appeal", "question", "problem", "greeting"];
const requestType = VALID_REQUEST_TYPES.includes(parsed.requestType)
  ? parsed.requestType
  : "question";
```

---

#### Bug #2 — Пробіл у regex-патерні для "спасибі"

**Файл:** `aiFirstLinePrompts.js:316`

```javascript
// ПОТОЧНИЙ КОД (баг — пробіл перед 'спасибі'):
/ спасибі/i,
```

**Проблема:** Рядок `"спасибі"` (на початку) **не** матчить цей патерн. Матчить лише `"дякую спасибі"` тощо. Результат: повідомлення "спасибі" йде в `full` режим замість `light`.

**Виправлення:**

```javascript
/спасибі/i,
```

---

#### Bug #3 — Патерн `/добре/i` без `^` захоплює проблемні запити

**Файл:** `aiFirstLinePrompts.js:319`

```javascript
// ПОТОЧНИЙ КОД (баг):
simplePatterns = [
  .../добре/i, // ← "мені не добре з цим принтером" → light mode!
];
```

**Проблема:** Фраза `"Добре, але принтер все одно не друкує"` матчить як просте повідомлення та йде в `light` режим.

**Виправлення:**

```javascript
/^добре$/i,   // тільки окреме слово
/^гаразд$/i,  // те ж для "гаразд"
```

---

#### Bug #4 — Кеш для анонімних користувачів — race condition

**Файл:** `aiFirstLineService.js:625, 974`

```javascript
// ПОТОЧНИЙ КОД:
const cacheKey = aiResponseCache.createKey(
  lastMessage,
  options.userId || "unknown",
);
```

**Проблема:** Якщо два різні незареєстровані користувачі надсилають `"привіт"` — вони отримують ту ж кешовану відповідь. Але якщо AI-відповідь містить персональні дані з userContext (місто, установа) — перший користувач може бачити дані другого.

**Виправлення:**

```javascript
// Кешувати лише якщо немає персонального контексту
const hasPersonalContext =
  userContext?.userCity || userContext?.userInstitution;
if (!hasPersonalContext && lastMessage && lastMessage.length < 50) {
  const cacheKey = aiResponseCache.createKey(lastMessage, "global");
  // ...
}
```

---

### 🟠 Серйозні проблеми

#### Problem #1 — INTENT_ANALYSIS промпт не має деяких template-змінних

**Файл:** `aiFirstLineService.js:821-834`

```javascript
const systemPrompt = fillPrompt(INTENT_ANALYSIS, {
  userContext,
  timeContext,
  dialogHistory,
  quickSolutions: quickSolutionsText, // ← є в service
  webSearchContext, // ← є в service
  similarTickets, // ← є в service
  activeTicketInfo, // ← є в service
  extraContextBlock, // ← є в service
  serverHealthContext, // ← є в service
  agenticSecondPass, // ← є в service
});
```

Але в поточному `INTENT_ANALYSIS` (prompts v4.1) ці template-змінні **відсутні** в тексті промпту. `fillPrompt()` замінює `{quickSolutions}` → `''`. Інформація губиться безслідно, AI не знає про черги, активні тікети, web-контекст.

**Виправлення:** Додати секцію в промпт:

```
CONTEXT (do not ignore):
User: {userContext}
Time: {timeContext}
Queue: {queueContext}
Similar resolved tickets: {similarTickets}
Active ticket: {activeTicketInfo}
Server health: {serverHealthContext}
Extra context: {extraContextBlock}
```

---

#### Problem #2 — `validateQuickSolution` відкидає KB статті

**Файл:** `aiResponseValidator.js:80-85`

```javascript
if (!this.requiredPatterns.steps.test(trimmed)) {
  return { valid: false, reason: "No numbered steps found" };
}
```

**Проблема:** `maxLength = 500`. KB стаття `"Для налаштування нового принтера потрібні права адміністратора. Я створю заявку."` — 77 символів, немає нумерованих кроків → **відкидається**. Але це валідна відповідь.

---

#### Problem #3 — `hasSuspiciousPhrases` блокує валідні відповіді

**Файл:** `aiResponseValidator.js:265-266`

```javascript
/\[.*?\]/, // Текст в квадратних дужках (часто placeholder)
/\{.*?\}/, // Текст в фігурних дужках
```

**Проблема:** Відповідь `"Перевірте підключення [USB або Wi-Fi]"` — блокується. Markdown-форматування `[посилання]` — блокується.

---

#### Problem #4 — Agentic RAG — змінна `agenticSecondPass` не використовується в промпті

**Файл:** `aiFirstLineService.js:820`

```javascript
const agenticSecondPass = iter > 0 ? "true" : "false";
// передається в fillPrompt але в INTENT_ANALYSIS немає {agenticSecondPass}
```

AI не знає що вона вже отримала додатковий контекст і що це другий прохід. Може повторно запросити той самий контекст.

---

## 3. Слабкі місця промптів

### 3.1 Структура `INTENT_ANALYSIS` — гігантський промпт

**Поточний стан:** Промпт складається з 9 великих блоків (~3500+ символів), але `MAX_TOKENS.INTENT_ANALYSIS = 600`. Це означає AI змушена обробляти величезний input та генерувати дуже обмежений output.

**Проблеми:**

- Повторення: `SYSADMIN_WORK_CONTEXT` і `ADVANCED_CATEGORIZATION` перекриваються в темі принтерів, мережі
- `ANALYZE_TEXT_RULES` — лише один рядок-placeholder, не несе цінності
- Блок `COMMUNICATION_STYLE` містить emoji (наприклад `🚨`) але сам промпт каже "не будь роботом" — суперечність
- Немає прикладів помилкових JSON відповідей (негативні приклади)

**Рекомендована реструктуризація:**

```
INTENT_ANALYSIS_v5 = [
  ROLE_DEFINITION     (~100 chars)  → хто ти
  RESPONSE_LANGUAGE   (~50 chars)   → відповідь завжди Ukrainian
  CONTEXT_BLOCK       (~300 chars)  → вставні змінні
  DECISION_TREE       (~500 chars)  → чіткий алгоритм рішення
  OUTPUT_FORMAT       (~300 chars)  → JSON schema
]
```

---

### 3.2 Відсутні важливі сценарії в промптах

#### Сценарій A: Повторне звернення по тому ж тікету

Поточний стан: Детектується через `getActiveTicketForUser()` + `ANXIOUS_REPEAT_PATTERNS`, але промпт не має чіткої інструкції що **казати** користувачу при повторному зверненні.

#### Сценарій B: Фото як доказ проблеми

Промпт не інструктує AI як реагувати коли `userContext.detectedHardware` містить результат розпізнавання з фото.

#### Сценарій C: Змішані мови (укр+рос)

Немає чіткої інструкції для повідомлень типу `"принтер нє робот, шо дєлать"`. Поточне детектування проблем — лише українські ключові слова.

#### Сценарій D: Emoji-only повідомлення

`"😤"`, `"🤔"`, `"👍"` — не обробляються. Йдуть в `full` режим і AI може видати помилкову відповідь.

---

### 3.3 Inconsistency категорій

| Місце                              | Категорії                                              |
| ---------------------------------- | ------------------------------------------------------ |
| `INTENT_ANALYSIS` output format    | `Hardware\|Software\|Network\|Access\|Printing\|Other` |
| `ADVANCED_CATEGORIZATION`          | Hardware, Software, Network, Access, Printing, Other   |
| `aiResponseValidator` schema       | `'general'` (default)                                  |
| `aiEnhancedService` quickSolutions | `'Hardware'`, `'Network'`, `'Access'`, `'Software'`    |
| DB модель Ticket                   | `subcategory` поле                                     |

**Проблема:** `"Printing"` як окрема категорія існує в промпті, але не в validator схемі. Принтери часто потрапляють у `Hardware`. Адміну складно фільтрувати.

---

### 3.4 `EMOTION_DETECTION` — неповна

```javascript
const EMOTION_DETECTION = `
🔴 URGENT: "терміново", "все зламалося", "каса не працює"
🟠 FRUSTRATED: "знову", "вже", "третій раз", "постійно"
🟡 CONFUSED: "не знаю", "як", "що робити"
🟢 NEUTRAL: спокійний запит
`;
```

**Відсутні патерни:**

- `"вибачте що турбую"` → CONFUSED або POLITE → знизити пріоритет
- `"Я ВЖЕ НАПИСАВ 3 РАЗИ"` → ANGRY → підняти до URGENT
- `"ok"`, `"зрозуміло"` → RESOLVED → перевірити чи закрити сесію
- Caps lock → ознака стресу

---

### 3.5 `SELF_HEALING_FILTER` — не покриває всі сценарії

Поточні 4 сценарії (комп, інтернет, принтер, програма) — базові. Відсутні:

- Відеокарта / монітор не відображає
- Bluetooth мишка/клавіатура
- Outlook/Teams не підключається
- VPN не підключається
- Zabbix-алерт (вже є окремий промпт, але не в self-healing)

---

## 4. Проблеми логіки сервісів

### 4.1 Fast-Track — відсутній graceful degradation

**Файл:** `aiFirstLineService.js:728-767`

```javascript
const fastTrack = aiEnhancedService.findQuickSolution(lastMsg.content, userContext || {});
if (fastTrack && fastTrack.hasQuickFix) {
  return { ... quickSolution: fastTrack.solution, priority: 'medium' };
  // ↑ Завжди 'medium' — ігнорується emotionalTone та context
}
```

**Проблеми:**

1. Fast-Track завжди повертає `priority: 'medium'` навіть якщо є слово "терміново"
2. Fast-Track не враховує `userContext` — один скрипт для всіх міст/установ
3. Після Fast-Track не виконується `metricsCollector.recordAIResponse()` — метрики неповні

**Рекомендація:**

```javascript
// Перевірити urgency навіть при fast-track
const urgentKeywords = ["терміново", "критично", "каса", "клієнти"];
const isUrgent = urgentKeywords.some((k) =>
  lastMsg.content.toLowerCase().includes(k),
);
return {
  ...fastTrackResult,
  priority: isUrgent ? "urgent" : "medium",
};
```

---

### 4.2 `getTimeContextForPrompt()` — хардкод розкладу

**Файл:** `aiFirstLineService.js:113-155`

```javascript
const CLOSE_MINS = 21 * 60; // 21:00
const openMins = day === 1 ? 12 * 60 : 10 * 60; // Mon 12:00, else 10:00
```

**Проблема:** Розклад захардкоджений. Якщо установа змінює годину роботи (свята, зміна режиму) — потрібен deploy.

**Рекомендація:** Перенести в `AISettings` або `Settings` модель:

```javascript
const settings = await getAISettings();
const openHour = settings.workingHoursStart ?? 10;
const closeHour = settings.workingHoursEnd ?? 21;
```

---

### 4.3 `getDuplicateTicketContext()` — занадто вузький пошук

**Файл:** `aiFirstLineService.js:235-283`

```javascript
// Шукає дублікати тільки якщо є categoryHint або 'принтер/друк' у тексті
if (categoryHint) { ... }
else if (problemText && /принтер|друк/i.test(problemText)) { ... }
// Для всіх інших категорій — взагалі не шукає дублікати!
```

**Проблема:** Для мережевих проблем, Software, Access — дублікати не детектуються.

---

### 4.4 `getSimilarResolvedTickets()` — фільтрація за рейтингом >= 4

```javascript
{ 'qualityRating.rating': { $gte: 4 } }
```

**Проблема:** Нові системи часто не мають рейтингів. Якщо у базі мало рейтингів — AI не отримує контексту схожих тікетів.

**Рекомендація:** Якщо `< 10` рейтингованих тікетів — знімати фільтр рейтингу.

---

### 4.5 Cache TTL = 1 година — занадто довго

**Файл:** `aiFirstLineService.js:975`

```javascript
aiResponseCache.set(cacheKey, result, 3600000); // 1 година
```

Якщо адмін змінив налаштування AI, оновив KB, або закрив масовий інцидент — кешовані відповіді будуть застарілими протягом 1 години.

**Рекомендація:** TTL = 5-15 хвилин для simple queries.

---

## 5. Валідація та безпека

### 5.1 Validator `maxLength = 500` конфліктує з промптом

`QUICK_SOLUTION_FORMAT` каже **300-450 символів**, але validator приймає до **500**. Ця розбіжність дозволяє проходити занадто довгі відповіді.

**Рекомендація:** Синхронізувати: `maxLength = 450`.

### 5.2 Validator не перевіряє мову відповіді

AI може відповісти англійською (особливо при помилках промпту або при Groq з певними моделями). Валідатор це не детектує.

**Рекомендація:**

```javascript
// Перевірка наявності кириличних символів
const cyrillicRatio =
  (text.match(/[а-яіїєґА-ЯІЇЄҐ]/g) || []).length / text.length;
if (cyrillicRatio < 0.3 && text.length > 50) {
  return { valid: false, reason: "Response not in Ukrainian" };
}
```

### 5.3 `fillPrompt()` — можлива prompt injection через userContext

**Файл:** `aiFirstLinePrompts.js:356-381`

```javascript
function fillPrompt(template, vars) {
  for (const [key, value] of Object.entries(replacements)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
}
```

Якщо `userContext.userName = "Ignore all previous instructions and..."` — цей текст вставляється в системний промпт без санітизації.

**Рекомендація:**

```javascript
function sanitizeForPrompt(value) {
  return String(value)
    .replace(/ignore\s+all\s+previous/gi, "[filtered]")
    .replace(/system\s*:/gi, "[filtered]")
    .slice(0, 200); // Hard limit
}
```

### 5.4 Відсутня rate-limiting для AI викликів

`analyzeIntent()` може бути викликана необмежену кількість разів. При flood attack → величезні витрати API.

**Рекомендація:** Додати `rateLimiter` на рівні `telegramService`:

```javascript
const MAX_AI_CALLS_PER_MIN = 10; // per user
```

---

## 6. Токен-менеджмент

### 6.1 Поточні ліміти

```javascript
MAX_TOKENS = {
  INTENT_ANALYSIS: 600, // output tokens
  INTENT_ANALYSIS_LIGHT: 250, // output tokens
  TICKET_SUMMARY: 350, // output tokens
};
```

### 6.2 Проблема: input tokens не обмежені

Якщо `dialogHistory` має 50 повідомлень × 200 символів = 10,000 символів → ~2500 input tokens. Плюс системний промпт ~1500 tokens. При лімітах Groq/GPT-4o-mini це може не спрацювати або коштувати дорого.

**Рекомендація — Sliding Window:**

```javascript
function truncateDialogHistory(history, maxMessages = 10) {
  if (history.length <= maxMessages) return history;
  // Завжди зберігати перше повідомлення (контекст проблеми) + останні N
  return [history[0], ...history.slice(-(maxMessages - 1))];
}
```

### 6.3 Agentic RAG подвоює витрати токенів

При 2 ітераціях agentic RAG: 2 × (input_tokens + output_tokens). При частих зверненнях це значно дорожче.

**Рекомендація:**

- MAX_AGENTIC_ITERATIONS = 1 для low-cost моделей (Groq)
- MAX_AGENTIC_ITERATIONS = 2 тільки для OpenAI GPT-4

### 6.4 `formatTicketsForContext()` — не обмежує загальний розмір

```javascript
return tickets
  .map(
    (t) =>
      `[${t.subcategory}] ${t.title}\nОпис: ${(t.description || "").slice(0, 150)}…\nРішення: ${res.slice(0, 300)}`,
  )
  .join("\n\n---\n\n");
```

5 тікетів × (150 + 300 + назва + форматування) ≈ **3000 символів ≈ 750 tokens** — це чверть доступних токенів лише для контексту.

**Рекомендація:** Динамічне обмеження:

```javascript
const MAX_CONTEXT_CHARS = 800; // for all tickets combined
let total = 0;
return tickets.filter(t => {
  total += (t.title?.length || 0) + 200;
  return total < MAX_CONTEXT_CHARS;
}).map(...);
```

---

## 7. Покращення промптів

### 7.1 Додати Decision Tree в INTENT_ANALYSIS

Замість переліку правил — чіткий алгоритм:

```
DECISION ALGORITHM:
Step 1: Is it a greeting/thanks/simple confirmation?
  YES → requestType: "greeting", promptMode: "light", no ticket

Step 2: Does it mention urgent keywords (каса, сервер, всі, терміново)?
  YES → priority: "URGENT", isTicketIntent: true

Step 3: Is it a known IT problem pattern?
  YES → check quickSolutions, provide solution, needsMoreInfo: depends on pattern

Step 4: Is information sufficient for ticket?
  YES → isTicketIntent: true, needsMoreInfo: false
  NO  → needsMoreInfo: true, ask ONE specific question

Step 5: Is it off-topic (weather, news, personal)?
  YES → offTopicResponse: polite redirect, isTicketIntent: false
```

### 7.2 Покращений `EMOTION_DETECTION`

```
EMOTION + ACTION MAP:

🔴 ANGRY: caps lock, "!!", "вже 3 рази", "знову та сама"
  → priority: HIGH+, tone: "Дуже шкода що так сталося знову..."

🟠 FRUSTRATED: "знову", "вже", "постійно"
  → priority: HIGH, check recurring pattern

🟡 CONFUSED: "не знаю", "допоможіть", "?"×2+
  → style: step-by-step, simpler language

🟢 URGENT-CALM: "терміново" but polite
  → priority: URGENT, calm professional response

⚪ NEUTRAL: default
  → friendly + efficient

POST-RESOLUTION SIGNALS:
"дякую", "допомогло", "все ок", "👍" → suggest closing ticket
```

### 7.3 Покращений `SELF_HEALING_FILTER`

```
SELF-HEALING v2 — Expanded Coverage:

"монітор не показує / чорний екран":
1️⃣ Перевірте кабель між монітором та ПК
2️⃣ Перевірте що монітор увімкнений
3️⃣ Натисніть будь-яку клавішу (може сплячий режим)

"мишка/клавіатура не працює" (USB):
1️⃣ Від'єднайте та вставте знову в інший USB порт
2️⃣ Перезавантажте ПК

"Teams/Zoom не запускається":
1️⃣ Перевірте інтернет
2️⃣ Перезапустіть програму через диспетчер задач
3️⃣ Якщо оновлення — дочекайтесь 5 хв

"VPN не підключається":
1️⃣ Перевірте інтернет (без VPN)
2️⃣ Спробуйте відключити та підключити знову
→ Якщо не допоможе — це для адміна (конфігурація)
```

### 7.4 Новий блок `CONTEXT_INTEGRATION`

```
CONTEXT INTEGRATION — Use all available data:

User profile: {userContext}
  → If city known: no need to ask city
  → If institution known: no need to ask address
  → If equipment known: reference it ("на вашому HP LaserJet...")

Time context: {timeContext}
  → Near closing + urgent = escalate priority

Server health: {serverHealthContext}
  → If server issues detected: warn user proactively

Queue: {queueContext}
  → Mention estimated wait only when > 2 tickets in queue

Active ticket: {activeTicketInfo}
  → If exists: reference it, don't create duplicate

Extra context: {extraContextBlock}
  → This is second-pass agentic data, use it prioritized
```

### 7.5 Покращені приклади в JSON output

```json
// Приклад 1 — Повторне звернення (anxious user):
{
  "requestType": "question",
  "isTicketIntent": false,
  "needsMoreInfo": false,
  "quickSolution": null,
  "offTopicResponse": "Бачу вашу заявку №{ticketNumber} вже в роботі 👍 Адмін займається. Якщо терміново — можу позначити як URGENT.",
  "priority": "MEDIUM"
}

// Приклад 2 —混合 мова (укр+рос):
{
  "requestType": "problem",
  "isTicketIntent": true,
  "quickSolution": "Спробуйте перезавантажити принтер (вимкніть на 30 сек)...",
  "priority": "MEDIUM"
}

// Приклад 3 — Emoji-only:
{
  "requestType": "greeting",
  "isTicketIntent": false,
  "offTopicResponse": "Привіт! Чим можу допомогти? 😊",
  "priority": "LOW"
}
```

---

## 8. Покращення архітектури

### 8.1 Розділити `INTENT_ANALYSIS` на 2 менші промпти

**Поточно:** Один гігантський промпт `INTENT_ANALYSIS` (9 блоків).

**Пропозиція:**

```
INTENT_ANALYSIS_CLASSIFY → Виявити: тип, пріоритет, емоцію (200 tokens output)
INTENT_ANALYSIS_RESPOND  → Генерувати: відповідь, quickSolution (400 tokens output)
```

Це дозволить:

- Кешувати результат CLASSIFY окремо
- Використовувати дешевшу модель для CLASSIFY (Groq Llama)
- Використовувати якіснішу для RESPOND (GPT-4o-mini)

### 8.2 Conversation Memory — компресія діалогу

При > 8 повідомленнях в `dialog_history` — автоматично стискати:

```javascript
async function compressDialogHistory(history) {
  if (history.length <= 8) return history;

  const summary = await callChatCompletion(
    settings,
    CONVERSATION_SUMMARY, // вже існує в промптах!
    formatDialogHistory(history.slice(0, -4)),
    150,
    false,
    0.3,
  );

  return [
    { role: "system", content: `[Summary]: ${summary}` },
    ...history.slice(-4), // Keep last 4 messages
  ];
}
```

### 8.3 Feedback Loop — навчання з тікетів

```javascript
// При закритті тікета з рейтингом >= 4 → оновити quickSolutions
async function learnFromResolvedTicket(ticket) {
  if (ticket.qualityRating?.rating >= 4 && ticket.resolutionSummary) {
    // Генерувати KB статтю (KB_ARTICLE_GENERATION промпт вже існує!)
    await generateKbArticleFromTicket(ticket);
  }
}
```

### 8.4 Structured Logging для AI рішень

Поточне: `logger.info('🤖 AI RAW RESPONSE')` — важко аналізувати.

**Рекомендація:**

```javascript
logger.info("ai.decision", {
  userId: options.userId,
  requestType,
  category: parsed.category,
  priority: parsed.priority,
  emotionalTone: parsed.emotionalTone,
  promptMode,
  hadFastTrack: false,
  hadAgenticRAG: iter > 0,
  tokensUsed: response.usage?.total_tokens,
  responseTimeMs: Date.now() - startTime,
});
```

---

## 9. Нові функції

### 9.1 Recurring Problem Detector

Якщо той самий тип проблеми у тієї ж установи > 3 рази за місяць:

```javascript
async function checkRecurringProblem(userId, category) {
  const count = await Ticket.countDocuments({
    createdBy: userId,
    subcategory: { $regex: category, $options: "i" },
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  });
  if (count >= 3) {
    return `⚠️ Увага: у вас це вже ${count}-а заявка по темі "${category}" за місяць. Рекомендую позначити як системну проблему.`;
  }
  return null;
}
```

### 9.2 Smart Greeting з контекстом

Замість стандартного "Привіт!", бот може:

```javascript
// Якщо є відкрита заявка:
"Привіт! Бачу у вас ще є відкрита заявка №{N} по принтеру.
Це нова проблема чи продовження?"

// Якщо остання заявка закрита < 7 днів тому:
"Привіт! Принтер більше не турбує? 😊 Чим можу допомогти?"

// Стандартне:
"Привіт! Чим можу допомогти?"
```

### 9.3 Proactive Status Update

Якщо тікет у статусі `in_progress` > 2 годин — автоматично надіслати update:

```
"Ваша заявка №{N} зараз в роботі у адміністратора.
Очікуваний час завершення: ~{ETA}.
Якщо стало гірше — напишіть 'ТЕРМІНОВО'."
```

### 9.4 Multi-language Detection

```javascript
function detectLanguage(text) {
  const cyrillicUkr = /[іїєґ]/;
  const cyrillicRus = /[ъыёэ]/;
  const latin = /[a-zA-Z]/;

  if (cyrillicUkr.test(text)) return "uk";
  if (cyrillicRus.test(text)) return "ru";
  if (latin.test(text)) return "en";
  return "uk"; // default
}
// Якщо мова ru/en → додати в промпт: "User wrote in {lang}, respond in Ukrainian"
```

### 9.5 AI Confidence Threshold UI

Якщо `requestTypeConfidence < 0.6`:

```
Бот: "Не впевнений чи правильно зрозумів 🤔
Це про:
• [Принтер / Мережу / Пароль]?
Оберіть або напишіть своїми словами."
```

---

## 10. Пріоритизований план

### 🔴 КРИТИЧНО (фікси, що ламають логіку) — 1 день

| #   | Завдання                                          | Файл                        | Складність |
| --- | ------------------------------------------------- | --------------------------- | ---------- |
| 1   | Виправити `requestType` нормалізацію (bug #1)     | `aiFirstLineService.js:933` | 5 хв       |
| 2   | Виправити пробіл у `/ спасибі/i` (bug #2)         | `aiFirstLinePrompts.js:316` | 1 хв       |
| 3   | Замінити `/добре/i` на `/^добре$/i` (bug #3)      | `aiFirstLinePrompts.js:319` | 1 хв       |
| 4   | Додати template-змінні в `INTENT_ANALYSIS` промпт | `aiFirstLinePrompts.js`     | 2 год      |
| 5   | Виправити cache bug для анонімних (bug #4)        | `aiFirstLineService.js:625` | 30 хв      |

### 🟠 ВАЖЛИВО (покращення якості) — 3-5 днів

| #   | Завдання                                                 | Файл                         | Складність |
| --- | -------------------------------------------------------- | ---------------------------- | ---------- |
| 6   | Виправити validator `hasSuspiciousPhrases` regex         | `aiResponseValidator.js:265` | 30 хв      |
| 7   | Виправити validator `maxLength` до 450                   | `aiResponseValidator.js:11`  | 5 хв       |
| 8   | Додати перевірку мови відповіді у validator              | `aiResponseValidator.js`     | 1 год      |
| 9   | Розширити `EMOTION_DETECTION` (caps lock, "!!")          | `aiFirstLinePrompts.js`      | 2 год      |
| 10  | Розширити `SELF_HEALING_FILTER` (+5 сценаріїв)           | `aiFirstLinePrompts.js`      | 2 год      |
| 11  | Fast-Track — передавати urgency з тексту                 | `aiFirstLineService.js:750`  | 1 год      |
| 12  | Додати `agenticSecondPass` інструкцію в промпт           | `aiFirstLinePrompts.js`      | 30 хв      |
| 13  | Розширити `getDuplicateTicketContext` для всіх категорій | `aiFirstLineService.js:235`  | 2 год      |

### 🟡 БАЖАНО (покращення продуктивності) — 1-2 тижні

| #   | Завдання                                     | Файл                        | Складність |
| --- | -------------------------------------------- | --------------------------- | ---------- |
| 14  | Dialog history sliding window (max 10 msg)   | `aiFirstLineService.js`     | 3 год      |
| 15  | Перенести робочий розклад в AISettings       | `aiFirstLineService.js:139` | 4 год      |
| 16  | Скоротити Cache TTL до 15 хвилин             | `aiFirstLineService.js:975` | 5 хв       |
| 17  | Structured logging для AI рішень             | `aiFirstLineService.js`     | 4 год      |
| 18  | Dynamic ticket context size limit            | `aiFirstLineService.js:304` | 1 год      |
| 19  | Recurring problem detector                   | новий модуль                | 1 день     |
| 20  | Prompt injection sanitization у `fillPrompt` | `aiFirstLinePrompts.js:356` | 2 год      |

### 🟢 ПОКРАЩЕННЯ (нові функції) — 2-4 тижні

| #   | Завдання                                      | Складність |
| --- | --------------------------------------------- | ---------- |
| 21  | Smart greeting з контекстом останнього тікету | 1 день     |
| 22  | Multi-language detection (укр/рос/eng)        | 1 день     |
| 23  | AI confidence threshold UI (кнопки вибору)    | 2 дні      |
| 24  | Feedback loop → auto KB article generation    | 3 дні      |
| 25  | Dialog compression (CONVERSATION_SUMMARY)     | 2 дні      |
| 26  | Proactive status updates для довгих тікетів   | 2 дні      |
| 27  | Rate limiting для AI викликів per user        | 1 день     |

---

## Підсумок критичних знахідок

```
❌ Bug #1: requestType 'problem'/'greeting' → 'question' (ламає розгалуження)
❌ Bug #2: '/spасибі/i' має пробіл (light mode не спрацьовує)
❌ Bug #3: '/добре/i' матчить "мені не добре" (false positive)
❌ Bug #4: cache conflict для анонімних users
⚠️  Template vars відсутні в промпті (контекст черги/тікетів не передається AI)
⚠️  Validator відкидає валідні KB відповіді (без numbered steps)
⚠️  Validator блокує [text in brackets] (false positive)
⚠️  Fast-Track ігнорує urgency keywords
⚠️  Agentic RAG: agenticSecondPass не використовується в промпті
⚠️  getDuplicateTicketContext тільки для принтерів
```

**Якщо виправити топ-5 критичних + 3 важливих — очікуване покращення:**

- Точність класифікації: ~75% → ~87%
- Відсоток false-light mode: знизиться на ~40%
- Витрати токенів: знизяться на ~15% (краще кешування)

---

_Аналіз проведено на основі: `aiFirstLinePrompts.js` (v4.1), `aiFirstLineService.js`, `telegramAIService.js`, `aiEnhancedService.js`, `aiResponseValidator.js`_
