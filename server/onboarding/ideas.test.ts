import { expect, test } from 'bun:test'
import { parseIdeas } from './ideas'

test('accepts exactly three distinct complete ideas and assigns stable server IDs', () => {
  const options = ['Reading list', 'Weekly planner', 'Project tracker'].map((name, index) => ({
    name,
    description: 'Useful project',
    icon: 'book' as const,
    theme: {
      font: (['serif', 'mono', 'rounded'] as const)[index]!,
      color: (['paper', 'sky', 'mint'] as const)[index]!
    },
    views: [
      {
        name: 'Reading list',
        icon: 'book' as const,
        description: 'Saved articles',
        features: ['Search articles by title', 'Save reading progress locally']
      },
      {
        name: 'Reading history',
        icon: 'calendar' as const,
        description: 'Finished articles',
        features: ['Browse completed articles']
      },
      {
        name: 'Notes',
        icon: 'file' as const,
        description: 'Reading notes',
        features: ['Save takeaways']
      }
    ],
    widgets: [
      {
        name: 'Reading count',
        description: 'Unread articles',
        features: ['Show unread count and open the reading list']
      }
    ]
  }))
  const result = parseIdeas({ options })
  expect(result).toHaveLength(3)
  expect(new Set(result.map(idea => idea.id)).size).toBe(3)
  expect(result[0].views).toEqual(options[0].views)
  expect(result[0].widgets).toEqual(options[0].widgets)
  expect(result[0].icon).toBe('book')
  expect(result[0].views[0].icon).toBe('book')
  expect(
    parseIdeas({
      options: options.map((option, index) => ({ ...option, name: `${index}${'a'.repeat(23)}` }))
    })
  ).toHaveLength(3)
  expect(() =>
    parseIdeas({
      options: options.map((option, index) => ({ ...option, name: `${index}${'a'.repeat(24)}` }))
    })
  ).toThrow()
  expect(
    parseIdeas({
      options: options.map(option => ({ ...option, description: 'a'.repeat(200) }))
    })
  ).toHaveLength(3)
  expect(() =>
    parseIdeas({
      options: options.map(option => ({ ...option, description: 'a'.repeat(201) }))
    })
  ).toThrow()
  for (const icon of [undefined, 'invented-icon']) {
    expect(() =>
      parseIdeas({
        options: options.map(option => ({
          ...option,
          views: option.views.map(view => ({ ...view, icon }))
        }))
      })
    ).toThrow()
  }
  expect(() => parseIdeas({ options: options.slice(0, 2) })).toThrow()
  expect(() => parseIdeas({ options: [options[0], options[0], options[0]] })).toThrow()
  expect(() =>
    parseIdeas({ options: options.map(option => ({ ...option, views: [], widgets: [] })) })
  ).toThrow()
})

test('rejects invented icons and incomplete applet plans', () => {
  const option = {
    name: 'Reading list',
    icon: 'book',
    description: 'Read articles',
    views: [
      {
        name: 'Tasks',
        icon: 'calendar' as const,
        description: 'Daily tasks',
        features: ['Complete a task']
      },
      {
        name: 'History',
        icon: 'calendar' as const,
        description: 'Past tasks',
        features: ['Browse completed tasks']
      },
      {
        name: 'Notes',
        icon: 'file' as const,
        description: 'Project notes',
        features: ['Save notes']
      }
    ],
    widgets: [{ name: 'Unread', description: 'Count', features: ['Show unread count'] }]
  }
  for (const invalid of [
    { ...option, icon: 'https://example.com/icon.svg' },
    { ...option, widgets: [{ name: 'Unread', description: 'Count' }] },
    {
      ...option,
      views: [
        { name: 'Library', icon: 'book' as const, description: 'Articles', features: [] },
        ...option.views.slice(1)
      ]
    },
    { ...option, brief: 'Old unstructured brief' }
  ]) {
    expect(() =>
      parseIdeas({
        options: ['One', 'Two', 'Three'].map((name, index) => ({
          ...invalid,
          name,
          theme: {
            font: (['serif', 'mono', 'rounded'] as const)[index]!,
            color: (['paper', 'sky', 'mint'] as const)[index]!
          }
        }))
      })
    ).toThrow()
  }
})

test('requires exactly three views and allows no widgets', () => {
  const applet = {
    name: 'Tasks',
    icon: 'calendar' as const,
    description: 'Daily tasks',
    features: ['Complete a task']
  }
  for (const count of [0, 1, 2, 3, 4, 5]) {
    const options = ['One', 'Two', 'Three'].map((name, index) => ({
      name,
      icon: 'calendar',
      theme: {
        font: (['serif', 'mono', 'rounded'] as const)[index]!,
        color: (['paper', 'sky', 'mint'] as const)[index]!
      },
      description: 'Plan the day',
      views: Array.from({ length: count }, () => applet),
      widgets: []
    }))
    if (count === 3) expect(parseIdeas({ options })).toHaveLength(3)
    else expect(() => parseIdeas({ options })).toThrow()
  }
})

test('requires distinct supported fonts and colors, with no extra customization', () => {
  const options = ['One', 'Two', 'Three'].map((name, index) => ({
    name,
    icon: 'book',
    description: 'A useful workspace',
    theme: {
      font: (['serif', 'mono', 'rounded'] as const)[index]!,
      color: (['paper', 'sky', 'mint'] as const)[index]!
    },
    views: [
      {
        name: 'Tasks',
        icon: 'calendar' as const,
        description: 'Daily tasks',
        features: ['Complete a task']
      },
      {
        name: 'History',
        icon: 'calendar' as const,
        description: 'Past tasks',
        features: ['Browse completed tasks']
      },
      {
        name: 'Notes',
        icon: 'file' as const,
        description: 'Project notes',
        features: ['Save notes']
      }
    ],
    widgets: [{ name: 'Tasks', description: 'Daily tasks', features: ['Complete a task'] }]
  }))
  expect(parseIdeas({ options }).map(idea => idea.theme)).toEqual(
    options.map(option => option.theme)
  )
  for (const field of ['font', 'color'] as const) {
    expect(() =>
      parseIdeas({
        options: options.map(option => ({
          ...option,
          theme: { ...option.theme, [field]: options[0]!.theme[field] }
        }))
      })
    ).toThrow('different font and color')
  }
  for (const theme of [
    { font: 'invented', color: 'paper' },
    { font: 'serif', color: '#ff0000' },
    { font: 'serif', color: 'paper', radius: 'square' },
    { font: 'serif', color: 'paper', agent: 'blob' }
  ]) {
    expect(() => parseIdeas({ options: [{ ...options[0], theme }, ...options.slice(1)] })).toThrow()
  }
})
