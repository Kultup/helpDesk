# План логіки бота: класифікація запиту та семантичний пошук по базі знань

Покроковий checklist для реалізації.

---

## Частина A. Класифікація: питання vs звернення

### A.1 Підготовка

- [x] Визначити місце в потоці: після спеціальних запитів (погода, курс, команди), перед пошуком по KB у `analyzeIntent`
- [x] Вирішити варіант: розширити INTENT_ANALYSIS (Варіант 1) чи окремий промпт класифікації (Варіант 2)

### A.2 Реалізація класифікації

- [x] Додати в промпт INTENT_ANALYSIS (або створити окремий промпт) поле `requestType: "question" | "appeal"`
- [x] Додати в JSON-схему відповіді поле `requestType` та опційно `confidence` і коротке обґрунтування
- [x] У `analyzeIntent` (aiFirstLineService.js) повертати поле `requestType`
- [x] У `handleMessageInAiMode` (telegramAIService.js) використовувати `requestType` для вибору: спочатку KB (question) чи одразу збір даних для заявки (appeal)

### A.3 Правила після класифікації

- [x] **question:** пріоритет — семантичний пошук по KB; при високій релевантності — стаття; при середній — "Можливо, ви мали на увазі: …"; при низькій — LLM або запрошення заявки (пріоритет KB і кнопка «Створити тікет» вже в потоці; середня/низька релевантність — у частині B)
- [x] **appeal:** основний потік — збір деталей і створення заявки; опційно — семантичний пошук по KB як підказки (додано підказку 1 статті з KB після першого питання збору)

---

## Частина B. Семантичний пошук по базі знань

### B.1 Підготовка стеку

- [x] Підтвердити використання OpenAI Embeddings (`text-embedding-3-small`) — OpenAI вже в проєкті
- [x] Визначити векторне сховище: MongoDB з полем `embedding` + косинусна схожість у Node.js (без Atlas Vector Search)

### B.2 Модель даних

- [x] У моделі KnowledgeBase (backend/models/KnowledgeBase.js) додати поле `embedding: [Number]` (select: false)
- [x] Окрема колекція не створювалася — вектор у тому ж документі

### B.3 Новий сервіс embeddings

- [x] Створити сервіс `backend/services/kbEmbeddingService.js`
- [x] Реалізувати `getEmbedding(text)` — виклик OpenAI embeddings (text-embedding-3-small)
- [x] Реалізувати `indexArticle(article)` — текст → вектор → збереження в документі
- [x] Реалізувати `findSimilarArticles(query, options)` — вектор запиту, косинусна схожість, повернути `{ article, score }[]`

### B.4 Індексація бази знань

- [x] Текст для індексації: `getIndexableText(article)` — title + content + tags, обріз до 8000 символів
- [x] Скрипт первинної індексації: `backend/scripts/indexKbEmbeddings.js`, запуск: `npm run kb:index` (у backend)
- [x] Після запуску скрипта поля `embedding` заповнюються для опублікованих статей
- [x] Atlas Vector Search не використовується — косинусна схожість у Node.js

### B.5 Векторний пошук

- [x] Пошук: завантаження статей з `embedding` + косинусна схожість у Node.js (kbEmbeddingService)
- [x] Пороги score у kbEmbeddingService: high 0.78, medium 0.5 (getScoreThresholds())
- [x] У kbSearchService.findBestMatchForBot спочатку семантичний пошук; якщо score >= high — повернути статтю
- [x] Інакше fallback на $text + regex + пошук за словами

### B.6 Тригери реіндексації

- [x] При створенні статті (POST /articles) викликати kbEmbeddingService.indexArticle після save
- [x] При оновленні статті (PUT /articles/:id) викликати реіндексацію після save
- [x] При публікації статті вектор оновлюється через PUT (реіндексація при будь-якому оновленні)

---

## Частина C. Інтеграція в analyzeIntent і бот

### C.1 Блок KNOWLEDGE BASE SEARCH

- [x] У aiFirstLineService.js у блоці KNOWLEDGE BASE SEARCH викликати семантичний пошук (findSimilarArticles)
- [x] Для `question` — пріоритет семантичному пошуку; для `appeal` — підказки з KB у \_sendKbHintForAppeal
- [x] При високому score (>= 0.78) — повертати одну статтю (`kbArticle`)
- [x] При середньому score (>= 0.5) — повертати `kbArticleCandidates` (до 3); бот показує "Можливо, ви мали на увазі:" з кнопками
- [x] При низькому score — fallback на findBestMatchForBotTextOnly ($text + regex + слова), далі LLM/Fast-Track
- [x] При помилці embeddings у try/catch викликається findBestMatchForBot (повний fallback)

### C.2 Telegram-бот

- [x] У \_sendKbHintForAppeal для типу appeal: findSimilarArticles(topK: 2), score >= medium — показати 1–2 статті як підказки; інакше findBestMatchForBotTextOnly для однієї підказки
- [x] Обробка kbArticleCandidates: повідомлення "Можливо, ви мали на увазі…" + inline-кнопки (callback*data: kb_article*:id)
- [x] handleKbArticleCallback(chatId, articleId, user) — за callback відправляє статтю в чат (текст + вкладення + кнопки)

---

## Частина D. Тестування

- [ ] **Питання + помилки:** запит з опечаткою (наприклад "ринтер") → знаходиться стаття про принтер
- [ ] **Питання + синоніми:** "ноутбук" / "комп'ютер" → релевантні статті
- [ ] **Звернення:** створення заявки без плутанини з відповіддю з KB
- [ ] **Fallback:** при вимкненому embeddings або порожній векторній базі працює $text + regex
- [ ] **Пороги:** перевірити поведінку при високому / середньому / низькому score

---

## Порядок кроків (флоу)

```
Текстове повідомлення
    → Класифікація (питання / звернення)
    → [question або невизначено] Семантичний пошук по KB (TOP-K)
        → score високий → Відповідь зі статті
        → score середній → "Можливо, ви мали на увазі: …"
        → score низький → Fallback $text + regex, далі LLM / заявка
    → [appeal] Збір деталей / створення заявки (опційно підказки з KB)
```

Спеціальні запити (погода, курс, команди) залишаються на початку обробки.

---

## Файли для змін

| Файл                                     | Дії                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `backend/prompts/aiFirstLinePrompts.js`  | INTENT_ANALYSIS: додати requestType                                               |
| `backend/services/aiFirstLineService.js` | Класифікація, виклик семантичного пошуку, пороги score                            |
| `backend/services/telegramAIService.js`  | Використання requestType, сценарії question/appeal                                |
| `backend/services/kbSearchService.js`    | findBestMatchForBotSemantic або зміна findBestMatchForBot                         |
| `backend/services/kbEmbeddingService.js` | **Створено:** getEmbedding, indexArticle, findSimilarArticles, getScoreThresholds |
| `backend/models/KnowledgeBase.js`        | Поле embedding                                                                    |
| `backend/routes/knowledgeBase.js`        | Тригери індексації при створенні/оновленні                                        |
| `backend/scripts/indexKbEmbeddings.js`   | **Створено:** первинна індексація, `npm run kb:index` у backend                   |
