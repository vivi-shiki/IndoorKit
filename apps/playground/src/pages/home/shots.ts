import museumLight from '../../../../../docs/images/museum-environment.png';
import museumDark from '../../../../../docs/images/museum-environment-dark.png';
import parkingLight from '../../../../../docs/images/parking-availability.png';
import parkingDark from '../../../../../docs/images/parking-availability-dark.png';
import hospitalLight from '../../../../../docs/images/tracking.png';
import hospitalDark from '../../../../../docs/images/tracking-dark.png';
import type { ThemeName } from '../../theme';
import type { Scenario } from './scenarios';

/** 每个场景在两套主题下的截图，跟着当前主题切换 */
export const SHOTS: Record<Scenario['id'], Record<ThemeName, string>> = {
  hospital: { light: hospitalLight, dark: hospitalDark },
  parking: { light: parkingLight, dark: parkingDark },
  museum: { light: museumLight, dark: museumDark },
};
