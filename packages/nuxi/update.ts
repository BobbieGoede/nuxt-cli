/* eslint-disable no-console */
// This script searches and writes to files, use at your own risk.
// Should be in the root of nuxi package in the nuxt-cli repository.

import type { Arg, ArgDef, ArgsDef, CommandDef, Resolvable } from 'citty'
import fs from 'node:fs/promises'
import { basename, join } from 'node:path'
import process from 'node:process'
import { commands } from './src/commands/index'

const commandsDirPath = process.env.COMMAND_DIR_PATH || ''
if (!commandsDirPath) {
  throw new Error('Set `COMMAND_DIR_PATH` to absolute path to nuxt docs commands directory (e.g. /home/user/nuxt/docs/3.api/4.commands).')
}

// escape for markdown tables
function escapePipe(str: string) {
  return str.replaceAll('|', '\\|')
}

/**
 * Find files and add to `commandDocFiles` for later use
 */
async function findCommandFiles(directoryPath: string) {
  const commandDocFiles: string[] = []
  const files = await fs.readdir(directoryPath)
  for (const file of files) {
    const fullPath = join(directoryPath, file)
    if ((await fs.lstat(fullPath)).isFile()) {
      commandDocFiles.push(fullPath)
    }
    else {
      console.log('no file', fullPath)
    }
  }

  return commandDocFiles
}

// https://github.com/unjs/citty/blob/fea15c4b02cebd5f454908bad4b6b7ba694ee9ca/src/_utils.ts#L29
function resolveValue<T>(input: Resolvable<T>): T | Promise<T> {
  return typeof input === 'function' ? (input as any)() : input
}

// https://github.com/unjs/citty/blob/fea15c4b02cebd5f454908bad4b6b7ba694ee9ca/src/_utils.ts#L10
// modified
function toArray(val: any = []) {
  return Array.isArray(val) ? val : [val]
}

// https://github.com/unjs/citty/blob/fea15c4b02cebd5f454908bad4b6b7ba694ee9ca/src/args.ts#L98
function resolveArgs(argsDef: ArgsDef): Arg[] {
  const args: Arg[] = []
  for (const [name, argDef] of Object.entries(argsDef || {}) as [string, Arg][]) {
    args.push({
      ...argDef,
      name,
      alias: toArray((argDef as any).alias),
    })
  }
  return args
}

/**
 * Formats argument string with value hints, defaults, and enum options if applicable
 * @remark Default values are only rendered for string and positional args
 */
function formatArgString(name: string, arg: ArgDef) {
  switch (arg.type) {
    case 'boolean': {
      return name
    }
    case 'enum': {
      if (arg.options) {
        return `${name}=<${arg.options.join('|')}>`
      }
      break
    }
    case 'string': {
      if (arg.valueHint) {
        return `${name}=<${arg.valueHint}>`
      }
      break
      // fall through (same as positional formatting)
    }
    // case "number":
    case 'positional': {
      if (arg.default != null) {
        return `${name}="${arg.default}"`
      }
      break
    }
  }

  // if (arg.default != null) {
  //   return `${name}=${wrap(String(arg.default), typeof arg.default === 'string' ? '"' : '')}`
  // }

  return name
}

// `no` prefix matcher (kebab-case or camelCase)
const negativePrefixRe = /^no[-A-Z]/

interface ContentColumn<T> { label: string, transform: (v: string, data: T) => string }
interface ContentSegment<T = string[]> { name: string, columns: ContentColumn<T>[], content: string[] }

// Formats and prefixes argument name + aliases (e.g. `-f, --foo`, `-no-f, --no-foo`)
function formatArgName(arg: Arg, negative: boolean = false) {
  if (arg.type === 'positional') {
    return arg.name.toUpperCase()
  }

  const short = negative ? '--no-' : '-'
  const long = negative ? '--no-' : '--'
  return [
    ...(arg.alias || []).map((a: string) => short + a),
    long + arg.name,
  ].join(', ')
}

function wrap(str: string, chars: string = '`') {
  return `${chars[0] || ''}${str}${chars[1] || chars[0] || ''}`
}
function wrapValue(str: string | undefined, chars?: string) {
  return str == null || str === ''
    ? ''
    : wrap(str, chars)
}
// Modified
// https://github.com/unjs/citty/blob/fea15c4b02cebd5f454908bad4b6b7ba694ee9ca/src/usage.ts#L18
async function renderUsage<T extends ArgsDef = ArgsDef>(
  cmd: CommandDef<T>,
) {
  const cmdArgs = resolveArgs(await resolveValue(cmd.args || {}))

  const argLines: [string, string, string][] = []
  const posLines: [string, string, string][] = []
  const usageArgs = { positional: [] as string[], required: [] as string[], optional: [] as string[] }

  for (const arg of cmdArgs) {
    const argName = formatArgName(arg, false)
    const argStr = formatArgString(argName, arg)
    const description = arg.description || ''

    if (arg.type === 'positional') {
      posLines.push([
        argStr,
        description,
        wrapValue(arg.valueHint, '<>'),
      ])

      const isRequired = arg.required !== false && arg.default === undefined
      usageArgs.positional.push(wrap(
        argName,
        isRequired ? '<>' : '[]',
      ))
      continue
    }
    const defaultValue = typeof arg.default !== 'string' ? JSON.stringify(arg.default) : arg.default ?? ''
    const requiredHint = arg.required === true && arg.default === undefined ? ' (required)' : ''
    const flagUsage = []

    // const booleanDefault = (arg.type === 'boolean' && arg.default === true)
    // if (!booleanDefault) {
    argLines.push([
      argStr,
      defaultValue || '',
      description + requiredHint,
    ])
    flagUsage.push(argStr)
    // }

    if (
      // @ts-expect-error nuxt also uses this for other types
      arg.negativeDescription
      && !negativePrefixRe.test(arg.name)
    ) {
      const negativeArgStr = formatArgString(formatArgName(arg, true), arg)
      flagUsage.push(negativeArgStr)
      argLines.push([
        negativeArgStr,
        '',
        // @ts-expect-error nuxt also uses this for other types
        arg.negativeDescription,
      ])
    }

    usageArgs[requiredHint ? 'required' : 'optional'].push(flagUsage.join(' | '))
    // if (requiredHint) {
    //   usageLine.push(argStr)
    // }
  }

  return { posLines, argLines, usageArgs }
}

/**
 * Replaces the string within marker tags found in `src` with `content`
 *
 * @remark marker tags look like `<!--[NAME]-[TAG]-->STRING</!--/[NAME]-[TAG]-->`
 */
function replaceAtMarker(name: string, tag: string, src: string, content: string) {
  const markerOpen = `<!--${name}-${tag}-->`
  const markerClose = `<!--/${name}-${tag}-->`

  return src.replace(
    new RegExp(`${markerOpen}[\\w\\s\\S]+${markerClose}`),
    [markerOpen, content, markerClose].join('\n'),
  )
}

function defineSegment<T extends string[]>(def: ContentSegment<T>): ContentSegment<T> {
  return def
}

function formatSegment<T extends string[]>(segment: ContentSegment<T>, data: T[]) {
  const contentLines: string[][] = []
  contentLines.push(segment.columns.map(x => x.label))
  contentLines.push(segment.columns.map(() => '---'))

  const transformers = segment.columns.map(x => x.transform || ((v: string) => v))
  for (const d of data) {
    const line: string[] = []
    for (let i = 0; i < transformers.length; i++) {
      line.push(transformers[i]!(d[i] || '', d))
    }
    contentLines.push(line)
  }

  return { name: segment.name, content: contentLines.map(x => x.join(' | ')) }
}

const argumentSegment = defineSegment<[string, string, string]>({
  name: 'args',
  content: [],
  columns: [
    { label: 'Argument', transform: (v: string) => wrap(escapePipe(v)) },
    { label: 'Description', transform: (v: string, data) => escapePipe(v + (data[2] ? ` (options: ${data[2]})` : '')) },
  ],
})

const optionSegment = defineSegment({
  name: 'opts',
  content: [],
  columns: [
    { label: 'Option', transform: (v: string) => {
      const val = escapePipe(wrapValue(v))
      if (val === '') {
        return ''
      }
      return val
    } },
    { label: 'Default', transform: (v: string) => {
      const val = escapePipe(wrapValue(v))
      if (val === '') {
        return ''
      }
      return `${val}{lang="ts"}`
    } },
    { label: 'Description', transform: (v: string) => escapePipe(v) },
  ],
})

/**
 * - finds/collects command doc files
 * - extract and format command usage
 * - write formatted usage to command doc within the marker tags
 */
async function run() {
  const commandDocFiles = await findCommandFiles(commandsDirPath)

  /**
   * Find the nuxt command documentation file and update contents within marker tags for `cmd`, `args`, `opts`
   */
  async function writeTemplate(name: string, def: CommandDef, file?: string, parent?: CommandDef, content?: string): Promise<string> {
    const meta = await resolveValue<Record<string, any> | undefined>(def?.meta)
    const parentMeta = await resolveValue<Record<string, any> | undefined>(parent?.meta)

    let commandName = meta?.name ?? name
    // adjust command name to include parent command name
    if (parentMeta?.name != null) {
      commandName = [parentMeta.name, commandName].join(' ')
    }

    const foundFile = file ?? commandDocFiles.find(x => basename(x).split('.')[0] === commandName)
    if (foundFile == null) {
      !name.startsWith('_') && console.log(`No command doc file found for command: ${commandName} (${name})`)
      return ''
    }

    content ??= await fs.readFile(foundFile, 'utf-8')

    if (def.subCommands != null) {
      for (const [subCommandName, fn] of Object.entries(def.subCommands) as [string, () => Promise<CommandDef>][]) {
        const subDef = await fn()
        content = await writeTemplate(subCommandName, subDef, foundFile, def, content)
      }
      await fs.writeFile(foundFile, content, 'utf8')
      return content
    }

    const args = await resolveValue(def.args)
    if (args == null)
      return content

    const data = await renderUsage(def)

    // remove options with dots as they are subcommands
    data.argLines = data.argLines.filter(x => !x[0]?.includes('.'))
    data.usageArgs.required = data.usageArgs.required.filter(x => !x?.includes('.'))
    data.usageArgs.optional = data.usageArgs.optional.filter(x => !x?.includes('.'))
    // console.log(data.usageArgs.optional)

    const l = [
      name === 'init' ? 'npm create nuxt@latest' : `npx nuxt ${commandName}`,
      data.usageArgs.positional.join(' '),
      data.usageArgs.required.join(' '),
    ].filter(Boolean).join(' ')

    const commandSegment = defineSegment({
      name: 'cmd',
      columns: [],
      content: [
        '```bash [Terminal]',
        [
          name === 'init' ? 'npm create nuxt@latest' : `npx nuxt ${commandName}`,
          data.usageArgs.positional.join(' '),
          data.usageArgs.required.join(' '),
          data.usageArgs.optional.map(v => `[${v}]`).reduce((acc, cur, i) => {
            if (acc.at(-1) != null && acc.at(-1).length + cur.length + 1 <= 80) {
              acc[Math.max(0, acc.length - 1)] += (acc[Math.max(0, acc.length - 1)] ? ' ' : '') + cur
            }
            else {
              acc.push(cur)
            }
            // console.log(acc)
            return acc
          }, []).join(`\n${' '.repeat(l.length + 1)}`),
        ].filter(Boolean).join(' '),
        '```',
      ],
    })

    const segments: { name: string, content: string[] }[] = [
      commandSegment,
      formatSegment(argumentSegment, data.posLines),
      formatSegment(optionSegment, data.argLines),
    ]

    const markerName = commandName.replaceAll(' ', '-')
    for (const entry of segments) {
      content = replaceAtMarker(markerName, entry.name, content, entry.content.join('\n'))
    }

    if (parent == null)
      await fs.writeFile(foundFile, content, 'utf8')
    return content
  }

  const entries = Object.entries(commands)
  await Promise.all(entries.map(async ([commandName, fn]) => {
    const def = await fn()
    await writeTemplate(commandName, def)
  }))
}

run().then(() => { })
