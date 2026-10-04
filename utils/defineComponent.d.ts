import type { Client, MessageComponentInteraction } from "discord.js";
import type { DatabaseSync } from "node:sqlite";

export interface Component {
  id: string;
  run(
    bot: Client<true>,
    interaction: MessageComponentInteraction<"cached">,
    params: string[],
    db: DatabaseSync,
  ): Promise<unknown>;
}

declare function defineComponent(component: Component): Component;
export = defineComponent;
