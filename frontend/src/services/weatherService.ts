const WEATHER_API_KEY = process.env.REACT_APP_WEATHER_API_KEY as string;
const WEATHER_BASE_URL = (process.env.REACT_APP_WEATHER_BASE_URL || 'https://api.openweathermap.org/data/2.5') as string;

export interface WeatherData {
  temperature: number;
  description: string;
  icon: string;
  city: string;
  country: string;
  humidity: number;
  windSpeed: number;
  feelsLike: number;
}

export class WeatherError extends Error {
  code?: string;
  
  constructor(options: { message: string; code?: string }) {
    super(options.message);
    this.name = 'WeatherError';
    this.code = options.code;
  }
}

class WeatherService {
  private currentLocationRequest: Promise<WeatherData> | null = null;
  private requestId = 0;

  private async fetchWeatherData(url: string): Promise<any> {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new WeatherError({ message: error.message });
      }
      throw new WeatherError({ message: 'Unknown error occurred' });
    }
  }

  async getCurrentWeather(city: string): Promise<WeatherData> {
    if (!WEATHER_API_KEY) {
      throw new WeatherError({ message: 'Weather API key is not configured' });
    }
    const url = `${WEATHER_BASE_URL}/weather?q=${encodeURIComponent(city)}&appid=${WEATHER_API_KEY}&units=metric&lang=uk`;
    
    const data = await this.fetchWeatherData(url);
    
    return {
      temperature: Math.round(data.main.temp),
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      city: data.name,
      country: data.sys.country,
      humidity: data.main.humidity,
      windSpeed: data.wind.speed,
      feelsLike: Math.round(data.main.feels_like)
    };
  }

  async getCurrentWeatherByCoords(lat: number, lon: number): Promise<WeatherData> {
    if (!WEATHER_API_KEY) {
      throw new WeatherError({ message: 'Weather API key is not configured' });
    }
    const url = `${WEATHER_BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric&lang=uk`;
    
    const data = await this.fetchWeatherData(url);
    
    return {
      temperature: Math.round(data.main.temp),
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      city: data.name,
      country: data.sys.country,
      humidity: data.main.humidity,
      windSpeed: data.wind.speed,
      feelsLike: Math.round(data.main.feels_like)
    };
  }

  getWeatherIconUrl(iconCode: string): string {
    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  }

  async getUserLocationWeather(): Promise<WeatherData> {
    // If there's already a request in progress, return it
    if (this.currentLocationRequest) {
      return this.currentLocationRequest;
    }

    // Create a new request
    this.currentLocationRequest = new Promise((resolve, reject) => {
      const currentRequestId = ++this.requestId;

      if (!navigator.geolocation) {
        console.warn('Geolocation is not supported, using default city');
        this.getCurrentWeather('Хмельницький')
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.currentLocationRequest = null;
          });
        return;
      }
      
      let resolved = false;
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (resolved) {
            return;
          }
          resolved = true;
          
          try {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            const weather = await this.getCurrentWeatherByCoords(lat, lon);
            resolve(weather);
          } catch (error) {
            console.error('Error getting weather by coordinates:', error);
            this.getCurrentWeather('Хмельницький')
              .then(resolve)
              .catch(reject);
          } finally {
            this.currentLocationRequest = null;
          }
        },
        (error) => {
          if (resolved) {
            return;
          }
          resolved = true;
          
          console.error(`Geolocation error:`, {
            code: error.code,
            message: error.message
          });
          
          // More detailed error logging for debugging
          let errorDescription = '';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorDescription = 'User denied geolocation permission';
              break;
            case error.POSITION_UNAVAILABLE:
              errorDescription = 'Location information is unavailable - network service failed';
              break;
            case error.TIMEOUT:
              errorDescription = 'Geolocation request timed out';
              break;
            default:
              errorDescription = 'Unknown geolocation error';
              break;
          }
          
          // Log the specific error for user feedback
          console.warn(`Geolocation error: {code: ${error.code}, message: ${errorDescription}}`);
          
          this.getCurrentWeather('Хмельницький')
            .then(resolve)
            .catch(reject)
            .finally(() => {
              this.currentLocationRequest = null;
            });
        },
        {
          timeout: 10000, // Reduced timeout to avoid network service timeout
          enableHighAccuracy: false, // Use less accurate but more reliable positioning
          maximumAge: 300000 // Allow cached position up to 5 minutes old
        }
      );
    });

    return this.currentLocationRequest;
  }
}

export const weatherService = new WeatherService();