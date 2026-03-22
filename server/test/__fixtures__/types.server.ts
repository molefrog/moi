export async function getDate() {
  return new Date('2025-01-01T00:00:00Z')
}

export async function getMap() {
  return new Map([
    ['a', 1],
    ['b', 2]
  ])
}

export async function getSet() {
  return new Set([1, 2, 3])
}

export async function echo(value: unknown) {
  return value
}
