import type { Command } from "./defineCommand";

export type Subcommand = Pick<
  Command,
  "name" | "description" | "options" | "run"
>;

declare function defineSubcommand(subcommand: Subcommand): Subcommand;
export = defineSubcommand;
