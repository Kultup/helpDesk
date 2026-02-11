import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Save, Plus, Trash2, CheckCircle, XCircle } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';

const RATING_KEYS = ['1', '2', '3', '4', '5'] as const;

export interface RatingMediaItem {
  gifs: string[];
  stickers: string[];
}

export type RatingMediaState = Record<string, RatingMediaItem>;

const defaultRatingMedia = (): RatingMediaState =>
  Object.fromEntries(RATING_KEYS.map(k => [k, { gifs: [], stickers: [] }]));

const normalizeRatingMedia = (raw: unknown): RatingMediaState => {
  const out = defaultRatingMedia();
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  RATING_KEYS.forEach(key => {
    const v = obj[key];
    if (!v || typeof v !== 'object') return;
    const item = v as Record<string, unknown>;
    const gifs = Array.isArray(item.gifs)
      ? (item.gifs as string[]).filter(x => typeof x === 'string' && x.trim())
      : [];
    const stickers = Array.isArray(item.stickers)
      ? (item.stickers as string[]).filter(x => typeof x === 'string' && x.trim())
      : [];
    out[key] = { gifs, stickers };
  });
  return out;
};

const BotSettings: React.FC = () => {
  const { t } = useTranslation();
  const [ratingMedia, setRatingMedia] = useState<RatingMediaState>(defaultRatingMedia());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setMessage(null);
      const response = await apiService.getBotSettings();
      if (response.success && response.data) {
        const data = response.data as { ratingMedia?: unknown };
        setRatingMedia(normalizeRatingMedia(data.ratingMedia));
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setMessage({
        type: 'error',
        text:
          err?.response?.data?.message ||
          t('settings.bot.loadError', 'Помилка завантаження налаштувань'),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateRating = (key: string, field: 'gifs' | 'stickers', index: number, value: string) => {
    setRatingMedia(prev => {
      const item = { ...prev[key], [field]: [...prev[key][field]] };
      item[field][index] = value;
      return { ...prev, [key]: item };
    });
  };

  const addRow = (key: string, field: 'gifs' | 'stickers') => {
    setRatingMedia(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: [...prev[key][field], ''],
      },
    }));
  };

  const removeRow = (key: string, field: 'gifs' | 'stickers', index: number) => {
    setRatingMedia(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: prev[key][field].filter((_, i) => i !== index),
      },
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setMessage(null);
      const payload: RatingMediaState = {};
      RATING_KEYS.forEach(key => {
        const item = ratingMedia[key];
        payload[key] = {
          gifs: (item.gifs || []).filter(s => s.trim()),
          stickers: (item.stickers || []).filter(s => s.trim()),
        };
      });
      const response = await apiService.updateBotSettings({ ratingMedia: payload });
      if (response.success) {
        setMessage({
          type: 'success',
          text: t('settings.bot.saved', 'Налаштування медіа оцінок збережено'),
        });
        await loadSettings();
      } else {
        setMessage({
          type: 'error',
          text:
            (response as { message?: string }).message ||
            t('settings.bot.saveError', 'Помилка збереження'),
        });
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      setMessage({
        type: 'error',
        text: err?.response?.data?.message || t('settings.bot.saveError', 'Помилка збереження'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const emotionKeys: Record<string, string> = {
    '1': 'settings.bot.emotionSorry',
    '2': 'settings.bot.emotionSad',
    '3': 'settings.bot.emotionOk',
    '4': 'settings.bot.emotionThumbsUp',
    '5': 'settings.bot.emotionThankYou',
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Image className="h-8 w-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            {t('settings.bot.title', 'Медіа оцінок тікетів')}
          </h1>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-md flex items-center space-x-2 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <p className="text-sm text-gray-600">
        {t(
          'settings.bot.description',
          'Налаштуйте GIF або стікери для кожної оцінки після закриття тікета. Якщо тут нічого не вказано, використовуються стандартні GIF з коду.'
        )}
      </p>

      {RATING_KEYS.map(key => {
        const item = ratingMedia[key] || { gifs: [], stickers: [] };
        const gifs = item.gifs.length ? item.gifs : [''];
        const stickers = item.stickers.length ? item.stickers : [''];
        return (
          <Card key={key}>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t(emotionKeys[key], key)}</h2>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.bot.gifUrls', 'Посилання на GIF (одне на рядок або кілька)')}
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  {t(
                    'settings.bot.gifHint',
                    'Наприклад: https://media.giphy.com/media/XXXXX/giphy.gif'
                  )}
                </p>
                <div className="space-y-2">
                  {gifs.map((url, idx) => (
                    <div key={`g-${key}-${idx}`} className="flex gap-2 items-center">
                      <Input
                        type="url"
                        value={url}
                        onChange={e => updateRating(key, 'gifs', idx, e.target.value)}
                        placeholder="https://media.giphy.com/media/..."
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeRow(key, 'gifs', idx)}
                        title={t('common.remove', 'Видалити')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addRow(key, 'gifs')}
                    className="flex items-center gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    {t('settings.bot.addLink', 'Додати посилання')}
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.bot.stickerIds', 'ID стікерів Telegram (file_id)')}
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  {t(
                    'settings.bot.stickerHint',
                    'Перешліть стікер боту — у логах або через getUpdates можна взяти file_id'
                  )}
                </p>
                <div className="space-y-2">
                  {stickers.map((sid, idx) => (
                    <div key={`s-${key}-${idx}`} className="flex gap-2 items-center">
                      <Input
                        type="text"
                        value={sid}
                        onChange={e => updateRating(key, 'stickers', idx, e.target.value)}
                        placeholder="CAACAgIAAxkB..."
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeRow(key, 'stickers', idx)}
                        title={t('common.remove', 'Видалити')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addRow(key, 'stickers')}
                    className="flex items-center gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    {t('settings.bot.addSticker', 'Додати стікер')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2">
          <Save className="h-4 w-4" />
          {isSaving ? t('common.saving', 'Збереження...') : t('common.save', 'Зберегти')}
        </Button>
      </div>
    </div>
  );
};

export default BotSettings;
