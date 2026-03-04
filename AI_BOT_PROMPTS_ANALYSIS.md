# AI Bot Prompts Analysis — HelpDesk System

## 📊 Overview

The AI bot uses a sophisticated multi-layer prompt system for intelligent ticket processing and user support.

---

## 🏗️ Architecture

### Core Files

| File                                     | Purpose                                  |
| ---------------------------------------- | ---------------------------------------- |
| `backend/prompts/aiFirstLinePrompts.js`  | Main prompt library (3098 lines)         |
| `backend/services/aiFirstLineService.js` | AI logic engine (2400 lines)             |
| `backend/services/telegramAIService.js`  | Telegram bot AI integration (2177 lines) |
| `backend/services/aiEnhancedService.js`  | Quick solutions & patterns (745 lines)   |
| `backend/models/AISettings.js`           | AI provider settings (Groq/OpenAI)       |

---

## 🎯 Key Prompt Components

### 1. **COMMUNICATION_STYLE** (Lines 8-56)

- Human-like conversation in Ukrainian
- Problem-first detection (negative indicators priority)
- Natural filler words allowed
- Emoji usage guidelines
- Local context awareness (power outages, UPS)

### 2. **QUICK_SOLUTION_FORMAT** (Lines 58-103)

- Problem acknowledgment first
- Quick self-check (1-2 steps max)
- Remote-first approach (AnyDesk/TeamViewer)
- 300-450 character limit
- Always offer ticket creation option

### 3. **IT_INFRASTRUCTURE_RULES** (Lines 107-234)

- **Domain environment** - Group Policy, MikroTik routers
- **User limitations** - No admin rights, no software installation
- **Network troubleshooting** - MikroTik only, no router restarts
- **Remote support only** - No physical visits
- **User account protocol** - Required info collection

### 4. **CONTEXT_AWARENESS** (Lines 240-297)

- Similar tickets reference
- Recurring problem detection (3+ times → escalate)
- User pattern tracking
- Past solution learning

### 5. **SMART_PRIORITIZATION** (Lines 303-425)

- **URGENT** 🔴: Business critical (POS, server down, clients waiting)
- **HIGH** 🟠: Can't work, team affected, deadline today
- **MEDIUM** 🟡: Default for most tickets
- **LOW** 🟢: Not urgent, feature requests
- **Financial Impact Detector** - Payment issues → urgent
- **Time-based escalation** - <2 hours to closing → High→Urgent

### 6. **SLA_COMMUNICATION** (Lines 431-475)

- Expectation setting after ticket creation
- After hours / weekend / holiday handling
- Queue context integration

### 7. **PROACTIVE_DIAGNOSTICS** (Lines 481-675)

- Self-healing filter (reboot first for hardware)
- Network logic tree (LEDs, speedtest)
- Category-specific questions:
  - Printing problems
  - Computer slow/freezing
  - Software errors
  - 1C/BAS/Syrve issues
  - AnyDesk/TeamViewer ID collection

### 8. **ADVANCED_CATEGORIZATION** (Lines 681-745)

- 11 main categories (Hardware, Software, Network, Access, etc.)
- Sub-category detection
- Routing hints for admins

### 9. **KNOWLEDGE_BASE** (Lines 751-1000+)

- Common issues & solutions
- Quick solution patterns

---

## 🧠 AI Processing Flow

### Phase 1: Light Classification (Token Saver)

```javascript
INTENT_ANALYSIS_LIGHT (300 tokens, temp 0.5)
→ Simple messages (greetings, FAQ)
→ Resolves ~60% of simple queries
```

### Phase 2: Full Analysis (If needed)

```javascript
INTENT_ANALYSIS (800 tokens, temp 0.7)
→ IT problems requiring full context
→ Loads all rules and infrastructure knowledge
```

### Phase 3: Agentic RAG (Optional)

```javascript
fetchExtraContextForAgentic()
→ KB search (embeddings + text search)
→ Ticket search (similar resolved tickets)
→ Max 2 iterations
```

---

## 📋 Intent Analysis Output Structure

```json
{
  "requestType": "problem|question|greeting|appeal",
  "requestTypeConfidence": 0.0-1.0,
  "isTicketIntent": true|false,
  "needsMoreInfo": true|false,
  "missingInfo": ["field1", "field2"],
  "category": "Hardware|Software|Network|Access|...",
  "subcategory": "Printer|1C|Wi-Fi|...",
  "priority": "urgent|high|medium|low",
  "emotionalTone": "calm|frustrated|anxious|angry",
  "quickSolution": "string|null",
  "offTopicResponse": "string|null",
  "autoTicket": true|false,
  "needMoreContext": true|false,
  "moreContextSource": "kb|tickets|web|none",
  "promptMode": "light|full"
}
```

---

## 🔧 Special Features

### 1. **Self-Healing Filter**

For Hardware/Printing/Performance issues:

- First ask user to reboot/power cycle
- If fixed → no ticket needed
- If persists → full diagnostics + ticket

### 2. **Network Storm Detection**

- 3+ tickets from same city about internet in 10 min
- Auto-escalate to urgent
- Mark as mass outage

### 3. **Duplicate Ticket Prevention**

- Same location + category in 10 min
- Add user to existing ticket instead of creating new

### 4. **Financial Impact Detector**

- Keywords: "каса", "чек", "клієнт у черзі", "рецепт"
- Auto-tag ticket with [💰 FINANCIAL IMPACT]
- Urgent priority

### 5. **Time-to-Closing Awareness**

- Shop hours: Mon 12:00-21:00, Tue-Sun 10:00-21:00
- <2 hours to closing → High→Urgent

### 6. **KB Relevance Guard**

- AI checks if KB article is relevant to query
- Prevents irrelevant article suggestions
- Uses both rule-based and AI-powered checks

---

## 🌐 Language & Context

### Ukrainian Language Requirements

- All user responses in Ukrainian
- Think in English, respond in Ukrainian
- Local context: Ukraine power outages, UPS, regional issues

### Regional Awareness

- Zaporizhzhia, Uzhhorod, etc.
- Power outage questions for network issues
- "Чи є світло?" for computer/network problems

---

## 🚨 Security & Constraints

### User Limitations (Never suggest otherwise)

- ❌ No admin rights on local machines
- ❌ No software installation without IT approval
- ❌ No system settings changes
- ❌ No network configuration changes

### Remote Support Only

- ❌ Never suggest physical visit
- ✅ Always use AnyDesk/TeamViewer
- ✅ Recommend local service center if remote fails

### MikroTik Network

- ❌ No router restart advice
- ❌ No 192.168.1.1 instructions
- ✅ Only admin-accessible solutions

---

## 📊 Token Management

### Token Usage Tracking

- File: `dataPath/token_usage.json`
- Monthly reset
- Tracks: promptTokens, completionTokens, totalTokens

### Token Limits

```javascript
MAX_TOKENS = {
  INTENT_ANALYSIS: 800,
  INTENT_ANALYSIS_LIGHT: 300,
  SIMILAR_TICKETS_RELEVANCE_CHECK: 80,
  KB_ARTICLE_RELEVANCE_CHECK: 60,
  TICKET_SUMMARY: 400,
};
```

### Temperature Settings

```javascript
TEMPERATURES = {
  INTENT_ANALYSIS: 0.7,
  INTENT_ANALYSIS_LIGHT: 0.5,
  SIMILAR_TICKETS_RELEVANCE_CHECK: 0.2,
};
```

---

## 🧪 Testing

### Test Files

- `tests/unit/services/aiFirstLineService.test.js`
- `tests/unit/services/telegramAIService.test.js`

### Run Tests

```bash
cd backend
npm run test:unit:ai
```

---

## 🔧 Quick Solutions Database (aiEnhancedService.js)

Pre-configured solutions for common issues:

| Problem Type               | Keywords                               | Category |
| -------------------------- | -------------------------------------- | -------- |
| New printer setup          | "налаштувати принтер", "новий принтер" | Hardware |
| Printer not printing color | "синьою фарбою", "прочистка"           | Hardware |
| Printer not printing       | "принтер не друкує"                    | Hardware |
| Paper jam                  | "папір застрягає"                      | Hardware |
| No internet                | "інтернет не працює"                   | Network  |
| Forgot Gmail password      | "забув пароль gmail"                   | Access   |
| Forgot password            | "забув пароль"                         | Access   |
| Slow computer              | "повільно працює"                      | Hardware |
| 1C not starting            | "1с не запускається"                   | Software |

---

## 🎨 Communication Examples

### ✅ Good Responses

```
"Спробуймо швидке рішення 👇"
"Зараз подивимось, що можна зробити"
"Ок, розумію проблему. От що раджу:"
"Така ситуація часто виникає через..."
```

### ❌ Bad Responses

```
"Дякуємо за Ваше звернення. Просимо Вас виконати наступні дії."
"З метою вирішення Вашої проблеми необхідно..."
"Рекомендується здійснити перезавантаження пристрою"
```

---

## 📈 Performance Metrics

### Light Classification Success Rate

- ~60% of simple messages resolved with INTENT_ANALYSIS_LIGHT
- Saves ~60% tokens on simple queries

### KB Relevance Check

- Prevents irrelevant article suggestions
- Uses AI + rule-based fallback

### Self-Healing Success

- ~30% of hardware issues resolved by reboot/power cycle
- Reduces unnecessary tickets

---

## 🐛 Known Issues & Improvements

### Current Issues (Check logs for)

1. Token limit exceeded on long conversations
2. KB relevance false positives
3. Network storm detection false negatives

### Suggested Improvements

1. Add more quick solution patterns
2. Improve Ukrainian language understanding
3. Add more regional context (other cities)
4. Better handling of mixed Ukrainian/Russian messages
5. Add voice message transcription context

---

## 📚 Related Documentation

- [AI_PROVIDER_SETUP.md](./AI_PROVIDER_SETUP.md) - AI provider configuration
- [bot_intent_and_semantic_kb_checklist.md](./bot_intent_and_semantic_kb_checklist.md) - KB checklist
- [CHANGELOG_AI_IMPROVEMENTS.md](./CHANGELOG_AI_IMPROVEMENTS.md) - AI changelog
- [docs/AI_BOT_LOGIC.md](./docs/AI_BOT_LOGIC.md) - AI logic documentation

---

## 🚀 Quick Test Commands

### Test Intent Analysis

```bash
cd backend
node -e "const s = require('./services/aiFirstLineService'); s.analyzeIntent([...], {})"
```

### Test KB Search

```bash
node -e "const kb = require('./services/kbSearchService'); kb.findBestMatchForBot('принтер')"
```

### Check Token Usage

```bash
cat backend/data/token_usage.json
```

---

**Last Updated:** 2026-03-04
**Version:** 3.1 (Enhanced AI Logic)
