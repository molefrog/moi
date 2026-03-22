import { getWeather } from './with-server.server'

export default function WeatherWidget() {
  return <button onClick={() => getWeather('NYC')}>Get Weather</button>
}
