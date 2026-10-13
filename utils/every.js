function every(name, interval, task) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (err) {
      console.error(`[${name}]`, err);
    } finally {
      running = false;
    }
  };
  return { run, timer: setInterval(run, interval) };
}

module.exports = { every };
