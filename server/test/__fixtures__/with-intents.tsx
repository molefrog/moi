export const config = {
  title: 'Products',
  intents: [
    { name: 'open-product', description: 'Open one product', params: { id: 'product id' } },
    { name: 'list-products' },
    { name: 'Bad Name' }, // skipped: not kebab-case
    { description: 'no name' }, // skipped: missing name
    { name: 'mixed-params', params: { kept: 'a string', 'kebab-key': 'quoted key', dropped: 42 } }
  ]
} as const

export default function Products() {
  return <div className="h-full w-full" />
}
