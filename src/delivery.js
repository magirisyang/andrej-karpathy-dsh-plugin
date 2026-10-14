// Use the same durable delivery event as DSH's present tool, only after a
// successful karpathy_explain result. This never launches another tool/process.
export function deliveryQueue(ctx, enabled = true) {
  const pending = new WeakMap();
  ctx.on('tools/result', (exec, result) => {
    const delivery = pending.get(exec);
    pending.delete(exec);
    if (!delivery || result.isError || exec.signal.aborted) return;
    delivery.session.append('deliverables/presented', {
      turn: delivery.turn, callId: exec.callId, files: delivery.files,
    });
  });
  return (exec, path, title) => {
    const files = [{ path, description: title }];
    if (!enabled) return { status: 'disabled', files };
    const session = exec.agent?.session;
    const boundary = session && ctx.get('sessionProjections')?.stateOf(session, 'turnBoundary');
    if (!exec.callId || typeof session?.append !== 'function' || !boundary || boundary.openTurnStartSeq == null)
      return { status: 'needs-present', files };
    pending.set(exec, { session, turn: boundary.lastTurn, files });
    return { status: 'queued', files };
  };
}
