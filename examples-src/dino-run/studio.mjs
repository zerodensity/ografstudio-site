// Helpers for driving a running Studio through its MCP server (set OGRAF_MCP_URL to choose which).
process.env.OGRAF_MCP_URL ??= 'http://127.0.0.1:4450/mcp';
const { call } = await import('./mcp.mjs');
export { call };

export async function settled() {
  let last = await call('ograf_get_project', { include: ['metadata'] });
  for (let i = 0; i < 80; i++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const next = await call('ograf_get_project', { include: ['metadata'] });
    const caps = await call('ograf_get_capabilities', { sections: ['editor'] });
    if (next.revision === last.revision && caps.editor?.responsive) return next;
    last = next;
  }
  throw new Error('Studio did not settle; keep its tab visible and run again.');
}

export async function apply(operations, reason) {
  const { revision } = await settled();
  const result = await call('ograf_apply_operations', { expectedRevision: revision, operations, reason });
  if (result.validation?.valid === false) throw new Error(JSON.stringify(result.validation).slice(0, 2500));
  return result;
}

export async function fresh(originalPrompt) {
  const start = await settled();
  await call('ograf_reset_project', { expectedRevision: start.revision, confirm: true, originalPrompt });
}

export async function scene() {
  const { project } = await call('ograf_get_project', {});
  const composition = project.compositions.find((item) => item.id === project.mainCompositionId) ?? project.compositions[0];
  const layer = (name) => {
    const found = composition.layers.find((item) => item.name === name);
    if (!found) throw new Error(`No layer "${name}".`);
    return found;
  };
  const field = (key) => {
    const found = composition.dataFields.find((item) => item.key === key);
    if (!found) throw new Error(`No field "${key}".`);
    return found;
  };
  return { project, composition, layer, field };
}

export const add = (kind, name, box, element, extra = {}) => ({
  type: 'add_layer',
  kind,
  name,
  transform: { x: box[0], y: box[1], width: box[2], height: box[3] },
  element,
  ...extra,
});
export const rect = (name, box, fill, radius = 0, extra = {}) =>
  add('rectangle', name, box, { fill, borderRadius: radius, strokeWidth: 0 }, extra);
export const text = (name, box, content, style = {}, extra = {}) =>
  add(
    'text',
    name,
    box,
    {
      content,
      fontFamily: style.font ?? 'Arial, sans-serif',
      fontSize: style.size ?? 24,
      minFontSize: Math.max(1, Math.round((style.size ?? 24) * (style.min ?? 0.5))),
      fontWeight: style.weight ?? 600,
      color: style.color ?? '#ffffff',
      textAlign: style.align ?? 'left',
      verticalAlign: style.valign ?? 'middle',
      autoFit: style.fit ?? 'fixed',
      overflowPolicy: 'clip',
      letterSpacing: style.ls ?? 0,
      ...(style.lh ? { lineHeight: style.lh } : {}),
      ...(style.transform ? { textTransform: style.transform } : {}),
    },
    extra,
  );
export const track = (layerName, property, keys) => {
  const byFrame = new Map(keys.map(([frame, value, easing = 'linear']) => [frame, { frame, value, easing }]));
  return { type: 'set_property_track', layerName, property, keys: [...byFrame.values()].sort((a, b) => a.frame - b.frame) };
};
