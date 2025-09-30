/* eslint-disable no-console */
// This script searches and writes to files, use at your own risk.
// Should be in the root of nuxi package in the nuxt-cli repository.

import type { Arg, ArgsDef, CommandDef, Resolvable } from 'citty'
import fs from 'node:fs/promises'
import { basename, join } from 'node:path'
import process from 'node:process'
import consola from 'consola'
import { colors } from 'consola/utils'
import { commands } from './src/commands/index'
import moduleBuilderBuild from '/Users/bobbiegoede/www/forks/nuxt-module-builder/src/commands/build'

// ----- Args -----

export type ArgType
  = | 'boolean'
    | 'string'
    | 'number'
    | 'enum'
    | 'positional'
    | undefined

// Args: Definition

export interface _ArgDef<T extends ArgType, VT extends boolean | number | string> {
  type?: T
  description?: string
  valueHint?: string
  alias?: string | string[]
  default?: VT
  required?: boolean
  options?: (string | number)[]
}

export type ArgDef
  = | BooleanArgDef
    | StringArgDef
    | NumberArgDef
    | PositionalArgDef
    | EnumArgDef

export type BooleanArgDef = Omit<_ArgDef<'boolean', boolean>, 'options'> & {
  negativeDescription?: string
}
export type StringArgDef = Omit<_ArgDef<'string', string>, 'options'>
export type NumberArgDef = Omit<_ArgDef<'number', number>, 'options'>
export type EnumArgDef = _ArgDef<'enum', string>
export type PositionalArgDef = Omit<
  _ArgDef<'positional', string>,
  'alias' | 'options'
>

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
      // if (arg.options) {
      //   return `${name}=<${arg.options.join('|')}>`
      // }
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
      // if (arg.default != null) {
      //   return `${name}="${arg.default}"`
      // }
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

function wrap(str: string, chars: string | string[] = '`') {
  return `${chars[0] || ''}${str}${chars[1] || chars[0] || ''}`
}
function wrapValue(str: string | undefined, chars?: string | string[]) {
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
  const posLines: [string, string, string, string][] = []
  const usageArgs = { positional: [] as string[], required: [] as string[], optional: [] as string[] }
  interface UsageParsed { name: string, alias: string[], required: boolean, type: 'positional' | string, default: string | boolean | number | undefined, options: string[] | undefined, description: string, valueHint: string | undefined }
  const usageArgs2: UsageParsed[] = []

  for (const arg of cmdArgs) {
    const argName = formatArgName(arg, false)
    const argStr = formatArgString(argName, arg)
    const description = arg.description || ''
    const defaultValue = typeof arg.default !== 'string' ? JSON.stringify(arg.default) : arg.default

    if (arg.type === 'positional') {
      posLines.push([
        argStr,
        defaultValue || '',
        description,
        wrapValue(arg.valueHint, '<>'),
      ])

      const isRequired = arg.required !== false && arg.default === undefined
      usageArgs.positional.push(wrap(
        argName,
        isRequired ? '<>' : '[]',
      ))
      usageArgs2.splice(usageArgs2.findIndex(x => x.type === 'positional') + 1, 0, {
        name: arg.name,
        alias: toArray(arg.alias),
        type: 'positional',
        // @ts-expect-error nuxt also uses this for other arg types
        options: arg.options as string[] | undefined,
        required: isRequired,
        default: defaultValue,
        description,
        valueHint: arg.valueHint,
      })
      continue
    }
    const requiredHint = arg.required === true && arg.default === undefined ? ' (required)' : ''
    // @ts-expect-error outdated citty
    const options = (arg.type === 'enum' && Array.isArray(arg.options) && arg.options.length > 0)
      // ? `(${arg.options.map(v => wrap(typeof v !== 'string' ? JSON.stringify(v) : v, ['`', '`{lang="ts"}'])).join(', ')})`
      // @ts-expect-error outdated citty
      ? arg.options.map(v => typeof v !== 'string' ? JSON.stringify(v) : v).join(' | ')
      : ''
    const flagUsage = []

    usageArgs2.push({
      name: arg.name,
      alias: toArray(arg.alias),
      required: arg.required === true && arg.default === undefined,
      type: arg.type || 'boolean',
      default: defaultValue,
      description,
      valueHint: arg.valueHint,
      // @ts-expect-error outdated citty
      options: (arg.type === 'enum' && Array.isArray(arg.options) && arg.options.length > 0)
      // ? `(${arg.options.map(v => wrap(typeof v !== 'string' ? JSON.stringify(v) : v, ['`', '`{lang="ts"}'])).join(', ')})`
      // @ts-expect-error outdated citty
        ? arg.options.map(v => typeof v !== 'string' ? JSON.stringify(v) : v)
        : [],
    })

    const booleanDefault = (arg.type === 'boolean' && arg.default === true)
    if (!booleanDefault) {
      argLines.push([
        argStr,
        defaultValue || '',
        [description, options, requiredHint].filter(Boolean).join(' '),
      ])
      flagUsage.push(argStr)
    }

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
        // arg.negativeDescription,
        // @ts-expect-error nuxt also uses this for other types
        [arg.negativeDescription, options].filter(Boolean).join(' '),
      ])

      usageArgs2.push({
        name: `no-${arg.name}`,
        alias: toArray(arg.alias).map(a => `no-${a}`),
        required: false,
        type: arg.type || 'boolean',
        default: undefined,
        // @ts-expect-error nuxt also uses this for other arg types
        description: arg.negativeDescription || '',
        valueHint: arg.valueHint,
        options: [],
      })
    }

    usageArgs[requiredHint ? 'required' : 'optional'].push(flagUsage.join(' | '))
    // if (requiredHint) {
    //   usageLine.push(argStr)
    // }
  }

  console.log(usageArgs2)
  return { posLines, argLines, usageArgs }
}

export async function customShowUsage<T extends ArgsDef = ArgsDef>(
  cmd: CommandDef<T>,
  parent?: CommandDef<T>,
) {
  try {
    consola.log(`${await getUsage(cmd, parent)}\n`)
  }
  catch (error) {
    consola.error(error)
  }
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

const argumentSegment = defineSegment<[string, string, string, string]>({
  name: 'args',
  content: [],
  columns: [
    { label: 'Argument', transform: (v: string) => wrap(escapePipe(v)) },
    { label: 'Default', transform: (v: string) => {
      const val = escapePipe(wrapValue(v))
      if (val === '') {
        return ''
      }
      return `${val}{lang="ts"}`
    } },
    { label: 'Description', transform: (v: string, data) => {
      // const opts = data[3] ? ` ${data[3]}` : ''
      return escapePipe(v + (data[3] ? ` (options: ${wrap(data[3].split('|').map(v2 => JSON.stringify(v2)).join(' | '), ['`', '`{lang="ts"}'])})` : ''))
    } },
  ],
})

export function formatLineColumns(lines: string[][], linePrefix = '') {
  const maxLength: number[] = []
  for (const line of lines) {
    for (const [i, element] of line.entries()) {
      maxLength[i] = Math.max(maxLength[i] || 0, element.length)
    }
  }
  return lines
    .map(l =>
      l
        .map(
          (c, i) =>
            linePrefix + c[i === 0 ? 'padStart' : 'padEnd'](maxLength[i] || 0),
        )
        .join('  '),
    )
    .join('\n')
}

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

export async function getUsage<T extends ArgsDef>(def: CommandDef<T>, parent?: CommandDef<T>) {
  const meta = await resolveValue<Record<string, any> | undefined>(def?.meta) || {}
  const parentMeta = await resolveValue<Record<string, any> | undefined>(parent?.meta)

  let commandName = meta?.name ?? name
  // adjust command name to include parent command name
  if (parentMeta?.name != null) {
    commandName = [parentMeta.name, commandName].join(' ')
  }

  // content ??= await fs.readFile(foundFile, 'utf-8')

  // if (def.subCommands != null) {
  //   for (const [subCommandName, fn] of Object.entries(def.subCommands) as [string, () => Promise<CommandDef>][]) {
  //     const subDef = await fn()
  //     content = await writeTemplate(subCommandName, subDef, foundFile, def, content)
  //   }
  //   await fs.writeFile(foundFile, content, 'utf8')
  //   return content
  // }

  // const args = await resolveValue(def.args)
  // if (args == null)
  //   return content
  const version = meta.version || parentMeta?.version
  const usageLines = []
  usageLines.push(
    colors.gray(`${meta.description} (${
      commandName
      + (version ? ` v${version}` : '')
    })`),
    '',
  )
  const data = await renderUsage(def)

  // remove options with dots as they are subcommands
  // data.argLines = data.argLines.filter(x => !x[0]?.includes('.'))
  data.usageArgs.required = data.usageArgs.required.filter(x => !x?.includes('.'))
  data.usageArgs.optional = data.usageArgs.optional.filter(x => !x?.includes('.'))
  usageLines.push(`USAGE \`${data.usageArgs.positional.join(' ')} ${data.usageArgs.required.join(' ')} ${data.usageArgs.optional.map(x => wrap(x, '[]')).join(' ')}\``)
  usageLines.push('')

  if (data.posLines.length) {
    usageLines.push(colors.underline('ARGUMENTS'), '')
    usageLines.push(formatLineColumns(data.posLines, '  '))
    usageLines.push('')
  }

  if (data.argLines.length) {
    usageLines.push(colors.underline('OPTIONS'), '')
    console.log(data.argLines.map(x => x.map(c => wrap(c))))
    usageLines.push(formatLineColumns(data.argLines.map(([x1, x2, x3]) => [wrapValue(x1, ['`', '`']), x3 + (x2 ? colors.gray(` (default: ${x2})`) : '')]), '  '))
    usageLines.push('')
  }

  // console.log(data.usageArgs.optional)
  return usageLines.filter(l => typeof l === 'string').join('\n')
}

/**
 * - finds/collects command doc files
 * - extract and format command usage
 * - write formatted usage to command doc within the marker tags
 */
async function run() {
  const commandsDirPath = process.env.COMMAND_DIR_PATH || ''
  if (!commandsDirPath) {
    throw new Error('Set `COMMAND_DIR_PATH` to absolute path to nuxt docs commands directory (e.g. /home/user/nuxt/docs/3.api/4.commands).')
  }
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

    // const l = [
    //   name === 'init' ? 'npm create nuxt@latest' : `npx nuxt ${commandName}`,
    //   data.usageArgs.positional.join(' '),
    //   data.usageArgs.required.join(' '),
    // ].filter(Boolean).join(' ')

    const commandSegment = defineSegment({
      name: 'cmd',
      columns: [],
      content: [
        '```bash [Terminal]',
        [
          name === 'init' ? 'npm create nuxt@latest' : `npx nuxt ${commandName}`,
          data.usageArgs.positional.join(' '),
          data.usageArgs.required.join(' '),
          '[OPTIONS]',
          // data.usageArgs.optional.map(v => `[${v}]`).join(' '),
          // data.usageArgs.optional.map(v => `[${v}]`).reduce((acc, cur) => {
          // const cmdWrapLength = 40
          //   const last: string | undefined = acc.at(-1)
          //   if (last != null && last.length + cur.length + 1 <= cmdWrapLength) {
          //     const lastIndex = Math.max(0, acc.length - 1)
          //     acc[lastIndex] += (acc[lastIndex] ? ' ' : '') + cur
          //   }
          //   else {
          //     acc.push(cur)
          //   }
          //   // console.log(acc)
          //   return acc
          // }, [] as string[]).join(`\n${' '.repeat(l.length + 1)}`),
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
  // eslint-disable-next-line ts/ban-ts-comment
  // @ts-ignore
  entries.push(['build-module', moduleBuilderBuild])
  await Promise.all(entries.map(async ([commandName, fn]) => {
    const def = await resolveValue(fn)
    const meta = await resolveValue(def?.meta)
    if (meta && commandName === 'build-module') {
      meta.name = 'build-module'
    }
    await writeTemplate(commandName, def)
  }))
}

if (process.argv.includes('--write')) {
  console.log('Writing command docs...')
  run().then(() => { })
}
