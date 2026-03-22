let counter = 0

export async function increment() {
  return ++counter
}

export async function dispose() {
  counter = 0
}
