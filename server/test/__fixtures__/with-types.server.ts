export type WeatherData = {
  city: string
  temp: number
}

export interface ForecastOptions {
  days: number
}

export async function getWeather(city: string): Promise<WeatherData> {
  return { city, temp: 72 }
}
