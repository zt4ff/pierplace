export class PythonRunner {
  constructor(createWorker, { initTimeoutMs = 60_000, executionTimeoutMs = 10_000 } = {}) {
    this.createWorker = createWorker;
    this.initTimeoutMs = initTimeoutMs;
    this.executionTimeoutMs = executionTimeoutMs;
    this.worker = null;
    this.ready = false;
    this.active = null;
    this.nextId = 1;
  }

  run(code, input, onOutput = () => {}, onStatus = () => {}) {
    if (this.active) {
      return Promise.reject(new Error('Python is already loading or running. Stop it before starting another execution.'));
    }

    return new Promise((resolve, reject) => {
      const task = {
        id: this.nextId++, code, input, onOutput, onStatus, resolve, reject,
        phase: 'loading', timer: null,
      };
      this.active = task;
      try {
        if (this.ready) {
          this.startExecution(task);
          return;
        }

        task.timer = setTimeout(() => {
          this.fail(new Error('Python initialization timed out. Check your connection and run again.'), true);
        }, this.initTimeoutMs);
        onStatus('loading');
        if (this.active !== task) return;

        const worker = this.createWorker();
        this.worker = worker;
        worker.onmessage = (event) => {
          if (this.worker !== worker) return;
          try {
            this.handleMessage(event.data);
          } catch (error) {
            this.fail(error, true);
          }
        };
        worker.onerror = (event) => {
          if (this.worker !== worker) return;
          event.preventDefault?.();
          this.fail(new Error(`Python worker failed: ${event.message || 'Unknown worker error'}. Run again to restart Python.`), true);
        };
        worker.onmessageerror = () => {
          if (this.worker !== worker) return;
          this.fail(new Error('Could not read a Python worker message. Run again to restart Python.'), true);
        };
        worker.postMessage({ type: 'init' });
      } catch (error) {
        this.fail(error, true);
      }
    });
  }

  startExecution(task) {
    clearTimeout(task.timer);
    task.phase = 'running';
    task.timer = setTimeout(() => {
      this.fail(new Error('Python execution timed out. Check for an infinite loop, then run again.'), true);
    }, this.executionTimeoutMs);
    task.onStatus('running');
    if (this.active !== task) return;
    this.worker.postMessage({ type: 'run', id: task.id, code: task.code, input: task.input });
  }

  handleMessage(message) {
    const task = this.active;
    if (!task || !message) return;

    if (task.phase === 'loading') {
      if (message.type === 'ready') {
        this.ready = true;
        this.startExecution(task);
      } else if (message.type === 'error' && message.id === null) {
        this.fail(new Error(message.message), true);
      }
      return;
    }

    if (message.id !== task.id) return;
    if (message.type === 'output') {
      task.onOutput(message.text);
    } else if (message.type === 'done') {
      this.finish();
    } else if (message.type === 'error') {
      this.fail(new Error(message.message));
    }
  }

  finish(error) {
    const task = this.active;
    if (!task) return;
    clearTimeout(task.timer);
    this.active = null;
    if (error) task.reject(error);
    else task.resolve();
  }

  fail(error, reset = false) {
    if (reset) this.resetWorker();
    this.finish(error);
  }

  resetWorker() {
    const worker = this.worker;
    this.worker = null;
    this.ready = false;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    // Cleanup must not prevent an active promise from settling.
    try {
      worker.terminate();
    } catch {
      // The worker may already have been terminated by its host.
    }
  }

  stop() {
    this.fail(new Error('Python was stopped. Run again when you are ready; Python will restart.'), true);
  }

  dispose() {
    this.stop();
  }
}
