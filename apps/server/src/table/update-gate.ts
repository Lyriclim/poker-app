/** One owner at a time; settlement waits for the owner without polling timers. */
export class UpdateGate {
  private release: (() => void) | null = null;
  private completion: Promise<void> = Promise.resolve();

  get busy(): boolean { return this.release !== null; }

  set busy(value: boolean) {
    if (value) {
      if (this.busy) throw new Error('Update already in progress');
      this.completion = new Promise((resolve) => { this.release = resolve; });
    } else {
      const release = this.release;
      this.release = null;
      release?.();
    }
  }

  idle(): Promise<void> { return this.completion; }
}
