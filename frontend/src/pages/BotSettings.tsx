import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bot } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import { Link } from 'react-router-dom';

const BotSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Bot className="h-8 w-8 text-gray-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            {t('settings.bot.title', 'Налаштування бота')}
          </h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold flex items-center space-x-2">
            <Bot className="h-5 w-5 text-gray-600" />
            <span>{t('settings.bot.title', 'Налаштування бота')}</span>
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            {t('settings.bot.aiDisabled', 'AI інтеграція вимкнена. Для налаштування Telegram перейдіть у розділ Налаштування Telegram.')}
          </p>
          <p className="text-sm text-gray-500">
            {t('settings.bot.aiOnlyAdmin', 'Налаштування AI (увімкнути першу лінію) доступні тільки для адміністраторів. Якщо ви не бачите пункт «Налаштування AI» у бічному меню — увійдіть під обліковим записом з роллю адміністратора або оновіть додаток до останньої версії.')}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Link
              to="/admin/settings/telegram"
              className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
            >
              {t('sidebar.telegramSettings', 'Налаштування Telegram')} →
            </Link>
            <Link
              to="/admin/settings/ai"
              className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
            >
              {t('sidebar.aiSettings', 'Налаштування AI')} (Groq/OpenAI, перша лінія) →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BotSettings;
