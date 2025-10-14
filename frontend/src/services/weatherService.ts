const WEATHER_API_KEY = '01685fec97ff2f24c1478377dd92be3f';
const WEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';

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
      console.log('Geolocation request already in progress, returning existing promise');
      return this.currentLocationRequest;
    }

    // Create a new request
    this.currentLocationRequest = new Promise((resolve, reject) => {
      const currentRequestId = ++this.requestId;
      console.log(`Starting geolocation request #${currentRequestId}`);

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

      console.log('Requesting geolocation permission...');
      
      let resolved = false;
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          if (resolved) {
            console.log(`Request #${currentRequestId}: Already resolved, ignoring success callback`);
            return;
          }
          resolved = true;
          
          try {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            console.log(`Request #${currentRequestId}: Geolocation success! Coordinates: ${lat}, ${lon}`);
            console.log(`Accuracy: ${position.coords.accuracy} meters`);
            
            const weather = await this.getCurrentWeatherByCoords(lat, lon);
            console.log(`Weather data received for: ${weather.city}, ${weather.country}`);
            console.log('Full weather object:', weather);
            resolve(weather);
          } catch (error) {
            console.error('Error getting weather by coordinates:', error);
            console.log('Falling back to default city (Хмельницький)');
            this.getCurrentWeather('Хмельницький')
              .then(resolve)
              .catch(reject);
          } finally {
            this.currentLocationRequest = null;
          }
        },
        (error) => {
          if (resolved) {
            console.log(`Request #${currentRequestId}: Already resolved, ignoring error callback`);
            return;
          }
          resolved = true;
          
          console.error(`Request #${currentRequestId}: Geolocation error:`, {
            code: error.code,
            message: error.message
          });
          
          // More detailed error logging for debugging
          let errorDescription = '';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorDescription = 'User denied geolocation permission';
              console.log('User denied geolocation permission');
              break;
            case error.POSITION_UNAVAILABLE:
              errorDescription = 'Location information is unavailable - network service failed';
              console.log('Location information is unavailable - this often happens when network-based location services fail');
              break;
            case error.TIMEOUT:
              errorDescription = 'Geolocation request timed out';
              console.log('Geolocation request timed out');
              break;
            default:
              errorDescription = 'Unknown geolocation error';
              console.log('Unknown geolocation error');
              break;
          }
          
          // Log the specific error for user feedback
          console.warn(`Geolocation error: {code: ${error.code}, message: ${errorDescription}}`);
          
          console.log('Using default city (Хмельницький) due to geolocation error');
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