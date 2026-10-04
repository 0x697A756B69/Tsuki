const defineComponent = require("../../../utils/defineComponent");

module.exports = defineComponent({
  id: "broken",
  async run() {
    throw new Error("broken");
  },
});
