# 🤖 План покращення AI бота

**HelpDesk System** | Версія: 1.0 | Останнє оновлення: 2026-03-04

---

## 📋 Зміст

1. [Огляд та цілі](#огляд-та-цілі)
2. [Етап 1: Швидкі покращення (1-2 дні)](#етап-1-швидкі-покращення-1-2-дні)
3. [Етап 2: Середньострокові покращення (1-2 тижні)](#етап-2-середньострокові-покращення-1-2-тижні)
4. [Етап 3: Довгострокові покращення (2-4 тижні)](#етап-3-довгострокові-покращення-2-4-тижні)
5. [Моніторинг та метрики](#моніторинг-та-метрики)
6. [Тестування та валідація](#тестування-та-валідація)

---

## 🎯 Огляд та цілі

### Поточний стан

- ✅ AI бот інтегрований з Telegram
- ✅ Базова класифікація намірів (intent analysis)
- ✅ Інтеграція з Groq/OpenAI
- ✅ Knowledge Base з семантичним пошуком
- ✅ Автоматичне створення тікетів

### Проблеми для вирішення

- ❌ Високі витрати токенів (великі промти)
- ❌ Недостатньо українського контексту
- ❌ Відсутність довгострокової пам'яті
- ❌ Обмежений збір фідбеку
- ❌ Відсутність метрик якості

### Цілі покращення

| Метрика                    | Поточне | Ціль   | Термін    |
| -------------------------- | ------- | ------ | --------- |
| Точність класифікації      | ~75%    | 90%+   | 2 тижні   |
| Середній час відповіді     | 2-3 сек | <1 сек | 1 тиждень |
| Витрати токенів            | Високі  | -40%   | 1 тиждень |
| Задоволеність користувачів | N/A     | 4.5/5  | 4 тижні   |
| % автоматичних відповідей  | ~60%    | 80%+   | 4 тижні   |

---

## 🚀 Етап 1: Швидкі покращення (1-2 дні)

### 1.1 Оптимізація промтів

#### 📁 Файли для змін:

- `backend/prompts/aiFirstLinePrompts.js`
- `backend/services/aiFirstLineService.js`

#### ✅ Крок 1: Додати українські приклади відповідей

**Файл:** `backend/prompts/aiFirstLinePrompts.js`

**Де додати:** Після `COMMUNICATION_STYLE` (рядок ~56)

```javascript
// ——— 🇺🇦 UKRAINIAN LANGUAGE EXAMPLES ———
const UKRAINIAN_LANGUAGE_EXAMPLES = `
📝 ПРИКЛАДИ ПРАВИЛЬНИХ ВІДПОВІДЕЙ (українською):

✅ ДОБРЕ (природно, по-людськи):
- "Привіт! Чим можу допомогти?"
- "Розумію, зараз розберемося з цим 👇"
- "Таке буває, давайте спробуємо..."
- "О, це до адміна. Зараз створю заявку"
- "Спробуйте перезавантажити. Якщо не допоможе — напишіть"
- "Готуйте AnyDesk — передаю заявку адміну"

❌ ПОГАНО (канцеляризми, кальки):
- "Дякуємо за звернення" → "Привіт! Слухаю"
- "Будь ласка, виконайте наступні дії" → "Спробуйте так:"
- "Ваше питання важливе для нас" → (не писати)
- "Рекомендується здійснити перезавантаження" → "Перезавантажте"
- "Просимо Вас надати інформацію" → "Підкажіть, будь ласка"
`;
```

#### ✅ Крок 2: Додати детектор емоцій

**Файл:** `backend/prompts/aiFirstLinePrompts.js`

**Де додати:** Після `UKRAINIAN_LANGUAGE_EXAMPLES`

```javascript
// ——— 😊 EMOTION DETECTION ———
const EMOTION_DETECTION = `
🧠 ВИЗНАЧЕННЯ ЕМОЦІЙНОГО СТАНУ КОРИСТУВАЧА:

🔴 ANGRY (злий/терміново):
Тригери: "терміново", "як довго", "скільки можна", "жах", "катастрофа"
Дії:
- Пріоритет: urgent
- Стиль: емпатичний + швидке рішення

🟠 FRUSTRATED (розчарований/повторна проблема):
Тригери: "знову", "вже", "третій раз", "не можу", "дістало"
Дії:
- Пріоритет: high
- Стиль: підтримуючий + ескалація

🟡 CONFUSED (загублений):
Тригери: "не знаю", "як", "що робити", "допоможіть"
Дії:
- Стиль: навчальний + покроковий

🟢 NEUTRAL (спокійний):
Дії:
- Стиль: дружній + ефективний
`;
```

#### ✅ Крок 3: Зменшити розмір промтів

**Файл:** `backend/prompts/aiFirstLinePrompts.js`

**Знайти:** `MAX_TOKENS` об'єкт (рядок ~3034)

**Замінити:**

```javascript
const MAX_TOKENS = {
  INTENT_ANALYSIS: 600, // Було: 800 (-25%)
  INTENT_ANALYSIS_LIGHT: 250, // Було: 300 (-17%)
  SIMILAR_TICKETS_RELEVANCE_CHECK: 60, // Було: 80 (-25%)
  KB_ARTICLE_RELEVANCE_CHECK: 50, // Було: 60 (-17%)
  TICKET_SUMMARY: 350, // Було: 400 (-12%)
};
```

---

### 1.2 Додати кешування відповідей

#### 📁 Створити новий файл:

**Файл:** `backend/services/aiResponseCache.js`

```javascript
const logger = require("../utils/logger");
const { dataPath } = require("../config/paths");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CACHE_FILE = path.join(dataPath, "ai_response_cache.json");
const DEFAULT_TTL = 3600000; // 1 година

class AIResponseCache {
  constructor() {
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0, size: 0 };
    this.loadCache();

    setInterval(() => this.saveCache(), 5 * 60 * 1000);
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
        const now = Date.now();
        for (const [key, value] of Object.entries(data)) {
          if (value.expiresAt > now) {
            this.cache.set(key, value);
          }
        }
      }
    } catch (err) {
      logger.warn("AI Cache: не вдалося завантажити", err.message);
    }
  }

  saveCache() {
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        CACHE_FILE,
        JSON.stringify(Object.fromEntries(this.cache)),
        "utf8",
      );
    } catch (err) {
      logger.error("AI Cache: не вдалося зберегти", err.message);
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt < now) this.cache.delete(key);
    }
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return entry.data;
  }

  set(key, data, ttl = DEFAULT_TTL) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
    });
    this.stats.size = this.cache.size;
  }

  createKey(message, userId) {
    const normalized = String(message).toLowerCase().trim().slice(0, 200);
    return crypto
      .createHash("md5")
      .update(`${userId}:${normalized}`)
      .digest("hex");
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate:
        total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) + "%" : "0%",
    };
  }
}

module.exports = new AIResponseCache();
```

#### ✅ Крок 2: Інтегрувати кеш в aiFirstLineService

**Файл:** `backend/services/aiFirstLineService.js`

**Додати імпорт:**

```javascript
const aiResponseCache = require("./aiResponseCache");
```

**Додати в початок `analyzeIntent`:**

```javascript
const lastMessage =
  dialogHistory.length > 0
    ? dialogHistory[dialogHistory.length - 1].content
    : "";

if (lastMessage && lastMessage.length < 50) {
  const cacheKey = aiResponseCache.createKey(
    lastMessage,
    options.userId || "unknown",
  );
  const cached = aiResponseCache.get(cacheKey);
  if (cached) {
    logger.debug("AI: знайдено в кеші");
    return cached;
  }
}
```

**Додати перед поверненням:**

```javascript
if (result && lastMessage && lastMessage.length < 50) {
  const cacheKey = aiResponseCache.createKey(
    lastMessage,
    options.userId || "unknown",
  );
  aiResponseCache.set(cacheKey, result, 3600000);
}
```

---

### 1.3 Додати збір фідбеку

#### 📁 Створити модель:

**Файл:** `backend/models/AIFeedback.js`

```javascript
const mongoose = require("mongoose");

const aiFeedbackSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BotConversation",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    telegramId: { type: String, required: true },
    messageId: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    feedback: { type: String, trim: true, maxlength: 500 },
    category: {
      type: String,
      enum: [
        "too_formal",
        "not_helpful",
        "wrong_category",
        "good",
        "excellent",
        "other",
      ],
    },
    resolved: { type: Boolean, default: false },
    adminNote: { type: String, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

aiFeedbackSchema.index({ userId: 1, createdAt: -1 });
aiFeedbackSchema.index({ rating: 1 });

module.exports = mongoose.model("AIFeedback", aiFeedbackSchema);
```

#### 📁 Створити контролер:

**Файл:** `backend/controllers/aiFeedbackController.js`

```javascript
const AIFeedback = require("../models/AIFeedback");

const createFeedback = async (req, res) => {
  try {
    const { conversationId, messageId, rating, feedback, category } = req.body;
    const newFeedback = await AIFeedback.create({
      conversationId,
      userId: req.user._id,
      telegramId: req.body.telegramId || req.user.telegramId,
      messageId,
      rating,
      feedback,
      category,
    });
    res.status(201).json({ success: true, data: newFeedback });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getFeedbackStats = async (req, res) => {
  try {
    const stats = await AIFeedback.aggregate([
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);
    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const avgRating =
      total > 0
        ? (stats.reduce((sum, s) => sum + s._id * s.count, 0) / total).toFixed(
            2,
          )
        : 0;
    res.json({
      success: true,
      data: { distribution: stats, total, averageRating: avgRating },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createFeedback, getFeedbackStats };
```

#### ✅ Крок 3: Додати маршрути

**Файл:** `backend/routes/aiKnowledge.js`

```javascript
const aiFeedbackController = require("../controllers/aiFeedbackController");

router.post(
  "/feedback",
  authenticateToken,
  aiFeedbackController.createFeedback,
);
router.get(
  "/feedback/stats",
  authenticateToken,
  requireAdmin,
  aiFeedbackController.getFeedbackStats,
);
```

---

## 📊 Етап 2: Середньострокові покращення (1-2 тижні)

### 2.1 Гібридний пошук Knowledge Base

#### 📁 Файл для змін:

`backend/services/kbSearchService.js`

#### ✅ Крок 1: Додати гібридний пошук

```javascript
/**
 * Гібридний пошук: семантичний + keyword
 */
async function hybridSearch(query, options = {}) {
  const { topK = 5, minScore = 0.5 } = options;

  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearch(query, { topK: topK * 2 }),
    keywordSearch(query, { topK: topK * 2 }),
  ]);

  const reranked = rerankResults(semanticResults, keywordResults, query);
  const filtered = reranked.filter((r) => r.score >= minScore);

  return filtered.slice(0, topK);
}

/**
 * Keyword пошук по title та content
 */
async function keywordSearch(query, options = {}) {
  const { topK = 10 } = options;
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const articles = await KnowledgeBase.find({
    isActive: true,
    status: "published",
    $or: [
      { title: { $regex: query, $options: "i" } },
      { content: { $regex: query, $options: "i" } },
      { tags: { $in: keywords } },
    ],
  })
    .limit(topK)
    .select("title content tags createdAt")
    .lean();

  return articles.map((article) => ({
    article,
    score: 0.7,
    matchType: "keyword",
  }));
}

/**
 * Rerank результатів
 */
function rerankResults(semanticResults, keywordResults, query) {
  const combined = new Map();

  semanticResults.forEach((result) => {
    const id = String(result.article._id);
    combined.set(id, { ...result, combinedScore: result.score * 0.7 });
  });

  keywordResults.forEach((result) => {
    const id = String(result.article._id);
    const existing = combined.get(id);
    if (existing) {
      existing.combinedScore += result.score * 0.3;
    } else {
      combined.set(id, { ...result, combinedScore: result.score * 0.3 });
    }
  });

  return Array.from(combined.values()).sort(
    (a, b) => b.combinedScore - a.combinedScore,
  );
}

module.exports = { hybridSearch, keywordSearch, rerankResults };
```

---

### 2.2 Розширена категоризація

#### 📁 Створити конфігурацію:

**Файл:** `backend/config/ticketCategories.js`

```javascript
module.exports = {
  MAIN_CATEGORIES: {
    HARDWARE: {
      id: "hardware",
      name: "Hardware",
      nameUa: "Обладнання",
      keywords: [
        "принтер",
        "монітор",
        "клавіатура",
        "миша",
        "scanner",
        "printer",
      ],
      subcategories: {
        PRINTER: {
          id: "printer",
          name: "Принтер",
          keywords: ["hp", "canon", "не друкує", "застрягає", "папір", "тонер"],
        },
        MONITOR: {
          id: "monitor",
          name: "Монітор",
          keywords: ["не вмикається", "мерехтить", "смуги", "екран"],
        },
      },
    },
    SOFTWARE: {
      id: "software",
      name: "Software",
      nameUa: "ПЗ",
      keywords: ["1с", "1c", "bas", "медок", "браузер", "chrome", "firefox"],
      subcategories: {
        "1C_BAS": {
          id: "1c_bas",
          name: "1С/BAS",
          keywords: ["1с", "1c", "bas", "сирве", "syrve", "база"],
        },
      },
    },
    NETWORK: {
      id: "network",
      name: "Network",
      nameUa: "Мережа",
      keywords: ["інтернет", "wi-fi", "роутер", "mikrotik", "підключення"],
    },
    ACCESS: {
      id: "access",
      name: "Access",
      nameUa: "Доступ",
      keywords: ["пароль", "password", "доступ", "обліковий запис", "логін"],
    },
  },
};
```

---

## 🔮 Етап 3: Довгострокові покращення (2-4 тижні)

### 3.1 Довгострокова пам'ять для користувачів

#### 📁 Створити сервіс:

**Файл:** `backend/services/userMemoryService.js`

```javascript
const UserMemory = require("../models/UserMemory");

class UserMemoryService {
  async getUserProfile(userId) {
    let profile = await UserMemory.findOne({ userId });
    if (!profile) {
      profile = await UserMemory.create({
        userId,
        preferences: {},
        history: [],
      });
    }
    return profile;
  }

  async addToHistory(userId, interaction) {
    const profile = await this.getUserProfile(userId);
    profile.history.push({
      type: interaction.type,
      data: interaction.data,
      timestamp: new Date(),
    });

    // Зберігаємо тільки останні 50 записів
    if (profile.history.length > 50) {
      profile.history = profile.history.slice(-50);
    }

    await profile.save();
  }

  async getSimilarProblems(userId, currentProblem, limit = 3) {
    const profile = await this.getUserProfile(userId);
    const problems = profile.history.filter(
      (h) => h.type === "ticket" || h.type === "problem",
    );

    // Знаходимо схожі проблеми за keywords
    const keywords = currentProblem.toLowerCase().split(/\s+/);
    const similar = problems.filter((p) =>
      keywords.some((k) => p.data.description?.toLowerCase().includes(k)),
    );

    return similar.slice(-limit);
  }
}

module.exports = new UserMemoryService();
```

---

### 3.2 A/B тестування відповідей

#### 📁 Створити сервіс:

**Файл:** `backend/services/abTestingService.js`

```javascript
const crypto = require("crypto");

class ABTestingService {
  constructor() {
    this.variants = new Map();
  }

  assignVariant(userId, experimentId) {
    const hash = crypto
      .createHash("md5")
      .update(`${userId}:${experimentId}`)
      .digest("hex");

    return parseInt(hash.slice(-2), 16) % 100 < 50 ? "A" : "B";
  }

  getVariant(experimentId, userId, variants) {
    const variant = this.assignVariant(userId, experimentId);
    return variants[variant];
  }

  trackResult(experimentId, variant, success) {
    // Зберігаємо результат для аналітики
    logger.info(
      `A/B Test: ${experimentId} variant ${variant} success=${success}`,
    );
  }
}

module.exports = new ABTestingService();
```

---

## 📈 Моніторинг та метрики

### Додати dashboard для AI метрик

#### 📁 Створити контролер:

**Файл:** `backend/controllers/aiMetricsController.js`

```javascript
const AIFeedback = require("../models/AIFeedback");
const BotConversation = require("../models/BotConversation");
const Ticket = require("../models/Ticket");

const getOverview = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      totalConversations,
      conversations24h,
      totalTickets,
      tickets24h,
      feedbackStats,
    ] = await Promise.all([
      BotConversation.countDocuments(),
      BotConversation.countDocuments({ createdAt: { $gte: last24h } }),
      Ticket.countDocuments({ aiCreated: true }),
      Ticket.countDocuments({ aiCreated: true, createdAt: { $gte: last24h } }),
      AIFeedback.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avgRating: { $avg: "$rating" },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        conversations: { total: totalConversations, last24h: conversations24h },
        tickets: { total: totalTickets, last24h: tickets24h },
        feedback: {
          total: feedbackStats[0]?.total || 0,
          avgRating: feedbackStats[0]?.avgRating?.toFixed(2) || 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getOverview };
```

---

## ✅ Чеклист для впровадження

### Пріоритет 1 (1-2 дні):

- [ ] Додати українські приклади в промти
- [ ] Додати детектор емоцій
- [ ] Створити aiResponseCache
- [ ] Інтегрувати кешування
- [ ] Створити модель AIFeedback
- [ ] Додати API для фідбеку

### Пріоритет 2 (1 тиждень):

- [ ] Гібридний пошук KB
- [ ] Розширити категорії
- [ ] Додати метрики якості
- [ ] Оптимізувати промти

### Пріоритет 3 (2-4 тижні):

- [ ] Довгострокова пам'ять
- [ ] A/B тестування
- [ ] Автоматичне навчання

---

## 🧪 Тестування

### Запустити тести:

```bash
cd backend
npm run test:unit:ai
```

### Перевірити кеш:

```bash
curl http://localhost:5000/api/ai/metrics/overview
```

---

**Створено:** 2026-03-04  
**Автор:** AI Assistant
