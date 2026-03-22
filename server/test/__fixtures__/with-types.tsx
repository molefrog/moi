import type { WeatherData } from './with-types.server'
import { getWeather } from './with-types.server'

export default function TypedWidget() {
  const handle = async () => {
    const data: WeatherData = await getWeather('NYC')
    console.log(data)
  }
  return <button onClick={handle}>Typed</button>
}
