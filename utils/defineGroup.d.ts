import type { Command } from "./defineCommand";

export type Group = Pick<Command, "name" | "description"> &
  Partial<Pick<Command, "permission" | "category" | "dm">>;

declare function defineGroup(group: Group): Group;
export = defineGroup;
