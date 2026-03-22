export const API_VERSION = 3

export async function getData() {
  return { version: API_VERSION }
}
