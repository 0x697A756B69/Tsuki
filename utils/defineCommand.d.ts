import type {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  Client,
} from "discord.js";
import type { DatabaseSync } from "node:sqlite";

type Interaction = ChatInputCommandInteraction<"cached">;

export interface CommandOption {
  type: Lowercase<keyof typeof ApplicationCommandOptionType>;
  name: string;
  description: string;
  required?: boolean;
  autocomplete?: boolean;
}

export interface Command {
  name: string;
  description: string;
  permission: bigint | "Aucune";
  category: string;
  dm: boolean;
  options?: CommandOption[];
  run(
    bot: Client<true>,
    interaction: Interaction,
    args: Interaction["options"],
    db: DatabaseSync,
  ): Promise<unknown>;
}

declare function defineCommand(command: Command): Command;
export = defineCommand;
