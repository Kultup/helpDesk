import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bot } from 'lucide-react';
import AISettings from './AISettings';

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

      <AISettings embedded />
    </div>
  );
};

export default BotSettings;
