# 🔬 AI Бот — Повторний аналіз після фіксів (v2)

> **Дата:** 2026-03-04 | Базується на поточному стані коду

---

## 📊 Результати попередніх фіксів

| #      | Баг                                   | Статус        |
| ------ | ------------------------------------- | ------------- |
| Bug #1 | `requestType` нормалізація            | ✅ Виправлено |
| Bug #2 | Пробіл у `/спасибі/i`                 | ✅ Виправлено |
| Bug #3 | `/добре/i` без `^`                    | ✅ Виправлено |
| Bug #4 | Cache race condition                  | ✅ Виправлено |
| P1     | Template vars відсутні в промпті      | ✅ Виправлено |
| P2     | Validator відкидав KB відповіді       | ✅ Виправлено |
| P3     | `hasSuspiciousPhrases` false positive | ✅ Виправлено |
| P4     | Fast-Track ігнорував urgency          | ✅ Виправлено |
| P5     | Дублікати тільки для принтерів        | ✅ Виправлено |

---

## 🚨 НОВІ КРИТИЧНІ ЗНАХІДКИ

### ПРОБЛЕМА #1 — Найкритичніша: 16 промптів `undefined`

**Файл:** `services/aiFirstLineService.js:7-29`

```javascript
const {
  INTENT_ANALYSIS,
  INTENT_ANALYSIS_LIGHT, // ← undefined!
  SIMILAR_TICKETS_RELEVANCE_CHECK, // ← undefined!
  KB_ARTICLE_RELEVANCE_CHECK, // ← undefined!
  NEXT_QUESTION, // ← undefined!
  TICKET_SUMMARY, // ← undefined!
  PHOTO_ANALYSIS, // ← undefined!
  COMPUTER_ACCESS_ANALYSIS, // ← undefined!
  STATISTICS_ANALYSIS, // ← undefined!
  RATING_EMOTION, // ← undefined!
  ZABBIX_ALERT_ANALYSIS, // ← undefined!
  TICKET_UPDATE_NOTIFICATION, // ← undefined!
  CONVERSATION_SUMMARY, // ← undefined!
  AUTO_RESOLUTION_CHECK, // ← undefined!
  SLA_BREACH_DETECTION, // ← undefined!
  PROACTIVE_ISSUE_DETECTION, // ← undefined!
  KB_ARTICLE_GENERATION, // ← undefined!
} = require("../prompts/aiFirstLinePrompts");
```

**Що відбувається:**

```javascript
function fillPrompt(template, vars) {
  if (!template || typeof template !== "string") {
    return ""; // ← ПОРОЖНІЙ РЯДОК для всіх undefined
  }
}
```

Тоді: `callChatCompletion(settings, '', userMessage, ...)` — AI отримує **порожній системний промпт**.

**Наслідки для кожного промпту:**

| Промпт                            | Функція                 | Наслідок                                         |
| --------------------------------- | ----------------------- | ------------------------------------------------ |
| `INTENT_ANALYSIS_LIGHT`           | light режим             | Завжди падає в full — жодної економії токенів    |
| `NEXT_QUESTION`                   | Генерація питань        | Питання без форматних вказівок → неструктуровано |
| `TICKET_SUMMARY`                  | Підсумок тікету         | JSON без schema → невірна структура              |
| `PHOTO_ANALYSIS`                  | Аналіз фото             | Аналіз без контексту helpdesk                    |
| `SIMILAR_TICKETS_RELEVANCE_CHECK` | Перевірка релевантності | Завжди `relevant: true` (fallback)               |
| `KB_ARTICLE_RELEVANCE_CHECK`      | KB релевантність        | Rule-based fallback — менш точно                 |
| `CONVERSATION_SUMMARY`            | Стиснення діалогу       | Некерований summary                              |
| `AUTO_RESOLUTION_CHECK`           | Авто-закриття           | Неточна перевірка                                |
| `ZABBIX_ALERT_ANALYSIS`           | Zabbix алерти           | Аналіз без ІТ-контексту                          |
| `SLA_BREACH_DETECTION`            | SLA моніторинг          | Некерована детекція                              |
| `KB_ARTICLE_GENERATION`           | Генерація статей        | Статті без структури                             |
| `CONVERSATIONAL_TRANSITION`       | Перехідні фрази         | Використовує hardcoded fallback                  |

**Причина:** Рефактор v4.1 прибрав усі промпти з файлу `aiFirstLinePrompts.js` окрім `INTENT_ANALYSIS`, залишивши service.js зі старими імпортами. Файл prompts скоротився з 3000+ рядків до 477.

---

### ПРОБЛЕМА #2 — Нові template-змінні не в `fillPrompt`

**Файл:** `prompts/aiFirstLinePrompts.js:411-424` (fillPrompt) + попередній фікс

В попередньому фіксі ми додали в `INTENT_ANALYSIS` промпт змінні:

- `{activeTicketInfo}`
- `{agenticSecondPass}`
- `{extraContextBlock}`

Але `fillPrompt` їх **не знає** і не замінює:

```javascript
const replacements = {
  userContext,
  timeContext,
  dialogHistory,
  missingInfo,
  similarTickets,
  kbArticle,
  userQuery,
  articleTitle,
  articleSnippet,
  serverHealthContext,
  queueContext,
  userMessage,
  // ← activeTicketInfo НЕ МА!
  // ← agenticSecondPass НЕ МА!
  // ← extraContextBlock НЕ МА!
  // ← quickSolutions НЕ МА! (передається в service але fillPrompt не знає)
  // ← webSearchContext НЕ МА!
};
```

**Результат:** У фінальний промпт потрапляє буквально:

```
Active ticket for this user: {activeTicketInfo}
Extra context (agentic pass {agenticSecondPass}): {extraContextBlock}
```

AI бачить нерозкриті placeholders і ігнорує або плутається.

---

### ПРОБЛЕМА #3 — MAX_TOKENS і TEMPERATURES неповні

`aiFirstLineService.js` звертається до:

- `MAX_TOKENS.NEXT_QUESTION` → `undefined` → `|| default` → 350
- `MAX_TOKENS.PHOTO_ANALYSIS` → `undefined` → `|| 400`
- `MAX_TOKENS.CONVERSATION_SUMMARY` → `undefined` → жодного default → **`undefined`**
- `TEMPERATURES.CONVERSATIONAL_TRANSITION` → `undefined` → fallback 0.3
- `TEMPERATURES.ZABBIX_ALERT_ANALYSIS` → `undefined` → fallback 0.3

Деякі функції не мають `|| default`:

```javascript
// aiFirstLineService.js:1994
(MAX_TOKENS.CONVERSATION_SUMMARY, // undefined — передається як undefined
  TEMPERATURES.CONVERSATION_SUMMARY); // undefined — передається як undefined
```

→ `callChatCompletion(..., undefined, undefined)` → `max_tokens: undefined || 350` (рятує fallback в callChatCompletion). Але поведінка непередбачувана.

---

### ПРОБЛЕМА #4 — `CONVERSATIONAL_TRANSITION` — динамічний імпорт

**Файл:** `aiFirstLineService.js:1598`

```javascript
// Усередині функції (не у верхньому імпорті):
const {
  CONVERSATIONAL_TRANSITION,
  TEMPERATURES,
} = require("../prompts/aiFirstLinePrompts");
```

`CONVERSATIONAL_TRANSITION` → `undefined`. `TEMPERATURES` → повторно імпортується але вже є в scope. Промпт порожній → hardcoded fallback responses завжди спрацьовують.

---

### ПРОБЛЕМА #5 — `COMPUTER_ACCESS_ANALYSIS` — неімпортований але використовується

```javascript
// imports (рядок 15):
COMPUTER_ACCESS_ANALYSIS,  // undefined
```

Grep показує що ця змінна існує в imports але **немає жодного `fillPrompt(COMPUTER_ACCESS_ANALYSIS, ...)`** у файлі. Мертвий імпорт.

---

## 📋 Повний список: що відсутнє в `aiFirstLinePrompts.js`

### Відсутні промпти (потрібно додати + експортувати)

| Константа                         | Де використовується                             | Критичність |
| --------------------------------- | ----------------------------------------------- | ----------- |
| `INTENT_ANALYSIS_LIGHT`           | `analyzeIntent()` — light mode                  | 🔴 Критично |
| `NEXT_QUESTION`                   | `generateNextQuestion()` — щоразу при уточненні | 🔴 Критично |
| `TICKET_SUMMARY`                  | `getTicketSummary()` — при кожному тікеті       | 🔴 Критично |
| `SIMILAR_TICKETS_RELEVANCE_CHECK` | self-correction                                 | 🟠 Важливо  |
| `KB_ARTICLE_RELEVANCE_CHECK`      | KB search relevance                             | 🟠 Важливо  |
| `PHOTO_ANALYSIS`                  | аналіз фото помилок                             | 🟠 Важливо  |
| `CONVERSATION_SUMMARY`            | стиснення довгих діалогів                       | 🟠 Важливо  |
| `AUTO_RESOLUTION_CHECK`           | автозакриття тікетів                            | 🟡 Бажано   |
| `CONVERSATIONAL_TRANSITION`       | фрази переходу                                  | 🟡 Бажано   |
| `RATING_EMOTION`                  | аналіз оцінки тікету                            | 🟡 Бажано   |
| `STATISTICS_ANALYSIS`             | аналітика                                       | 🟡 Бажано   |
| `ZABBIX_ALERT_ANALYSIS`           | Zabbix інтеграція                               | 🟡 Бажано   |
| `TICKET_UPDATE_NOTIFICATION`      | сповіщення                                      | 🟡 Бажано   |
| `SLA_BREACH_DETECTION`            | SLA моніторинг                                  | 🟡 Бажано   |
| `PROACTIVE_ISSUE_DETECTION`       | проактивне виявлення                            | 🟡 Бажано   |
| `KB_ARTICLE_GENERATION`           | генерація статей                                | 🟡 Бажано   |

### Відсутні ключі в `fillPrompt` (потрібно додати)

| Ключ                     | Де передається                     | Де використовується в промпті |
| ------------------------ | ---------------------------------- | ----------------------------- |
| `activeTicketInfo`       | `analyzeIntent()`                  | `INTENT_ANALYSIS` (новий)     |
| `agenticSecondPass`      | `analyzeIntent()`                  | `INTENT_ANALYSIS` (новий)     |
| `extraContextBlock`      | `analyzeIntent()`                  | `INTENT_ANALYSIS` (новий)     |
| `quickSolutions`         | `analyzeIntent()`                  | (не в поточному промпті)      |
| `webSearchContext`       | `analyzeIntent()`                  | (не в поточному промпті)      |
| `transitionType`         | `generateConversationalResponse()` | `CONVERSATIONAL_TRANSITION`   |
| `emotionalTone`          | `generateConversationalResponse()` | `CONVERSATIONAL_TRANSITION`   |
| `queueCount`             | `generateConversationalResponse()` | `CONVERSATIONAL_TRANSITION`   |
| `queueMinutes`           | `generateConversationalResponse()` | `CONVERSATIONAL_TRANSITION`   |
| `priority`               | `getTicketSummary()`               | `TICKET_SUMMARY`              |
| `category`               | `getTicketSummary()`               | `TICKET_SUMMARY`              |
| `recognized_access_info` | `getTicketSummary()`               | `TICKET_SUMMARY`              |
| `problemDescription`     | `analyzePhoto()`                   | `PHOTO_ANALYSIS`              |

### Відсутні ключі в `MAX_TOKENS`

```javascript
// Потрібно додати:
NEXT_QUESTION: 150,
PHOTO_ANALYSIS: 400,
COMPUTER_ACCESS_ANALYSIS: 150,
SIMILAR_TICKETS_RELEVANCE_CHECK: 80,
KB_ARTICLE_RELEVANCE_CHECK: 60,
RATING_EMOTION: 80,
STATISTICS_ANALYSIS: 1500,
ZABBIX_ALERT_ANALYSIS: 600,
TICKET_UPDATE_NOTIFICATION: 200,
CONVERSATION_SUMMARY: 300,
AUTO_RESOLUTION_CHECK: 150,
CONVERSATIONAL_TRANSITION: 100,
SLA_BREACH_DETECTION: 600,
PROACTIVE_ISSUE_DETECTION: 600,
KB_ARTICLE_GENERATION: 1000,
```

### Відсутні ключі в `TEMPERATURES`

```javascript
// Потрібно додати:
NEXT_QUESTION: 0.6,
TICKET_SUMMARY: 0.3,
PHOTO_ANALYSIS: 0.4,
SIMILAR_TICKETS_RELEVANCE_CHECK: 0.2,
KB_ARTICLE_RELEVANCE_CHECK: 0.2,
RATING_EMOTION: 0.9,
STATISTICS_ANALYSIS: 0.3,
ZABBIX_ALERT_ANALYSIS: 0.3,
TICKET_UPDATE_NOTIFICATION: 0.5,
CONVERSATION_SUMMARY: 0.3,
AUTO_RESOLUTION_CHECK: 0.2,
CONVERSATIONAL_TRANSITION: 0.7,
SLA_BREACH_DETECTION: 0.3,
PROACTIVE_ISSUE_DETECTION: 0.4,
KB_ARTICLE_GENERATION: 0.5,
```

---

## 🎯 Пріоритетний план виправлень

### 🔴 КРОК 1 — Виправити `fillPrompt` (5 хвилин)

Додати відсутні ключі в `replacements` map:

```javascript
const replacements = {
  // існуючі
  userContext,
  timeContext,
  dialogHistory,
  missingInfo,
  similarTickets,
  kbArticle,
  userQuery,
  articleTitle,
  articleSnippet,
  serverHealthContext,
  queueContext,
  userMessage,
  // нові (для INTENT_ANALYSIS):
  activeTicketInfo: vars.activeTicketInfo ?? "(немає)",
  agenticSecondPass: vars.agenticSecondPass ?? "false",
  extraContextBlock: vars.extraContextBlock ?? "",
  quickSolutions: vars.quickSolutions ?? "",
  webSearchContext: vars.webSearchContext ?? "",
  // для інших промптів:
  transitionType: vars.transitionType ?? "",
  emotionalTone: vars.emotionalTone ?? "neutral",
  queueCount: vars.queueCount ?? "2",
  queueMinutes: vars.queueMinutes ?? "40",
  priority: vars.priority ?? "medium",
  category: vars.category ?? "Other",
  recognized_access_info: vars.recognized_access_info ?? "",
  problemDescription: vars.problemDescription ?? "",
};
```

### 🔴 КРОК 2 — Додати 3 найкритичніші промпти (1-2 години)

**`INTENT_ANALYSIS_LIGHT`** — light класифікація (гітки, прості ок/дякую):

```javascript
const INTENT_ANALYSIS_LIGHT = `You are a helpdesk bot. Classify this simple message quickly.

TASK: Determine if this is a simple greeting/confirmation OR an IT problem.

RULES:
- Greetings: "привіт", "дякую", "ок", "добре", "зрозуміло" → requestType: "greeting"
- IT problem hint: contains tech keywords → needsFullAnalysis: true

OUTPUT (JSON only):
{
  "requestType": "greeting|question",
  "requestTypeConfidence": 0.0-1.0,
  "isTicketIntent": false,
  "needsMoreInfo": false,
  "priority": "low",
  "emotionalTone": "neutral",
  "quickSolution": null,
  "offTopicResponse": "Привіт! Чим можу допомогти?",
  "needsFullAnalysis": false
}

Context:
User: {userContext}
Time: {timeContext}
Dialog: {dialogHistory}
Server: {serverHealthContext}
`;
```

**`NEXT_QUESTION`** — уточнюючи питання:

```javascript
const NEXT_QUESTION = `You are a helpdesk support person. Ask ONE short clarifying question in Ukrainian.

RULES:
- Ask only ONE question (the most important missing piece)
- Keep it under 100 characters
- Be natural: "Яка модель принтера?" not "Будь ласка, вкажіть модель"
- Don't repeat what user already said
- Missing info: {missingInfo}
- User profile: {userContext}
`;
```

**`TICKET_SUMMARY`** — підсумок тікету:

```javascript
const TICKET_SUMMARY = `You are a helpdesk assistant. Create a support ticket from this dialog.

Context: {userContext}
Priority hint: {priority}
Category hint: {category}
Similar tickets for reference: {similarTickets}

OUTPUT (JSON only):
{
  "title": "Short title (max 80 chars)",
  "description": "Full problem description in Ukrainian (100-500 chars)",
  "category": "Hardware|Software|Network|Access|Printing|Other",
  "priority": "low|medium|high|urgent"
}

RULES:
- title: specific, action-oriented ("Принтер HP не друкує в офісі 3")
- description: who, what, when, impact
- All text in Ukrainian
`;
```

### 🔴 КРОК 3 — Доповнити MAX_TOKENS і TEMPERATURES (15 хвилин)

Додати всі відсутні ключі у відповідні об'єкти в `module.exports`.

### 🟠 КРОК 4 — Додати решту промптів (3-4 години)

Пріоритет за частотою використання:

1. `SIMILAR_TICKETS_RELEVANCE_CHECK` — кожен full-mode запит
2. `CONVERSATION_SUMMARY` — довгі діалоги
3. `PHOTO_ANALYSIS` — є фото
4. `AUTO_RESOLUTION_CHECK` — після кожної відповіді
5. `CONVERSATIONAL_TRANSITION` — при кожному закритті сесії
6. Решта

---

## 📌 Інші актуальні проблеми

### P1 — `selectIntentPrompt` не перевіряє довгі повідомлення

```javascript
// Поточно: перевіряє тільки якщо isFirstMessage || userMessages.length <= 1
if (isFirstMessage || userMessages.length <= 1) {
  for (const pattern of simplePatterns) {
    if (pattern.test(lastMessage)) {
      return "light";
    }
  }
}
```

Після першого повідомлення "дякую" на 2-му кроці ніколи не буде light mode. Але якщо userMessages.length = 5 і юзер пише "ок", він все одно іде в full. Це коштує зайвих токенів.

**Рекомендація:** Прибрати перевірку на `isFirstMessage` для simplePatterns — вони безпечні в будь-якому місці діалогу.

### P2 — `aitraining.md` — файл в корені проекту

```bash
ls /d/helpDesk/aitraining.md
```

Файл існує. Якщо він містить реальні дані (паролі, API ключі, приватна інформація) — потрібна перевірка чи він не доступний через веб-сервер.

### P3 — `CONVERSATIONAL_TRANSITION` — подвійний імпорт

```javascript
// Рядок 7 (верхній імпорт) — через destructuring → undefined
// Рядок 1598 (всередині функції) — динамічний reimport → теж undefined
const { CONVERSATIONAL_TRANSITION } = require("../prompts/aiFirstLinePrompts");
```

Обидва шляхи дають `undefined`. Функція завжди повертає hardcoded fallback.

---

## ✅ Підсумкова таблиця проблем

| Проблема                                                 | Критичність | Файл                           | Дія                   |
| -------------------------------------------------------- | ----------- | ------------------------------ | --------------------- |
| 16 промптів `undefined`                                  | 🔴 Критично | prompts/aiFirstLinePrompts.js  | Додати промпти        |
| `fillPrompt` не знає нових змінних                       | 🔴 Критично | prompts/aiFirstLinePrompts.js  | Додати в replacements |
| `MAX_TOKENS` неповний                                    | 🟠 Важливо  | prompts/aiFirstLinePrompts.js  | Додати ключі          |
| `TEMPERATURES` неповний                                  | 🟠 Важливо  | prompts/aiFirstLinePrompts.js  | Додати ключі          |
| `selectIntentPrompt` обмежено (тільки 1-ше повідомлення) | 🟡 Бажано   | prompts/aiFirstLinePrompts.js  | Прибрати умову        |
| `CONVERSATIONAL_TRANSITION` подвійний undefined import   | 🟡 Бажано   | services/aiFirstLineService.js | Виправити             |

**Всі проблеми зосереджені в одному файлі:** `prompts/aiFirstLinePrompts.js` — він занадто мало експортує порівняно з тим що від нього очікує service.
