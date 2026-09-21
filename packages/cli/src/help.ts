/**
 * Help layout shared by `--help` and the `help` subcommand.
 *
 * Commander's stock help puts the whole subcommand signature
 * ("cp|copy [options] <src> <dest>") in the term column and sizes one column
 * for every section from the widest term on the page. A single long flag then
 * squeezes every description, and below ~75 columns Commander stops wrapping
 * altogether. This layout follows what cobra-based CLIs (flyctl, auth0) do
 * instead:
 *
 *   - command lists show the bare command name and a one-line `help_text`;
 *     the full `description` is kept for the command's own help page
 *   - long flags line up whether or not they have a short form
 *   - each section sizes its own term column, capped at `MAX_TERM_WIDTH`; a
 *     wider term sits on its own line instead of pushing the column out
 *   - descriptions wrap with a hanging indent, and when the terminal is too
 *     narrow for a readable column they drop under their term
 *   - long command lists are split under the headings the spec declares
 *
 * Headings and terms are bold and the bracketed notes are dimmed. Commander
 * strips the escape codes again when the output is not a colour terminal
 * (piped, NO_COLOR, ...), so nothing here has to check.
 */

import type {
  Command,
  Argument as CommanderArgument,
  Help,
  Option,
} from 'commander';

import type { Argument } from './types.js';

const ITEM_INDENT = 2;
const SPACER_WIDTH = 2;
const MAX_TERM_WIDTH = 30;
const MIN_COLUMN_DESCRIPTION_WIDTH = 28;
// Deeper than the long-flag column ("      --public"), so a description
// stacked under a flag never reads as another flag.
const STACKED_DESCRIPTION_INDENT = 10;
const MIN_WRAP_WIDTH = 20;
const USAGE_PREFIX = 'Usage: ';

export const OPTIONS_HEADING = 'Options:';
export const GLOBAL_OPTIONS_HEADING = 'Global Options:';
const COMMANDS_HEADING = 'Commands:';

const bold = (text: string) => `\x1b[1m${text}\x1b[22m`;
const dim = (text: string) => `\x1b[2m${text}\x1b[22m`;

/** What the help page needs from the spec that Commander has no slot for. */
interface HelpDetails {
  examples?: string[];
  /** Headings for the subcommand list, in display order. */
  groups?: string[];
  /**
   * Options every subcommand accepts, listed for reference on a page whose
   * own command does not take them (the root).
   */
  globalOptions?: Option[];
}

const helpDetails = new WeakMap<Command, HelpDetails>();

export function setHelpDetails(cmd: Command, details: HelpDetails): void {
  helpDetails.set(cmd, details);
}

export function groupHeading(group: string): string {
  return `${group}:`;
}

/** Sort `[heading, items]` entries by `order`; unlisted headings go last. */
function orderSections<T>(
  sections: Map<string, T[]>,
  order: string[]
): Array<[string, T[]]> {
  const rank = (heading: string) => {
    const index = order.indexOf(heading);
    return index === -1 ? order.length : index;
  };
  return [...sections].sort(([a], [b]) => rank(a) - rank(b));
}

/**
 * The text shown next to an argument or flag in help: the precise `help_text`
 * when the spec has one, otherwise the description, followed by the facts a
 * user needs to fill the value in.
 */
export function argumentHelpText(arg: Argument): string {
  let text = arg.help_text ?? arg.description ?? '';

  if (arg.deprecated) {
    const hint = arg.replaced_by ? ` Use ${arg.replaced_by} instead.` : '';
    text = `(deprecated) ${text}${hint}`;
  }

  const notes: string[] = [];
  if (arg.required && arg.type !== 'positional') {
    notes.push('required');
  }
  if (arg.options && arg.options.length > 0) {
    const values = arg.options.map((option) =>
      typeof option === 'string' ? option : option.value
    );
    notes.push(`options: ${values.join(', ')}`);
  }
  // A flag that defaults to off says nothing the flag's presence doesn't.
  if (arg.default !== undefined && arg.type !== 'flag') {
    notes.push(`default: ${arg.default}`);
  }

  if (notes.length === 0) return text;
  // Square brackets: descriptions often end in a parenthetical of their own.
  return text ? `${text} [${notes.join('; ')}]` : `[${notes.join('; ')}]`;
}

function commandPath(cmd: Command): string {
  const names: string[] = [];
  for (let current: Command | null = cmd; current; current = current.parent) {
    names.unshift(current.name());
  }
  return names.join(' ');
}

function hang(text: string, indent: number): string {
  return text.replace(/\n/g, `\n${' '.repeat(indent)}`);
}

export const helpConfiguration = {
  // Commander refuses to wrap below 40 columns; the stacked layout stays
  // legible well under that.
  minWidthToWrap: MIN_WRAP_WIDTH,

  subcommandTerm(cmd: Command): string {
    return cmd.name();
  },

  optionTerm(option: Option): string {
    return option.flags.startsWith('--') ? `    ${option.flags}` : option.flags;
  },

  styleTitle: bold,
  styleSubcommandTerm: bold,
  styleOptionTerm: bold,
  styleArgumentTerm: bold,

  // Dim the notes argumentHelpText() appends, so the description reads first.
  styleDescriptionText(text: string): string {
    return text.replace(
      / \[(?:required|options: |default: )[^\]]*\]$/,
      (notes) => dim(notes)
    );
  },

  // Choices, defaults and required-ness are already part of the text built by
  // argumentHelpText(), so Commander must not append its own.
  optionDescription(option: Option): string {
    return option.description;
  },

  argumentDescription(argument: CommanderArgument): string {
    return argument.description;
  },

  commandUsage(this: Help, cmd: Command): string {
    const parts = [commandPath(cmd)];
    if (this.visibleOptions(cmd).length > 0) parts.push('[options]');
    if (this.visibleCommands(cmd).length > 0) parts.push('[command]');
    for (const argument of cmd.registeredArguments) {
      const name = `${argument.name()}${argument.variadic ? '...' : ''}`;
      parts.push(argument.required ? `<${name}>` : `[${name}]`);
    }
    return parts.join(' ');
  },

  formatItem(
    this: Help,
    term: string,
    termWidth: number,
    description: string,
    helper: Help
  ): string {
    const itemIndent = ' '.repeat(ITEM_INDENT);
    if (!description) return `${itemIndent}${term}`;

    const helpWidth = helper.helpWidth ?? 80;
    const column = ITEM_INDENT + termWidth + SPACER_WIDTH;
    const stacked = helpWidth - column < MIN_COLUMN_DESCRIPTION_WIDTH;
    const descriptionIndent = stacked ? STACKED_DESCRIPTION_INDENT : column;
    const wrapped = hang(
      helper.boxWrap(
        description,
        Math.max(helpWidth - descriptionIndent, MIN_WRAP_WIDTH)
      ),
      descriptionIndent
    );

    if (stacked || helper.displayWidth(term) > termWidth) {
      return `${itemIndent}${term}\n${' '.repeat(descriptionIndent)}${wrapped}`;
    }
    // Pad by visible width: a styled term is longer than it looks.
    const padding = ' '.repeat(
      termWidth - helper.displayWidth(term) + SPACER_WIDTH
    );
    return `${itemIndent}${term}${padding}${wrapped}`;
  },

  formatHelp(this: Help, cmd: Command, helper: Help): string {
    const helpWidth = helper.helpWidth ?? 80;
    const details = helpDetails.get(cmd) ?? {};
    const output: string[] = [];

    const termWidthOf = (rows: Array<[string, string]>) =>
      Math.min(
        Math.max(0, ...rows.map(([term]) => helper.displayWidth(term))),
        MAX_TERM_WIDTH
      );

    const addSection = (
      heading: string,
      rows: Array<[string, string]>,
      termWidth = termWidthOf(rows)
    ) => {
      if (rows.length === 0) return;
      output.push(
        helper.styleTitle(heading),
        ...rows.map(([term, description]) =>
          helper.formatItem(term, termWidth, description, helper)
        ),
        ''
      );
    };

    const commandRow = (sub: Command): [string, string] => [
      helper.styleSubcommandTerm(helper.subcommandTerm(sub)),
      helper.styleSubcommandDescription(helper.subcommandDescription(sub)),
    ];
    const optionRow = (option: Option): [string, string] => [
      helper.styleOptionTerm(helper.optionTerm(option)),
      helper.styleOptionDescription(helper.optionDescription(option)),
    ];

    output.push(
      `${helper.styleTitle(USAGE_PREFIX.trimEnd())} ${hang(
        helper.boxWrap(
          helper.commandUsage(cmd),
          helpWidth - USAGE_PREFIX.length
        ),
        USAGE_PREFIX.length
      )}`,
      ''
    );

    const description = helper.commandDescription(cmd);
    if (description) {
      output.push(helper.boxWrap(description, helpWidth), '');
    }

    const aliases = cmd.aliases();
    if (aliases.length > 0) {
      output.push(
        helper.styleTitle('Aliases:'),
        `${' '.repeat(ITEM_INDENT)}${[cmd.name(), ...aliases].join(', ')}`,
        ''
      );
    }

    // One column for every command group, so the headings split the list
    // without breaking its alignment.
    const visibleCommands = helper.visibleCommands(cmd);
    const commandTermWidth = termWidthOf(visibleCommands.map(commandRow));
    const commandSections = this.groupItems(
      cmd.commands as Command[],
      visibleCommands,
      (sub) => sub.helpGroup() || COMMANDS_HEADING
    );
    for (const [heading, commands] of orderSections(
      commandSections,
      (details.groups ?? []).map(groupHeading)
    )) {
      addSection(heading, commands.map(commandRow), commandTermWidth);
    }

    addSection(
      'Arguments:',
      helper
        .visibleArguments(cmd)
        .map((argument) => [
          helper.styleArgumentTerm(helper.argumentTerm(argument)),
          helper.styleArgumentDescription(helper.argumentDescription(argument)),
        ])
    );

    const optionSections = this.groupItems(
      cmd.options as Option[],
      helper.visibleOptions(cmd),
      (option) => option.helpGroupHeading ?? OPTIONS_HEADING
    );
    if (details.globalOptions) {
      optionSections.set(GLOBAL_OPTIONS_HEADING, details.globalOptions);
    }
    for (const [heading, options] of orderSections(optionSections, [
      OPTIONS_HEADING,
    ])) {
      addSection(heading, options.map(optionRow));
    }

    if (details.examples && details.examples.length > 0) {
      // Left unwrapped: a command broken across lines no longer pastes.
      output.push(
        helper.styleTitle('Examples:'),
        ...details.examples.map(
          (example) => `${' '.repeat(ITEM_INDENT)}${example}`
        ),
        ''
      );
    }

    if (visibleCommands.length > 0) {
      output.push(
        helper.boxWrap(
          `Use "${commandPath(cmd)} [command] --help" for more information about a command.`,
          helpWidth
        ),
        ''
      );
    }

    return output.join('\n');
  },
};
