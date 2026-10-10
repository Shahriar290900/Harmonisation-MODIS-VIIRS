import { BadgeCheck, Eye, FlaskConical, type LucideIcon } from 'lucide-react';
import { Icon3D, type IconTone } from '../../ui/icons/Icon3D';

export const STAGE_LABEL: Record<string, string> = {
  ui_prototype: 'UI prototype',
  observed_comparison: 'Observed comparison',
  validated_calibration: 'Validated calibration'
};

const STAGE_ICON: Record<string, [LucideIcon, IconTone]> = { ui_prototype: [FlaskConical, 'red'], observed_comparison: [Eye, 'cyan'], validated_calibration: [BadgeCheck, 'teal'] };

/** Rectangular release-stage tag (footer + honesty card). */
export function StageTagLx({ stage }: { stage: string }) {
  const [icon, tone] = STAGE_ICON[stage] ?? STAGE_ICON.ui_prototype;
  return <span className={'lx-stage-tag lx-stage-tag--' + stage}><Icon3D icon={icon} tone={tone} size={15} />{STAGE_LABEL[stage] ?? stage}</span>;
}
