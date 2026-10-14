const defineComponent = require("../../../utils/core/defineComponent");

module.exports = defineComponent({
  id: "broken",
  async run() {
    throw new Error("broken");
  },
});
