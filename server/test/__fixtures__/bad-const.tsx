import { getData } from './bad-const.server'

export default function BadWidget() {
  return <button onClick={() => getData()}>Get Data</button>
}
