import { defineCommand } from 'citty';

defineCommand({
  meta: {
    name: "frigear-nu-cli",
    version: "0.0.1"
  },
  subCommands: {
    "files-to-import": defineCommand({})
  }
});
