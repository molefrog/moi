export async function getWeather(city: string) {
  return { city, temp: 72 }
}

export async function getForecast(city: string, days: number) {
  return { city, days, forecast: [] }
}
