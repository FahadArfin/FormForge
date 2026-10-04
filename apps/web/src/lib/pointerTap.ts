type PointerSample = { pointerId: number; clientX: number; clientY: number; isPrimary: boolean; button: number; type?: string }
/** A second finger, pointer cancellation or an excursion into a drag invalidates the whole gesture. */
export class PointerTap {
  private start: PointerSample | null = null
  down(event: PointerSample) { this.start = event.isPrimary && event.button === 0 ? { ...event, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY } : null }
  move(event: PointerSample) { if (this.start && (this.start.pointerId !== event.pointerId || Math.hypot(event.clientX - this.start.clientX, event.clientY - this.start.clientY) > 6)) this.start = null }
  up(event: PointerSample) { this.move(event); const tap = !!this.start && event.type !== 'pointercancel' && event.isPrimary && event.button === 0; this.start = null; return tap }
  cancel() { this.start = null }
}
