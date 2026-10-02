import type { Collection } from "discord.js";
import type { DatabaseSync } from "node:sqlite";
import type { Command } from "./utils/defineCommand";

declare module "discord.js" {
  interface Client {
    commands: Collection<string, Command>;
    utils: { createId(prefix: string): Promise<string> };
    db: DatabaseSync;
  }
}

declare module "ms" {
  function ms(value: string): number | undefined;
  export = ms;
}
