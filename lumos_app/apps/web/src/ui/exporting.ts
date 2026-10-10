import type { ActivityRecord, Manifest, Region } from '../types';
import { briefHtml, toCsv, type SourceEntry } from './bridge';

export function exportCsv(records: ActivityRecord[], region: Region | undefined, manifest: Manifest, sources: Map<string, SourceEntry>) {
  const csv = toCsv(records, {
    snapshotId: manifest.snapshot_id, releaseStage: manifest.release_stage, releaseReason: manifest.release_reason,
    synthetic: manifest.synthetic, selectedModelId: manifest.selected_model_id, aoiName: region?.name, sources: [...sources.values()]
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `lumos_${region?.aoi_id ?? 'aoi'}_${manifest.snapshot_id}${manifest.synthetic ? '_DEMO' : ''}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Print via a hidden iframe so no popup window is needed. */
export function printBrief(record: ActivityRecord, region: Region | undefined, manifest: Manifest, sources: Map<string, SourceEntry>, yearRecords: (ActivityRecord | null)[]) {
  const html = briefHtml({ record, manifest, region, sources: [...sources.values()], yearRecords });
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 1500); }, 250);
}
