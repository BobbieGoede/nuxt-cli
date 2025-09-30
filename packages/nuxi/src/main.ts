import nodeCrypto from 'node:crypto'
import { resolve } from 'node:path'
import process from 'node:process'

import { runMain as _runMain, defineCommand, showUsage } from 'citty'
import { provider } from 'std-env'

import { description, name, version } from '../package.json'
import { customShowUsage, getUsage } from '../update'
import { commands } from './commands'
import { cwdArgs } from './commands/_shared'
import { setupGlobalConsole } from './utils/console'
import { checkEngines } from './utils/engines'
import { logger } from './utils/logger'

// globalThis.crypto support for Node.js 18
if (!globalThis.crypto) {
  globalThis.crypto = nodeCrypto.webcrypto as unknown as Crypto
}

export const main = defineCommand({
  meta: {
    name: name.endsWith('nightly') ? name : 'nuxi',
    version,
    description,
  },
  args: {
    ...cwdArgs,
    command: {
      type: 'positional',
      required: false,
    },
  },
  subCommands: commands,
  async setup(ctx) {
    const command = ctx.args._[0]
    logger.debug(`Running \`nuxt ${command}\` command`)
    const dev = command === 'dev'
    setupGlobalConsole({ dev })

    // Check Node.js version and CLI updates in background
    let backgroundTasks: Promise<any> | undefined
    if (command !== '_dev' && provider !== 'stackblitz') {
      backgroundTasks = Promise.all([
        checkEngines(),
      ]).catch(err => logger.error(err))
    }

    // Avoid background check to fix prompt issues
    if (command === 'init') {
      await backgroundTasks
    }

    // allow running arbitrary commands if there's a locally registered binary with `nuxt-` prefix
    if (ctx.args.command && !(ctx.args.command in commands)) {
      const cwd = resolve(ctx.args.cwd)
      try {
        const { x } = await import('tinyexec')
        // `tinyexec` will resolve command from local binaries
        await x(`nuxt-${ctx.args.command}`, ctx.rawArgs.slice(1), {
          nodeOptions: { stdio: 'inherit', cwd },
          throwOnError: true,
        })
      }
      catch (err) {
        // TODO: use windows err code as well
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
          return
        }
      }
      process.exit()
    }
  },
})

export type Awaitable<T> = () => T | Promise<T>
export type Resolvable<T> = T | Promise<T> | (() => T) | (() => Promise<T>)
export function resolveValue<T>(input: Resolvable<T>): T | Promise<T> {
  return typeof input === 'function' ? (input as any)() : input
}
// function customShowUsage<T extends ArgsDef = ArgsDef>(
//   cmd: CommandDef<T>,
//   parent?: CommandDef<T>,
// ) {
//   const resolved = resolveValue(cmd)
//   const argEntries = Object.entries(resolved.args || {}) as [string, ArgDef][]
//   const newArgs = []
//   for (const [argName, argDef] of argEntries) {
//     const resolvedArg = resolveValue(argDef)
//     if (resolvedArg.type === 'boolean' && resolvedArg.negativeDescription && resolvedArg.default === true) {
//       newArgs.push([`no-${argName}`, { ...resolvedArg, description: resolvedArg.negativeDescription, default: undefined }])
//     }
//     else {
//       newArgs.push([argName, resolvedArg])
//     }
//   }

//   const newArgObj = Object.fromEntries(newArgs)
//   return showUsage({ ...resolved, args: newArgObj }, parent)
// }
export const runMain = () => _runMain(main, { showUsage: customShowUsage })
