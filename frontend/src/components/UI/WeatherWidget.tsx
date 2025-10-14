import React, { useState, useEffect } from 'react';
import { Cloud, CloudRain, Sun, CloudSnow, Zap, Eye, Wind, Droplets } from 'lucide-react';
import { weatherService, WeatherData, WeatherError } from '../../services/weatherService';
import { useTranslation } from 'react-i18next';

interface WeatherWidgetProps {
  className?: string;
  showDetails?: boolean;
}

const WeatherWidget: React.FC<WeatherWidgetProps> = ({ 
  className = '', 
  showDetails = false 
}) => {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    loadWeather();
    // Refresh weather every 30 minutes
    const interval = setInterval(loadWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadWeather = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      console.log('WeatherWidget: Starting to load weather...', forceRefresh ? '(forced refresh)' : '');
      
      // Clear any cached weather data if forcing refresh
      if (forceRefresh) {
        setWeather(null);
      }
      
      const weatherData = await weatherService.getUserLocationWeather();
      console.log('WeatherWidget: Weather data loaded:', weatherData);
      setWeather(weatherData);
    } catch (err) {
      const errorMessage = err instanceof WeatherError 
        ? err.message 
        : t('weather.error.unknown');
      console.error('WeatherWidget: Weather loading error:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getWeatherIcon = (iconCode: string, description: string) => {
    const iconProps = { className: "h-5 w-5" };
    
    if (iconCode.includes('01')) return <Sun {...iconProps} className="h-5 w-5 text-yellow-500" />;
    if (iconCode.includes('02') || iconCode.includes('03') || iconCode.includes('04')) 
      return <Cloud {...iconProps} className="h-5 w-5 text-gray-500" />;
    if (iconCode.includes('09') || iconCode.includes('10')) 
      return <CloudRain {...iconProps} className="h-5 w-5 text-blue-500" />;
    if (iconCode.includes('11')) 
      return <Zap {...iconProps} className="h-5 w-5 text-purple-500" />;
    if (iconCode.includes('13')) 
      return <CloudSnow {...iconProps} className="h-5 w-5 text-blue-300" />;
    if (iconCode.includes('50')) 
      return <Eye {...iconProps} className="h-5 w-5 text-gray-400" />;
    
    return <Cloud {...iconProps} className="h-5 w-5 text-gray-500" />;
  };

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
        <span className="text-sm text-muted-foreground">{t('weather.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div 
        className={`flex items-center space-x-2 cursor-pointer ${className}`}
        onClick={() => loadWeather(true)}
        title={t('weather.clickToRetry')}
      >
        <Cloud className="h-5 w-5 text-red-500" />
        <span className="text-sm text-red-500">{t('weather.error.failed')}</span>
      </div>
    );
  }

  if (!weather) return null;

  const WeatherContent = () => (
    <div className="flex items-center space-x-2">
      {getWeatherIcon(weather.icon, weather.description)}
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">
          {weather.temperature}°C
        </span>
        {showDetails && (
          <span className="text-xs text-muted-foreground capitalize">
            {weather.description}
          </span>
        )}
      </div>
    </div>
  );

  const WeatherTooltip = () => (
    <div className="absolute top-full right-0 mt-2 p-3 bg-background border border-border rounded-lg shadow-lg z-50 min-w-[200px]">
      <div className="flex items-center space-x-2 mb-2">
        {getWeatherIcon(weather.icon, weather.description)}
        <div>
          <div className="font-medium text-foreground">{weather.city}</div>
          <div className="text-sm text-muted-foreground capitalize">{weather.description}</div>
        </div>
      </div>
      
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('weather.temperature')}:</span>
          <span className="text-foreground font-medium">{weather.temperature}°C</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('weather.feelsLike')}:</span>
          <span className="text-foreground">{weather.feelsLike}°C</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground flex items-center">
            <Droplets className="h-3 w-3 mr-1" />
            {t('weather.humidity')}:
          </span>
          <span className="text-foreground">{weather.humidity}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground flex items-center">
            <Wind className="h-3 w-3 mr-1" />
            {t('weather.wind')}:
          </span>
          <span className="text-foreground">{weather.windSpeed} м/с</span>
        </div>
      </div>
    </div>
  );

  return (
    <div 
      className={`relative ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div 
        className="cursor-pointer hover:bg-accent hover:text-accent-foreground rounded-md p-2 transition-colors"
        onClick={() => loadWeather(true)}
        title={t('weather.clickToRefresh')}
      >
        <WeatherContent />
      </div>
      
      {showTooltip && <WeatherTooltip />}
    </div>
  );
};

export default WeatherWidget;